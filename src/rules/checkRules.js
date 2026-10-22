// PURE: sanity-check a rules object before saving. errors block saving; warnings are shown to marketers.
import { CATEGORIES } from '../data/catalog.js';
import { OFFER_TYPES } from './defaultRules.js';

export function checkRules(r) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ field, message });
  const warn = (field, message) => warnings.push({ field, message });
  if (!r || typeof r !== 'object') return { errors: [{ field: 'rules', message: 'Rules are missing' }], warnings };

  const c = r.campaign || {};
  if (!(c.budgetInr >= 0)) err('campaign.budgetInr', 'Budget must be 0 or more');
  if (!c.startDate || !c.endDate || c.startDate > c.endDate) err('campaign.endDate', 'Campaign end date must be after the start date');
  if (!(c.controlGroupPct >= 0 && c.controlGroupPct <= 50)) err('campaign.controlGroupPct', 'Control group must be between 0% and 50%');
  if (c.controlGroupPct < 5) warn('campaign.controlGroupPct', 'A control group under 5% makes it hard to prove the offers work');
  if (!(c.offerValidityHours >= 1)) err('campaign.offerValidityHours', 'Offers must be valid for at least 1 hour');

  const k = r.contact || {};
  if (!(k.maxOffersPerWeek >= 0 && k.maxOffersPerWeek <= 14)) err('contact.maxOffersPerWeek', 'Offers per week must be between 0 and 14');
  if (k.maxOffersPerWeek > 4) warn('contact.maxOffersPerWeek', 'More than 4 offers a week usually feels like spam');
  if (k.maxOffersPerWeek > 0 && k.cooldownHours * k.maxOffersPerWeek > 168) warn('contact.cooldownHours', `With a ${k.cooldownHours}h gap, nobody can actually get ${k.maxOffersPerWeek} offers in a week`);

  const o = r.offers || {};
  for (const type of Object.keys(OFFER_TYPES)) if (!o[type]) err(`offers.${type}`, `Missing settings for ${OFFER_TYPES[type].label}`);
  if (o.percent_off && o.percent_off.minPct > o.percent_off.maxPct) err('offers.percent_off.minPct', 'Minimum % off is higher than the maximum');
  if (o.flat_off && o.flat_off.minInr > o.flat_off.maxInr) err('offers.flat_off.minInr', 'Minimum ₹ off is higher than the maximum');
  if (o.bonus_points && o.bonus_points.minPoints > o.bonus_points.maxPoints) err('offers.bonus_points.minPoints', 'Minimum points is higher than the maximum');
  if (o.flat_off && o.flat_off.maxInr > o.flat_off.minOrderInr) err('offers.flat_off.maxInr', 'Flat discount cannot be bigger than the minimum order');

  const floor = r.margin?.minMarginAfterDiscountPct ?? 0;
  for (const [cat, cfg] of Object.entries(r.categories || {})) {
    if (!CATEGORIES[cat]) { err(`categories.${cat}`, `Unknown category ${cat}`); continue; }
    const marginCap = CATEGORIES[cat].marginPct - floor;
    if (cfg.maxDiscountPct < 0) err(`categories.${cat}.maxDiscountPct`, 'Discount cap cannot be negative');
    if (cfg.enabled && cfg.maxDiscountPct > marginCap) warn(`categories.${cat}.maxDiscountPct`, `${cat} is capped at ${cfg.maxDiscountPct}% but its margin only allows ${Math.max(0, marginCap)}%. The margin floor wins`);
    if (cfg.enabled && o.percent_off && Math.min(cfg.maxDiscountPct, marginCap) < o.percent_off.minPct) warn(`categories.${cat}.maxDiscountPct`, `${cat} can never get a % off offer (cap below the ${o.percent_off.minPct}% minimum)`);
  }

  const q = r.targeting?.quadrants || {};
  for (const [name, cfg] of Object.entries(q)) {
    for (const t of cfg.allowedOffers || []) if (!OFFER_TYPES[t]) err(`targeting.quadrants.${name}`, `Unknown offer type ${t}`);
    if (cfg.maxDiscountPct > 0 && !(cfg.allowedOffers || []).some((t) => ['percent_off', 'flat_off', 'cart_recovery'].includes(t))) warn(`targeting.quadrants.${name}.maxDiscountPct`, `${name.replace(/_/g, ' ')} has a discount cap but no discount offers allowed`);
  }
  if ((q.sure_thing?.maxDiscountPct || 0) > 0) warn('targeting.quadrants.sure_thing.maxDiscountPct', 'Discounts for "Sure Things" mostly go to people who would have bought anyway');
  if ((q.do_not_disturb?.allowedOffers || []).length) warn('targeting.quadrants.do_not_disturb', 'Contacting "Do Not Disturb" customers can reduce their purchases');

  for (const w of r.windows || []) {
    if (!w.start || !w.end || w.start > w.end) err('windows', `Window "${w.name}" ends before it starts`);
    for (const cat of w.categories || []) if (!CATEGORIES[cat]) err('windows', `Window "${w.name}" uses unknown category ${cat}`);
  }
  if (r.message && !(r.message.maxChars >= 80)) err('message.maxChars', 'Messages need at least 80 characters');
  return { errors, warnings };
}
