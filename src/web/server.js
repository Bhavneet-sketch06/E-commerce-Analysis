// Express API for the dashboard + Server-Sent Events live feed. Serves dashboard/dist when built.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import * as db from '../db.js';
import { analyse, decide, runCampaign } from '../engine.js';
import { overview } from '../metrics.js';
import { checkRules } from '../rules/checkRules.js';
import { QUADRANTS } from '../uplift.js';
import { CATEGORIES } from '../data/catalog.js';
import { OFFER_TYPES } from '../rules/defaultRules.js';
import { aiAvailable } from '../agent/agent.js';
import { interpretRule } from '../agent/ruleWriter.js';
import { diffRules, applyChanges } from '../rules/diff.js';
import { simulate } from '../simulate.js';
import { autopilotStatus, scanNow } from '../scheduler.js';
import { TRIGGERS } from '../triggers.js';
import { modelCheck } from '../world.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '../../dashboard/dist');

function auth(req, res, next) {
  // The health check stays public so the host can tell the app is alive; everything else needs the password.
  if (!config.dashboardPassword || req.path === '/api/health') return next();
  const [type, value] = (req.headers.authorization || '').split(' ');
  const pass = type === 'Basic' ? Buffer.from(value || '', 'base64').toString().split(':').slice(1).join(':') : '';
  if (pass === config.dashboardPassword) return next();
  res.set('WWW-Authenticate', 'Basic realm="Offer Engine"').status(401).send('Password required');
}

function customerRow(c, rules) {
  const { f, u } = analyse(c, rules);
  return {
    id: c.id, name: c.name, city: c.city, language: c.language, telegram: c.telegramId != null, username: c.username || null,
    segment: f.segment, quadrant: u.quadrant, pBase: u.pBase, pOffer: u.pOffer, uplift: u.uplift, churnRisk: f.churnRisk,
    ltv: f.lifetimeValue, orders: f.lifetimeOrders, recencyDays: f.recencyDays, topCategory: f.topCategory, cartValue: f.cartValue, optedOut: c.optedOut,
  };
}

