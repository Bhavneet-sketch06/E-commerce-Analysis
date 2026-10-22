// PURE: what-if forecast of one campaign wave over the whole population, using the rule-based policy
// (no AI calls), so marketers can move sliders and see the effect instantly.

import { computeFeatures } from './features.js';
import { scoreUplift } from './uplift.js';
import { eligibility, estimateCost, expectedBasket } from './rules/eligibility.js';
import { fallbackProposal, offerGenerosity } from './policy.js';
import { hashString } from './data/generate.js';
import { CATEGORIES } from './data/catalog.js';

// Evaluate at noon IST on today's date, or the campaign start if it hasn't started yet.
export function simulationTime(rules, now = new Date()) {
  const today = new Date(new Date(now).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const day = today < rules.campaign.startDate ? rules.campaign.startDate : today > rules.campaign.endDate ? rules.campaign.endDate : today;
  return new Date(`${day}T06:30:00Z`);
}

export function simulate(rules, customers, now = new Date()) {
  const at = simulationTime(rules, now);
  const rows = customers.filter((c) => !c.optedOut).map((c) => {
    const f = computeFeatures(c, at);
    const u = scoreUplift(f, rules.targeting);
    const value = u.uplift * expectedBasket(f, f.topCategory) * (CATEGORIES[f.topCategory]?.marginPct ?? 25) / 100;
    return { c, f, u, value };
  }).sort((a, b) => b.value - a.value);

  let committed = 0;
  const res = {
    customers: rows.length, sent: 0, holdout: 0, blocked: {}, budgetCommitted: 0,
    expectedRedemptions: 0, expectedDiscountCost: 0, expectedIncrementalOrders: 0, expectedIncrementalRevenue: 0, expectedProfit: 0,
    wastedOnSureThings: 0, byQuadrant: {}, byOffer: {}, byCategory: {},
  };
  for (const { c, f, u } of rows) {
    const holdout = c.telegramId == null && hashString(`${rules.campaign.name}:${c.id}`) % 100 < rules.campaign.controlGroupPct;
    if (holdout) { res.holdout++; continue; }
    const state = { committedInr: committed, committedTodayInr: committed, sentOffers: [], ignoreQuietHours: true };
    const noPacing = { ...rules, campaign: { ...rules.campaign, dailyPacing: false } };
    const el = eligibility(c, f, u, noPacing, state, at);
    if (!el.canContact) { const code = el.blockers[0]?.code || 'no_option'; res.blocked[code] = (res.blocked[code] || 0) + 1; continue; }
    const p = fallbackProposal(c, f, u, el.options, el.budget.today);
    if (p.action !== 'send') { res.blocked.no_option = (res.blocked.no_option || 0) + 1; continue; }
    const offer = { ...p };
    const cost = estimateCost(offer, f);
    committed += cost;

    const gen = offerGenerosity(offer);
    const lift = Math.max(-u.pBase, u.uplift * gen);
    const pBuy = Math.min(0.98, u.pBase + lift);
    const category = offer.category || f.topCategory;
    const basket = offer.type === 'cart_recovery' ? f.cartValue : expectedBasket(f, category, offer.minOrderInr || 0);
    const margin = (CATEGORIES[category]?.marginPct ?? 25) / 100;
    const discountCost = pBuy * cost;
    const incRevenue = lift * basket;

    res.sent++;
    res.expectedRedemptions += pBuy;
    res.expectedDiscountCost += discountCost;
    res.expectedIncrementalOrders += lift;
    res.expectedIncrementalRevenue += incRevenue;
    res.expectedProfit += incRevenue * margin - discountCost;
    if (u.quadrant === 'sure_thing') res.wastedOnSureThings += u.pBase * cost;

    const q = (res.byQuadrant[u.quadrant] ||= { sent: 0, cost: 0, incRevenue: 0, profit: 0 });
    q.sent++; q.cost += discountCost; q.incRevenue += incRevenue; q.profit += incRevenue * margin - discountCost;
    res.byOffer[offer.type] = (res.byOffer[offer.type] || 0) + 1;
    if (offer.category) res.byCategory[offer.category] = (res.byCategory[offer.category] || 0) + 1;
  }
  res.budgetCommitted = committed;
  res.roi = res.expectedDiscountCost ? res.expectedProfit / res.expectedDiscountCost : null;
  for (const k of ['expectedRedemptions', 'expectedDiscountCost', 'expectedIncrementalOrders', 'expectedIncrementalRevenue', 'expectedProfit', 'budgetCommitted', 'wastedOnSureThings']) res[k] = Math.round(res[k] * 10) / 10;
  for (const q of Object.values(res.byQuadrant)) for (const k of ['cost', 'incRevenue', 'profit']) q[k] = Math.round(q[k]);
  return res;
}
