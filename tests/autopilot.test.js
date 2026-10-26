import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../src/db.js';
import { scanNow, expireOffers } from '../src/scheduler.js';
import { TRIGGERS } from '../src/triggers.js';

// In-memory store, no AI (no testers; synthetic customers always use the rule engine), no quiet hours.
beforeAll(() => {
  db.load(':memory:', { populationSize: 300 });
  const r = db.getRules();
  r.contact.quietHoursStart = 0;
  r.contact.quietHoursEnd = 0;
  r.campaign.startDate = '2020-01-01';
  r.campaign.endDate = '2099-12-31';
  r.triggers.syntheticPerScan = 15;
  r.triggers.aiSyntheticPerScan = 0; // never call the real API from tests
  db.saveRules(r, { by: 'test' });
});

describe('autopilot', () => {
  it('scans, fires due triggers and records why each decision happened', async () => {
    const result = await scanNow();
    const fired = Object.values(result.fired).reduce((s, n) => s + n, 0);
    expect(fired).toBeGreaterThan(0);
    const triggered = db.decisions().filter((d) => TRIGGERS[d.trigger]);
    expect(triggered.length).toBe(fired);
    for (const d of triggered) expect(d.triggerReason).toBeTruthy();
    // never fires the same trigger twice for the same customer in one go
    const again = await scanNow();
    const ids = db.decisions().filter((d) => TRIGGERS[d.trigger]).map((d) => `${d.customerId}:${d.trigger}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(again.error).toBeUndefined();
  });

  it('counts an offer that expired without any answer as ignored', () => {
    const sent = db.decisions().find((d) => d.status === 'sent' && !d.outcome?.purchased);
    expect(sent).toBeTruthy();
    const c = db.getCustomer(sent.customerId);
    const before = c.offerHistory?.ignoredStreak || 0;
    const later = new Date(Date.parse(sent.expiresAt) + 60_000);
    expireOffers(later);
    expect(db.getDecision(sent.id).response).toBe('expired');
    expect(db.getCustomer(sent.customerId).offerHistory.ignoredStreak).toBe(before + 1);
    expireOffers(later); // processed only once
    expect(db.getCustomer(sent.customerId).offerHistory.ignoredStreak).toBe(before + 1);
  });
});
