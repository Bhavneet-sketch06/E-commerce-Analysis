// Orchestrates one decision: features -> uplift -> control group -> eligibility -> AI (validated, one revision)
// -> deterministic fallback -> coupon + log. Nothing reaches a customer without passing validate().

import * as db from './db.js';
import { computeFeatures, signals } from './features.js';
import { scoreUplift } from './uplift.js';
import { eligibility, expectedBasket } from './rules/eligibility.js';
import { validate } from './rules/validator.js';
import { fallbackProposal, offerGenerosity } from './policy.js';

export { offerGenerosity };
import { proposeOffer, reviseOffer, buildBrief, aiAvailable } from './agent/agent.js';
import { hashString } from './data/generate.js';
import { CATEGORIES } from './data/catalog.js';
import { trueOutcome } from './world.js';

const HOUR = 3_600_000;

// Control group: a stable random slice of SYNTHETIC customers per campaign. Live Telegram testers always get offers.
export function isHoldout(customer, rules) {
  if (customer.telegramId != null) return false;
  return hashString(`${rules.campaign.name}:${customer.id}`) % 100 < rules.campaign.controlGroupPct;
}

export function analyse(customer, rules, now = new Date()) {
  const f = computeFeatures(customer, now);
  const u = scoreUplift(f, rules.targeting);
  return { f, u, signals: signals(f) };
}

function summarise(p) {
  if (!p) return null;
  const { action, type, category, discountPct, amountInr, points, headline, message, reasoning } = p;
  return { action, type, category, discountPct, amountInr, points, headline, message, reasoning };
}

export async function decide(customerId, { trigger = 'campaign', triggerReason = null, now = new Date(), useAI = true, ignoreQuietHours = false } = {}) {
  const customer = db.getCustomer(customerId);
  if (!customer) throw new Error(`Unknown customer ${customerId}`);
  const rules = db.getRules();
  const { f, u, signals: why } = analyse(customer, rules, now);
  const holdout = isHoldout(customer, rules);
  const state = { ...db.campaignState(now), ...db.customerState(customer.id), holdout, ignoreQuietHours, liveCustomer: customer.telegramId != null };
  const ctx = { customer, f, u, rules, state, now };

  const base = {
    at: new Date(now).toISOString(), customerId: customer.id, telegramId: customer.telegramId, name: customer.name,
    trigger, triggerReason, quadrant: u.quadrant, segment: f.segment, scores: u, signals: why, ruleVersion: db.ruleVersions().at(-1).version,
    synthetic: customer.telegramId == null,
  };

  // Control group: record what we WOULD have sent (rule-based, free), send nothing.
  if (holdout) {
    const el = eligibility(customer, f, u, rules, { ...state, holdout: false }, now);
    const wouldSend = el.canContact ? fallbackProposal(customer, f, u, el.options, el.budget.today, trigger) : null;
    const offer = wouldSend && wouldSend.action === 'send' ? validate(wouldSend, { ...ctx, state: { ...state, holdout: false } }).offer : null;
    const rec = db.addDecision({ ...base, status: 'holdout', offer, attempts: [], blockers: [{ code: 'control_group', message: 'Control group: no offer sent (used to measure uplift)' }] });
    if (base.synthetic) simulateOutcome(rec, f, customer);
    return rec;
  }

  const el = eligibility(customer, f, u, rules, state, now);
  if (!el.canContact) {
    return db.addDecision({ ...base, status: 'blocked', blockers: el.blockers, attempts: [] });
  }

  const attempts = [];
  let chosen = null;
  if (useAI && aiAvailable()) {
    try {
      const brief = buildBrief({ customer, f, u, el, trigger, triggerReason, now });
      let res = await proposeOffer(brief);
      let check = validate(res.proposal, ctx);
      attempts.push({ source: 'ai', proposal: summarise(res.proposal), ok: check.ok, violations: check.violations, ms: res.ms, model: res.model });
      if (check.ok) chosen = { proposal: res.proposal, check, source: 'ai' };
      else {
        res = await reviseOffer(res.messages, check.violations);
        check = validate(res.proposal, ctx);
        attempts.push({ source: 'ai_revision', proposal: summarise(res.proposal), ok: check.ok, violations: check.violations, ms: res.ms, model: res.model });
        if (check.ok) chosen = { proposal: res.proposal, check, source: 'ai_revised' };
      }
    } catch (err) {
      attempts.push({ source: 'ai', ok: false, error: String(err.message || err).slice(0, 300), violations: [] });
    }
  }
  if (!chosen) {
    const p = fallbackProposal(customer, f, u, el.options, el.budget.today, trigger);
    const check = validate(p, ctx);
    attempts.push({ source: 'fallback', proposal: summarise(p), ok: check.ok, violations: check.violations });
    if (check.ok) chosen = { proposal: p, check, source: 'fallback' };
  }
  if (!chosen) {
    return db.addDecision({ ...base, status: 'blocked', attempts, blockers: [{ code: 'no_valid_offer', message: 'No proposal passed the guardrail' }] });
  }
  if (chosen.check.skipped) {
    return db.addDecision({ ...base, status: 'skipped', source: chosen.source, attempts, reasoning: chosen.proposal.reasoning });
  }

  const { offer } = chosen.check;
  const expiresAt = new Date(new Date(now).getTime() + rules.campaign.offerValidityHours * HOUR).toISOString();
  const needsCode = ['percent_off', 'flat_off', 'free_shipping', 'cart_recovery', 'bonus_points'].includes(offer.type) && !(offer.type === 'cart_recovery' && !offer.discountPct);
  const code = needsCode ? db.newCouponCode() : null;
  const rec = db.addDecision({
    ...base, status: 'sent', source: chosen.source, attempts, offer,
    headline: chosen.proposal.headline, message: chosen.proposal.message, reasoning: chosen.proposal.reasoning,
    coupon: code, expiresAt,
  });
  if (code) db.addCoupon({ code, decisionId: rec.id, customerId: customer.id, offer, expiresAt, status: 'issued' });
  if (base.synthetic) simulateOutcome(rec, f, customer);
  return rec;
}

