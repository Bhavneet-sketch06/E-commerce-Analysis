import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generatePopulation } from '../src/data/generate.js';
import { computeFeatures } from '../src/features.js';
import { scoreUplift } from '../src/uplift.js';
import { trueOutcome, modelCheck, TRUE_RESPONSE } from '../src/world.js';

const REF = '2026-10-26T06:30:00Z';
const { customers } = generatePopulation({ n: 600, seed: 2026, refDate: REF });
const rows = customers.map((c) => { const f = computeFeatures(c, REF); return { customer: c, f, quadrant: scoreUplift(f).quadrant }; });

describe('ground truth', () => {
  it('only the simulated world (and the generator) may read the hidden archetype', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith('.js') && fs.readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '').includes('_archetype')) offenders.push(p.split(path.sep).join('/'));
      }
    };
    walk('src');
    const allowed = ['src/world.js', 'src/data/generate.js', 'src/web/server.js'];
    expect(offenders.filter((p) => !allowed.includes(p))).toEqual([]);
    // the server only strips it from API responses
    expect(fs.readFileSync('src/web/server.js', 'utf8').match(/_archetype/g).length).toBe(1);
  });

  it('is deterministic per decision', () => {
    const { customer, f } = rows[3];
    const rec = { customerId: customer.id, at: REF, status: 'sent', offer: { type: 'percent_off', category: f.topCategory, discountPct: 15 }, coupon: 'PB-X' };
    expect(trueOutcome(customer, f, rec)).toEqual(trueOutcome(customer, f, rec));
  });

  it('real offers change behaviour as the truth says: bargain hunters respond, serial returners do not', () => {
    const rate = (arch, treated) => {
      const g = rows.filter((r) => r.customer._archetype === arch);
      let buys = 0;
      for (let k = 0; k < 20; k++) for (const { customer, f } of g) {
        const rec = { customerId: customer.id, at: `2026-10-${10 + k}T06:30:00Z`, status: treated ? 'sent' : 'holdout', offer: { type: 'percent_off', category: f.topCategory, discountPct: 15 } };
        if (trueOutcome(customer, f, rec).purchased) buys++;
      }
      return buys / (g.length * 20);
    };
    expect(rate('bargain_hunter', true) - rate('bargain_hunter', false)).toBeGreaterThan(0.15);
    expect(rate('serial_returner', true)).toBeLessThanOrEqual(rate('serial_returner', false) + 0.01);
  });

  it('the engine, without seeing the truth, puts the most responsive people in Persuadable', () => {
    const check = modelCheck(rows);
    expect(check.persuadable.trueDiscountLift).toBeGreaterThan(check.sure_thing.trueDiscountLift + 5);
    expect(check.persuadable.trueDiscountLift).toBeGreaterThan(check.lost_cause.trueDiscountLift);
    expect(check.sure_thing.trueBuyAnyway).toBeGreaterThan(3 * check.persuadable.trueBuyAnyway);
    expect(Object.keys(TRUE_RESPONSE)).toHaveLength(9);
  });
});
