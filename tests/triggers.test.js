import { describe, it, expect } from 'vitest';
import { computeFeatures, signals } from '../src/features.js';
import { scoreUplift } from '../src/uplift.js';
import { detectTriggers } from '../src/triggers.js';
import { DEFAULT_RULES } from '../src/rules/defaultRules.js';
import { contactBlockers, eligibility } from '../src/rules/eligibility.js';
import { chooseOffer } from '../src/policy.js';
import { checkRules } from '../src/rules/checkRules.js';
import { withDefaults } from '../src/db.js';
import { diffRules } from '../src/rules/diff.js';

const NOW = new Date('2026-10-22T06:30:00Z'); // 12:00 IST
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const rules = structuredClone(DEFAULT_RULES);

function order(daysAgo, category = 'Fashion', valueInr = 1500) {
  return { date: ago(daysAgo * DAY), category, products: ['x'], items: 1, grossInr: valueInr, discountPct: 0, valueInr, usedCoupon: false, returned: false, payment: 'UPI' };
}
function customer(over = {}) {
  return {
    id: 'T1', name: 'Test User', city: 'Ludhiana', language: 'en', signupDate: ago(400 * DAY), preferredCategory: 'Fashion',
    orders: [order(200), order(140), order(80)], pointsBalance: 300, pointsExpiringSoon: 0,
    visits30d: 5, lastVisitDate: ago(DAY), browsedCategories: [], browseLog: [], cart: null,
    offerHistory: { received90d: 0, ignoredStreak: 0 }, optedOut: false, telegramId: 1, ...over,
  };
}
const due = (c, r = rules) => detectTriggers(c, computeFeatures(c, NOW), r, NOW).map((t) => t.type);
const views = (category, n, product, hoursAgo = 5) => Array.from({ length: n }, (_, i) => ({ at: ago((hoursAgo + i * 6) * HOUR), category, product }));
const cart = (minutesAgo) => ({ items: [{ product: 'Smartwatch', category: 'Electronics', priceInr: 2999 }], valueInr: 2999, updatedAt: ago(minutesAgo * MIN) });

describe('abandoned cart trigger', () => {
  it('waits for the configured time, then fires once per cart', () => {
    expect(due(customer({ cart: cart(30) }))).not.toContain('cart_abandoned');
    const c = customer({ cart: cart(61) });
    expect(due(c)[0]).toBe('cart_abandoned'); // most urgent first
    c.triggerState = { cart_abandoned: { at: NOW.toISOString(), key: c.cart.updatedAt } };
    expect(due(c)).not.toContain('cart_abandoned');
  });
  it('fires again when the cart changes, and stops after the max window', () => {
    const c = customer({ cart: cart(90), triggerState: { cart_abandoned: { at: ago(DAY), key: 'old-cart' } } });
    expect(due(c)).toContain('cart_abandoned');
    expect(due(customer({ cart: cart(73 * 60) }))).not.toContain('cart_abandoned');
  });
});

describe('browsed but did not buy', () => {
  it('fires after repeated views of a category they have not bought', () => {
    const c = customer({ browseLog: views('Electronics', 4, 'Smartwatch') });
    expect(due(c)).toContain('browse_abandoned');
    const f = computeFeatures(c, NOW);
    expect(f.browseIntent).toMatchObject({ category: 'Electronics', views7d: 4, product: 'Smartwatch' });
    expect(signals(f).join(' ')).toMatch(/viewed Electronics 4 times/);
  });
  it('ignores categories they just bought, ones already in the cart, and very recent views', () => {
    expect(due(customer({ orders: [order(200), order(5, 'Electronics')], browseLog: views('Electronics', 4, 'Smartwatch') }))).not.toContain('browse_abandoned');
    expect(due(customer({ cart: cart(5), browseLog: views('Electronics', 4, 'Smartwatch') }))).not.toContain('browse_abandoned');
    expect(due(customer({ browseLog: views('Electronics', 4, 'Smartwatch', 0.5) }))).not.toContain('browse_abandoned');
    expect(due(customer({ browseLog: views('Electronics', 2, 'Smartwatch') }))).not.toContain('browse_abandoned');
  });
  it('does not repeat for the same category within a week', () => {
    const c = customer({ browseLog: views('Electronics', 4, 'Smartwatch'), triggerState: { browse_abandoned: { at: ago(2 * DAY), key: 'Electronics' } } });
    expect(due(c)).not.toContain('browse_abandoned');
  });
  it('the rule engine offers the category they keep viewing', () => {
    const c = customer({ orders: [order(400), order(300, 'Beauty')], browseLog: views('Toys', 5, 'Science Kit') });
    const f = computeFeatures(c, NOW);
    const u = { ...scoreUplift(f), quadrant: 'persuadable' };
    const el = eligibility(c, f, u, rules, { sentOffers: [] }, NOW);
    expect(chooseOffer(f, u, el.options, 'browse_abandoned').category).toBe('Toys');
  });
});

