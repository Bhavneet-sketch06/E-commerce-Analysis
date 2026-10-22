import { describe, it, expect } from 'vitest';
import { generatePopulation } from '../src/data/generate.js';
import { computeFeatures } from '../src/features.js';
import { scoreUplift } from '../src/uplift.js';
import { DEFAULT_RULES } from '../src/rules/defaultRules.js';
import { eligibility, maxPctFor } from '../src/rules/eligibility.js';
import { validate, extractClaims } from '../src/rules/validator.js';

const REF = '2026-10-22T06:30:00Z'; // 12:00 IST, inside the campaign, outside quiet hours
const rules = structuredClone(DEFAULT_RULES);
const people = generatePopulation({ n: 400, seed: 7, refDate: REF }).customers.map((c) => {
  const f = computeFeatures(c, REF);
  return { customer: c, f, u: scoreUplift(f) };
});
const find = (pred) => {
  const p = people.find(pred);
  if (!p) throw new Error('fixture not found');
  return p;
};
const ctx = (p, over = {}) => ({ ...p, rules: over.rules || rules, state: { sentOffers: [], committedInr: 0, committedTodayInr: 0, ...over.state }, now: over.now || REF });

const persuadable = find((p) => p.u.quadrant === 'persuadable' && p.f.ignoredStreak < 4 && p.f.returnRate <= 0.4);
const withCart = find((p) => p.u.quadrant === 'persuadable' && p.f.hasAbandonedCart && p.f.ignoredStreak < 4 && p.f.returnRate <= 0.4);
const sureThing = find((p) => p.u.quadrant === 'sure_thing' && p.f.ignoredStreak < 4 && p.f.returnRate <= 0.4);
const dnd = find((p) => p.u.quadrant === 'do_not_disturb');

const good = (over = {}) => ({
  action: 'send', type: 'percent_off', category: 'Fashion', discountPct: 15,
  headline: 'Your Fashion edit is waiting', message: 'Enjoy 15% off Fashion this week on orders above ₹499.', ...over,
});

describe('validator: valid offers pass', () => {
  it('accepts an in-range % off for a persuadable customer', () => {
    const r = validate(good(), ctx(persuadable));
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.offer.estCostInr).toBeGreaterThan(0);
  });
  it('accepts skip', () => {
    expect(validate({ action: 'skip', reasoning: 'no need' }, ctx(persuadable)).ok).toBe(true);
  });
  it('accepts a cart recovery quoting the real cart value', () => {
    const r = validate({
      action: 'send', type: 'cart_recovery', category: withCart.f.cartItems[0].category, discountPct: 5,
      headline: 'Still thinking?', message: `Your cart (₹${withCart.f.cartValue.toLocaleString('en-IN')}) is saved. Take 5% off if you check out today.`,
    }, ctx(withCart));
    expect(r.violations).toEqual([]);
  });
});

