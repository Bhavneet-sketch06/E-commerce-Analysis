// PURE: deterministic offer policy. Used as the safe fallback when the AI fails or is unavailable,
// and by the what-if simulator (no AI calls needed to forecast a whole population).

import { CATEGORIES, POINT_VALUE_INR } from './data/catalog.js';
import { estimateCost } from './rules/eligibility.js';

const fmt = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const roundTo5 = (x) => Math.round(x / 5) * 5;

// How strongly an offer moves behaviour, relative to the customer's typical uplift.
export function offerGenerosity(offer) {
  if (!offer) return 0;
  switch (offer.type) {
    case 'percent_off': case 'cart_recovery': return Math.min(1.4, 0.4 + (offer.discountPct || 0) / 15);
    case 'flat_off': return Math.min(1.3, 0.5 + (offer.amountInr || 0) / 250);
    case 'free_shipping': return 0.6;
    case 'bonus_points': return 0.5 + Math.min(0.4, (offer.points || 0) / 1000);
    case 'points_reminder': return 0.5;
    default: return 0.3;
  }
}

// Pick the cheapest offer likely to work, given the eligible options.
export function chooseOffer(f, u, options) {
  const by = (t) => options.filter((o) => o.type === t);
  const couponHabit = (f.discountShare * f.lifetimeOrders + 0.3 * 2) / (f.lifetimeOrders + 2);

  const cart = by('cart_recovery')[0];
  if (cart && f.cartAgeHours <= 24 * 7) {
    const pct = Math.min(cart.maxPct, u.quadrant === 'persuadable' ? roundTo5(5 + 10 * couponHabit) : 0);
    return { action: 'send', type: 'cart_recovery', category: cart.category, discountPct: pct };
  }
  const reminder = by('points_reminder')[0];
  if (reminder && u.quadrant !== 'persuadable') return { action: 'send', type: 'points_reminder' };

  // Discounts for persuadables, or for any group the marketing rules explicitly allow them for.
  if (u.quadrant === 'persuadable' || by('percent_off').length) {
    const pcts = by('percent_off');
    const pick = pcts.find((o) => o.category === f.topCategory) || pcts.find((o) => o.category === f.preferredCategory) || pcts[0];
    if (pick) {
      const want = roundTo5(5 + 15 * couponHabit + 5 * (f.churnRisk > 0.5 ? 1 : 0));
      return { action: 'send', type: 'percent_off', category: pick.category, discountPct: Math.max(pick.minPct, Math.min(pick.maxPct, want)) };
    }
    const flat = by('flat_off')[0];
    if (flat) return { action: 'send', type: 'flat_off', category: flat.category, amountInr: flat.minInr };
    if (by('free_shipping')[0]) return { action: 'send', type: 'free_shipping' };
  }
  if (u.quadrant === 'sure_thing') {
    const pts = by('bonus_points')[0];
    if (pts && f.rfm.M >= 4) return { action: 'send', type: 'bonus_points', points: Math.min(pts.maxPoints, Math.max(pts.minPoints, 200)) };
    const nudge = by('nudge')[0];
    if (nudge) return { action: 'send', type: 'nudge', category: nudge.categories[0] || f.topCategory };
  }
  if (u.quadrant === 'lost_cause') {
    const flat = by('flat_off').find((o) => o.category === f.topCategory) || by('flat_off')[0];
    if (flat && f.churnRisk < 0.9) return { action: 'send', type: 'flat_off', category: flat.category, amountInr: flat.minInr };
    const nudge = by('nudge')[0];
    if (nudge) return { action: 'send', type: 'nudge', category: nudge.categories[0] || f.topCategory };
  }
  if (reminder) return { action: 'send', type: 'points_reminder' };
  const nudge = by('nudge')[0];
  if (nudge && nudge.categories.length) return { action: 'send', type: 'nudge', category: nudge.categories[0] };
  return { action: 'skip' };
}