describe('win-back and points triggers', () => {
  it('fires win-back only when clearly overdue versus their own rhythm', () => {
    // orders every ~30 days, last one 140 days ago: 4.7x overdue
    expect(due(customer({ orders: [order(200), order(170), order(140)] }))).toContain('win_back');
    // orders every ~60 days, last one 80 days ago: only 1.3x overdue, below the 1.5x rule
    expect(due(customer())).not.toContain('win_back');
  });
  it('does not chase customers who are on schedule, and respects the repeat window', () => {
    expect(due(customer({ orders: [order(120), order(80), order(40)] }))).not.toContain('win_back');
    expect(due(customer({ orders: [order(200), order(170), order(140)], triggerState: { win_back: { at: ago(10 * DAY), key: '140' } } }))).not.toContain('win_back');
  });
  it('reminds about expiring points above the minimum', () => {
    expect(due(customer({ pointsExpiringSoon: 150 }))).toContain('points_expiring');
    expect(due(customer({ pointsExpiringSoon: 40 }))).not.toContain('points_expiring');
  });
  it('respects the master switch, individual switches and opt-out', () => {
    const off = structuredClone(rules);
    off.triggers.enabled = false;
    expect(due(customer({ cart: cart(90) }), off)).toEqual([]);
    const noCart = structuredClone(rules);
    noCart.triggers.cartAbandoned.enabled = false;
    expect(due(customer({ cart: cart(90) }), noCart)).not.toContain('cart_abandoned');
    expect(due(customer({ cart: cart(90), optedOut: true }))).toEqual([]);
  });
});

describe('just bought: no offers', () => {
  it('blocks every offer within the window after a purchase', () => {
    const c = customer({ orders: [order(200), order(1)] });
    const f = computeFeatures(c, NOW);
    expect(contactBlockers(c, f, scoreUplift(f), rules, { sentOffers: [] }, NOW).map((b) => b.code)).toContain('recent_purchase');
    const later = customer({ orders: [order(200), order(4)] });
    const f2 = computeFeatures(later, NOW);
    expect(contactBlockers(later, f2, scoreUplift(f2), rules, { sentOffers: [] }, NOW).map((b) => b.code)).not.toContain('recent_purchase');
  });
});

describe('rules', () => {
  it('fills new settings into rules saved by an older version, keeping their values', () => {
    const old = structuredClone(DEFAULT_RULES);
    delete old.triggers;
    delete old.contact.noOffersAfterPurchaseHours;
    old.contact.maxOffersPerWeek = 3;
    const r = withDefaults(old);
    expect(r.triggers.cartAbandoned.afterMinutes).toBe(60);
    expect(r.contact.noOffersAfterPurchaseHours).toBe(72);
    expect(r.contact.maxOffersPerWeek).toBe(3);
  });
  it('describes trigger changes in plain sentences', () => {
    const next = structuredClone(DEFAULT_RULES);
    next.triggers.cartAbandoned.afterMinutes = 10;
    next.triggers.browseAbandoned.enabled = false;
    next.contact.noOffersAfterPurchaseHours = 48;
    expect(diffRules(DEFAULT_RULES, next).map((d) => d.text)).toEqual(expect.arrayContaining([
      'Cart reminder after: 60 min → 10 min', "Browsed-but-didn't-buy trigger: on → off", 'No offers after a purchase for: 72 hours → 48 hours',
    ]));
  });
  it('checks trigger settings', () => {
    expect(checkRules(DEFAULT_RULES).errors).toEqual([]);
    const bad = structuredClone(DEFAULT_RULES);
    bad.triggers.cartAbandoned.maxHours = 0;
    bad.triggers.browseAbandoned.minViews = 1;
    expect(checkRules(bad).errors.map((e) => e.field)).toEqual(expect.arrayContaining(['triggers.cartAbandoned.maxHours', 'triggers.browseAbandoned.minViews']));
  });
});