describe('validator: rule breaks are rejected', () => {
  it('rejects a discount above the category cap', () => {
    const r = validate(good({ category: 'Electronics', discountPct: 20, message: 'Get 20% off Electronics!' }), ctx(persuadable));
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain('discount_out_of_range');
  });
  it('rejects an unknown offer type', () => {
    expect(validate(good({ type: 'bogo' }), ctx(persuadable)).violations[0].code).toBe('unknown_offer');
  });
  it('rejects a discount for a sure-thing customer (would have bought anyway)', () => {
    const codes = validate(good(), ctx(sureThing)).violations.map((v) => v.code);
    expect(codes).toContain('offer_not_allowed');
  });
  it('blocks do-not-disturb customers entirely', () => {
    const codes = validate(good(), ctx(dnd)).violations.map((v) => v.code);
    expect(codes.some((c) => ['quadrant_blocked', 'fatigue', 'high_returns'].includes(c))).toBe(true);
  });
  it('rejects a message promising more than the offer', () => {
    const r = validate(good({ message: 'Flat 30% off Fashion just for you!' }), ctx(persuadable));
    expect(r.violations.map((v) => v.code)).toContain('message_mismatch');
  });
  it('catches mismatched numbers written in Hindi/Punjabi digits', () => {
    expect(validate(good({ message: 'फैशन पर ३०% की छूट!' }), ctx(persuadable)).ok).toBe(false);
    expect(validate(good({ message: 'ਫੈਸ਼ਨ ਤੇ ੩੦% ਛੋਟ!' }), ctx(persuadable)).ok).toBe(false);
    expect(validate(good({ message: 'फैशन पर १५% की छूट!' }), ctx(persuadable)).ok).toBe(true);
  });
  it('rejects promising free delivery on a % off offer', () => {
    const r = validate(good({ message: '15% off Fashion + free delivery!' }), ctx(persuadable));
    expect(r.violations.map((v) => v.code)).toContain('message_mismatch');
  });
  it('rejects invented coupon codes and banned phrases', () => {
    const codes = validate(good({ message: 'Use code DIWALI50 for 15% off, guaranteed lowest price ever' }), ctx(persuadable)).violations.map((v) => v.code);
    expect(codes).toContain('invented_code');
    expect(codes).toContain('banned_phrase');
  });
  it('rejects over-long messages', () => {
    expect(validate(good({ message: 'x'.repeat(600) }), ctx(persuadable)).violations.map((v) => v.code)).toContain('too_long');
  });
});

describe('contact rules', () => {
  it('enforces the weekly cap and cooldown', () => {
    const sentOffers = [{ at: '2026-10-21T06:00:00Z' }, { at: '2026-10-19T06:00:00Z' }];
    const codes = validate(good(), ctx(persuadable, { state: { sentOffers } })).violations.map((v) => v.code);
    expect(codes).toContain('frequency_cap');
    expect(codes).toContain('cooldown');
  });
  it('respects quiet hours (23:30 IST)', () => {
    const codes = validate(good(), ctx(persuadable, { now: '2026-10-22T18:00:00Z' })).violations.map((v) => v.code);
    expect(codes).toContain('quiet_hours');
  });
  it('respects opt-out and the control group', () => {
    const optedOut = { ...persuadable, customer: { ...persuadable.customer, optedOut: true } };
    expect(validate(good(), ctx(optedOut)).violations.map((v) => v.code)).toContain('opted_out');
    expect(validate(good(), ctx(persuadable, { state: { holdout: true } })).violations.map((v) => v.code)).toContain('control_group');
  });
  it('stops paid offers when the budget is spent, but free nudges still work', () => {
    const el = eligibility(persuadable.customer, persuadable.f, persuadable.u, rules, { committedInr: rules.campaign.budgetInr, sentOffers: [] }, REF);
    expect(el.options.some((o) => ['percent_off', 'flat_off', 'free_shipping', 'bonus_points'].includes(o.type))).toBe(false); // a 0% cart reminder is still free
    const codes = validate(good(), ctx(persuadable, { state: { committedInr: rules.campaign.budgetInr } })).violations.map((v) => v.code);
    expect(codes).toContain('over_budget');
  });
});

describe('limits', () => {
  it('never lets a discount eat the margin floor, even if marketing raises the cap', () => {
    const r = structuredClone(rules);
    r.categories.Electronics.maxDiscountPct = 50;
    r.offers.percent_off.maxPct = 50;
    r.targeting.quadrants.persuadable.maxDiscountPct = 50;
    expect(maxPctFor(r, 'persuadable', 'Electronics', 50, REF)).toBe(7); // 12% margin - 5% floor
  });
  it('adds the Diwali bonus only inside the window', () => {
    const before = maxPctFor(rules, 'persuadable', 'Home & Kitchen', 25, '2026-10-25T06:00:00Z');
    const during = maxPctFor(rules, 'persuadable', 'Home & Kitchen', 25, '2026-11-05T06:00:00Z');
    expect(during).toBe(before + 5);
  });
  it('extracts claims in mixed text', () => {
    const c = extractClaims('Save ₹1,299 + 10% + 200 points, free shipping');
    expect(c).toMatchObject({ percents: [10], rupees: [1299], points: [200], freeShipping: true });
  });
});
