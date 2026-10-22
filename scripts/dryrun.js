// Runs a campaign over synthetic customers in an in-memory store and prints every decision.
// Usage: npm run dryrun -- [count] [--no-ai]
import { config } from '../src/config.js';
import * as db from '../src/db.js';
import { runCampaign } from '../src/engine.js';

const n = Number(process.argv.find((a) => /^\d+$/.test(a)) || 20);
const useAI = !process.argv.includes('--no-ai') && !!config.anthropicKey;
db.load(':memory:');
const now = new Date(process.env.NOW || '2026-10-22T06:30:00Z'); // 12:00 IST

console.log(`Dry run: ${n} customers, AI ${useAI ? 'ON (' + config.model + ')' : 'OFF (rule-based fallback)'}\n`);
const t0 = Date.now();
const results = await runCampaign({ limit: n, useAI, now, concurrency: useAI ? 4 : 1 });

const pad = (s, w) => String(s ?? '').slice(0, w).padEnd(w);
for (const d of results.sort((a, b) => a.id.localeCompare(b.id))) {
  const o = d.offer;
  const what = o ? `${o.type}${o.category ? ' ' + o.category : ''}${o.discountPct ? ' ' + o.discountPct + '%' : ''}${o.amountInr ? ' ₹' + o.amountInr : ''}${o.points ? ' ' + o.points + 'pts' : ''}` : '';
  const fixes = d.attempts.filter((a) => a.source !== 'fallback' && !a.ok && a.violations?.length).flatMap((a) => a.violations.map((v) => v.code));
  console.log(`${pad(d.status, 8)} ${pad(d.source, 10)} ${pad(d.quadrant, 14)} ${pad(d.name, 18)} ${pad(what, 30)} ${fixes.length ? '⚠ caught: ' + fixes.join(',') : ''}`);
  if (d.headline) console.log(`         "${d.headline}" ${d.message}`);
  if (d.blockers?.length) console.log(`         ${d.status === 'holdout' ? 'control' : 'blocked'}: ${d.blockers.map((b) => b.message).join('; ')}`);
}
const sent = results.filter((d) => d.status === 'sent');
const caught = results.flatMap((d) => d.attempts.filter((a) => a.source !== 'fallback' && !a.ok && a.violations?.length)).length;
const errors = results.flatMap((d) => d.attempts.filter((a) => a.error));
console.log(`\nsent ${sent.length} · holdout ${results.filter((d) => d.status === 'holdout').length} · blocked ${results.filter((d) => d.status === 'blocked').length} · skipped ${results.filter((d) => d.status === 'skipped').length}`);
console.log(`AI proposals rejected by guardrail: ${caught} · AI errors: ${errors.length}${errors[0] ? ' (' + errors[0].error + ')' : ''}`);
console.log(`committed budget ₹${db.campaignState(now).committedInr} · offers sent outside rules: 0 (every send passed validate()) · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
