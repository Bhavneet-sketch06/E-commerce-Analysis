// Seeded synthetic customer generator. Same seed + refDate => identical data.
// Each customer has a hidden `_archetype` used ONLY to generate behaviour and to check realism.
// The engine must never read `_archetype`; it works from observed behaviour (see features.js).

import {
  CATEGORIES, CATEGORY_NAMES, SEASONALITY, CITIES, FIRST_NAMES, LAST_NAMES,
} from './catalog.js';

const DAY = 86_400_000;

export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (pairs) => {
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let x = next() * total;
      for (const [v, w] of pairs) if ((x -= w) < 0) return v;
      return pairs[pairs.length - 1][0];
    },
    normal: (mean = 0, sd = 1) => {
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    poisson: (lambda) => {
      if (lambda <= 0) return 0;
      if (lambda > 30) return Math.max(0, Math.round(r.normal(lambda, Math.sqrt(lambda))));
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do { k++; p *= next(); } while (p > L);
      return k - 1;
    },
  };
  return r;
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// share = population share. ordersPerYear = mean purchase rate while active.
// lapseDays = how long ago they stopped buying. coupon = share of orders using a coupon.
// returnMult scales the category return rate. visits = sessions per 30 days. cartP = chance of an open cart.
// offerFatigue = how many recent offers they ignored (drives "do not disturb").
export const ARCHETYPES = {
  vip:            { share: 0.05, ordersPerYear: 11, lapseDays: [0, 12],    coupon: 0.12, returnMult: 0.8, visits: [10, 25], cartP: 0.30, tenure: [400, 1100], offerFatigue: [0, 2] },
  loyal:          { share: 0.12, ordersPerYear: 5,  lapseDays: [0, 30],    coupon: 0.20, returnMult: 0.9, visits: [5, 14],  cartP: 0.30, tenure: [250, 1100], offerFatigue: [0, 2] },
  bargain_hunter: { share: 0.13, ordersPerYear: 3,  lapseDays: [5, 60],    coupon: 0.80, returnMult: 1.1, visits: [4, 12],  cartP: 0.55, tenure: [150, 900],  offerFatigue: [0, 1] },
  regular:        { share: 0.15, ordersPerYear: 2.2, lapseDays: [10, 70],   coupon: 0.30, returnMult: 1.0, visits: [2, 8],   cartP: 0.30, tenure: [150, 1000], offerFatigue: [0, 2] },
  lapsing:        { share: 0.13, ordersPerYear: 2.5, lapseDays: [75, 170],  coupon: 0.35, returnMult: 1.0, visits: [0, 2],   cartP: 0.15, tenure: [300, 1100], offerFatigue: [1, 4] },
  one_timer:      { share: 0.24, ordersPerYear: 0,  lapseDays: [90, 420],  coupon: 0.55, returnMult: 1.0, visits: [0, 1],   cartP: 0.05, tenure: [100, 900],  offerFatigue: [2, 6] },
  window_shopper: { share: 0.08, ordersPerYear: 0.6, lapseDays: [20, 200], coupon: 0.60, returnMult: 1.0, visits: [6, 18],  cartP: 0.85, tenure: [60, 700],   offerFatigue: [0, 2] },
  new:            { share: 0.06, ordersPerYear: 3,  lapseDays: [0, 20],    coupon: 0.50, returnMult: 1.0, visits: [2, 9],   cartP: 0.45, tenure: [2, 30],     offerFatigue: [0, 0] },
  serial_returner:{ share: 0.04, ordersPerYear: 4,  lapseDays: [3, 40],    coupon: 0.40, returnMult: 3.5, visits: [5, 14],  cartP: 0.35, tenure: [200, 900],  offerFatigue: [3, 7] },
};

const LANGS = [['en', 60], ['hi', 20], ['pa', 20]];
const AGE_BANDS = [['18-24', 30], ['25-34', 35], ['35-44', 20], ['45-54', 10], ['55+', 5]];
const PAYMENTS = [['UPI', 47], ['COD', 33], ['Card', 15], ['Wallet', 5]];

function iso(ms) { return new Date(ms).toISOString(); }

