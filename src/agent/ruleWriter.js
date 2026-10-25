// Plain English -> structured rule changes. Claude only proposes edits; the server applies them to a copy,
// checks them, and shows a diff + impact preview. Nothing changes until a marketer clicks Apply.

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client = null;
const getClient = () => (client ||= new Anthropic({ apiKey: config.anthropicKey, timeout: 60_000, maxRetries: 1 }));

const SYSTEM = `You translate a marketing manager's instruction into precise edits to the offer engine's rules (JSON).
Rules glossary:
- campaign: budgetInr (₹), dailyPacing, controlGroupPct, offerValidityHours, startDate/endDate (YYYY-MM-DD)
- contact: maxOffersPerWeek, cooldownHours, quietHoursStart/End (0-23, IST), pauseAfterIgnored, noOffersAfterPurchaseHours
- triggers (automatic timing): enabled, scanEveryMinutes, syntheticPerScan,
  cartAbandoned {enabled, afterMinutes, maxHours}, browseAbandoned {enabled, minViews, withinDays, afterMinutes},
  winBack {enabled, overdueRatio, minDaysSinceOrder, repeatAfterDays}, pointsExpiring {enabled, minPoints, repeatAfterDays}
- targeting.persuadableMinUplift (0-1), targeting.sureThingMinBase (0-1)
- targeting.quadrants.<persuadable|sure_thing|lost_cause|do_not_disturb>.allowedOffers (list of offer types) and .maxDiscountPct
- offers.<type>: enabled, minPct/maxPct, minInr/maxInr, minOrderInr, minPoints/maxPoints. Types: percent_off, flat_off, free_shipping, cart_recovery, bonus_points, points_reminder, nudge
- categories.<Fashion|Electronics|Home & Kitchen|Beauty|Grocery|Sports|Books|Toys>: enabled, maxDiscountPct
- margin.minMarginAfterDiscountPct, exclusions.maxReturnRate (0-1), exclusions.minAccountAgeDays
- message.maxChars, message.bannedPhrases (list of strings)
- windows: list of festive windows {name, start, end, extraDiscountPct, categories} (to add or change one, return the WHOLE new list)

Return each edit as {path, value}: path is dot-separated using the exact keys above (category names may contain spaces and "&"),
value is the new value encoded as JSON text (e.g. "10", "true", "[\\"nudge\\"]", "\\"2026-11-02\\"").
Change only what the instruction asks. If the instruction is ambiguous or impossible, make no edits and explain in "question".
"summary" restates in one plain sentence what will change.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'changes', 'question'],
  properties: {
    summary: { type: 'string' },
    changes: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['path', 'value'], properties: { path: { type: 'string' }, value: { type: 'string' } } },
    },
    question: { type: 'string' },
  },
};

export async function interpretRule(instruction, rules, today) {
  const response = await getClient().beta.messages.create({
    model: config.model,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Today is ${today}.\nCurrent rules:\n${JSON.stringify(rules, null, 1)}\n\nInstruction: ${instruction}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined this instruction');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('No answer from the model');
  const out = JSON.parse(text);
  const changes = [];
  const unparsed = [];
  for (const c of out.changes) {
    try { changes.push({ path: c.path, value: JSON.parse(c.value) }); } catch { unparsed.push(c.path); }
  }
  return { summary: out.summary, question: out.question, changes, unparsed };
}