// Message templates in English, Hindi and Punjabi. Numbers always come from the offer itself.
export function templateMessage(offer, customer, f) {
  const first = customer.name.split(' ')[0];
  const lang = ['en', 'hi', 'pa'].includes(customer.language) ? customer.language : 'en';
  const cat = offer.category;
  const emoji = CATEGORIES[cat]?.emoji || '🎁';
  const product = f.cartItems?.[0]?.product || (cat ? CATEGORIES[cat].products[0] : '');
  const T = {
    percent_off: {
      en: [`${emoji} ${offer.discountPct}% off ${cat}, just for you`, `Hi ${first}! We picked ${cat} for you this week. Enjoy ${offer.discountPct}% off on orders above ${fmt(offer.minOrderInr)}.`],
      hi: [`${emoji} आपके लिए ${cat} पर ${offer.discountPct}% छूट`, `नमस्ते ${first}! इस हफ्ते ${cat} पर ${offer.discountPct}% की छूट, ${fmt(offer.minOrderInr)} से ऊपर के ऑर्डर पर।`],
      pa: [`${emoji} ਤੁਹਾਡੇ ਲਈ ${cat} 'ਤੇ ${offer.discountPct}% ਛੋਟ`, `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${first}! ਇਸ ਹਫ਼ਤੇ ${cat} 'ਤੇ ${offer.discountPct}% ਛੋਟ, ${fmt(offer.minOrderInr)} ਤੋਂ ਵੱਧ ਦੇ ਆਰਡਰ 'ਤੇ।`],
    },
    flat_off: {
      en: [`${emoji} ${fmt(offer.amountInr)} off your next ${cat} order`, `Hi ${first}, it's been a while! Here's ${fmt(offer.amountInr)} off ${cat} on orders above ${fmt(offer.minOrderInr)}.`],
      hi: [`${emoji} अगले ${cat} ऑर्डर पर ${fmt(offer.amountInr)} की छूट`, `नमस्ते ${first}, बहुत दिन हो गए! ${fmt(offer.minOrderInr)} से ऊपर के ${cat} ऑर्डर पर ${fmt(offer.amountInr)} की छूट।`],
      pa: [`${emoji} ਅਗਲੇ ${cat} ਆਰਡਰ 'ਤੇ ${fmt(offer.amountInr)} ਦੀ ਛੋਟ`, `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${first}, ਬੜੇ ਦਿਨ ਹੋ ਗਏ! ${fmt(offer.minOrderInr)} ਤੋਂ ਵੱਧ ਦੇ ${cat} ਆਰਡਰ 'ਤੇ ${fmt(offer.amountInr)} ਦੀ ਛੋਟ।`],
    },
    free_shipping: {
      en: ['🚚 Free delivery on your next order', `Hi ${first}! Your next order ships free. No minimum fuss, just shop.`],
      hi: ['🚚 अगले ऑर्डर पर फ्री डिलीवरी', `नमस्ते ${first}! आपके अगले ऑर्डर की डिलीवरी फ्री है।`],
      pa: ['🚚 ਅਗਲੇ ਆਰਡਰ \'ਤੇ ਫ੍ਰੀ ਡਿਲੀਵਰੀ', `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${first}! ਤੁਹਾਡੇ ਅਗਲੇ ਆਰਡਰ ਦੀ ਡਿਲੀਵਰੀ ਫ੍ਰੀ ਹੈ।`],
    },
    cart_recovery: offer.discountPct > 0 ? {
      en: [`🛒 Your ${product} is still waiting`, `Hi ${first}, you left ${fmt(f.cartValue)} in your cart. Check out now and take ${offer.discountPct}% off.`],
      hi: [`🛒 आपका ${product} अभी भी इंतज़ार में है`, `नमस्ते ${first}, आपकी कार्ट में ${fmt(f.cartValue)} का सामान है। अभी खरीदें और ${offer.discountPct}% छूट पाएं।`],
      pa: [`🛒 ਤੁਹਾਡਾ ${product} ਹਾਲੇ ਵੀ ਉਡੀਕ ਰਿਹਾ ਹੈ`, `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${first}, ਤੁਹਾਡੀ ਕਾਰਟ ਵਿੱਚ ${fmt(f.cartValue)} ਦਾ ਸਾਮਾਨ ਹੈ। ਹੁਣੇ ਖਰੀਦੋ ਅਤੇ ${offer.discountPct}% ਛੋਟ ਲਓ।`],
    } : {
      en: [`🛒 Your ${product} is still waiting`, `Hi ${first}, you left ${fmt(f.cartValue)} in your cart. It's saved for you whenever you're ready.`],
      hi: [`🛒 आपका ${product} अभी भी इंतज़ार में है`, `नमस्ते ${first}, आपकी कार्ट में ${fmt(f.cartValue)} का सामान सेव है।`],
      pa: [`🛒 ਤੁਹਾਡਾ ${product} ਹਾਲੇ ਵੀ ਉਡੀਕ ਰਿਹਾ ਹੈ`, `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${first}, ਤੁਹਾਡੀ ਕਾਰਟ ਵਿੱਚ ${fmt(f.cartValue)} ਦਾ ਸਾਮਾਨ ਸੇਵ ਹੈ।`],
    },
    bonus_points: {
      en: [`⭐ ${offer.points} bonus points for you`, `Thank you for shopping with us, ${first}! We've added ${offer.points} bonus points (worth ${fmt(offer.points * POINT_VALUE_INR)}) on your next order.`],
      hi: [`⭐ आपके लिए ${offer.points} बोनस पॉइंट्स`, `धन्यवाद ${first}! अगले ऑर्डर पर ${offer.points} बोनस पॉइंट्स (${fmt(offer.points * POINT_VALUE_INR)} के बराबर)।`],
      pa: [`⭐ ਤੁਹਾਡੇ ਲਈ ${offer.points} ਬੋਨਸ ਪੁਆਇੰਟ`, `ਧੰਨਵਾਦ ${first}! ਅਗਲੇ ਆਰਡਰ 'ਤੇ ${offer.points} ਬੋਨਸ ਪੁਆਇੰਟ (${fmt(offer.points * POINT_VALUE_INR)} ਦੇ ਬਰਾਬਰ)।`],
    },
    points_reminder: {
      en: [`⏳ ${offer.points} points expire soon`, `Hi ${first}, ${offer.points} of your reward points expire this month. Use them on your next order before they're gone.`],
      hi: [`⏳ ${offer.points} पॉइंट्स जल्द खत्म होंगे`, `नमस्ते ${first}, आपके ${offer.points} पॉइंट्स इस महीने खत्म हो रहे हैं। अगले ऑर्डर पर इस्तेमाल करें।`],
      pa: [`⏳ ${offer.points} ਪੁਆਇੰਟ ਜਲਦੀ ਖ਼ਤਮ ਹੋਣਗੇ`, `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${first}, ਤੁਹਾਡੇ ${offer.points} ਪੁਆਇੰਟ ਇਸ ਮਹੀਨੇ ਖ਼ਤਮ ਹੋ ਰਹੇ ਹਨ। ਅਗਲੇ ਆਰਡਰ 'ਤੇ ਵਰਤੋ।`],
    },
    nudge: {
      en: [`${emoji} New in ${cat}, picked for you`, `Hi ${first}! Fresh arrivals in ${cat} that match what you love, like the ${CATEGORIES[cat]?.products[1] || product}. Take a look!`],
      hi: [`${emoji} ${cat} में आपके लिए नया`, `नमस्ते ${first}! ${cat} में नए प्रोडक्ट आए हैं, जैसे ${CATEGORIES[cat]?.products[1] || product}। एक नज़र डालें!`],
      pa: [`${emoji} ${cat} ਵਿੱਚ ਤੁਹਾਡੇ ਲਈ ਨਵਾਂ`, `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${first}! ${cat} ਵਿੱਚ ਨਵੇਂ ਪ੍ਰੋਡਕਟ ਆਏ ਹਨ, ਜਿਵੇਂ ${CATEGORIES[cat]?.products[1] || product}। ਜ਼ਰੂਰ ਦੇਖੋ!`],
    },
  };
  const [headline, message] = T[offer.type][lang];
  return { headline, message };
}

// Picks an offer, then steps down to cheaper ones until it fits today's remaining budget.
export function fallbackProposal(customer, f, u, options, budgetToday = Infinity) {
  let menu = options;
  let choice;
  let offer;
  for (;;) {
    choice = chooseOffer(f, u, menu);
    if (choice.action === 'skip') return { ...choice, reasoning: 'No suitable offer within the rules and budget.' };
    const opt = menu.find((o) => o.type === choice.type && (!o.category || o.category === choice.category)) || {};
    offer = { ...choice, minOrderInr: opt.minOrderInr, points: choice.points ?? opt.points };
    const cost = estimateCost(offer, f);
    if (cost <= budgetToday) break;
    const minPct = opt.minPct ?? 0;
    if (offer.discountPct > minPct && estimateCost({ ...offer, discountPct: minPct }, f) <= budgetToday) {
      offer.discountPct = minPct;
      choice.discountPct = minPct;
      break;
    }
    menu = menu.filter((o) => o !== opt);
  }
  return { ...offer, ...templateMessage(offer, customer, f), reasoning: `Rule-based pick for a ${u.quadrant.replace(/_/g, ' ')} customer.` };
}
