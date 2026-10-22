// Tiny JSON-file store. Everything lives in memory and is flushed to disk (atomically, debounced).
// `bus` emits live events for the dashboard feed.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { generatePopulation } from './data/generate.js';
import { DEFAULT_RULES } from './rules/defaultRules.js';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

const EMPTY = () => ({ meta: null, customers: {}, decisions: [], coupons: {}, events: [], ruleVersions: [] });
let data = EMPTY();
let file = config.dbPath;
let timer = null;

export function load(filePath = config.dbPath, { populationSize = 600 } = {}) {
  file = filePath;
  if (file !== ':memory:' && fs.existsSync(file)) {
    data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } else {
    data = EMPTY();
  }
  if (!Object.keys(data.customers).length) {
    const pop = generatePopulation({ n: populationSize, seed: 2026 });
    data.meta = pop.meta;
    for (const c of pop.customers) data.customers[c.id] = c;
  }
  if (!data.ruleVersions.length) {
    data.ruleVersions.push({ version: 1, at: new Date().toISOString(), by: 'system', note: 'Default rules', rules: structuredClone(DEFAULT_RULES) });
  }
  saveNow();
  return data;
}

export function saveNow() {
  if (file === ':memory:') return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function save() {
  clearTimeout(timer);
  timer = setTimeout(saveNow, 400);
}

// ---------- rules ----------
export const getRules = () => data.ruleVersions[data.ruleVersions.length - 1].rules;
export const ruleVersions = () => data.ruleVersions.map(({ rules, ...v }) => v);
export const ruleVersion = (n) => data.ruleVersions.find((v) => v.version === n);

export function saveRules(rules, { by = 'dashboard', note = '' } = {}) {
  const version = data.ruleVersions[data.ruleVersions.length - 1].version + 1;
  const entry = { version, at: new Date().toISOString(), by, note, rules: structuredClone(rules) };
  data.ruleVersions.push(entry);
  save();
  bus.emit('live', { kind: 'rules', version, note, by, at: entry.at });
  return entry;
}

// ---------- customers ----------
export const customers = () => Object.values(data.customers);
export const getCustomer = (id) => data.customers[id];
export const findByTelegram = (tgId) => customers().find((c) => c.telegramId === tgId);

export function upsertCustomer(c) {
  data.customers[c.id] = c;
  save();
  return c;
}

// ---------- decisions / offers ----------
export const decisions = () => data.decisions;
export const getDecision = (id) => data.decisions.find((d) => d.id === id);

export function addDecision(d) {
  const rec = { id: `D${String(data.decisions.length + 1).padStart(5, '0')}`, ...d };
  data.decisions.push(rec);
  save();
  bus.emit('live', { kind: 'decision', decision: rec });
  return rec;
}

export function updateDecision(id, patch) {
  const d = getDecision(id);
  if (!d) return null;
  Object.assign(d, patch);
  save();
  bus.emit('live', { kind: 'decision_update', decision: d });
  return d;
}

export function newCouponCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = 'PB-' + Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
  } while (data.coupons[code]);
  return code;
}

export function addCoupon(coupon) {
  data.coupons[coupon.code] = coupon;
  save();
  return coupon;
}

export const getCoupon = (code) => data.coupons[code];
export const coupons = () => Object.values(data.coupons);

export function addEvent(ev) {
  const rec = { at: new Date().toISOString(), ...ev };
  data.events.push(rec);
  if (data.events.length > 5000) data.events.splice(0, data.events.length - 5000);
  save();
  bus.emit('live', { kind: 'event', event: rec });
  return rec;
}
export const events = () => data.events;

// ---------- campaign state used by eligibility ----------
const istDay = (t) => new Date(new Date(t).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

export function campaignState(now = new Date()) {
  const sent = data.decisions.filter((d) => d.status === 'sent');
  const committedInr = sent.reduce((s, d) => s + (d.offer?.estCostInr || 0), 0);
  const today = istDay(now);
  const committedTodayInr = sent.filter((d) => istDay(d.at) === today).reduce((s, d) => s + (d.offer?.estCostInr || 0), 0);
  return { committedInr, committedTodayInr };
}

export function customerState(customerId) {
  return {
    sentOffers: data.decisions.filter((d) => d.customerId === customerId && d.status === 'sent').map((d) => ({ at: d.at, id: d.id })),
  };
}

export function resetActivity() {
  data.decisions = [];
  data.coupons = {};
  data.events = [];
  saveNow();
}
