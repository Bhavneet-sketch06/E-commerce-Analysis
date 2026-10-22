// Orchestrates one decision: features -> uplift -> control group -> eligibility -> AI (validated, one revision)
// -> deterministic fallback -> coupon + log. Nothing reaches a customer without passing validate().

import * as db from './db.js';
import { computeFeatures, signals } from './features.js';
import { scoreUplift } from './uplift.js';
import { eligibility, expectedBasket } from './rules/eligibility.js';
import { validate } from './rules/validator.js';
import { fallbackProposal } from './policy.js';
import { proposeOffer, reviseOffer, buildBrief, aiAvailable } from './agent/agent.js';
import { hashString, rng } from './data/generate.js';
import { CATEGORIES, POINT_VALUE_INR } from './data/catalog.js';

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

export async function decide(customerId, { trigger = 'campaign', now = new Date(), useAI = true, ignoreQuietHours = false } = {}) {
  const customer = db.getCustomer(customerId);
  if (!customer) throw new Error(`Unknown customer ${customerId}`);
  const rules = db.getRules();
  const { f, u, signals: why } = analyse(customer, rules, now);
  const holdout = isHoldout(customer, rules);
  const state = { ...db.campaignState(now), ...db.customerState(customer.id), holdout, ignoreQuietHours };
  const ctx = { customer, f, u, rules, state, now };

  const base = {
    at: new Date(now).toISOString(), customerId: customer.id, telegramId: customer.telegramId, name: customer.name,
    trigger, quadrant: u.quadrant, segment: f.segment, scores: u, signals: why, ruleVersion: db.ruleVersions().at(-1).version,
    synthetic: customer.telegramId == null,
  };

  // Control group: record what we WOULD have sent (rule-based, free), send nothing.
  if (holdout) {
    const el = eligibility(customer, f, u, rules, { ...state, holdout: false }, now);
    const wouldSend = el.canContact ? fallbackProposal(customer, f, u, el.options, el.budget.today) : null;
    const offer = wouldSend && wouldSend.action === 'send' ? validate(wouldSend, { ...ctx, state: { ...state, holdout: false } }).offer : null;
    const rec = db.addDecision({ ...base, status: 'holdout', offer, attempts: [], blockers: [{ code: 'control_group', message: 'Control group: no offer sent (used to measure uplift)' }] });
    if (base.synthetic) simulateOutcome(rec, f, u);
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
      const brief = buildBrief({ customer, f, u, el, trigger, now });
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
    const p = fallbackProposal(customer, f, u, el.options, el.budget.today);
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
  if (base.synthetic) simulateOutcome(rec, f, u);
  return rec;
}

// Synthetic customers "respond" according to their uplift scores (seeded per decision, so reproducible).
// Treated: P(buy) = pBase + uplift x generosity. Control: P(buy) = pBase.
export function offerGenerosity(offer) {
  if (!offer) return 0;
  switch (offer.type) {
    case 'percent_off': case 'cart_recovery': return Math.min(1.4, 0.4 + (offer.discountPct || 0) / 15);
    case 'flat_off': return Math.min(1.3, 0.5 + (offer.amountInr || 0) / 250);
    case 'free_shipping': return 0.6;
    case 'bonus_points': return 0.5 + Math.min(0.4, (offer.points || 0) / 1000);
    case 'points_reminder': return 0.5;
    default: return 0.3;
  }
}

export function simulateOutcome(rec, f, u) {
  const r = rng(`outcome:${rec.customerId}:${rec.at}`);
  const treated = rec.status === 'sent';
  const p = treated ? Math.min(0.98, u.pBase + Math.max(-u.pBase, u.uplift * offerGenerosity(rec.offer))) : u.pBase;
  const purchased = r.next() < p;
  const category = rec.offer?.category || f.topCategory;
  let orderValueInr = 0;
  let discountCostInr = 0;
  if (purchased) {
    const basket = rec.offer?.type === 'cart_recovery' ? f.cartValue : expectedBasket(f, category, rec.offer?.minOrderInr || 0);
    orderValueInr = Math.round(basket * Math.exp(r.normal(0, 0.25)));
    if (treated && rec.offer) {
      const o = rec.offer;
      if (o.discountPct) discountCostInr = Math.round(orderValueInr * o.discountPct / 100);
      else if (o.amountInr) discountCostInr = o.amountInr;
      else if (o.type === 'free_shipping') discountCostInr = 49;
      else if (o.type === 'bonus_points') discountCostInr = Math.round(o.points * POINT_VALUE_INR);
    }
  }
  const marginPct = CATEGORIES[category]?.marginPct ?? 25;
  const outcome = {
    simulated: true, purchased, orderValueInr, discountCostInr,
    grossProfitInr: Math.round(orderValueInr * marginPct / 100) - discountCostInr,
    claimed: treated && purchased && !!rec.coupon,
  };
  db.updateDecision(rec.id, { outcome });
  if (outcome.claimed) db.addEvent({ type: 'redeemed', decisionId: rec.id, customerId: rec.customerId, simulated: true, orderValueInr });
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
