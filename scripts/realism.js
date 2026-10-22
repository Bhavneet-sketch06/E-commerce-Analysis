// Prints statistics showing the synthetic data behaves like real e-commerce data.
import { generatePopulation } from '../src/data/generate.js';
import { computeFeatures } from '../src/features.js';
import { scoreUplift } from '../src/uplift.js';

const refDate = process.argv[2] || '2026-10-22T12:00:00Z';
const { customers } = generatePopulation({ n: 600, seed: 2026, refDate });
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const inr = (x) => `₹${Math.round(x).toLocaleString('en-IN')}`;
const tally = (arr) => arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});

const rows = customers.map((c) => {
  const f = computeFeatures(c, refDate);
  return { c, f, u: scoreUplift(f) };
});
const orders = customers.flatMap((c) => c.orders);

console.log(`\n== ${customers.length} customers, ${orders.length} orders (ref ${refDate}) ==`);
const ltv = rows.map((r) => r.f.lifetimeValue).sort((a, b) => b - a);
const total = ltv.reduce((s, x) => s + x, 0);
const top20 = ltv.slice(0, Math.round(ltv.length * 0.2)).reduce((s, x) => s + x, 0);
console.log(`Top 20% of customers = ${pct(top20 / total)} of revenue   (real platforms: ~60-80%)`);
const oc = tally(rows.map((r) => Math.min(r.f.lifetimeOrders, 10)));
console.log('Orders per customer:', Object.entries(oc).map(([k, v]) => `${k == 10 ? '10+' : k}:${v}`).join('  '));
console.log(`One-time buyers among buyers: ${pct(rows.filter((r) => r.f.lifetimeOrders === 1).length / rows.filter((r) => r.f.lifetimeOrders > 0).length)}   (real: ~40-60%)`);
console.log(`Orders with coupon: ${pct(orders.filter((o) => o.usedCoupon).length / orders.length)}   Returned: ${pct(orders.filter((o) => o.returned).length / orders.length)}   COD: ${pct(orders.filter((o) => o.payment === 'COD').length / orders.length)}`);
console.log(`Customers with an open cart: ${pct(rows.filter((r) => r.f.hasAbandonedCart).length / rows.length)}`);

console.log('\nBy category: orders | AOV | return rate');
const byCat = {};
for (const o of orders) (byCat[o.category] ||= []).push(o);
for (const [cat, os] of Object.entries(byCat)) {
  console.log(`  ${cat.padEnd(15)} ${String(os.length).padStart(5)} | ${inr(os.reduce((s, o) => s + o.valueInr, 0) / os.length).padStart(8)} | ${pct(os.filter((o) => o.returned).length / os.length)}`);
}

console.log('\nOrders by month (seasonality, last 24 months):');
const months = tally(orders.filter((o) => Date.parse(refDate) - Date.parse(o.date) < 730 * 864e5).map((o) => o.date.slice(5, 7)));
console.log(' ', Object.keys(months).sort().map((m) => `${m}:${months[m]}`).join('  '));

console.log('\nRFM segments:', Object.entries(tally(rows.map((r) => r.f.segment))).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('Quadrants:   ', Object.entries(tally(rows.map((r) => r.u.quadrant))).map(([k, v]) => `${k} ${v}`).join(' · '));

console.log('\nHidden archetype -> quadrant (sanity check):');
const arche = {};
for (const r of rows) (arche[r.c._archetype] ||= []).push(r.u.quadrant);
for (const [a, qs] of Object.entries(arche)) {
  const t = tally(qs);
  console.log(`  ${a.padEnd(15)} n=${String(qs.length).padStart(3)}  ` + ['persuadable', 'sure_thing', 'lost_cause', 'do_not_disturb'].map((q) => `${q.split('_')[0]}:${t[q] || 0}`).join('  '));
}
