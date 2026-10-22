// PURE: customer + rules + state -> may we contact them, and which offers within which limits.
// Both the AI agent (as its menu) and the validator (as the source of truth) use this.

import { CATEGORIES, POINT_VALUE_INR, SHIPPING_COST_INR } from '../data/catalog.js';
import { OFFER_TYPES } from './defaultRules.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function istHour(now) {
  const d = new Date(new Date(now).getTime() + 5.5 * HOUR);
  return d.getUTCHours();
}

function istDate(now) {
  return new Date(new Date(now).getTime() + 5.5 * HOUR).toISOString().slice(0, 10);
}

export function activeWindows(rules, now) {
  const today = istDate(now);
  return (rules.windows || []).filter((w) => w.start <= today && today <= w.end);
}

// Budget available right now (overall and, with pacing, for today).
export function budgetLeft(rules, state, now) {
  const { budgetInr, startDate, endDate, dailyPacing } = rules.campaign;
  const overall = budgetInr - (state.committedInr || 0);
  if (!dailyPacing) return { overall, today: overall };
  const days = Math.max(1, Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY) + 1);
  const dailyCap = (budgetInr / days) * 3;
  return { overall, today: Math.min(overall, dailyCap - (state.committedTodayInr || 0)), dailyCap };
}

// Contact-level checks: can this person receive ANY message right now?
export function contactBlockers(customer, f, u, rules, state, now) {
  const blockers = [];
  const nowMs = new Date(now).getTime();
  const today = istDate(now);
  const { campaign, contact, exclusions } = rules;
  if (customer.optedOut) blockers.push({ code: 'opted_out', message: 'Customer opted out of offers' });
  if (state.holdout) blockers.push({ code: 'control_group', message: 'Customer is in the control group (no offers, used to measure uplift)' });
  if (today < campaign.startDate || today > campaign.endDate) blockers.push({ code: 'campaign_inactive', message: `Campaign runs ${campaign.startDate} to ${campaign.endDate}` });
  const h = istHour(now);
  const quiet = contact.quietHoursStart > contact.quietHoursEnd
    ? h >= contact.quietHoursStart || h < contact.quietHoursEnd
    : h >= contact.quietHoursStart && h < contact.quietHoursEnd;
  if (quiet && !state.ignoreQuietHours) blockers.push({ code: 'quiet_hours', message: `Quiet hours (${contact.quietHoursStart}:00-${contact.quietHoursEnd}:00 IST)` });
  const recent = (state.sentOffers || []).filter((o) => nowMs - Date.parse(o.at) < 7 * DAY);
  if (recent.length >= contact.maxOffersPerWeek) blockers.push({ code: 'frequency_cap', message: `Already got ${recent.length} offers this week (max ${contact.maxOffersPerWeek})` });
  const last = (state.sentOffers || []).map((o) => Date.parse(o.at)).sort((a, b) => b - a)[0];
  if (last && nowMs - last < contact.cooldownHours * HOUR) blockers.push({ code: 'cooldown', message: `Last offer ${Math.round((nowMs - last) / HOUR)}h ago (cooldown ${contact.cooldownHours}h)` });
  if (f.ignoredStreak >= contact.pauseAfterIgnored) blockers.push({ code: 'fatigue', message: `Ignored the last ${f.ignoredStreak} offers (pause after ${contact.pauseAfterIgnored})` });
  if (f.lifetimeOrders >= 3 && f.returnRate > exclusions.maxReturnRate) blockers.push({ code: 'high_returns', message: `Return rate ${Math.round(f.returnRate * 100)}% is above ${Math.round(exclusions.maxReturnRate * 100)}%` });
  if (f.tenureDays < exclusions.minAccountAgeDays) blockers.push({ code: 'new_account', message: `Account is ${f.tenureDays} days old (min ${exclusions.minAccountAgeDays})` });
  const q = rules.targeting.quadrants[u.quadrant];
  if (!q || !q.allowedOffers.length) blockers.push({ code: 'quadrant_blocked', message: `No offers allowed for ${u.quadrant.replace(/_/g, ' ')} customers` });
  return blockers;
}

