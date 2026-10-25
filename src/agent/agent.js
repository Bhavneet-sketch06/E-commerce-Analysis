// Claude chooses and personalises ONE offer from the eligible menu, as structured JSON.
// The caller validates it; on violations we ask Claude to fix it once, passing the exact violations back.

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { CATEGORY_NAMES } from '../data/catalog.js';
import { OFFER_TYPES } from '../rules/defaultRules.js';
import { QUADRANTS } from '../uplift.js';

let client = null;
const getClient = () => (client ||= new Anthropic({ apiKey: config.anthropicKey, timeout: 45_000, maxRetries: 1 }));
export const aiAvailable = () => !!config.anthropicKey;

const SYSTEM = `You are the offer strategist for Parvaaz Bazaar, an e-commerce platform in Punjab, India.
For one customer you choose AT MOST ONE offer from the menu you are given, or decide to send nothing, and you write the Telegram message.

How to decide:
- Spend margin only where it changes behaviour. "Sure thing" customers buy anyway: reward loyalty (points, a personal pick), never discount.
  "Persuadable" customers respond to incentives: pick the smallest discount likely to convert. "Lost cause" customers: cheap win-back or nothing.
- "trigger" says why we are contacting them right now; make the offer and the message answer it:
  cart_abandoned -> cart_recovery for their cart; browse_abandoned -> the category/product they keep viewing (browsing.considering);
  win_back -> they are overdue versus their usual rhythm, a warm "we miss you" with the smallest incentive that could bring them back;
  points_expiring -> remind them about the points; campaign / customer_request -> pick what fits best.
- Otherwise prefer what the customer actually does: an abandoned cart, a category they keep browsing, their favourite category.
- Every number must stay inside the menu's ranges. Skipping is a valid, good decision when nothing fits.

How to write:
- Write in the customer's language: "en" English, "hi" Hindi (Devanagari), "pa" Punjabi (Gurmukhi). Always write numbers with Western digits (0-9) and rupees as ₹.
- Headline: max 60 characters, may start with one emoji. Message: 1-3 short sentences, warm and specific (use their first name, the product or category, their city or festival if natural).
- Mention only what the offer gives: its exact % or ₹ amount, minimum order, points. Never mention free delivery unless the offer is free_shipping.
- Do not write a coupon code or an expiry date (the system adds them). No pressure tactics, no "guaranteed", no ALL CAPS.
- Never mention internal labels (quadrant, churn risk, scores) in the message.

"reasoning" is for the marketing team, in English, 1-2 sentences: why this offer (or nothing) for this customer.
For fields that don't apply to the chosen offer use 0 (numbers) or "" (category).`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'type', 'category', 'discountPct', 'amountInr', 'points', 'headline', 'message', 'reasoning'],
  properties: {
    action: { type: 'string', enum: ['send', 'skip'] },
    type: { type: 'string', enum: [...Object.keys(OFFER_TYPES), 'none'] },
    category: { type: 'string', enum: [...CATEGORY_NAMES, ''] },
    discountPct: { type: 'integer' },
    amountInr: { type: 'integer' },
    points: { type: 'integer' },
    headline: { type: 'string' },
    message: { type: 'string' },
    reasoning: { type: 'string' },
  },
};

export function buildBrief({ customer, f, u, el, trigger, triggerReason, now }) {
  const first = customer.name.split(' ')[0];
  return {
    today: new Date(now).toISOString().slice(0, 10),
    trigger,
    triggerReason: triggerReason || null,
    activeFestiveWindows: el.windows,
    customer: {
      firstName: first, city: customer.city, language: customer.language, ageBand: customer.ageBand,
      segment: f.segment, quadrant: `${u.quadrant} (${QUADRANTS[u.quadrant].short})`,
      buyProbabilityNoOffer: u.pBase, buyProbabilityWithOffer: u.pOffer,
      favouriteCategory: f.topCategory, statedPreference: f.preferredCategory,
      ordersLastYear: f.frequency365, daysSinceLastOrder: f.recencyDays, avgOrderValueInr: f.aov,
      usesCouponsShare: f.discountShare, returnRate: f.returnRate,
      cart: f.hasAbandonedCart ? { valueInr: f.cartValue, hoursAgo: f.cartAgeHours, items: f.cartItems.map((i) => `${i.product} (₹${i.priceInr})`) } : null,
      rewardPoints: f.pointsBalance, pointsExpiringIn30Days: f.pointsExpiringSoon,
      browsing: {
        viewsLast7Days: f.views7d, viewsLast30Days: f.views30d, mostBrowsedRecently: f.topBrowsedCategory,
        considering: f.browseIntent ? `${f.browseIntent.product} (${f.browseIntent.category}), viewed ${f.browseIntent.views7d}x this week, not bought` : null,
      },
      hoursSinceLastOrder: f.hoursSinceLastOrder,
    },
    menu: el.options,
    budgetLeftTodayInr: Math.round(el.budget.today),
  };
}

function parseOutput(response) {
  if (response.stop_reason === 'refusal') throw new Error('Model declined');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`No text in response (stop_reason ${response.stop_reason})`);
  const out = JSON.parse(text);
  // Normalise "not applicable" fields so the validator sees only what the offer uses.
  const p = { action: out.action, type: out.type, headline: out.headline, message: out.message, reasoning: out.reasoning };
  if (out.category) p.category = out.category;
  if (out.discountPct) p.discountPct = out.discountPct;
  if (out.amountInr) p.amountInr = out.amountInr;
  if (out.points) p.points = out.points;
  if (p.action === 'send' && p.type === 'none') p.action = 'skip';
  return p;
}

async function call(messages) {
  const started = Date.now();
  const response = await getClient().beta.messages.create({
    model: config.model,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages,
  });
  return { response, ms: Date.now() - started, model: response.model };
}

// Returns a conversation handle so the engine can ask for a fix with the validator's violations.
export async function proposeOffer(brief) {
  const messages = [{ role: 'user', content: `Choose the offer for this customer.\n\n${JSON.stringify(brief, null, 1)}` }];
  const { response, ms, model } = await call(messages);
  messages.push({ role: 'assistant', content: response.content });
  return { proposal: parseOutput(response), messages, ms, model };
}

export async function reviseOffer(messages, violations) {
  const list = violations.map((v) => `- ${v.message}`).join('\n');
  messages.push({ role: 'user', content: `The guardrail rejected that proposal:\n${list}\nReturn a corrected proposal that stays inside the menu limits, or skip.` });
  const { response, ms, model } = await call(messages);
  messages.push({ role: 'assistant', content: response.content });
  return { proposal: parseOutput(response), messages, ms, model };
}
