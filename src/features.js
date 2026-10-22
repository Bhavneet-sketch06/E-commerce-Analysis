// PURE: raw customer record -> behavioural features the engine reasons about.
// Uses only observed behaviour (orders, visits, cart, points, offer history), never `_archetype`.

import { CATEGORIES } from './data/catalog.js';

const DAY = 86_400_000;
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

function score(value, steps) {
  // steps: thresholds for scores 5,4,3,2 (descending "better" values); anything else is 1
  for (let i = 0; i < steps.length; i++) if (steps[i](value)) return 5 - i;
  return 1;
}

export function computeFeatures(c, refDate = new Date()) {
  const refMs = new Date(refDate).getTime();
  const orders = c.orders || [];
  const kept = orders.filter((o) => !o.returned);
  const last365 = kept.filter((o) => refMs - Date.parse(o.date) < 365 * DAY);
  const tenureDays = Math.max(0, Math.round((refMs - Date.parse(c.signupDate)) / DAY));
  const lastOrderMs = orders.length ? Date.parse(orders[orders.length - 1].date) : null;
  const recencyDays = lastOrderMs ? Math.round((refMs - lastOrderMs) / DAY) : null;

  const frequency365 = last365.length;
  const monetary365 = last365.reduce((s, o) => s + o.valueInr, 0);
  const lifetimeValue = kept.reduce((s, o) => s + o.valueInr, 0);
  const aov = kept.length ? Math.round(lifetimeValue / kept.length) : 0;
  const discountShare = orders.length ? orders.filter((o) => o.usedCoupon).length / orders.length : 0.5;
  const returnRate = orders.length ? orders.filter((o) => o.returned).length / orders.length : 0;

  let avgGapDays = null;
  if (orders.length >= 2) {
    const first = Date.parse(orders[0].date);
    avgGapDays = Math.round((lastOrderMs - first) / DAY / (orders.length - 1));
  }
  // How overdue is the next purchase compared with this customer's own rhythm?
  const expectedGap = Math.max(avgGapDays ?? 60, 14);
  const overdueRatio = recencyDays == null ? null : round(recencyDays / expectedGap);

  // Category affinity from orders (fallback: stated preference)
  const counts = {};
  for (const o of orders) counts[o.category] = (counts[o.category] || 0) + 1;
  const topCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || c.preferredCategory;

  const cartAgeHours = c.cart ? Math.round((refMs - Date.parse(c.cart.updatedAt)) / 3600_000) : null;
  const hasAbandonedCart = !!c.cart && cartAgeHours >= 1 && c.cart.items.length > 0;
  const daysSinceVisit = Math.round((refMs - Date.parse(c.lastVisitDate)) / DAY);

  const R = recencyDays == null ? 1 : score(recencyDays, [(d) => d <= 14, (d) => d <= 30, (d) => d <= 60, (d) => d <= 120]);
  const F = score(frequency365, [(f) => f >= 12, (f) => f >= 6, (f) => f >= 3, (f) => f >= 2]);
  const M = score(monetary365, [(m) => m >= 30000, (m) => m >= 12000, (m) => m >= 5000, (m) => m >= 1500]);

  let segment;
  if (!orders.length) segment = c.visits30d > 0 ? 'Window Shopper' : 'Dormant Signup';
  else if (tenureDays <= 45) segment = 'New Customer';
  else if (R >= 4 && F >= 4) segment = 'Champion';
  else if (F >= 4 || (R >= 3 && F >= 3)) segment = 'Loyal';
  else if (R >= 4 && F <= 2) segment = 'Promising';
  else if (R <= 2 && F >= 3) segment = 'At Risk';
  else if (R <= 2 && orders.length <= 1) segment = 'Lost';
  else if (R <= 2) segment = 'Hibernating';
  else segment = 'Needs Attention';

  // Churn risk: overdue vs own rhythm, low engagement, no recent visits.
  let churnRisk;
  if (recencyDays == null) churnRisk = c.visits30d > 3 ? 0.45 : 0.8;
  else {
    const z = -1.6 + 1.7 * Math.log(Math.max(overdueRatio, 0.1)) - 0.12 * Math.min(c.visits30d, 15) + 0.015 * Math.min(daysSinceVisit, 90);
    churnRisk = sigmoid(z);
  }

  return {
    id: c.id,
    recencyDays, frequency365, monetary365, lifetimeOrders: orders.length, lifetimeValue, aov,
    tenureDays, avgGapDays, overdueRatio,
    discountShare: round(discountShare), returnRate: round(returnRate),
    topCategory, preferredCategory: c.preferredCategory,
    cartValue: c.cart?.valueInr || 0, cartItems: c.cart?.items || [], cartAgeHours, hasAbandonedCart,
    visits30d: c.visits30d, daysSinceVisit,
    pointsBalance: c.pointsBalance, pointsExpiringSoon: c.pointsExpiringSoon,
    ignoredStreak: c.offerHistory?.ignoredStreak || 0,
    rfm: { R, F, M }, segment, churnRisk: round(churnRisk),
  };
}

// Plain-language reasons this customer stands out; used for /why and dashboard cards.
export function signals(f) {
  const out = [];
  if (f.hasAbandonedCart) out.push(`left ₹${f.cartValue.toLocaleString('en-IN')} in the cart ${f.cartAgeHours < 48 ? `${f.cartAgeHours}h` : `${Math.round(f.cartAgeHours / 24)} days`} ago`);
  if (f.recencyDays != null && f.overdueRatio >= 1.5) out.push(`last order ${f.recencyDays} days ago (usually every ~${f.avgGapDays ?? 60} days)`);
  if (f.recencyDays == null) out.push('has never ordered yet');
  if (f.pointsExpiringSoon > 0) out.push(`${f.pointsExpiringSoon} reward points expire within 30 days`);
  if (f.discountShare >= 0.6 && f.lifetimeOrders >= 2) out.push('mostly buys with a coupon');
  if (f.rfm.F >= 4) out.push(`orders often (${f.frequency365} orders this year)`);
  if (f.returnRate >= 0.3 && f.lifetimeOrders >= 3) out.push(`returns a lot (${Math.round(f.returnRate * 100)}% of orders)`);
  if (f.ignoredStreak >= 3) out.push(`ignored the last ${f.ignoredStreak} offers`);
  if (f.visits30d >= 8 && f.recencyDays != null && f.recencyDays > 30) out.push(`visited ${f.visits30d} times this month without buying`);
  return out;
}

export function categoryMargin(category) {
  return CATEGORIES[category]?.marginPct ?? 0;
}
