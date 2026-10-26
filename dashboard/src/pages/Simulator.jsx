import { useEffect, useRef, useState } from 'react';
import { FlaskConical, SlidersHorizontal, Save, RotateCcw, Loader2, Lightbulb, BarChart3, Ban } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { api, useApi } from '../api.jsx';
import { inr, inrShort, OFFER_LABEL, QUAD } from '../format.js';
import { AnimatedNumber, Button, Panel, Toggle, Info } from '../components/ui.jsx';
import { setIn, Slider } from '../components/fields.jsx';

const BLOCK_LABEL = {
  fatigue: 'Paused (ignored too many offers)', quadrant_blocked: 'Group not allowed any offer', high_returns: 'Too many returns',
  budget_exhausted: 'Budget ran out', control_group: 'Control group', no_option: 'No suitable offer', campaign_inactive: 'Campaign not running',
  frequency_cap: 'Weekly cap', cooldown: 'Cooldown', opted_out: 'Opted out', new_account: 'Account too new',
  recent_purchase: 'Just bought (no offers for a while)', quiet_hours: 'Quiet hours',
};

function Metric({ label, value, base, format, highlight, lowerBetter, info }) {
  const d = value - base;
  const good = lowerBetter ? d < 0 : d > 0;
  return (
    <div className={`panel p-4 ${highlight ? 'glow-ok' : ''}`}>
      <p className="label flex items-center gap-1.5">{label}{info && <Info text={info} />}</p>
      <AnimatedNumber value={value} format={format} className={`mt-2 block font-bold ${highlight ? 'text-3xl text-ok' : 'text-2xl'} ${value < 0 ? '!text-bad' : ''}`} />
      <p className={`num mt-1 text-xs ${Math.abs(d) < 0.5 ? 'text-faint' : good ? 'text-ok' : 'text-bad'}`}>
        {Math.abs(d) < 0.5 ? 'same as current rules' : `${d > 0 ? '▲' : '▼'} ${format(Math.abs(d))} vs current`}
      </p>
    </div>
  );
}

