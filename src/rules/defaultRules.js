// The business rules: hard limits that every offer (AI-chosen or not) must respect.
// The dashboard edits a copy of this; each saved change becomes a new version in the store.

export const OFFER_TYPES = {
  percent_off: { label: '% off a category', costly: true, needsCategory: true },
  flat_off: { label: 'Flat ₹ off', costly: true, needsCategory: true },
  free_shipping: { label: 'Free delivery', costly: true, needsCategory: false },
  cart_recovery: { label: 'Cart reminder (+ optional discount)', costly: true, needsCategory: true },
  bonus_points: { label: 'Bonus reward points', costly: true, needsCategory: false },
  points_reminder: { label: 'Points-expiring reminder', costly: false, needsCategory: false },
  nudge: { label: 'Personal pick, no discount', costly: false, needsCategory: true },
};

export const DEFAULT_RULES = {
  campaign: {
    name: 'Festive Season 2026',
    startDate: '2026-10-20',
    endDate: '2026-11-15',
    budgetInr: 50000,
    dailyPacing: true,          // spread the budget evenly (up to 1.5x the daily average on any day)
    controlGroupPct: 10,        // share of customers who never get offers, to measure real uplift
    offerValidityHours: 72,
  },
  contact: {
    maxOffersPerWeek: 2,
    cooldownHours: 48,
    quietHoursStart: 22,        // IST, no messages from 22:00...
    quietHoursEnd: 8,           // ...until 08:00
    pauseAfterIgnored: 4,       // stop contacting someone who ignored this many offers in a row
  },
  targeting: {
    persuadableMinUplift: 0.07,
    sureThingMinBase: 0.3,
    quadrants: {
      persuadable: { allowedOffers: ['percent_off', 'flat_off', 'free_shipping', 'cart_recovery', 'bonus_points', 'points_reminder', 'nudge'], maxDiscountPct: 25 },
      sure_thing: { allowedOffers: ['bonus_points', 'points_reminder', 'nudge'], maxDiscountPct: 0 },
      lost_cause: { allowedOffers: ['flat_off', 'points_reminder', 'nudge'], maxDiscountPct: 10 },
      do_not_disturb: { allowedOffers: [], maxDiscountPct: 0 },
    },
  },
  offers: {
    percent_off: { enabled: true, minPct: 5, maxPct: 25, minOrderInr: 499 },
    flat_off: { enabled: true, minInr: 50, maxInr: 300, minOrderInr: 999 },
    free_shipping: { enabled: true, minOrderInr: 199 },
    cart_recovery: { enabled: true, maxPct: 15 },
    bonus_points: { enabled: true, minPoints: 50, maxPoints: 400 },
    points_reminder: { enabled: true },
    nudge: { enabled: true },
  },
  categories: {
    Fashion: { enabled: true, maxDiscountPct: 30 },
    Electronics: { enabled: true, maxDiscountPct: 7 },
    'Home & Kitchen': { enabled: true, maxDiscountPct: 20 },
    Beauty: { enabled: true, maxDiscountPct: 30 },
    Grocery: { enabled: true, maxDiscountPct: 8 },
    Sports: { enabled: true, maxDiscountPct: 20 },
    Books: { enabled: true, maxDiscountPct: 15 },
    Toys: { enabled: true, maxDiscountPct: 25 },
  },
  margin: { minMarginAfterDiscountPct: 5 },
  exclusions: { maxReturnRate: 0.4, minAccountAgeDays: 0 },
  message: {
    maxChars: 450,
    bannedPhrases: ['guaranteed', 'free money', 'last chance ever', '100% off', 'lowest price ever'],
  },
  windows: [
    { name: 'Diwali Week', start: '2026-11-02', end: '2026-11-09', extraDiscountPct: 5, categories: ['Home & Kitchen', 'Grocery', 'Fashion'] },
  ],
};