function priceFor(r, category) {
  const [lo, hi] = CATEGORIES[category].price;
  // log-uniform within the band, skewed to the cheaper end like real baskets
  const x = Math.pow(r.next(), 1.6);
  const raw = Math.exp(Math.log(lo) + x * (Math.log(hi) - Math.log(lo)));
  return Math.round(raw / 10) * 10 - 1; // ₹ prices end in 9
}

function pickCategory(r, preferred, secondary) {
  const x = r.next();
  if (x < 0.55) return preferred;
  if (x < 0.8) return secondary;
  return r.pick(CATEGORY_NAMES);
}

function generateOrders(r, a, { signupMs, refMs, preferred, secondary, intensity }) {
  const orders = [];
  const lapse = r.int(a.lapseDays[0], a.lapseDays[1]);
  const activeEnd = refMs - lapse * DAY;
  if (activeEnd <= signupMs) return { orders, lapse };

  if (a.ordersPerYear === 0) {
    // exactly one order, at the end of the active window
    orders.push(makeOrder(r, a, activeEnd, preferred, secondary));
    return { orders, lapse };
  }
  // Walk month by month; Poisson orders with seasonality and the customer's own intensity.
  for (let t = signupMs; t < activeEnd; t += 30 * DAY) {
    const month = new Date(t).getUTCMonth();
    const span = Math.min(30 * DAY, activeEnd - t);
    const lambda = (a.ordersPerYear / 12) * SEASONALITY[month] * intensity * (span / (30 * DAY));
    const n = r.poisson(lambda);
    for (let k = 0; k < n; k++) orders.push(makeOrder(r, a, t + r.next() * span, preferred, secondary));
  }
  // An "active" customer whose last order fell before the lapse window gets one recent order,
  // so recency matches the archetype.
  if (orders.length && a.lapseDays[1] <= 70) {
    const last = Math.max(...orders.map((o) => Date.parse(o.date)));
    if (last < activeEnd - 45 * DAY) orders.push(makeOrder(r, a, activeEnd - r.next() * 5 * DAY, preferred, secondary));
  }
  if (!orders.length && a !== ARCHETYPES.window_shopper) orders.push(makeOrder(r, a, activeEnd, preferred, secondary));
  orders.sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
  return { orders, lapse };
}

function makeOrder(r, a, ms, preferred, secondary) {
  const category = pickCategory(r, preferred, secondary);
  const month = new Date(ms).getUTCMonth();
  const festive = SEASONALITY[month] >= 1.15;
  const items = r.weighted([[1, 60], [2, 28], [3, 12]]);
  let gross = 0;
  const products = [];
  for (let i = 0; i < items; i++) {
    gross += priceFor(r, category);
    products.push(r.pick(CATEGORIES[category].products));
  }
  const usedCoupon = r.chance(Math.min(0.95, a.coupon * (festive ? 1.25 : 1)));
  const discountPct = usedCoupon ? r.pick([5, 10, 10, 15, 15, 20, 25]) : 0;
  const value = Math.round(gross * (1 - discountPct / 100));
  const returned = r.chance(Math.min(0.85, CATEGORIES[category].returnRate * a.returnMult));
  return {
    date: iso(ms), category, products, items, grossInr: gross, discountPct, valueInr: value,
    usedCoupon, returned, payment: r.weighted(PAYMENTS),
  };
}