export default function Simulator({ meta }) {
  const { data: current } = useApi('/rules', { live: false });
  const [rules, setRules] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const seq = useRef(0);

  useEffect(() => { if (current && !rules) setRules(structuredClone(current.rules)); }, [current]);
  useEffect(() => {
    if (!rules) return;
    const id = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      api('/simulate', { method: 'POST', body: { rules } })
        .then((r) => { if (id === seq.current) { setRes(r); setError(null); } })
        .catch((e) => id === seq.current && setError(e.message))
        .finally(() => id === seq.current && setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [rules]);

  if (!rules) return <div className="panel scanline h-60" />;
  const set = (path) => (v) => { setSaved(null); setRules((r) => setIn(r, path, v)); };
  const q = rules.targeting.quadrants;
  const sureDiscounts = q.sure_thing.allowedOffers.includes('percent_off');
  const toggleSureDiscounts = (on) => setRules((r) => {
    let n = setIn(r, 'targeting.quadrants.sure_thing.allowedOffers', on ? [...new Set([...r.targeting.quadrants.sure_thing.allowedOffers, 'percent_off'])] : r.targeting.quadrants.sure_thing.allowedOffers.filter((x) => x !== 'percent_off'));
    n = setIn(n, 'targeting.quadrants.sure_thing.maxDiscountPct', on ? 20 : 0);
    return n;
  });
  const dndOn = q.do_not_disturb.allowedOffers.length > 0;
  const toggleDnd = (on) => set('targeting.quadrants.do_not_disturb.allowedOffers')(on ? ['nudge', 'flat_off'] : []);
  const lostOn = q.lost_cause.allowedOffers.length > 0;
  const toggleLost = (on) => set('targeting.quadrants.lost_cause.allowedOffers')(on ? ['flat_off', 'points_reminder', 'nudge'] : []);

  const f = res?.forecast;
  const b = res?.baseline;
  const quadData = f ? Object.keys(QUAD).map((k) => ({
    name: QUAD[k].label,
    'Discount spend': f.byQuadrant[k]?.cost || 0,
    'Extra revenue': f.byQuadrant[k]?.incRevenue || 0,
  })) : [];
  const insight = f && b && (
    f.wastedOnSureThings > b.wastedOnSureThings + 500 ? `You'd hand ${inr(f.wastedOnSureThings - b.wastedOnSureThings)} more in discounts to people who'd buy anyway.`
      : f.expectedProfit > b.expectedProfit + 200 ? `This setup earns about ${inr(f.expectedProfit - b.expectedProfit)} more profit per wave than the current rules.`
      : f.expectedProfit < b.expectedProfit - 200 ? `This setup loses about ${inr(b.expectedProfit - f.expectedProfit)} of profit per wave compared with the current rules.`
      : 'Move the sliders. The forecast updates instantly using the full customer base.'
  );

  const save = async () => {
    try { const out = await api('/rules', { method: 'PUT', body: { rules, note: 'From the what-if simulator', by: 'Marketing (simulator)' } }); setSaved(out.version); }
    catch (e) { setError(e.data?.check?.errors?.[0]?.message || e.message); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Panel className="xl:col-span-4" title="Try a strategy" icon={SlidersHorizontal} info="Nothing here is saved until you press 'Save as new rules'. The forecast uses the rule engine over every customer (no AI calls, no messages sent)."
        action={<button onClick={() => { setRules(structuredClone(current.rules)); setSaved(null); }} className="flex items-center gap-1 text-xs text-muted hover:text-ink"><RotateCcw size={12} />Reset</button>}>
        <div className="space-y-5">
          <Slider label="Campaign budget" value={rules.campaign.budgetInr} onChange={set('campaign.budgetInr')} min={10000} max={300000} step={5000} format={inrShort} />
          <Slider label="Control group" value={rules.campaign.controlGroupPct} onChange={set('campaign.controlGroupPct')} min={0} max={30} format={(v) => `${v}%`} />
          <Slider label="Max discount for Persuadables" value={q.persuadable.maxDiscountPct} onChange={set('targeting.quadrants.persuadable.maxDiscountPct')} min={5} max={50} format={(v) => `${v}%`} />
          <Slider label="Persuadable threshold (offer adds at least)" value={Math.round(rules.targeting.persuadableMinUplift * 100)} onChange={(v) => set('targeting.persuadableMinUplift')(v / 100)} min={1} max={20} format={(v) => `${v} pts`} />
          <Slider label="Minimum margin kept" value={rules.margin.minMarginAfterDiscountPct} onChange={set('margin.minMarginAfterDiscountPct')} min={0} max={20} format={(v) => `${v}%`} />
          <Slider label="Pause after ignored offers" value={rules.contact.pauseAfterIgnored} onChange={set('contact.pauseAfterIgnored')} min={1} max={10} />

          <div className="space-y-2.5 rounded-xl border border-line bg-panel2/50 p-3">
            {[
              ['Give Sure Things discounts too', sureDiscounts, toggleSureDiscounts, 'text-info'],
              ['Win-back offers for Lost Causes', lostOn, toggleLost, 'text-idle'],
              ['Contact Do-Not-Disturb customers', dndOn, toggleDnd, 'text-bad'],
            ].map(([label, on, fn, tw]) => (
              <div key={label} className="flex items-center justify-between gap-3 text-sm"><span className={tw}>{label}</span><Toggle checked={on} onChange={fn} label={label} /></div>
            ))}
          </div>

          <details className="group rounded-xl border border-line bg-panel2/50 p-3">
            <summary className="cursor-pointer text-sm text-muted">Category discount caps</summary>
            <div className="mt-3 space-y-3">
              {Object.keys(rules.categories).map((c) => (
                <Slider key={c} label={`${meta?.categories?.[c]?.emoji || ''} ${c} (margin ${meta?.categories?.[c]?.marginPct ?? '?'}%)`} value={rules.categories[c].maxDiscountPct} onChange={set(`categories.${c}.maxDiscountPct`)} min={0} max={50} format={(v) => `${v}%`} />
              ))}
            </div>
          </details>

          {error && <p className="text-sm text-bad">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={save} disabled={!res?.diff?.length}><Save size={14} /> Save as new rules</Button>
            {saved && <span className="text-sm text-ok">Saved as v{saved} ✓</span>}
          </div>
          {res?.diff?.length > 0 && <ul className="space-y-0.5 text-xs text-muted">{res.diff.slice(0, 6).map((d) => <li key={d.path}>• {d.text}</li>)}</ul>}
        </div>
      </Panel>

      <div className="space-y-4 xl:col-span-8">
        <div className={`panel flex items-start gap-3 p-4 ${busy ? 'scanline' : ''}`}>
          <Lightbulb size={18} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-sm text-ink">{insight || 'Calculating forecast…'}</p>
          {busy && <Loader2 size={16} className="ml-auto shrink-0 animate-spin text-muted" />}
        </div>
        {f && b && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Metric label="Expected profit" value={f.expectedProfit} base={b.expectedProfit} format={inr} highlight info="Extra margin from purchases the offers caused, minus every discount paid (including to people who'd have bought anyway)." />
              <Metric label="Extra revenue" value={f.expectedIncrementalRevenue} base={b.expectedIncrementalRevenue} format={inr} info="Revenue from purchases that happen only because of the offer." />
              <Metric label="Discount spend" value={f.expectedDiscountCost} base={b.expectedDiscountCost} format={inr} lowerBetter info="Expected cost of discounts actually redeemed." />
              <Metric label="Offers sent" value={f.sent} base={b.sent} format={(v) => Math.round(v).toLocaleString('en-IN')} />
              <Metric label="Budget committed" value={f.budgetCommitted} base={b.budgetCommitted} format={inr} lowerBetter info="Worst case: if every offer was redeemed." />
              <Metric label="Wasted on Sure Things" value={f.wastedOnSureThings} base={b.wastedOnSureThings} format={inr} lowerBetter info="Rewards given to customers who would have bought anyway." />
            </div>
            <Panel title="Where the money goes, by customer group" icon={BarChart3} info="Discount spend vs extra revenue the offers create. Healthy: Persuadables bring far more revenue than they cost.">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={quadData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="var(--faint)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--faint)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={inrShort} />
                    <Tooltip cursor={{ fill: 'var(--panel-2)' }} formatter={(v) => inr(v)} contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--line-strong)', borderRadius: 10, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Discount spend" fill="var(--bad)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Extra revenue" fill="var(--ok)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="Offer mix" icon={FlaskConical}>
                <ul className="space-y-2">
                  {Object.entries(f.byOffer).sort((x, y) => y[1] - x[1]).map(([k, v]) => (
                    <li key={k} className="text-xs">
                      <div className="mb-1 flex justify-between"><span>{OFFER_LABEL[k]}</span><b className="num">{v}</b></div>
                      <div className="h-1.5 rounded-full bg-panel2"><div className="h-full rounded-full bg-ai" style={{ width: `${(v / Math.max(1, f.sent)) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Who doesn't get an offer, and why" icon={Ban}>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between"><span className="text-info">Control group</span><b className="num">{f.holdout}</b></li>
                  {Object.entries(f.blocked).sort((x, y) => y[1] - x[1]).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-muted">{BLOCK_LABEL[k] || k}</span><b className="num">{v}</b></li>)}
                </ul>
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