let baseline = { key: null, value: null };
function baselineForecast() {
  const key = `${db.ruleVersions().at(-1).version}:${db.customers().length}:${new Date().toISOString().slice(0, 13)}`;
  if (baseline.key !== key) baseline = { key, value: simulate(db.getRules(), db.customers()) };
  return baseline.value;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(auth);

  app.get('/api/health', (req, res) => res.json({ ok: true, ai: aiAvailable(), model: config.model }));

  app.get('/api/meta', (req, res) => res.json({
    quadrants: QUADRANTS, categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, { emoji: v.emoji, marginPct: v.marginPct }])),
    offerTypes: OFFER_TYPES, ai: aiAvailable(), model: config.model, population: db.customers().length,
  }));

  app.get('/api/overview', (req, res) => res.json(overview()));

  app.get('/api/customers', (req, res) => {
    const rules = db.getRules();
    let rows = db.customers().map((c) => customerRow(c, rules));
    if (req.query.quadrant) rows = rows.filter((r) => r.quadrant === req.query.quadrant);
    if (req.query.telegram) rows = rows.filter((r) => r.telegram);
    if (req.query.q) { const q = String(req.query.q).toLowerCase(); rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.city.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)); }
    rows.sort((a, b) => Number(b.telegram) - Number(a.telegram) || b.uplift - a.uplift);
    res.json(rows);
  });

  app.get('/api/customers/:id', (req, res) => {
    const c = db.getCustomer(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const { f, u, signals } = analyse(c, db.getRules());
    const { _archetype, ...pub } = c;
    res.json({ customer: pub, features: f, scores: u, signals, decisions: db.decisions().filter((d) => d.customerId === c.id).slice(-20).reverse() });
  });

  // Ground-truth check of the targeting (synthetic customers only; the engine itself never sees this).
  app.get('/api/model-check', (req, res) => {
    const rules = db.getRules();
    const rows = db.customers().filter((c) => c.telegramId == null).map((c) => ({ customer: c, quadrant: analyse(c, rules).u.quadrant }));
    res.json(modelCheck(rows));
  });

  app.get('/api/decisions', (req, res) => {
    let rows = db.decisions();
    if (req.query.status) rows = rows.filter((d) => d.status === req.query.status);
    if (req.query.telegram) rows = rows.filter((d) => d.telegramId != null);
    if (req.query.trigger) rows = rows.filter((d) => d.trigger === req.query.trigger);
    if (req.query.source === 'ai') rows = rows.filter((d) => d.source === 'ai' || d.source === 'ai_revised');
    if (req.query.guardrail) rows = rows.filter((d) => d.attempts?.some((a) => a.source !== 'fallback' && (!a.ok || a.error)));
    const limit = Math.min(500, Number(req.query.limit) || 100);
    res.json(rows.slice(-limit).reverse());
  });

  app.get('/api/rules', (req, res) => res.json({ rules: db.getRules(), version: db.ruleVersions().at(-1), check: checkRules(db.getRules()) }));
  app.get('/api/rules/versions', (req, res) => res.json(db.ruleVersions().reverse()));
  app.get('/api/rules/versions/:n', (req, res) => {
    const v = db.ruleVersion(Number(req.params.n));
    return v ? res.json(v) : res.status(404).json({ error: 'Not found' });
  });
  app.put('/api/rules', (req, res) => {
    const { rules, note, by } = req.body || {};
    const check = checkRules(rules);
    if (check.errors.length) return res.status(400).json({ error: 'Rules have problems', check });
    const v = db.saveRules(rules, { by: by || 'Marketing team', note: note || 'Edited in dashboard' });
    res.json({ version: v.version, check });
  });
  app.post('/api/rules/check', (req, res) => {
    const rules = req.body?.rules;
    res.json({ check: checkRules(rules), diff: rules ? diffRules(db.getRules(), rules) : [] });
  });
  app.get('/api/rules/versions/:n/diff', (req, res) => {
    const n = Number(req.params.n);
    const v = db.ruleVersion(n);
    const prev = db.ruleVersion(n - 1);
    if (!v) return res.status(404).json({ error: 'Not found' });
    res.json({ diff: prev ? diffRules(prev.rules, v.rules) : [], vsCurrent: diffRules(v.rules, db.getRules()) });
  });
  // Plain English -> proposed rules (not saved). The dashboard shows the diff + forecast, then PUTs on Apply.
  app.post('/api/rules/nl', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Type an instruction first' });
    if (!aiAvailable()) return res.status(503).json({ error: 'Plain-English rules need ANTHROPIC_API_KEY. You can still edit the rules directly below.' });
    try {
      const current = db.getRules();
      const out = await interpretRule(text, current, new Date().toISOString().slice(0, 10));
      const { rules, rejected } = applyChanges(current, out.changes);
      const customers = db.customers();
      res.json({
        summary: out.summary, question: out.question, rejected: [...rejected, ...out.unparsed.map((p) => ({ path: p, reason: 'could not read value' }))],
        rules, diff: diffRules(current, rules), check: checkRules(rules),
        impact: { before: baselineForecast(), after: simulate(rules, customers) },
      });
    } catch (err) {
      res.status(502).json({ error: `Could not interpret that: ${err.message}` });
    }
  });
  app.post('/api/simulate', (req, res) => {
    const rules = req.body?.rules || db.getRules();
    const check = checkRules(rules);
    if (check.errors.length) return res.status(400).json({ error: check.errors[0].message, check });
    const customers = db.customers();
    res.json({ forecast: simulate(rules, customers), baseline: baselineForecast(), diff: diffRules(db.getRules(), rules), check });
  });
  app.post('/api/rules/rollback', (req, res) => {
    const v = db.ruleVersion(Number(req.body?.version));
    if (!v) return res.status(404).json({ error: 'Version not found' });
    const saved = db.saveRules(v.rules, { by: req.body?.by || 'Marketing team', note: `Rolled back to v${v.version}` });
    res.json({ version: saved.version });
  });

  app.post('/api/decide/:id', async (req, res) => {
    try {
      res.json(await decide(req.params.id, { trigger: 'dashboard', useAI: req.body?.useAI !== false }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  let running = null;
  app.post('/api/launch', async (req, res) => {
    if (running) return res.status(409).json({ error: 'A campaign is already running' });
    const limit = Math.min(300, Number(req.body?.limit) || 40);
    const useAI = req.body?.useAI !== false;
    db.bus.emit('live', { kind: 'campaign', phase: 'start', limit, useAI });
    running = (async () => {
      const testers = db.customers().filter((c) => c.telegramId != null && !c.optedOut);
      const out = [];
      for (const c of testers) out.push(await decide(c.id, { trigger: 'campaign', useAI }));
      out.push(...(await runCampaign({ limit, useAI, onlySynthetic: true })));
      return out;
    })();
    try {
      const out = await running;
      const count = (s) => out.filter((d) => d.status === s).length;
      const summary = { total: out.length, sent: count('sent'), holdout: count('holdout'), blocked: count('blocked'), skipped: count('skipped') };
      db.bus.emit('live', { kind: 'campaign', phase: 'done', summary });
      res.json(summary);
    } finally {
      running = null;
    }
  });

  app.get('/api/autopilot', (req, res) => {
    const byTrigger = {};
    for (const d of db.decisions()) {
      if (!TRIGGERS[d.trigger]) continue;
      const t = (byTrigger[d.trigger] ||= { fired: 0, sent: 0, blocked: 0, holdout: 0, skipped: 0, claimed: 0, purchased: 0 });
      t.fired++;
      t[d.status] = (t[d.status] || 0) + 1;
      if (d.response === 'claimed' || d.outcome?.claimed) t.claimed++;
      if (d.outcome?.purchased) t.purchased++;
    }
    const expired = db.decisions().filter((d) => d.response === 'expired').length;
    res.json({ ...autopilotStatus(), byTrigger, expiredIgnored: expired, rules: db.getRules().triggers });
  });
  app.post('/api/autopilot/scan', async (req, res) => res.json(await scanNow()));

  app.post('/api/reset', (req, res) => {
    db.resetActivity();
    db.bus.emit('live', { kind: 'reset' });
    res.json({ ok: true });
  });

  app.get('/api/live', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (ev) => {
      // keep payloads small: strip AI conversation details
      const slim = ev.decision ? { ...ev, decision: { ...ev.decision, attempts: ev.decision.attempts?.map(({ proposal, ...a }) => ({ ...a, proposal: proposal && { type: proposal.type, category: proposal.category, discountPct: proposal.discountPct, amountInr: proposal.amountInr, points: proposal.points } })) } } : ev;
      res.write(`data: ${JSON.stringify(slim)}\n\n`);
    };
    db.bus.on('live', send);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { db.bus.off('live', send); clearInterval(ping); });
  });

  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
  } else {
    app.get('/', (req, res) => res.send('Dashboard not built yet. Run: npm run build (or npm run dashboard for dev mode).'));
  }
  return app;
}

export function startServer(port) {
  const app = createApp();
  return app.listen(port, () => console.log(`[web] dashboard + API on http://localhost:${port}`));
}
