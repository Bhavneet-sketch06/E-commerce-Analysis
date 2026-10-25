// Telegram bot: classmates onboard as customers, browse a mini catalogue, leave carts, and receive
// rule-checked offers. Offers created anywhere (bot, dashboard, campaign) are delivered via the db bus.

import { Bot, InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import * as db from '../db.js';
import { CATEGORIES, CATEGORY_NAMES, POINT_VALUE_INR } from '../data/catalog.js';
import { generateForTelegramUser, hashString } from '../data/generate.js';
import { analyse, decide, runCampaign } from '../engine.js';
import { runTriggersFor } from '../scheduler.js';
import { QUADRANTS } from '../uplift.js';
import { OFFER_TYPES } from '../rules/defaultRules.js';

const CART_ABANDON_DELAY_MS = (Number(process.env.CART_ABANDON_SECONDS) || 45) * 1000;
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CITIES = ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Mohali', 'Chandigarh', 'Bathinda', 'Delhi'];
const FREQS = [['weekly', 'Every week'], ['monthly', 'Every month'], ['sales', 'Only in sales 🏷️'], ['rarely', 'Rarely'], ['new', "I'm new here"]];
const LANGS = [['en', 'English'], ['hi', 'हिंदी'], ['pa', 'ਪੰਜਾਬੀ']];

export function productPrice(category, product) {
  const [lo, hi] = CATEGORIES[category].price;
  const x = (hashString(product) % 1000) / 1000;
  return Math.round(Math.exp(Math.log(lo) + Math.pow(x, 1.4) * (Math.log(hi) - Math.log(lo))) / 10) * 10 - 1;
}

// Every category or product a tester looks at becomes browsing history the engine learns from.
function logView(c, category, product = null) {
  c.browseLog = [...(c.browseLog || []), { at: new Date().toISOString(), category, product }].slice(-60);
}

const isAdmin = (ctx) => config.adminIds.includes(String(ctx.from?.id));
const customerOf = (ctx) => db.findByTelegram(ctx.from.id);

function mainMenu() {
  return new InlineKeyboard()
    .text('🛍️ Browse', 'menu:browse').text('🛒 My cart', 'menu:cart').row()
    .text('🎁 Get my offer', 'menu:offer').text('🎟️ My coupons', 'menu:coupons').row()
    .text('👤 My profile', 'menu:profile').text('❓ How it works', 'menu:help');
}

function profileCard(c) {
  const { f, u } = analyse(c, db.getRules());
  const lines = [
    `👤 <b>${esc(c.name)}</b> · ${esc(c.city)}`,
    `🏷️ Shopper type: <b>${f.segment}</b>`,
    `❤️ Favourite: ${CATEGORIES[f.topCategory]?.emoji || ''} ${f.topCategory}`,
    `📦 ${f.lifetimeOrders} past orders${f.recencyDays != null ? ` · last one ${f.recencyDays} days ago` : ''}`,
    `⭐ ${c.pointsBalance} reward points (${inr(c.pointsBalance * POINT_VALUE_INR)})${c.pointsExpiringSoon ? ` · ${c.pointsExpiringSoon} expire soon` : ''}`,
    c.cart?.items?.length ? `🛒 Cart: ${c.cart.items.length} item(s), ${inr(c.cart.valueInr)}` : '🛒 Cart is empty',
    '',
    `<i>Engine view: ${QUADRANTS[u.quadrant].label} (${QUADRANTS[u.quadrant].short.toLowerCase()})</i>`,
  ];
  return lines.join('\n');
}

export function offerCard(d) {
  const exp = new Date(d.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const parts = [`<b>${esc(d.headline)}</b>`, '', esc(d.message), ''];
  if (d.coupon) parts.push(`🎟️ Code: <code>${d.coupon}</code>`);
  parts.push(`⏳ Valid till ${exp}`);
  const kb = new InlineKeyboard();
  if (d.coupon) kb.text('🛒 Claim', `o:claim:${d.id}`);
  else kb.text('👀 Show me', `o:claim:${d.id}`);
  kb.text('🤔 Why this?', `o:why:${d.id}`).text('🙅 Not now', `o:no:${d.id}`);
  return { text: parts.join('\n'), kb };
}

export function whyText(d) {
  if (!d) return "You haven't received an offer yet. Tap 🎁 Get my offer!";
  const q = QUADRANTS[d.quadrant];
  const r = db.getRules();
  const o = d.offer || {};
  const checks = [];
  if (o.discountPct) checks.push(`✅ ${o.discountPct}% is within the ${o.category} discount limit`);
  if (o.amountInr) checks.push(`✅ ${inr(o.amountInr)} off is within the allowed range`);
  if (o.points) checks.push(`✅ ${o.points} points is within the points limit`);
  checks.push(`✅ At most ${r.contact.maxOffersPerWeek} offers per week, ${r.contact.cooldownHours}h apart`);
  checks.push('✅ Within the campaign budget');
  checks.push('✅ Message promises nothing beyond the offer');
  const fixed = d.attempts?.filter((a) => !a.ok && a.violations?.length && a.source !== 'fallback') || [];
  return [
    '🤔 <b>Why you got this offer</b>',
    '',
    d.signals?.length ? `We noticed you ${d.signals.map(esc).join(', ')}.` : 'Based on your shopping pattern.',
    `You look like a <b>${q.label}</b> shopper: ${q.short.toLowerCase()}.`,
    d.reasoning ? `\n💬 <i>${esc(d.reasoning)}</i>` : '',
    '',
    '<b>Rules checked before sending</b>',
    ...checks,
    fixed.length ? `\n🛡️ The AI's first idea broke a rule (${esc(fixed[0].violations[0].message)}), so it was corrected before sending.` : '',
    '',
    `<i>Picked by ${d.source === 'fallback' ? 'our rule engine' : 'AI (Claude)'} · checked against rules v${d.ruleVersion}. /stop to opt out anytime.</i>`,
  ].filter((x) => x !== '').join('\n');
}

function friendlyBlock(d) {
  const b = d.blockers?.[0];
  if (!b) return 'No offer right now.';
  const map = {
    frequency_cap: "You've already had your offers for this week. We don't want to spam you! 🙂",
    cooldown: 'We just sent you something. Give it a little time ⏳',
    quiet_hours: "It's quiet hours (10pm-8am). We'll keep it for the morning 🌙",
    recent_purchase: 'You just placed an order, so no offers for a little while. Enjoy your purchase! 📦',
    opted_out: "You've opted out of offers. Send /resume to turn them back on.",
    fatigue: "You've passed on a few offers, so we're giving you a break.",
    quadrant_blocked: "Nothing special for you right now. We'll ping you when there's something worth it.",
    budget_exhausted: "Today's offer budget is used up. Try again tomorrow!",
    campaign_inactive: 'No campaign is running right now.',
    high_returns: "You're not eligible for offers right now.",
  };
  return `${map[b.code] || 'No offer right now.'}\n\n<i>Rule: ${esc(b.message)}</i>`;
}

export function createBot(token) {
  const bot = new Bot(token);
  const onboarding = new Map(); // tgId -> answers so far

  async function deliver(d) {
    if (!d.telegramId || d.status !== 'sent' || d.delivered) return;
    const { text, kb } = offerCard(d);
    try {
      await bot.api.sendMessage(d.telegramId, text, { parse_mode: 'HTML', reply_markup: kb });
      db.updateDecision(d.id, { delivered: true, deliveredAt: new Date().toISOString() });
      db.addEvent({ type: 'delivered', decisionId: d.id, customerId: d.customerId });
    } catch (err) {
      console.error('[bot] delivery failed', d.id, err.message);
      db.updateDecision(d.id, { deliveryError: err.message });
    }
  }
  db.bus.on('live', (ev) => { if (ev.kind === 'decision') deliver(ev.decision); });

  // ---------- onboarding ----------
  bot.command('start', async (ctx) => {
    const c = customerOf(ctx);
    if (c) {
      if (c.optedOut) { c.optedOut = false; db.upsertCustomer(c); }
      return ctx.reply(`Welcome back! 👋\n\n${profileCard(c)}`, { parse_mode: 'HTML', reply_markup: mainMenu() });
    }
    onboarding.set(ctx.from.id, { firstName: ctx.from.first_name });
    const kb = new InlineKeyboard();
    LANGS.forEach(([k, label]) => kb.text(label, `ob:lang:${k}`));
    return ctx.reply(
      `Sat Sri Akal ${esc(ctx.from.first_name || '')}! 🙏\n\nWelcome to <b>Parvaaz Bazaar</b>, Punjab's favourite online bazaar (a demo store for our hackathon).\n\nAnswer 4 quick questions and I'll build your shopper profile. Then I'll only send you offers that are actually worth it.\n\n<b>1/4 · Which language for your offers?</b>`,
      { parse_mode: 'HTML', reply_markup: kb },
    );
  });

  bot.callbackQuery(/^ob:(\w+):(.+)$/, async (ctx) => {
    const [, step, value] = ctx.match;
    const a = onboarding.get(ctx.from.id) || { firstName: ctx.from.first_name };
    onboarding.set(ctx.from.id, a);
    await ctx.answerCallbackQuery();
    if (step === 'lang') {
      a.language = value;
      const kb = new InlineKeyboard();
      CITIES.forEach((city, i) => { kb.text(city, `ob:city:${city}`); if (i % 3 === 2) kb.row(); });
      return ctx.editMessageText('<b>2/4 · Which city do you shop from?</b>', { parse_mode: 'HTML', reply_markup: kb });
    }
    if (step === 'city') {
      a.city = value;
      const kb = new InlineKeyboard();
      CATEGORY_NAMES.forEach((cat, i) => { kb.text(`${CATEGORIES[cat].emoji} ${cat}`, `ob:cat:${cat}`); if (i % 2 === 1) kb.row(); });
      return ctx.editMessageText('<b>3/4 · What do you love shopping for?</b>', { parse_mode: 'HTML', reply_markup: kb });
    }
    if (step === 'cat') {
      a.preferredCategory = value;
      const kb = new InlineKeyboard();
      FREQS.forEach(([k, label]) => kb.text(label, `ob:freq:${k}`).row());
      return ctx.editMessageText('<b>4/4 · How often do you shop online?</b>', { parse_mode: 'HTML', reply_markup: kb });
    }
    if (step === 'freq') {
      a.frequency = value;
      const c = generateForTelegramUser({ telegramId: ctx.from.id, ...a });
      c.name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || c.name;
      c.username = ctx.from.username || null;
      c.joinedAt = new Date().toISOString();
      db.upsertCustomer(c);
      onboarding.delete(ctx.from.id);
      db.addEvent({ type: 'joined', customerId: c.id, name: c.name });
      await ctx.editMessageText(`🎉 Your profile is ready! We generated a realistic shopping history based on your answers.\n\n${profileCard(c)}`, { parse_mode: 'HTML', reply_markup: mainMenu() });
    }
  });

  // ---------- menu ----------
  bot.callbackQuery(/^menu:(\w+)$/, async (ctx) => {
    const c = customerOf(ctx);
    await ctx.answerCallbackQuery();
    if (!c) return ctx.reply('Send /start to set up your profile first.');
    const what = ctx.match[1];
    if (what === 'profile') return ctx.reply(profileCard(c), { parse_mode: 'HTML', reply_markup: mainMenu() });
    if (what === 'browse') {
      const kb = new InlineKeyboard();
      CATEGORY_NAMES.forEach((cat, i) => { kb.text(`${CATEGORIES[cat].emoji} ${cat}`, `b:${CATEGORY_NAMES.indexOf(cat)}`); if (i % 2 === 1) kb.row(); });
      return ctx.reply('🛍️ <b>Browse the bazaar</b>', { parse_mode: 'HTML', reply_markup: kb });
    }
    if (what === 'cart') return showCart(ctx, c);
    if (what === 'offer') return requestOffer(ctx, c);
    if (what === 'coupons') return showCoupons(ctx, c);
    if (what === 'help') return ctx.reply(HELP, { parse_mode: 'HTML' });
  });

  bot.callbackQuery(/^b:(\d+)$/, async (ctx) => {
    const c = customerOf(ctx);
    await ctx.answerCallbackQuery();
    if (!c) return;
    const cat = CATEGORY_NAMES[Number(ctx.match[1])];
    c.visits30d += 1;
    c.lastVisitDate = new Date().toISOString();
    c.browsedCategories = [cat, ...(c.browsedCategories || []).filter((x) => x !== cat)].slice(0, 3);
    logView(c, cat);
    db.upsertCustomer(c);
    db.addEvent({ type: 'browse', customerId: c.id, category: cat });
    const kb = new InlineKeyboard();
    const lines = CATEGORIES[cat].products.map((p, i) => {
      kb.text(`➕ ${p}`, `add:${CATEGORY_NAMES.indexOf(cat)}:${i}`);
      if (i % 2 === 1) kb.row();
      return `• ${p}: <b>${inr(productPrice(cat, p))}</b>`;
    });
    kb.row().text('🛒 View cart', 'menu:cart');
    return ctx.reply(`${CATEGORIES[cat].emoji} <b>${cat}</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery(/^add:(\d+):(\d+)$/, async (ctx) => {
    const c = customerOf(ctx);
    if (!c) return ctx.answerCallbackQuery();
    const cat = CATEGORY_NAMES[Number(ctx.match[1])];
    const product = CATEGORIES[cat].products[Number(ctx.match[2])];
    const item = { product, category: cat, priceInr: productPrice(cat, product) };
    c.cart = c.cart?.items?.length ? c.cart : { items: [], valueInr: 0 };
    c.cart.items.push(item);
    c.cart.valueInr = c.cart.items.reduce((s, i) => s + i.priceInr, 0);
    c.cart.updatedAt = new Date().toISOString();
    logView(c, cat, product);
    db.upsertCustomer(c);
    db.addEvent({ type: 'add_to_cart', customerId: c.id, product, priceInr: item.priceInr });
    return ctx.answerCallbackQuery({ text: `Added ${product} (${inr(item.priceInr)}) 🛒` });
  });

  async function showCart(ctx, c) {
    if (!c.cart?.items?.length) return ctx.reply('🛒 Your cart is empty. Tap 🛍️ Browse to add something.', { reply_markup: mainMenu() });
    const claimed = activeClaimedCoupon(c);
    const lines = c.cart.items.map((i) => `• ${i.product}: ${inr(i.priceInr)}`);
    const kb = new InlineKeyboard().text('✅ Checkout', 'cart:checkout').text('🚶 Leave cart', 'cart:leave').row().text('🗑️ Empty cart', 'cart:empty');
    return ctx.reply(
      `🛒 <b>Your cart</b>\n\n${lines.join('\n')}\n\nTotal: <b>${inr(c.cart.valueInr)}</b>${claimed ? `\n🎟️ Coupon <code>${claimed.code}</code> will be applied if it fits` : ''}\n\n<i>If you just walk away, the engine notices on its own after a while. Tap "Leave cart" to skip the wait.</i>`,
      { parse_mode: 'HTML', reply_markup: kb },
    );
  }

  function activeClaimedCoupon(c) {
    const now = Date.now();
    return db.coupons().find((k) => k.customerId === c.id && k.status === 'claimed' && Date.parse(k.expiresAt) > now);
  }

  bot.callbackQuery(/^cart:(\w+)$/, async (ctx) => {
    const c = customerOf(ctx);
    await ctx.answerCallbackQuery();
    if (!c?.cart?.items?.length) return ctx.reply('Your cart is empty.');
    const action = ctx.match[1];
    if (action === 'empty') {
      c.cart = null;
      db.upsertCustomer(c);
      return ctx.reply('🗑️ Cart emptied.', { reply_markup: mainMenu() });
    }
    if (action === 'leave') {
      // Demo shortcut: fast-forward the cart past the "abandoned after" rule, then let the trigger engine react.
      const waitMin = db.getRules().triggers?.cartAbandoned?.afterMinutes ?? 60;
      c.cart.updatedAt = new Date(Date.now() - (waitMin + 1) * 60_000).toISOString();
      db.upsertCustomer(c);
      db.addEvent({ type: 'cart_abandoned', customerId: c.id, valueInr: c.cart.valueInr });
      await ctx.reply(`🚶 You walked away from ${inr(c.cart.valueInr)} in your cart...\n\n<i>(Demo: we fast-forward ${waitMin} min, the time the rules wait before calling a cart abandoned. The engine will decide in ~${Math.round(CART_ABANDON_DELAY_MS / 1000)}s whether you're worth a nudge.)</i>`, { parse_mode: 'HTML' });
      setTimeout(async () => {
        const fresh = db.getCustomer(c.id);
        if (!fresh?.cart?.items?.length) return;
        const d = await runTriggersFor(c.id);
        if (!d) {
          await bot.api.sendMessage(ctx.from.id, '🤖 Nothing to send right now: this cart was already handled, or the cart trigger is off, or it is quiet hours.').catch(() => {});
        } else if (d.status !== 'sent') {
          await bot.api.sendMessage(ctx.from.id, `🤖 The engine looked at your cart and decided <b>not</b> to send an offer.\n\n${friendlyBlock(d.blockers?.length ? d : { blockers: [{ code: 'quadrant_blocked', message: d.reasoning || 'Skipped' }] })}`, { parse_mode: 'HTML' }).catch(() => {});
        }
      }, CART_ABANDON_DELAY_MS);
      return;
    }
    if (action === 'checkout') return checkout(ctx, c);
  });

  async function checkout(ctx, c) {
    const items = c.cart.items;
    const gross = c.cart.valueInr;
    const coupon = activeClaimedCoupon(c);
    let discount = 0;
    let applied = null;
    if (coupon) {
      const o = coupon.offer;
      const catTotal = o.category ? items.filter((i) => i.category === o.category).reduce((s, i) => s + i.priceInr, 0) : gross;
      const meetsMin = gross >= (o.minOrderInr || 0);
      if (meetsMin && catTotal > 0) {
        if (o.discountPct) discount = Math.round(catTotal * o.discountPct / 100);
        else if (o.amountInr) discount = Math.min(o.amountInr, catTotal);
        else if (o.type === 'free_shipping') discount = 49;
        else if (o.type === 'bonus_points') discount = 0;
        applied = coupon;
      }
    }
    const value = gross - discount;
    const top = items[0].category;
    c.orders.push({ date: new Date().toISOString(), category: top, products: items.map((i) => i.product), items: items.length, grossInr: gross, discountPct: discount ? Math.round(discount / gross * 100) : 0, valueInr: value, usedCoupon: !!applied, returned: false, payment: 'UPI' });
    const earned = Math.floor(value / 100) + (applied?.offer.type === 'bonus_points' ? applied.offer.points : 0);
    c.pointsBalance += earned;
    c.cart = null;
    if (c.offerHistory) c.offerHistory.ignoredStreak = 0;
    db.upsertCustomer(c);
    if (applied) {
      applied.status = 'redeemed';
      applied.redeemedAt = new Date().toISOString();
      db.updateDecision(applied.decisionId, { outcome: { simulated: false, purchased: true, orderValueInr: value, discountCostInr: discount, claimed: true } });
      db.addEvent({ type: 'redeemed', decisionId: applied.decisionId, customerId: c.id, orderValueInr: value, discountInr: discount });
    } else {
      db.addEvent({ type: 'order', customerId: c.id, orderValueInr: value });
    }
    return ctx.reply(`✅ <b>Order placed!</b> (demo, no real payment)\n\nPaid ${inr(value)}${discount ? `, saved <b>${inr(discount)}</b> with <code>${applied.code}</code>` : ''}\n⭐ +${earned} reward points`, { parse_mode: 'HTML', reply_markup: mainMenu() });
  }

  async function requestOffer(ctx, c) {
    await ctx.replyWithChatAction('typing');
    const d = await decide(c.id, { trigger: 'customer_request' });
    if (d.status === 'sent') return; // delivered through the bus
    if (d.status === 'skipped') return ctx.reply(`🤖 I checked, and there's nothing worth sending you right now. Keep shopping, it'll come!\n\n<i>${esc(d.reasoning || '')}</i>`, { parse_mode: 'HTML' });
    return ctx.reply(friendlyBlock(d), { parse_mode: 'HTML' });
  }

  async function showCoupons(ctx, c) {
    const mine = db.coupons().filter((k) => k.customerId === c.id).slice(-8).reverse();
    if (!mine.length) return ctx.reply('🎟️ No coupons yet. Tap 🎁 Get my offer!', { reply_markup: mainMenu() });
    const label = (k) => (k.status === 'redeemed' ? '✅ used' : Date.parse(k.expiresAt) < Date.now() ? '⌛ expired' : k.status === 'claimed' ? '🟢 claimed' : '🔵 available');
    const lines = mine.map((k) => {
      const o = k.offer;
      const what = o.discountPct ? `${o.discountPct}% off ${o.category}` : o.amountInr ? `${inr(o.amountInr)} off ${o.category}` : o.points ? `${o.points} bonus points` : OFFER_TYPES[o.type].label;
      return `<code>${k.code}</code> · ${what} · ${label(k)}`;
    });
    return ctx.reply(`🎟️ <b>Your coupons</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
  }

  // ---------- offer buttons ----------
  bot.callbackQuery(/^o:(claim|why|no):(D\d+)$/, async (ctx) => {
    const [, action, id] = ctx.match;
    const d = db.getDecision(id);
    if (!d || d.telegramId !== ctx.from.id) return ctx.answerCallbackQuery({ text: 'Offer not found' });
    if (!d.opened) db.updateDecision(id, { opened: true });
    if (action === 'why') {
      await ctx.answerCallbackQuery();
      db.addEvent({ type: 'why', decisionId: id, customerId: d.customerId });
      return ctx.reply(whyText(d), { parse_mode: 'HTML' });
    }
    if (action === 'no') {
      await ctx.answerCallbackQuery({ text: 'No problem! 👍' });
      const c = db.getCustomer(d.customerId);
      c.offerHistory = { ...(c.offerHistory || {}), ignoredStreak: (c.offerHistory?.ignoredStreak || 0) + 1 };
      db.upsertCustomer(c);
      db.updateDecision(id, { response: 'dismissed' });
      db.addEvent({ type: 'dismissed', decisionId: id, customerId: d.customerId });
      return ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text('🤔 Why this?', `o:why:${id}`) }).catch(() => {});
    }
    // claim
    const coupon = d.coupon && db.getCoupon(d.coupon);
    if (coupon && Date.parse(coupon.expiresAt) < Date.now()) return ctx.answerCallbackQuery({ text: 'This offer has expired ⌛' });
    if (coupon && coupon.status === 'issued') { coupon.status = 'claimed'; coupon.claimedAt = new Date().toISOString(); }
    const claimer = db.getCustomer(d.customerId);
    if (claimer?.offerHistory) { claimer.offerHistory.ignoredStreak = 0; db.upsertCustomer(claimer); }
    db.updateDecision(id, { response: 'claimed' });
    db.addEvent({ type: 'claimed', decisionId: id, customerId: d.customerId });
    await ctx.answerCallbackQuery({ text: coupon ? 'Coupon saved! It applies at checkout 🎉' : 'Opening the bazaar 🛍️' });
    if (d.offer?.category && CATEGORIES[d.offer.category]) {
      const kb = new InlineKeyboard().text(`${CATEGORIES[d.offer.category].emoji} Shop ${d.offer.category}`, `b:${CATEGORY_NAMES.indexOf(d.offer.category)}`).text('🛒 My cart', 'menu:cart');
      return ctx.reply(coupon ? `🎟️ <code>${coupon.code}</code> is saved and will apply automatically at checkout.` : 'Here you go 👇', { parse_mode: 'HTML', reply_markup: kb });
    }
    return ctx.reply(coupon ? `🎟️ <code>${coupon.code}</code> is saved and will apply at checkout.` : '👍', { parse_mode: 'HTML', reply_markup: mainMenu() });
  });

  // ---------- commands ----------
  const HELP = [
    '❓ <b>How Parvaaz Offers works</b>',
    '',
    '1. Your answers created a realistic shopper profile (synthetic data, nothing real).',
    '2. The engine predicts how likely you are to buy <i>with</i> and <i>without</i> an offer. Discounts go only where they change something.',
    '3. An AI (Claude) picks and writes your offer, but only inside the business rules: max discounts, budget, 2 offers a week, quiet hours.',
    '4. Every AI offer is checked by a guardrail before it reaches you. Tap 🤔 Why this? on any offer to see the checks.',
    '',
    'Try it: 🛍️ Browse → add items → 🛒 My cart → 🚶 Leave cart, and wait a moment.',
    '',
    'Commands: /profile /why /mycoupons /stop /resume',
  ].join('\n');

  bot.command('help', (ctx) => ctx.reply(HELP, { parse_mode: 'HTML' }));
  bot.command('profile', (ctx) => {
    const c = customerOf(ctx);
    return c ? ctx.reply(profileCard(c), { parse_mode: 'HTML', reply_markup: mainMenu() }) : ctx.reply('Send /start first.');
  });
  bot.command('menu', (ctx) => ctx.reply('What would you like to do?', { reply_markup: mainMenu() }));
  bot.command('why', (ctx) => {
    const c = customerOf(ctx);
    const last = c && db.decisions().filter((d) => d.customerId === c.id && d.status === 'sent').at(-1);
    return ctx.reply(whyText(last), { parse_mode: 'HTML' });
  });
  bot.command('mycoupons', (ctx) => { const c = customerOf(ctx); return c ? showCoupons(ctx, c) : ctx.reply('Send /start first.'); });
  bot.command('offer', (ctx) => { const c = customerOf(ctx); return c ? requestOffer(ctx, c) : ctx.reply('Send /start first.'); });
  bot.command('stop', (ctx) => {
    const c = customerOf(ctx);
    if (!c) return ctx.reply('You have no profile. Nothing to stop.');
    c.optedOut = true;
    db.upsertCustomer(c);
    db.addEvent({ type: 'opted_out', customerId: c.id });
    return ctx.reply('🔕 Done. You will not receive any more offers. Send /resume anytime to turn them back on.');
  });
  bot.command('resume', (ctx) => {
    const c = customerOf(ctx);
    if (!c) return ctx.reply('Send /start first.');
    c.optedOut = false;
    db.upsertCustomer(c);
    db.addEvent({ type: 'opted_in', customerId: c.id });
    return ctx.reply('🔔 Offers are back on!', { reply_markup: mainMenu() });
  });

  // Admin: /launch [n] runs a campaign over all Telegram testers + n synthetic customers. /myid shows your id.
  bot.command('myid', (ctx) => ctx.reply(`Your Telegram id: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' }));
  bot.command('launch', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('Only admins can launch campaigns.');
    const n = Number(ctx.match) || 30;
    await ctx.reply(`🚀 Launching: all Telegram testers + top ${n} synthetic customers...`);
    const testers = db.customers().filter((c) => c.telegramId != null && !c.optedOut);
    const res = [];
    for (const c of testers) res.push(await decide(c.id, { trigger: 'campaign' }));
    res.push(...(await runCampaign({ limit: n, onlySynthetic: true })));
    const count = (s) => res.filter((d) => d.status === s).length;
    return ctx.reply(`✅ Done. Sent ${count('sent')} · control ${count('holdout')} · blocked ${count('blocked')} · skipped ${count('skipped')}`);
  });

  bot.catch((err) => console.error('[bot] error:', err.error?.message || err.error));
  return bot;
}