// Synthetic customers respond according to their hidden TRUE behaviour (world.js), not our model's estimates,
// so treated-vs-control results really test the targeting.
export function simulateOutcome(rec, f, customer = db.getCustomer(rec.customerId)) {
  const outcome = trueOutcome(customer, f, rec);
  db.updateDecision(rec.id, { outcome });
  if (outcome.claimed) db.addEvent({ type: 'redeemed', decisionId: rec.id, customerId: rec.customerId, simulated: true, orderValueInr: outcome.orderValueInr });
}

// One-off: outcomes simulated by the old (model-based) method are recomputed from ground truth.
export function migrateSimulatedOutcomes() {
  const rules = db.getRules();
  const redo = new Set();
  for (const d of db.decisions()) {
    if (!d.outcome?.simulated || d.outcome.groundTruth) continue;
    const c = db.getCustomer(d.customerId);
    if (!c) continue;
    const { f } = analyse(c, rules, d.at);
    db.updateDecision(d.id, { outcome: trueOutcome(c, f, d) });
    redo.add(d.id);
  }
  if (redo.size) {
    db.removeEvents((e) => e.simulated && redo.has(e.decisionId));
    for (const id of redo) {
      const d = db.getDecision(id);
      if (d.outcome.claimed) db.addEvent({ type: 'redeemed', decisionId: id, customerId: d.customerId, simulated: true, orderValueInr: d.outcome.orderValueInr, at: d.at });
    }
  }
  return redo.size;
}

// Run a campaign over many customers: highest expected incremental value first, so the budget goes where it matters.
export async function runCampaign({ limit = 50, useAI = true, concurrency = 4, now = new Date(), onlySynthetic = false, onDecision } = {}) {
  const rules = db.getRules();
  const ranked = db.customers()
    .filter((c) => !c.optedOut && (!onlySynthetic || c.telegramId == null))
    .map((c) => {
      const { f, u } = analyse(c, rules, now);
      return { c, value: u.uplift * expectedBasket(f, f.topCategory) * (CATEGORIES[f.topCategory]?.marginPct ?? 25) / 100 };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

  const results = [];
  let i = 0;
  async function worker() {
    while (i < ranked.length) {
      const { c } = ranked[i++];
      try {
        const d = await decide(c.id, { trigger: 'campaign', now, useAI });
        results.push(d);
        onDecision?.(d);
      } catch (err) {
        console.error('[campaign]', c.id, err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
