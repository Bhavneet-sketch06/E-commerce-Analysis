// PURE: the guardrail. Every proposal (from the AI or the fallback) passes through here before sending.
// It recomputes eligibility from the rules itself and never trusts the proposer.

import { eligibility, estimateCost } from './eligibility.js';
import { OFFER_TYPES } from './defaultRules.js';
import { POINT_VALUE_INR, SHIPPING_COST_INR, FREE_SHIPPING_THRESHOLD_INR } from '../data/catalog.js';

// Devanagari (०-९) and Gurmukhi (੦-੯) digits -> ASCII so Hindi/Punjabi messages are checked too.
export function normalizeDigits(s) {
  return s
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[੦-੯]/g, (d) => String(d.charCodeAt(0) - 0x0A66));
}

const num = (s) => Number(String(s).replace(/,/g, ''));

export function extractClaims(text) {
  const t = normalizeDigits(text);
  const percents = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent|प्रतिशत|ਪ੍ਰਤੀਸ਼ਤ)/gi)].map((m) => num(m[1]));
  const rupees = [
    ...[...t.matchAll(/(?:₹|\brs\.?|\binr|रु\.?|ਰੁ\.?)\s*([\d,]+(?:\.\d+)?)/gi)].map((m) => num(m[1])),
    ...[...t.matchAll(/([\d,]+(?:\.\d+)?)\s*(?:rupees|रुपये|रुपए|ਰੁਪਏ)/gi)].map((m) => num(m[1])),
  ];
  const points = [...t.matchAll(/([\d,]+)\s*(?:bonus\s+)?(?:reward\s+)?(?:points|pts|पॉइंट्स|पॉइंट|अंक|ਪੁਆਇੰਟ|ਅੰਕ)/gi)].map((m) => num(m[1]));
  const freeShipping = /free\s*(delivery|shipping)|मुफ़्त\s*डिलीवरी|मुफ्त\s*डिलीवरी|फ्री\s*डिलीवरी|ਮੁਫ਼ਤ\s*ਡਿਲੀਵਰੀ|ਫ੍ਰੀ\s*ਡਿਲੀਵਰੀ/i.test(t);
  const codeLike = /\b[A-Z]{3,}[0-9]{2,}\b/.test(t);
  return { percents, rupees, points, freeShipping, codeLike };
}

const near = (a, b) => Math.abs(a - b) <= 1;

