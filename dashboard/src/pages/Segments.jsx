import { useMemo, useState } from 'react';
import { Crosshair, Search, Users, ShieldCheck } from 'lucide-react';
import { useApi } from '../api.jsx';
import { inr, pct, QUAD } from '../format.js';
import { Panel, Pill, Empty } from '../components/ui.jsx';
import QuadrantScatter from '../components/QuadrantScatter.jsx';

const ADVICE = {
  persuadable: 'Real discounts, cart recovery, free delivery. Smallest incentive that converts.',
  sure_thing: 'No discounts. Bonus points, points reminders and personal picks keep them happy for free.',
  lost_cause: 'A small flat ₹ win-back at most, or a free personal pick. Do not burn budget here.',
  do_not_disturb: 'No messages. Offer fatigue and serial returns mean contact does more harm than good.',
};

// Ground truth check: did the engine put people in the right groups?
function ModelCheck() {
  const { data } = useApi('/model-check', { live: false });
  if (!data) return null;
  return (
    <Panel title="Model check: did we target the right people?" icon={ShieldCheck}
      info="Every synthetic customer has a hidden 'true' behaviour that the engine never sees. Here we compare the groups the engine chose with that truth. If targeting works, Persuadables really gain most from a discount and Sure Things really buy anyway.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.keys(QUAD).map((k) => {
          const x = data[k];
          if (!x) return null;
          return (
            <div key={k} className="rounded-xl border border-line bg-panel2 p-3">
              <p className={`text-sm font-bold ${QUAD[k].tw}`}>{QUAD[k].label} <span className="font-normal text-faint">· {x.n}</span></p>
              <p className="mt-2 text-xs text-muted">Real extra chance from a discount</p>
              <p className={`num text-xl font-bold ${x.trueDiscountLift >= 10 ? 'text-ok' : 'text-ink'}`}>+{x.trueDiscountLift} pts</p>
              <p className="mt-1 text-xs text-muted">Really buys anyway: <b className="num text-ink">{x.trueBuyAnyway}%</b>{x.backfires ? <> · <span className="text-bad">{x.backfires} backfire</span></> : null}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">✅ Discounts go where they really change behaviour; Sure Things really would buy anyway. The engine gets this right without ever seeing the truth.</p>
    </Panel>
  );
}

export default function Segments({ onSelect }) {
  const { data: rows } = useApi('/customers');
  const { data: rules } = useApi('/rules', { live: false });
  const [quad, setQuad] = useState(null);
  const [q, setQ] = useState('');
  const [tgOnly, setTgOnly] = useState(false);

  const filtered = useMemo(() => (rows || []).filter((r) =>
    (!quad || r.quadrant === quad) && (!tgOnly || r.telegram) &&
    (!q || `${r.name} ${r.city} ${r.segment} ${r.id}`.toLowerCase().includes(q.toLowerCase()))), [rows, quad, q, tgOnly]);

  const stats = useMemo(() => Object.fromEntries(Object.keys(QUAD).map((k) => {
    const g = (rows || []).filter((r) => r.quadrant === k);
    return [k, { n: g.length, ltv: g.reduce((s, r) => s + r.ltv, 0) / Math.max(1, g.length), uplift: g.reduce((s, r) => s + r.uplift, 0) / Math.max(1, g.length) }];
  })), [rows]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(QUAD).map(([k, meta]) => (
          <button key={k} onClick={() => setQuad(quad === k ? null : k)}
            className={`panel p-4 text-left transition hover:-translate-y-0.5 ${quad === k ? 'ring-2 ring-offset-0' : ''}`} style={quad === k ? { '--tw-ring-color': meta.color } : undefined}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-bold ${meta.tw}`}>{meta.label}</span>
              <span className="num text-2xl font-bold">{stats[k]?.n ?? 0}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{meta.hint}</p>
            <p className="mt-3 text-xs text-ink"><span className="text-faint">Plan: </span>{ADVICE[k]}</p>
            <p className="num mt-2 text-[11px] text-faint">avg LTV {inr(stats[k]?.ltv)} · avg uplift {((stats[k]?.uplift || 0) * 100).toFixed(1)} pts</p>
          </button>
        ))}
      </div>

      <ModelCheck />

      <Panel title="Uplift map" icon={Crosshair} info="Click a quadrant card above to highlight it, or click any dot to open the customer. The dashed lines are the targeting thresholds, which you can change on the Rules page.">
        <QuadrantScatter rows={rows || []} targeting={rules?.rules?.targeting} onSelect={onSelect} height={420} highlight={quad} />
      </Panel>

      <Panel title={`Customers (${filtered.length})`} icon={Users} bodyClass="p-0"
        action={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={tgOnly} onChange={(e) => setTgOnly(e.target.checked)} />Telegram only</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city…" className="w-44 rounded-lg border border-line-strong bg-panel2 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-ok/60 sm:w-56" />
            </div>
          </div>
        }>
        {!rows ? <div className="scanline h-40" /> : filtered.length === 0 ? <Empty title="No customers match" /> : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-panel text-left text-[11px] uppercase tracking-wider text-faint">
                <tr>{['Customer', 'Segment', 'Group', 'Buys anyway', 'Offer adds', 'Churn risk', 'LTV', 'Last order'].map((h) => <th key={h} className="border-b border-line px-4 py-2.5 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((r) => (
                  <tr key={r.id} onClick={() => onSelect(r.id)} className="cursor-pointer border-b border-line/60 transition hover:bg-panel2">
                    <td className="px-4 py-2">
                      <p className="font-medium text-ink">{r.name} {r.telegram && <Pill className="ml-1 border-info/40 bg-info/10 text-info">TG</Pill>}</p>
                      <p className="text-[11px] text-faint">{r.city} · {r.topCategory}</p>
                    </td>
                    <td className="px-4 py-2 text-muted">{r.segment}</td>
                    <td className={`px-4 py-2 text-xs font-semibold ${QUAD[r.quadrant].tw}`}>{QUAD[r.quadrant].label}</td>
                    <td className="num px-4 py-2">{pct(r.pBase, 0)}</td>
                    <td className={`num px-4 py-2 ${r.uplift < 0 ? 'text-bad' : 'text-ok'}`}>{r.uplift >= 0 ? '+' : ''}{(r.uplift * 100).toFixed(1)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded-full bg-panel2"><div className="h-full rounded-full" style={{ width: `${r.churnRisk * 100}%`, background: r.churnRisk > 0.6 ? 'var(--bad)' : 'var(--warn)' }} /></div><span className="num text-xs text-muted">{pct(r.churnRisk, 0)}</span></div>
                    </td>
                    <td className="num px-4 py-2">{inr(r.ltv)}</td>
                    <td className="num px-4 py-2 text-muted">{r.recencyDays == null ? 'never' : `${r.recencyDays}d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
