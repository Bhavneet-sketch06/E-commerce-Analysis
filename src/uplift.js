// PURE: uplift model. For each customer estimate
//   pBase  = P(buys in the next 14 days with NO offer)
//   pOffer = P(buys in the next 14 days WITH a typical offer)
//   uplift = pOffer - pBase   (what the offer actually changes)
// and place them in one of four quadrants. Discounts only make business sense for Persuadables.

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const round = (x) => Math.round(x * 1000) / 1000;

export const QUADRANTS = {
  persuadable: { label: 'Persuadable', short: 'Buys only if nudged: worth a discount', color: '#2dd4bf' },
  sure_thing: { label: 'Sure Thing', short: 'Buys anyway: no discount, reward loyalty instead', color: '#60a5fa' },
  lost_cause: { label: 'Lost Cause', short: 'Unlikely to buy either way: spend little', color: '#94a3b8' },
  do_not_disturb: { label: 'Do Not Disturb', short: 'Offers make things worse: leave alone', color: '#fb7185' },
};

export const DEFAULT_TARGETING = { persuadableMinUplift: 0.07, sureThingMinBase: 0.3 };

export function scoreUplift(f, targeting = DEFAULT_TARGETING) {
  const R = f.rfm.R;
  const F = f.rfm.F;
  const freshCart = f.hasAbandonedCart && f.cartAgeHours <= 72;

  const zBase = -1.7
    + 0.75 * (R - 3)
    + 0.6 * (F - 3)
    + (freshCart ? 0.9 : 0)
    + 0.06 * Math.min(f.visits30d, 15)
    - 1.1 * (f.lifetimeOrders >= 2 ? f.discountShare : 0)   // coupon-waiters hold off without one
    - (f.recencyDays == null ? 0.6 : 0);
  const pBase = sigmoid(zBase);

  // Responsiveness to an offer: price-sensitive, mid-churn (still reachable), carts waiting.
  const midChurn = 4 * f.churnRisk * (1 - f.churnRisk); // peaks at churnRisk = 0.5
  // Coupon habit, shrunk towards 30% so one coupon order doesn't make someone "price sensitive".
  const couponHabit = (f.discountShare * f.lifetimeOrders + 0.3 * 2) / (f.lifetimeOrders + 2);
  let lift = 0.02
    + 0.3 * couponHabit
    + (freshCart ? 0.14 : f.hasAbandonedCart ? 0.05 : 0)
    + 0.10 * midChurn
    + (f.pointsExpiringSoon > 0 ? 0.03 : 0);
  // Saturation: people who buy anyway can't be lifted much.
  // Scaled so typical coupon uplift lands in the realistic 2-15 percentage-point range.
  lift *= 0.55 * (1 - pBase);
  // Negative effects ("sleeping dogs"): offer fatigue and serial returners.
  lift -= 0.025 * Math.max(0, Math.min(f.ignoredStreak, 7) - 2);
  if (f.lifetimeOrders >= 3) lift -= 0.3 * Math.max(0, f.returnRate - 0.25);
  // Lost causes: very high churn means even offers rarely land.
  lift *= 1 - Math.max(0, f.churnRisk - 0.6) * 2;

  const pOffer = clamp(pBase + lift);
  const uplift = pOffer - pBase;

  let quadrant;
  if (uplift < 0) quadrant = 'do_not_disturb';
  else if (uplift >= targeting.persuadableMinUplift) quadrant = 'persuadable';
  else if (pBase >= targeting.sureThingMinBase) quadrant = 'sure_thing';
  else quadrant = 'lost_cause';

  return { pBase: round(pBase), pOffer: round(pOffer), uplift: round(uplift), quadrant };
}