export function validate(proposal, { customer, f, u, rules, state, now = new Date() }) {
  const violations = [];
  const add = (code, message) => violations.push({ code, message });

  if (!proposal || typeof proposal !== 'object') return { ok: false, violations: [{ code: 'malformed', message: 'No proposal returned' }], offer: null };
  if (proposal.action === 'skip') return { ok: true, violations, offer: null, skipped: true };
  if (proposal.action !== 'send') add('malformed', `Unknown action "${proposal.action}"`);

  const el = eligibility(customer, f, u, rules, state, now);
  for (const b of el.blockers) add(b.code, b.message);

  const { type } = proposal;
  if (!OFFER_TYPES[type]) {
    add('unknown_offer', `"${type}" is not an offer type`);
    return { ok: false, violations, offer: null };
  }
  const matches = el.options.filter((o) => o.type === type);
  if (!matches.length && el.unaffordable.some((o) => o.type === type)) add('over_budget', `Not enough budget left for ${OFFER_TYPES[type].label} (₹${Math.max(0, Math.round(el.budget.today))} left today)`);
  else if (!el.blockers.length && !matches.length) add('offer_not_allowed', `${OFFER_TYPES[type].label} is not allowed for this customer (${u.quadrant.replace(/_/g, ' ')})`);

  let opt = matches[0];
  if (OFFER_TYPES[type].needsCategory && type !== 'nudge') {
    opt = matches.find((o) => o.category === proposal.category);
    if (matches.length && !opt) add('category_not_allowed', `${type} on "${proposal.category}" is not allowed`);
  }
  if (type === 'nudge' && matches[0] && proposal.category && !matches[0].categories.includes(proposal.category)) {
    add('category_not_allowed', `Nudge category "${proposal.category}" doesn't match the customer's interests`);
  }

  const offer = { type, category: proposal.category || opt?.category || null };
  if (opt) {
    if (type === 'percent_off' || type === 'cart_recovery') {
      const pct = Number(proposal.discountPct ?? 0);
      if (!Number.isFinite(pct) || pct < opt.minPct || pct > opt.maxPct) add('discount_out_of_range', `Discount ${pct}% is outside ${opt.minPct}-${opt.maxPct}%`);
      offer.discountPct = pct;
      if (opt.minOrderInr) offer.minOrderInr = opt.minOrderInr;
    } else if (type === 'flat_off') {
      const amt = Number(proposal.amountInr ?? 0);
      if (!Number.isFinite(amt) || amt < opt.minInr || amt > opt.maxInr) add('amount_out_of_range', `₹${amt} off is outside ₹${opt.minInr}-₹${opt.maxInr}`);
      offer.amountInr = amt;
      offer.minOrderInr = opt.minOrderInr;
    } else if (type === 'bonus_points') {
      const pts = Number(proposal.points ?? 0);
      if (!Number.isFinite(pts) || pts < opt.minPoints || pts > opt.maxPoints) add('points_out_of_range', `${pts} points is outside ${opt.minPoints}-${opt.maxPoints}`);
      offer.points = pts;
    } else if (type === 'free_shipping') {
      offer.minOrderInr = opt.minOrderInr;
    } else if (type === 'points_reminder') {
      offer.points = opt.points;
    }
  }
  offer.estCostInr = estimateCost(offer, f);
  if (offer.estCostInr > Math.max(0, el.budget.today)) add('over_budget', `Costs ~₹${offer.estCostInr}, only ₹${Math.max(0, Math.round(el.budget.today))} left today`);

  // ---- Message checks: the text may not promise anything the offer doesn't give ----
  const text = `${proposal.headline || ''}\n${proposal.message || ''}`;
  if (!proposal.message || !proposal.message.trim()) add('empty_message', 'Message is empty');
  if (text.length > rules.message.maxChars) add('too_long', `Message is ${text.length} chars (max ${rules.message.maxChars})`);
  const lower = text.toLowerCase();
  for (const phrase of rules.message.bannedPhrases) if (lower.includes(phrase.toLowerCase())) add('banned_phrase', `Uses banned phrase "${phrase}"`);

  const claims = extractClaims(text);
  const pctAllowed = ['percent_off', 'cart_recovery'].includes(type) && offer.discountPct > 0 ? [offer.discountPct] : [];
  for (const p of claims.percents) if (!pctAllowed.some((a) => near(a, p))) add('message_mismatch', `Message says ${p}% but the offer is ${pctAllowed.length ? `${pctAllowed[0]}%` : 'not a % discount'}`);

  const cart = f.cartItems || [];
  const cartAfter = f.cartValue * (1 - (offer.discountPct || 0) / 100);
  const rupeeAllowed = [
    offer.amountInr, offer.minOrderInr, f.cartValue, Math.round(cartAfter), Math.floor(cartAfter), Math.round(f.cartValue - cartAfter),
    ...cart.map((i) => i.priceInr), ...cart.map((i) => Math.round(i.priceInr * (1 - (offer.discountPct || 0) / 100))),
    offer.points ? Math.round(offer.points * POINT_VALUE_INR) : null, Math.round(f.pointsBalance * POINT_VALUE_INR),
    Math.round(f.pointsExpiringSoon * POINT_VALUE_INR), SHIPPING_COST_INR, FREE_SHIPPING_THRESHOLD_INR,
  ].filter((x) => x != null && x > 0);
  for (const r of claims.rupees) if (!rupeeAllowed.some((a) => near(a, r))) add('message_mismatch', `Message mentions ₹${r}, which doesn't match the offer`);

  const ptsAllowed = [offer.points, f.pointsBalance, f.pointsExpiringSoon, offer.points ? f.pointsBalance + offer.points : null].filter((x) => x != null && x > 0);
  for (const p of claims.points) if (!ptsAllowed.some((a) => near(a, p))) add('message_mismatch', `Message mentions ${p} points, which doesn't match the offer`);

  if (claims.freeShipping && type !== 'free_shipping') add('message_mismatch', 'Message promises free delivery but the offer is not free delivery');
  if (claims.codeLike) add('invented_code', 'Message contains a coupon code; codes are added by the system');

  return { ok: violations.length === 0, violations, offer };
}
