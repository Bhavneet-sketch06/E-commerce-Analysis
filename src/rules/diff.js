// PURE: describe the difference between two rule sets in plain sentences for marketers.
import { OFFER_TYPES } from './defaultRules.js';

const QUAD = { persuadable: 'Persuadable', sure_thing: 'Sure Thing', lost_cause: 'Lost Cause', do_not_disturb: 'Do Not Disturb' };
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

const LABELS = {
  'campaign.name': ['Campaign name', String],
  'campaign.startDate': ['Campaign start', String],
  'campaign.endDate': ['Campaign end', String],
  'campaign.budgetInr': ['Campaign budget', inr],
  'campaign.dailyPacing': ['Daily budget pacing', (v) => (v ? 'on' : 'off')],
  'campaign.controlGroupPct': ['Control group', (v) => `${v}%`],
  'campaign.offerValidityHours': ['Offer validity', (v) => `${v} hours`],
  'contact.maxOffersPerWeek': ['Max offers per person per week', String],
  'contact.cooldownHours': ['Minimum gap between offers', (v) => `${v} hours`],
  'contact.quietHoursStart': ['Quiet hours start', (v) => `${v}:00`],
  'contact.quietHoursEnd': ['Quiet hours end', (v) => `${v}:00`],
  'contact.pauseAfterIgnored': ['Pause after ignored offers', String],
  'contact.noOffersAfterPurchaseHours': ['No offers after a purchase for', (v) => `${v} hours`],
  'triggers.enabled': ['Automatic triggers', (v) => (v ? 'on' : 'off')],
  'triggers.scanEveryMinutes': ['Check customers every', (v) => `${v} min`],
  'triggers.cartAbandoned.enabled': ['Abandoned-cart trigger', (v) => (v ? 'on' : 'off')],
  'triggers.cartAbandoned.afterMinutes': ['Cart reminder after', (v) => `${v} min`],
  'triggers.cartAbandoned.maxHours': ['Stop cart reminders after', (v) => `${v} hours`],
  'triggers.browseAbandoned.enabled': ["Browsed-but-didn't-buy trigger", (v) => (v ? 'on' : 'off')],
  'triggers.browseAbandoned.minViews': ['"Considering" means at least', (v) => `${v} views`],
  'triggers.browseAbandoned.withinDays': ['…within', (v) => `${v} days`],
  'triggers.browseAbandoned.afterMinutes': ['Browse nudge after last view', (v) => `${v} min`],
  'triggers.winBack.enabled': ['Win-back trigger', (v) => (v ? 'on' : 'off')],
  'triggers.winBack.overdueRatio': ['Win-back when overdue by', (v) => `${v}× their usual gap`],
  'triggers.winBack.minDaysSinceOrder': ['Win-back only after', (v) => `${v} days without an order`],
  'triggers.winBack.repeatAfterDays': ['Repeat win-back after', (v) => `${v} days`],
  'triggers.pointsExpiring.enabled': ['Points-expiring trigger', (v) => (v ? 'on' : 'off')],
  'triggers.pointsExpiring.minPoints': ['Points reminder when at least', (v) => `${v} points expire`],
  'triggers.pointsExpiring.repeatAfterDays': ['Repeat points reminder after', (v) => `${v} days`],
  'triggers.syntheticPerScan': ['Synthetic customers acted on per scan', String],
  'targeting.persuadableMinUplift': ['Persuadable threshold (offer must add at least)', (v) => `${Math.round(v * 100)} pts`],
  'targeting.sureThingMinBase': ['Sure Thing threshold (buys anyway at least)', (v) => `${Math.round(v * 100)}%`],
  'margin.minMarginAfterDiscountPct': ['Minimum margin kept after discount', (v) => `${v}%`],
  'exclusions.maxReturnRate': ['Exclude customers returning more than', (v) => `${Math.round(v * 100)}%`],
  'exclusions.minAccountAgeDays': ['Minimum account age', (v) => `${v} days`],
  'message.maxChars': ['Max message length', (v) => `${v} characters`],
};

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
    else out[p] = v;
  }
  return out;
}

