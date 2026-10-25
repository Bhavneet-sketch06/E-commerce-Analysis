export const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
export const inrShort = (n) => {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(v % 100000 ? 1 : 0)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v}`;
};
export const pct = (x, d = 1) => `${((x || 0) * 100).toFixed(d)}%`;
export const ago = (iso) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export const QUAD = {
  persuadable: { label: 'Persuadable', color: 'var(--ok)', tw: 'text-ok', bg: 'bg-ok', hint: 'Buys only if nudged. The only group worth real discounts.' },
  sure_thing: { label: 'Sure Thing', color: 'var(--info)', tw: 'text-info', bg: 'bg-info', hint: 'Buys anyway. A discount here is lost margin, so reward loyalty instead.' },
  lost_cause: { label: 'Lost Cause', color: 'var(--idle)', tw: 'text-idle', bg: 'bg-idle', hint: 'Unlikely to buy either way. Spend very little.' },
  do_not_disturb: { label: 'Do Not Disturb', color: 'var(--bad)', tw: 'text-bad', bg: 'bg-bad', hint: 'Offers make them less likely to buy (fatigue, serial returns). Leave alone.' },
};

export const OFFER_LABEL = {
  percent_off: '% off', flat_off: 'Flat ₹ off', free_shipping: 'Free delivery', cart_recovery: 'Cart recovery',
  bonus_points: 'Bonus points', points_reminder: 'Points reminder', nudge: 'Personal pick',
};

export function offerText(o) {
  if (!o) return '—';
  if (o.type === 'percent_off') return `${o.discountPct}% off ${o.category}`;
  if (o.type === 'flat_off') return `${inr(o.amountInr)} off ${o.category}`;
  if (o.type === 'cart_recovery') return o.discountPct ? `Cart: ${o.discountPct}% off` : 'Cart reminder';
  if (o.type === 'bonus_points') return `${o.points} bonus points`;
  if (o.type === 'points_reminder') return `${o.points} pts expiring`;
  if (o.type === 'nudge') return `Pick: ${o.category}`;
  return OFFER_LABEL[o.type] || o.type;
}

export const SOURCE = {
  ai: { label: 'AI', tw: 'text-ai border-ai/40 bg-ai/10' },
  ai_revised: { label: 'AI · corrected', tw: 'text-warn border-warn/40 bg-warn/10' },
  fallback: { label: 'Rule engine', tw: 'text-muted border-line-strong bg-panel2' },
};

export const STATUS = {
  sent: { label: 'Sent', tw: 'text-ok border-ok/40 bg-ok/10' },
  blocked: { label: 'Blocked', tw: 'text-bad border-bad/40 bg-bad/10' },
  holdout: { label: 'Control group', tw: 'text-info border-info/40 bg-info/10' },
  skipped: { label: 'Skipped', tw: 'text-muted border-line-strong bg-panel2' },
};

export const TRIGGER = {
  cart_abandoned: { label: 'Abandoned cart', emoji: '🛒', hint: 'Items left in the cart and not bought' },
  browse_abandoned: { label: "Browsed, didn't buy", emoji: '👀', hint: 'Kept viewing a category without buying' },
  win_back: { label: 'About to leave', emoji: '💔', hint: 'Overdue compared with their usual buying rhythm' },
  points_expiring: { label: 'Points expiring', emoji: '⏳', hint: 'Reward points about to run out' },
  campaign: { label: 'Campaign', emoji: '🚀' }, customer_request: { label: 'Asked for an offer', emoji: '🙋' }, dashboard: { label: 'Sent from dashboard', emoji: '🖱️' },
};

export const VIOLATION = {
  discount_out_of_range: 'Discount over the limit', amount_out_of_range: '₹ off over the limit', points_out_of_range: 'Points over the limit',
  message_mismatch: 'Message promised more', offer_not_allowed: 'Offer not allowed for this customer', category_not_allowed: 'Category not allowed',
  over_budget: 'Over budget', banned_phrase: 'Banned phrase', invented_code: 'Invented a coupon code', too_long: 'Message too long',
  unknown_offer: 'Unknown offer type', empty_message: 'Empty message', malformed: 'Malformed answer',
};
