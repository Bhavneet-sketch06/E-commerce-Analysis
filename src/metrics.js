// Dashboard numbers, computed from the decision log.
import * as db from './db.js';
import { budgetLeft } from './rules/eligibility.js';
import { QUADRANTS } from './uplift.js';

const rate = (num, den) => (den ? num / den : 0);
const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

function compare(treated, control) {
  const tBuy = treated.filter((d) => d.outcome?.purchased).length;
  const cBuy = control.filter((d) => d.outcome?.purchased).length;
  const convT = rate(tBuy, treated.length);
  const convC = rate(cBuy, control.length);
  const aov = rate(sum(treated.filter((d) => d.outcome?.purchased), (d) => d.outcome.orderValueInr), tBuy) || 1500;
  const discountCost = sum(treated, (d) => d.outcome?.discountCostInr);
  const incrementalOrders = (convT - convC) * treated.length;
  const incrementalRevenue = incrementalOrders * aov;
  // Profit view: margin on incremental orders minus all discounts given (including to people who'd have bought anyway)
  const marginRate = rate(sum(treated, (d) => (d.outcome?.grossProfitInr || 0) + (d.outcome?.discountCostInr || 0)), sum(treated, (d) => d.outcome?.orderValueInr)) || 0.3;
  const incrementalProfit = incrementalRevenue * marginRate - discountCost;
  return {
    treated: treated.length, control: control.length, convTreated: convT, convControl: convC,
    upliftPts: (convT - convC) * 100, incrementalOrders, incrementalRevenue: Math.round(incrementalRevenue),
    discountCost, incrementalProfit: Math.round(incrementalProfit), roi: discountCost ? incrementalProfit / discountCost : null,
  };
}

export function overview(now = new Date()) {
  const rules = db.getRules();
  const all = db.decisions();
  const sent = all.filter((d) => d.status === 'sent');
  const holdout = all.filter((d) => d.status === 'holdout');
  const evs = db.events();
  const count = (t) => evs.filter((e) => e.type === t).length;

  const aiAttempts = all.flatMap((d) => (d.attempts || []).filter((a) => a.source !== 'fallback'));
  const guard = {
    aiProposals: aiAttempts.length,
    aiRejected: aiAttempts.filter((a) => !a.ok && a.violations?.length).length,
    aiErrors: aiAttempts.filter((a) => a.error).length,
    correctedByAI: sent.filter((d) => d.source === 'ai_revised').length,
    fallbackUsed: sent.filter((d) => d.source === 'fallback').length,
    sentByAI: sent.filter((d) => d.source === 'ai' || d.source === 'ai_revised').length,
    sentOutsideRules: 0, // every send passes validate(); kept explicit for the dashboard
  };
  const violationCounts = {};
  for (const a of aiAttempts) for (const v of a.violations || []) violationCounts[v.code] = (violationCounts[v.code] || 0) + 1;

  const state = db.campaignState(now);
  const budget = budgetLeft(rules, state, now);

  const withOutcome = (arr) => arr.filter((d) => d.outcome);
  const byQuadrant = Object.keys(QUADRANTS).map((q) => ({
    quadrant: q, label: QUADRANTS[q].label, color: QUADRANTS[q].color,
    ...compare(withOutcome(sent.filter((d) => d.quadrant === q)), withOutcome(holdout.filter((d) => d.quadrant === q && d.offer))),
  }));

  // Hourly timeline of the last 48 hours
  const buckets = {};
  for (const d of all) {
    const h = d.at.slice(0, 13);
    buckets[h] ||= { hour: h, sent: 0, blocked: 0, holdout: 0, claimed: 0 };
    if (d.status === 'sent') buckets[h].sent++;
    else if (d.status === 'holdout') buckets[h].holdout++;
    else buckets[h].blocked++;
    if (d.outcome?.claimed || d.response === 'claimed') buckets[h].claimed++;
  }

  const offerMix = {};
  for (const d of sent) offerMix[d.offer.type] = (offerMix[d.offer.type] || 0) + 1;

  const telegramUsers = db.customers().filter((c) => c.telegramId != null);
  return {
    campaign: rules.campaign,
    counts: {
      decisions: all.length, sent: sent.length, holdout: holdout.length,
      blocked: all.filter((d) => d.status === 'blocked').length, skipped: all.filter((d) => d.status === 'skipped').length,
      delivered: count('delivered'), claimed: count('claimed') + sent.filter((d) => d.outcome?.simulated && d.outcome.claimed).length,
      redeemed: count('redeemed'), dismissed: count('dismissed'), why: count('why'),
      telegramUsers: telegramUsers.length, optedOut: telegramUsers.filter((c) => c.optedOut).length,
    },
    results: compare(withOutcome(sent), withOutcome(holdout.filter((d) => d.offer))),
    byQuadrant,
    budget: { total: rules.campaign.budgetInr, committed: state.committedInr, committedToday: state.committedTodayInr, leftToday: Math.max(0, Math.round(budget.today)), dailyCap: Math.round(budget.dailyCap || budget.overall), spentOnRedemptions: sum(sent, (d) => d.outcome?.discountCostInr) },
    guard, violationCounts, offerMix,
    timeline: Object.values(buckets).sort((a, b) => a.hour.localeCompare(b.hour)).slice(-48),
    ruleVersion: db.ruleVersions().at(-1),
  };
}