function describe(path, before, after) {
  if (LABELS[path]) {
    const [label, fmt] = LABELS[path];
    return `${label}: ${before === undefined ? '–' : fmt(before)} → ${after === undefined ? '–' : fmt(after)}`;
  }
  let m = path.match(/^categories\.(.+)\.(maxDiscountPct|enabled)$/);
  if (m) return m[2] === 'enabled' ? `${m[1]} offers: ${after ? 'switched on' : 'switched off'}` : `${m[1]} max discount: ${before}% → ${after}%`;
  m = path.match(/^targeting\.quadrants\.(\w+)\.(allowedOffers|maxDiscountPct)$/);
  if (m) {
    const who = QUAD[m[1]] || m[1];
    if (m[2] === 'maxDiscountPct') return `${who} max discount: ${before}% → ${after}%`;
    const added = (after || []).filter((x) => !(before || []).includes(x)).map((t) => OFFER_TYPES[t]?.label || t);
    const removed = (before || []).filter((x) => !(after || []).includes(x)).map((t) => OFFER_TYPES[t]?.label || t);
    return [added.length && `${who} can now get: ${added.join(', ')}`, removed.length && `${who} can no longer get: ${removed.join(', ')}`].filter(Boolean).join('; ');
  }
  m = path.match(/^offers\.(\w+)\.(\w+)$/);
  if (m) {
    const label = OFFER_TYPES[m[1]]?.label || m[1];
    const field = { enabled: 'enabled', minPct: 'min %', maxPct: 'max %', minOrderInr: 'min order', minInr: 'min ₹', maxInr: 'max ₹', minPoints: 'min points', maxPoints: 'max points' }[m[2]] || m[2];
    const fmt = (v) => (m[2] === 'enabled' ? (v ? 'on' : 'off') : /Inr$/.test(m[2]) ? inr(v) : /Pct$/.test(m[2]) ? `${v}%` : v);
    return `${label} ${field}: ${fmt(before)} → ${fmt(after)}`;
  }
  if (path === 'message.bannedPhrases') {
    const added = (after || []).filter((x) => !(before || []).includes(x));
    const removed = (before || []).filter((x) => !(after || []).includes(x));
    return [added.length && `Banned phrases added: ${added.map((x) => `"${x}"`).join(', ')}`, removed.length && `Banned phrases removed: ${removed.map((x) => `"${x}"`).join(', ')}`].filter(Boolean).join('; ');
  }
  if (path === 'windows') {
    const names = (w) => (w || []).map((x) => `${x.name} (${x.start} to ${x.end}, +${x.extraDiscountPct}% on ${x.categories.join(', ')})`);
    return `Festive windows: ${names(before).join('; ') || 'none'} → ${names(after).join('; ') || 'none'}`;
  }
  return `${path}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`;
}

export function diffRules(a, b) {
  const fa = flatten(a);
  const fb = flatten(b);
  const out = [];
  for (const p of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    if (JSON.stringify(fa[p]) !== JSON.stringify(fb[p])) out.push({ path: p, before: fa[p], after: fb[p], text: describe(p, fa[p], fb[p]) });
  }
  return out;
}

// Apply [{path, value}] edits to a copy. Only existing paths (or whole arrays) may change.
export function applyChanges(rules, changes) {
  const next = structuredClone(rules);
  const rejected = [];
  for (const { path, value } of changes) {
    const keys = path.split('.');
    let node = next;
    for (let i = 0; i < keys.length - 1 && node; i++) node = node[keys[i]];
    const last = keys[keys.length - 1];
    if (!node || typeof node !== 'object' || !(last in node)) { rejected.push({ path, reason: 'unknown setting' }); continue; }
    const cur = node[last];
    const ok = Array.isArray(cur) ? Array.isArray(value) : typeof cur === typeof value;
    if (!ok) { rejected.push({ path, reason: `expected ${Array.isArray(cur) ? 'a list' : typeof cur}` }); continue; }
    node[last] = value;
  }
  return { rules: next, rejected };
}