export function generateCustomer(r, id, archetypeKey, refMs, overrides = {}) {
  const a = ARCHETYPES[archetypeKey];
  const preferred = overrides.preferredCategory || r.pick(CATEGORY_NAMES);
  let secondary = r.pick(CATEGORY_NAMES);
  if (secondary === preferred) secondary = CATEGORY_NAMES[(CATEGORY_NAMES.indexOf(preferred) + 3) % CATEGORY_NAMES.length];
  const tenureDays = r.int(a.tenure[0], a.tenure[1]);
  const signupMs = refMs - tenureDays * DAY;
  // Individual heterogeneity: lognormal intensity creates the long tail of heavy spenders.
  const intensity = Math.exp(r.normal(-0.1, 0.6));

  const { orders, lapse } = generateOrders(r, a, { signupMs, refMs, preferred, secondary, intensity });

  // Reward points: 1 per ₹100 of kept orders; expire 365 days after earning; some get redeemed.
  let earnedActive = 0;
  let expiringSoon = 0;
  for (const o of orders) {
    if (o.returned) continue;
    const age = (refMs - Date.parse(o.date)) / DAY;
    const pts = Math.floor(o.valueInr / 100);
    if (age < 365) earnedActive += pts;
    if (age >= 335 && age < 365) expiringSoon += pts;
  }
  const redeemed = Math.round(earnedActive * r.float(0, 0.6));
  const pointsBalance = Math.max(0, earnedActive - redeemed);
  expiringSoon = Math.min(expiringSoon, pointsBalance);

  // Sessions / browsing
  const visits30d = r.int(a.visits[0], a.visits[1]);
  const lastOrderMs = orders.length ? Date.parse(orders[orders.length - 1].date) : null;
  const lastVisitDaysAgo = visits30d > 0
    ? r.int(0, Math.max(1, Math.round(30 / visits30d)))
    : Math.min(tenureDays, lapse + r.int(0, 30));
  const browsed = [preferred, secondary, r.pick(CATEGORY_NAMES)].slice(0, Math.max(1, Math.min(3, visits30d)));

  // Open cart (abandonment is the norm: ~70% of carts in Indian e-commerce are abandoned)
  let cart = null;
  if (r.chance(a.cartP) && lastVisitDaysAgo < 30) {
    const category = r.chance(0.7) ? preferred : secondary;
    const n = r.weighted([[1, 55], [2, 30], [3, 15]]);
    const items = [];
    for (let i = 0; i < n; i++) items.push({ product: r.pick(CATEGORIES[category].products), category, priceInr: priceFor(r, category) });
    const hoursAgo = Math.max(1, lastVisitDaysAgo * 24 + r.int(1, 20));
    cart = { items, valueInr: items.reduce((s, it) => s + it.priceInr, 0), updatedAt: iso(refMs - hoursAgo * 3600_000) };
  }

  const ignored = r.int(a.offerFatigue[0], a.offerFatigue[1]);
  const first = overrides.firstName || r.pick(FIRST_NAMES);
  return {
    id,
    name: overrides.name || `${first} ${r.pick(LAST_NAMES)}`,
    city: overrides.city || r.weighted(CITIES),
    ageBand: r.weighted(AGE_BANDS),
    language: overrides.language || r.weighted(LANGS),
    signupDate: iso(signupMs),
    preferredCategory: preferred,
    orders,
    pointsBalance,
    pointsExpiringSoon: expiringSoon,
    visits30d,
    lastVisitDate: iso(refMs - lastVisitDaysAgo * DAY),
    browsedCategories: browsed,
    cart,
    offerHistory: { received90d: ignored + r.int(0, 3), ignoredStreak: ignored },
    optedOut: false,
    telegramId: overrides.telegramId ?? null,
    synthetic: overrides.telegramId == null,
    _archetype: archetypeKey,
  };
}

export function generatePopulation({ n = 600, seed = 2026, refDate = new Date() } = {}) {
  const r = rng(seed);
  const refMs = new Date(refDate).getTime();
  const shares = Object.entries(ARCHETYPES).map(([k, a]) => [k, a.share]);
  const customers = [];
  for (let i = 0; i < n; i++) {
    customers.push(generateCustomer(r, `C${String(i + 1).padStart(4, '0')}`, r.weighted(shares), refMs));
  }
  return { meta: { seed, n, refDate: iso(refMs), generatedAt: new Date().toISOString() }, customers };
}

// Classmates: their onboarding answers choose an archetype, the rest is generated from their Telegram id.
const FREQUENCY_TO_ARCHETYPES = {
  weekly: [['vip', 40], ['loyal', 60]],
  monthly: [['loyal', 30], ['regular', 70]],
  sales: [['bargain_hunter', 80], ['window_shopper', 20]],
  rarely: [['lapsing', 50], ['one_timer', 35], ['window_shopper', 15]],
  new: [['new', 100]],
};

export function generateForTelegramUser({ telegramId, firstName, city, preferredCategory, frequency, language }, refDate = new Date()) {
  const r = rng(`tg-${telegramId}`);
  const archetype = r.weighted(FREQUENCY_TO_ARCHETYPES[frequency] || FREQUENCY_TO_ARCHETYPES.monthly);
  return generateCustomer(r, `T${telegramId}`, archetype, new Date(refDate).getTime(), {
    telegramId, name: firstName || 'Friend', firstName, city, preferredCategory, language,
  });
}
