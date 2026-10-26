// PURE: the simulated WORLD, i.e. how synthetic customers really respond to an offer (or to no offer).
// It reads each customer's hidden `_archetype` (ground truth). This is the ONLY module allowed to:
// the engine targets using its own estimates (uplift.js) and never sees the truth, so comparing offer vs
// control outcomes is a genuine test of whether the targeting picked the right people.
// The numbers are deliberately NOT the uplift model's formulas.

import { rng } from './data/generate.js';
import { expectedBasket } from './rules/eligibility.js';
import { CATEGORIES, POINT_VALUE_INR, SHIPPING_COST_INR } from './data/catalog.js';

// base = chance of buying in the next 14 days with no offer.
// discount / points / nudge = extra chance an offer of that kind adds (negative = it backfires).
export const TRUE_RESPONSE = {
  vip:             { base: 0.55, discount: 0.03, points: 0.05, nudge: 0.03 },   // buys anyway
  loyal:           { base: 0.30, discount: 0.05, points: 0.05, nudge: 0.03 },
  bargain_hunter:  { base: 0.06, discount: 0.24, points: 0.04, nudge: 0.01 },   // waits for a deal
  regular:         { base: 0.12, discount: 0.09, points: 0.04, nudge: 0.03 },
  lapsing:         { base: 0.04, discount: 0.11, points: 0.03, nudge: 0.02 },   // winnable, barely
  one_timer:       { base: 0.02, discount: 0.03, points: 0.01, nudge: 0.005 },  // mostly gone
  window_shopper:  { base: 0.05, discount: 0.15, points: 0.02, nudge: 0.04 },
  new:             { base: 0.10, discount: 0.12, points: 0.03, nudge: 0.05 },
  serial_returner: { base: 0.15, discount: -0.04, points: -0.02, nudge: -0.03 }, // offers backfire
};

function offerLift(truth, offer) {
  if (!offer) return 0;
  switch (offer.type) {
    case 'percent_off': case 'cart_recovery': return truth.discount * Math.min(1.6, (offer.discountPct || 0) / 12 + (offer.type === 'cart_recovery' ? 0.4 : 0));
    case 'flat_off': return truth.discount * Math.min(1.4, (offer.amountInr || 0) / 150);
    case 'free_shipping': return truth.discount * 0.6;
    case 'bonus_points': return truth.points * Math.min(1.5, (offer.points || 0) / 200);
    case 'points_reminder': return truth.points;
    default: return truth.nudge;
  }
}

// What actually happens within 14 days. Deterministic per decision (seeded), so results are reproducible.
export function trueOutcome(customer, f, rec) {
  const truth = TRUE_RESPONSE[customer._archetype] || TRUE_RESPONSE.regular;
  const treated = rec.status === 'sent';
  let base = truth.base;
  let lift = treated ? offerLift(truth, rec.offer) : 0;
  // Situations that really change behaviour: a fresh cart or something they keep looking at.
  if (f.hasAbandonedCart && f.cartAgeHours <= 72) { base += 0.12; if (rec.offer?.type === 'cart_recovery') lift += 0.08; }
  if (f.browseIntent && f.browseIntent.lastViewHoursAgo <= 72) { base += 0.04; if (rec.offer?.category === f.browseIntent.category) lift += 0.05; }
  // People who already ignore offers respond worse to another one.
  if (treated && f.ignoredStreak >= 3) lift -= 0.04;
  const p = Math.max(0, Math.min(0.97, base + lift));

  const r = rng(`world:${rec.customerId}:${rec.at}`);
  const purchased = r.next() < p;
  const category = rec.offer?.category || f.topCategory;
  let orderValueInr = 0;
  let discountCostInr = 0;
  if (purchased) {
    const basket = rec.offer?.type === 'cart_recovery' && f.cartValue ? f.cartValue : expectedBasket(f, category, rec.offer?.minOrderInr || 0);
    orderValueInr = Math.round(basket * Math.exp(r.normal(0, 0.25)));
    if (treated && rec.offer) {
      const o = rec.offer;
      if (o.discountPct) discountCostInr = Math.round(orderValueInr * o.discountPct / 100);
      else if (o.amountInr) discountCostInr = o.amountInr;
      else if (o.type === 'free_shipping') discountCostInr = SHIPPING_COST_INR;
      else if (o.type === 'bonus_points') discountCostInr = Math.round(o.points * POINT_VALUE_INR);
    }
  }
  const marginPct = CATEGORIES[category]?.marginPct ?? 25;
  return {
    simulated: true, groundTruth: true, purchased, orderValueInr, discountCostInr,
    grossProfitInr: Math.round(orderValueInr * marginPct / 100) - discountCostInr,
    claimed: treated && purchased && !!rec.coupon,
  };
}

// Model check: for each group the ENGINE assigned, what is the TRUE response (from hidden behaviour)?
// If targeting works, Persuadables gain most from a discount and Sure Things buy anyway.
export function modelCheck(rows) {
  const g = {};
  for (const { customer, quadrant } of rows) {
    const t = TRUE_RESPONSE[customer._archetype];
    if (!t) continue;
    const x = (g[quadrant] ||= { n: 0, trueDiscountLift: 0, trueBuyAnyway: 0, backfires: 0 });
    x.n++;
    x.trueDiscountLift += t.discount;
    x.trueBuyAnyway += t.base;
    if (t.discount < 0) x.backfires++;
  }
  for (const x of Object.values(g)) {
    x.trueDiscountLift = Math.round((x.trueDiscountLift / x.n) * 1000) / 10;
    x.trueBuyAnyway = Math.round((x.trueBuyAnyway / x.n) * 1000) / 10;
  }
  return g;
}
