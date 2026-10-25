// Autopilot: every few minutes, look at every customer and act on whatever is due (abandoned carts,
// browsing without buying, customers drifting away, expiring points). Also turns unanswered, expired
// offers into "ignored" so offer fatigue is learned from behaviour, not just the "Not now" button.

import * as db from './db.js';
import { decide, analyse } from './engine.js';
import { detectTriggers, isUnansweredExpiry, TRIGGERS } from './triggers.js';
import { contactBlockers, istHour } from './rules/eligibility.js';

const status = { running: false, scanning: false, lastScanAt: null, nextScanAt: null, lastResult: null, totals: {} };
let timer = null;

export const autopilotStatus = () => ({ ...status, triggers: TRIGGERS });

const scanIntervalMs = (rules) => (Number(process.env.TRIGGER_SCAN_SECONDS) * 1000) || Math.max(1, rules.triggers?.scanEveryMinutes || 5) * 60_000;

export function expireOffers(now = new Date()) {
  const nowMs = new Date(now).getTime();
  let ignored = 0;
  for (const d of db.decisions()) {
    if (!isUnansweredExpiry(d, nowMs)) continue;
    const answered = ['claimed', 'dismissed'].includes(d.response) || d.outcome?.purchased;
    db.updateDecision(d.id, { expiryProcessed: true, ...(answered ? {} : { response: 'expired' }) });
    const c = db.getCustomer(d.customerId);
    if (!c) continue;
    const prev = c.offerHistory?.ignoredStreak || 0;
    c.offerHistory = { ...(c.offerHistory || {}), ignoredStreak: answered ? 0 : prev + 1 };
    db.upsertCustomer(c);
    if (!answered) {
      ignored++;
      if (c.telegramId != null) db.addEvent({ type: 'expired', decisionId: d.id, customerId: c.id });
    }
  }
  return ignored;
}

function remember(c, trig, now) {
  c.triggerState = { ...(c.triggerState || {}), [trig.type]: { at: new Date(now).toISOString(), key: trig.key } };
  db.upsertCustomer(c);
}

// Fire the most urgent due trigger for one customer. Returns the decision, or null if nothing was due.
export async function runTriggersFor(customerId, { now = new Date(), useAI = true } = {}) {
  const c = db.getCustomer(customerId);
  if (!c) return null;
  const rules = db.getRules();
  const { f, u } = analyse(c, rules, now);
  const [trig] = detectTriggers(c, f, rules, now);
  if (!trig) return null;
  // Quiet hours: leave the trigger pending so it fires in the morning instead of being lost.
  const quiet = contactBlockers(c, f, u, rules, { sentOffers: [] }, now).some((b) => b.code === 'quiet_hours');
  if (quiet) return null;
  remember(c, trig, now);
  const d = await decide(c.id, { trigger: trig.type, triggerReason: trig.reason, now, useAI });
  status.totals[trig.type] = (status.totals[trig.type] || 0) + 1;
  return d;
}

export async function scanNow({ now = new Date() } = {}) {
  if (status.scanning) return status.lastResult;
  status.scanning = true;
  const started = Date.now();
  const result = { at: new Date(now).toISOString(), expiredIgnored: 0, checked: 0, fired: {}, sent: 0, blocked: 0, holdout: 0, skipped: 0 };
  try {
    result.expiredIgnored = expireOffers(now);
    const rules = db.getRules();
    const h = istHour(now);
    const { quietHoursStart: qs, quietHoursEnd: qe } = rules.contact;
    result.quietHours = qs > qe ? h >= qs || h < qe : h >= qs && h < qe;
    if (rules.triggers?.enabled) {
      // Live testers: every due trigger, AI on. Synthetic customers: a few per scan, rule engine (cheap, keeps the feed alive).
      const testers = db.customers().filter((c) => c.telegramId != null && !c.optedOut);
      const synthetic = db.customers().filter((c) => c.telegramId == null && !c.optedOut)
        .map((c) => { const { f, u } = analyse(c, rules, now); return { c, u, due: detectTriggers(c, f, rules, now) }; })
        .filter((x) => x.due.length)
        .sort((a, b) => b.u.uplift - a.u.uplift)
        .slice(0, rules.triggers.syntheticPerScan || 0);
      result.checked = testers.length + synthetic.length;
      const run = async (c, useAI) => {
        const d = await runTriggersFor(c.id, { now, useAI });
        if (!d) return;
        result.fired[d.trigger] = (result.fired[d.trigger] || 0) + 1;
        result[d.status] = (result[d.status] || 0) + 1;
      };
      for (const c of testers) await run(c, true);
      for (const { c } of synthetic) await run(c, false);
    }
  } catch (err) {
    result.error = err.message;
    console.error('[autopilot]', err);
  } finally {
    result.ms = Date.now() - started;
    status.scanning = false;
    status.lastScanAt = result.at;
    status.lastResult = result;
  }
  db.bus.emit('live', { kind: 'scan', result });
  return result;
}

export function startScheduler() {
  if (status.running) return;
  status.running = true;
  const loop = async () => {
    await scanNow().catch((e) => console.error('[autopilot]', e));
    const ms = scanIntervalMs(db.getRules());
    status.nextScanAt = new Date(Date.now() + ms).toISOString();
    timer = setTimeout(loop, ms);
  };
  const first = 15_000; // let the bot connect first
  status.nextScanAt = new Date(Date.now() + first).toISOString();
  timer = setTimeout(loop, first);
  console.log(`[autopilot] on: scanning every ${scanIntervalMs(db.getRules()) / 1000}s`);
}

export function stopScheduler() {
  clearTimeout(timer);
  status.running = false;
}
