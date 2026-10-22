import { describe, it, expect } from 'vitest';
import { generatePopulation, generateForTelegramUser } from '../src/data/generate.js';
import { computeFeatures } from '../src/features.js';
import { scoreUplift } from '../src/uplift.js';

const REF = '2026-10-22T12:00:00Z';
const { customers } = generatePopulation({ n: 600, seed: 2026, refDate: REF });
const rows = customers.map((c) => {
  const f = computeFeatures(c, REF);
  return { c, f, u: scoreUplift(f) };
});

describe('synthetic data behaves like real customers', () => {
  it('is deterministic for a seed', () => {
    const again = generatePopulation({ n: 600, seed: 2026, refDate: REF }).customers;
    expect(again[123]).toEqual(customers[123]);
  });
  it('has a long tail: top 20% bring 60-85% of revenue', () => {
    const ltv = rows.map((r) => r.f.lifetimeValue).sort((a, b) => b - a);
    const share = ltv.slice(0, 120).reduce((s, x) => s + x, 0) / ltv.reduce((s, x) => s + x, 0);
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.85);
  });
  it('has festive seasonality (Oct-Nov busier than Jun)', () => {
    const orders = customers.flatMap((c) => c.orders);
    const m = (mm) => orders.filter((o) => o.date.slice(5, 7) === mm).length;
    expect(m('10') + m('11')).toBeGreaterThan(1.4 * 2 * m('06'));
  });
  it('fashion is returned more than grocery', () => {
    const orders = customers.flatMap((c) => c.orders);
    const rate = (cat) => { const os = orders.filter((o) => o.category === cat); return os.filter((o) => o.returned).length / os.length; };
    expect(rate('Fashion')).toBeGreaterThan(3 * rate('Grocery'));
  });
  it('quadrants are all present and sensible', () => {
    const q = (name) => rows.filter((r) => r.u.quadrant === name).length / rows.length;
    for (const name of ['persuadable', 'sure_thing', 'lost_cause', 'do_not_disturb']) expect(q(name)).toBeGreaterThan(0.02);
    expect(q('persuadable')).toBeLessThan(0.6);
    const vips = rows.filter((r) => r.c._archetype === 'vip');
    expect(vips.filter((r) => r.u.quadrant === 'sure_thing').length / vips.length).toBeGreaterThan(0.7);
  });
  it('builds a stable profile for a Telegram user from their answers', () => {
    const a = generateForTelegramUser({ telegramId: 42, firstName: 'Simran', city: 'Ludhiana', preferredCategory: 'Beauty', frequency: 'sales', language: 'pa' }, REF);
    const b = generateForTelegramUser({ telegramId: 42, firstName: 'Simran', city: 'Ludhiana', preferredCategory: 'Beauty', frequency: 'sales', language: 'pa' }, REF);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ id: 'T42', city: 'Ludhiana', preferredCategory: 'Beauty', language: 'pa', telegramId: 42 });
  });
});