// Highest % discount allowed for this quadrant + category + offer, after margin floor and festive windows.
export function maxPctFor(rules, quadrant, category, offerMaxPct, now) {
  const cat = rules.categories[category];
  if (!cat || !cat.enabled) return 0;
  const win = activeWindows(rules, now).filter((w) => w.categories.includes(category));
  const bonus = win.reduce((s, w) => s + (w.extraDiscountPct || 0), 0);
  const qMax = rules.targeting.quadrants[quadrant]?.maxDiscountPct ?? 0;
  const marginCap = (CATEGORIES[category]?.marginPct ?? 0) - rules.margin.minMarginAfterDiscountPct;
  const caps = [offerMaxPct + bonus, cat.maxDiscountPct + bonus, qMax === 0 ? 0 : qMax + bonus, marginCap];
  return Math.max(0, Math.floor(Math.min(...caps)));
}

export function expectedBasket(f, category, minOrderInr = 0) {
  const fromHistory = f.topCategory === category && f.aov ? f.aov : null;
  const [lo, hi] = CATEGORIES[category]?.price || [500, 2000];
  const typical = fromHistory || Math.round(Math.sqrt(lo * hi));
  return Math.max(minOrderInr, typical);
}

// Estimated cost to the business if the offer is redeemed (used for budget checks).
export function estimateCost(offer, f) {
  switch (offer.type) {
    case 'percent_off': return Math.round(expectedBasket(f, offer.category, offer.minOrderInr) * offer.discountPct / 100);
    case 'cart_recovery': return Math.round(f.cartValue * (offer.discountPct || 0) / 100);
    case 'flat_off': return offer.amountInr || 0;
    case 'free_shipping': return SHIPPING_COST_INR;
    case 'bonus_points': return Math.round((offer.points || 0) * POINT_VALUE_INR);
    default: return 0;
  }
}

export function eligibility(customer, f, u, rules, state, now = new Date()) {
  const blockers = contactBlockers(customer, f, u, rules, state, now);
  const budget = budgetLeft(rules, state, now);
  const quadrant = rules.targeting.quadrants[u.quadrant] || { allowedOffers: [], maxDiscountPct: 0 };
  const options = [];
  if (!blockers.length) {
    const cats = Object.keys(rules.categories).filter((c) => rules.categories[c].enabled);
    for (const type of quadrant.allowedOffers) {
      const o = rules.offers[type];
      if (!o?.enabled || !OFFER_TYPES[type]) continue;
      if (type === 'percent_off') {
        for (const category of cats) {
          const maxPct = maxPctFor(rules, u.quadrant, category, o.maxPct, now);
          if (maxPct >= o.minPct) options.push({ type, category, minPct: o.minPct, maxPct, minOrderInr: o.minOrderInr });
        }
      } else if (type === 'flat_off') {
        for (const category of cats) {
          const maxPct = maxPctFor(rules, u.quadrant, category, 100, now);
          const maxInr = Math.min(o.maxInr, Math.floor((o.minOrderInr * maxPct) / 100));
          if (maxInr >= o.minInr) options.push({ type, category, minInr: o.minInr, maxInr, minOrderInr: o.minOrderInr });
        }
      } else if (type === 'cart_recovery') {
        if (!f.hasAbandonedCart) continue;
        const category = f.cartItems[0]?.category;
        const maxPct = maxPctFor(rules, u.quadrant, category, o.maxPct, now);
        options.push({ type, category, minPct: 0, maxPct, cartValueInr: f.cartValue });
      } else if (type === 'free_shipping') {
        options.push({ type, minOrderInr: o.minOrderInr });
      } else if (type === 'bonus_points') {
        options.push({ type, minPoints: o.minPoints, maxPoints: o.maxPoints });
      } else if (type === 'points_reminder') {
        if (f.pointsExpiringSoon >= (o.minPoints || 1)) options.push({ type, points: f.pointsExpiringSoon });
      } else if (type === 'nudge') {
        options.push({ type, categories: [...new Set([f.topCategory, f.preferredCategory])].filter((c) => cats.includes(c)) });
      }
    }
  }
  // Drop costly options the remaining budget can't cover even at their minimum.
  const affordable = options.filter((opt) => {
    const minOffer = { ...opt, discountPct: opt.minPct, amountInr: opt.minInr, points: opt.minPoints };
    return estimateCost(minOffer, f) <= Math.max(0, budget.today);
  });
  const budgetBlocked = options.length && !affordable.length;
  return {
    canContact: !blockers.length && affordable.length > 0,
    blockers: budgetBlocked ? [...blockers, { code: 'budget_exhausted', message: `Budget left today ₹${Math.max(0, Math.round(budget.today))}` }] : blockers,
    options: affordable,
    unaffordable: options.filter((o) => !affordable.includes(o)),
    budget,
    windows: activeWindows(rules, now).map((w) => w.name),
  };
}
