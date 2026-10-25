// PURE: decides WHEN a customer should be contacted. Looks at what they just did (or stopped doing)
// and returns the moments that are due, most urgent first. The engine still decides WHAT (if anything) to send.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const TRIGGERS = {
  cart_abandoned: { label: 'Abandoned cart', emoji: '🛒' },
  browse_abandoned: { label: 'Browsed, didn\'t buy', emoji: '👀' },
  win_back: { label: 'About to leave', emoji: '💔' },
  points_expiring: { label: 'Points expiring', emoji: '⏳' },
};
const ORDER = Object.keys(TRIGGERS);
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function recentlyFired(state, type, now, withinMs, key) {
  const s = state?.[type];
  if (!s) return false;
  if (key !== undefined && s.key !== key) return false;
  return now - Date.parse(s.at) < withinMs;
}

// Categories the customer keeps viewing without buying, using the rule's thresholds.
export function browseCandidates(customer, rules, nowMs) {
  const t = rules.triggers.browseAbandoned;
  const bought = new Set((customer.orders || []).filter((o) => nowMs - Date.parse(o.date) < 30 * DAY).map((o) => o.category));
  const inCart = new Set((customer.cart?.items || []).map((i) => i.category));
  const byCat = {};
  for (const e of customer.browseLog || []) {
    const at = Date.parse(e.at);
    if (at > nowMs || nowMs - at > t.withinDays * DAY || bought.has(e.category) || inCart.has(e.category)) continue;
    (byCat[e.category] ||= []).push(e);
  }
  return Object.entries(byCat)
    .filter(([, evs]) => evs.length >= t.minViews)
    .map(([category, evs]) => {
      const pc = {};
      for (const e of evs) if (e.product) pc[e.product] = (pc[e.product] || 0) + 1;
      const lastViewMs = Math.max(...evs.map((e) => Date.parse(e.at)));
      return { category, views: evs.length, product: Object.entries(pc).sort((a, b) => b[1] - a[1])[0]?.[0] || null, minutesSinceLastView: Math.round((nowMs - lastViewMs) / MIN) };
    })
    .sort((a, b) => b.views - a.views);
}

export function detectTriggers(customer, f, rules, now = new Date()) {
  const t = rules.triggers;
  if (!t?.enabled || customer.optedOut) return [];
  const nowMs = new Date(now).getTime();
  const state = customer.triggerState || {};
  const due = [];

  const cart = customer.cart;
  if (t.cartAbandoned?.enabled && cart?.items?.length) {
    const ageMin = (nowMs - Date.parse(cart.updatedAt)) / MIN;
    if (ageMin >= t.cartAbandoned.afterMinutes && ageMin <= t.cartAbandoned.maxHours * 60 && !recentlyFired(state, 'cart_abandoned', nowMs, Infinity, cart.updatedAt)) {
      const ago = ageMin < 120 ? `${Math.round(ageMin)} min` : ageMin < 48 * 60 ? `${Math.round(ageMin / 60)}h` : `${Math.round(ageMin / 1440)} days`;
      due.push({ type: 'cart_abandoned', key: cart.updatedAt, reason: `Left ${inr(cart.valueInr)} in the cart ${ago} ago (${cart.items.map((i) => i.product).join(', ')})` });
    }
  }

  if (t.browseAbandoned?.enabled) {
    const c = browseCandidates(customer, rules, nowMs).find((x) => x.minutesSinceLastView >= t.browseAbandoned.afterMinutes);
    if (c && !recentlyFired(state, 'browse_abandoned', nowMs, 7 * DAY, c.category)) {
      due.push({ type: 'browse_abandoned', key: c.category, category: c.category, reason: `Viewed ${c.category}${c.product ? ` (${c.product})` : ''} ${c.views} times in ${t.browseAbandoned.withinDays} days without buying` });
    }
  }

  const w = t.winBack;
  if (w?.enabled && f.lifetimeOrders >= 1 && f.recencyDays >= w.minDaysSinceOrder && f.overdueRatio >= w.overdueRatio
    && !recentlyFired(state, 'win_back', nowMs, w.repeatAfterDays * DAY)) {
    due.push({ type: 'win_back', key: String(f.recencyDays), reason: `Last order ${f.recencyDays} days ago, usually orders every ~${f.avgGapDays ?? 60} days (${f.overdueRatio}× overdue)` });
  }

  const p = t.pointsExpiring;
  if (p?.enabled && f.pointsExpiringSoon >= p.minPoints && !recentlyFired(state, 'points_expiring', nowMs, p.repeatAfterDays * DAY)) {
    due.push({ type: 'points_expiring', key: String(f.pointsExpiringSoon), reason: `${f.pointsExpiringSoon} reward points expire within 30 days` });
  }

  return due.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
}

// Offers that ran out without any response count as "ignored" (drives offer fatigue / Do Not Disturb).
export function isUnansweredExpiry(decision, nowMs) {
  return decision.status === 'sent' && !decision.expiryProcessed && decision.expiresAt && Date.parse(decision.expiresAt) < nowMs;
}
