import { Send, TrendingUp, Target, Fuel, Radio, ShieldCheck, Crosshair, Filter, PieChart as PieIcon, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { useApi } from '../api.jsx';
import { inr, inrShort, pct, OFFER_LABEL, QUAD } from '../format.js';
import { AnimatedNumber, Empty, Gauge, Info, Panel } from '../components/ui.jsx';
import QuadrantScatter from '../components/QuadrantScatter.jsx';
import LiveFeed from '../components/LiveFeed.jsx';

const ACCENT = {
  ok: 'border-ok/40 bg-ok/10 text-ok', info: 'border-info/40 bg-info/10 text-info',
  ai: 'border-ai/40 bg-ai/10 text-ai', warn: 'border-warn/40 bg-warn/10 text-warn',
};

function Kpi({ icon: Icon, label, info, children, footer, accent = 'ok', spark }) {
  return (
    <div className={`panel relative overflow-hidden p-5 ${accent === 'ok' ? 'glow-ok' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`rounded-lg border p-1.5 ${ACCENT[accent]}`}><Icon size={14} /></span>
        <span className="label">{label}</span>
        {info && <Info text={info} />}
      </div>
      <div className="mt-3">{children}</div>
      {footer && <p className="mt-1.5 text-xs text-muted">{footer}</p>}
      {spark && spark.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 opacity-60">
          <ResponsiveContainer>
            <AreaChart data={spark} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs><linearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ok)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--ok)" stopOpacity={0} /></linearGradient></defs>
              <Area type="monotone" dataKey="sent" stroke="var(--ok)" strokeWidth={1.5} fill="url(#sp)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Funnel({ steps }) {
  const max = Math.max(1, steps[0].value);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted">{s.label} {s.info && <Info text={s.info} />}</span>
            <span><b className="num text-sm text-ink">{s.value}</b>{i > 0 && <span className="num ml-2 text-faint">{pct(s.value / Math.max(1, steps[i - 1].value), 0)}</span>}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-panel2">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(s.value / max) * 100}%`, background: s.color, boxShadow: `0 0 12px ${s.color}` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const MIX_COLORS = ['var(--ok)', 'var(--info)', 'var(--ai)', 'var(--warn)', 'var(--bad)', 'var(--idle)', '#f472b6'];

export default function Overview({ onSelect, go }) {
  const { data: o } = useApi('/overview');
  const { data: customers } = useApi('/customers');
  const { data: rules } = useApi('/rules');
  if (!o) return <div className="panel scanline h-40" />;
  const r = o.results;
  const hasResults = r.treated > 0;
  const mix = Object.entries(o.offerMix).map(([k, v]) => ({ name: OFFER_LABEL[k] || k, value: v }));
  const quadCounts = Object.fromEntries(Object.keys(QUAD).map((q) => [q, customers?.filter((c) => c.quadrant === q).length ?? 0]));

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-12 xl:grid-cols-4">
        <Kpi icon={Send} label="Offers sent" spark={o.timeline}
          info="Offers that passed every rule and were delivered (Telegram) or simulated (synthetic customers)."
          footer={<>{o.counts.decisions} decisions · {o.counts.blocked} blocked by rules · {o.counts.holdout} in control</>}>
          <AnimatedNumber value={o.counts.sent} className="text-4xl font-bold" />
        </Kpi>
        <Kpi icon={Target} label="Conversion" accent="info"
          info="Share who bought within 14 days. 'With offer' = customers we sent an offer to. 'Control' = similar customers we deliberately held back.">
          <div className="flex items-end gap-3">
            <AnimatedNumber value={r.convTreated * 100} format={(v) => `${v.toFixed(1)}%`} className="text-4xl font-bold" />
            <span className="pb-1 text-sm text-muted">vs <b className="num text-ink">{pct(r.convControl)}</b> control</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {[['With offer', r.convTreated, 'var(--ok)'], ['Control', r.convControl, 'var(--info)']].map(([k, v, c]) => (
              <div key={k} className="flex items-center gap-2 text-[11px] text-muted">
                <span className="w-16">{k}</span>
                <div className="h-1.5 flex-1 rounded-full bg-panel2"><div className="h-full rounded-full" style={{ width: `${Math.min(100, v * 250)}%`, background: c }} /></div>
              </div>
            ))}
          </div>
        </Kpi>
        <Kpi icon={TrendingUp} label="Uplift vs control" accent="ai"
          info="The difference in conversion between customers who got an offer and the control group. This is the real effect of the offers, not just sales that would have happened anyway."
          footer={hasResults ? (r.control < 30
            ? <span className="text-warn">Early data: only {r.control} in the control group. Launch more to firm this up.</span>
            : <>≈ {inr(r.incrementalRevenue)} extra revenue · ROI <b className="text-ink">{r.roi == null ? '–' : `${r.roi.toFixed(1)}×`}</b></>) : 'Launch a campaign to measure'}>
          <AnimatedNumber value={r.upliftPts} format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`} className={`text-4xl font-bold ${r.upliftPts >= 0 ? 'text-ok' : 'text-bad'}`} />
          <span className="ml-1 text-sm text-muted">pts</span>
        </Kpi>
        <Kpi icon={Fuel} label="Budget" accent="warn" info="Committed = estimated cost of every offer sent. Daily pacing stops the engine from spending the whole budget on day one.">
          <div className="flex items-center gap-4">
            <div className="w-32 shrink-0"><Gauge value={o.budget.committed} max={o.budget.total} today={o.budget.committedToday} todayMax={o.budget.dailyCap} size={150} /></div>
            <div className="space-y-1 text-xs text-muted">
              <p><b className="num text-base text-ink">{inrShort(o.budget.committed)}</b> / {inrShort(o.budget.total)}</p>
              <p><span className="text-info">■</span> today {inrShort(o.budget.committedToday)} / {inrShort(o.budget.dailyCap)}</p>
              <p>{inrShort(o.budget.leftToday)} left today</p>
            </div>
          </div>
        </Kpi>
      </div>

      {/* Scatter + feed */}
      <Panel className="lg:col-span-8" title="Who deserves an offer?" icon={Crosshair}
        info="Each dot is a customer. Across: how likely they are to buy anyway. Up: how much an offer changes that. Only the green zone gets real discounts. Click a dot for the full profile. Outlined dots are Telegram testers."
        action={<button onClick={() => go('segments')} className="text-xs text-ok hover:underline">Explore segments →</button>}>
        <QuadrantScatter rows={customers || []} targeting={rules?.rules?.targeting} onSelect={onSelect} height={330} />
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(QUAD).map(([k, q]) => (
            <div key={k} className="rounded-xl border border-line bg-panel2 px-3 py-2">
              <p className={`text-[11px] font-semibold ${q.tw}`}>{q.label}</p>
              <p className="num text-lg font-bold">{quadCounts[k]}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="lg:col-span-4 lg:row-span-2 lg:max-h-[860px]" title="Live activity" icon={Radio} bodyClass="p-3 overflow-hidden flex flex-col"
        info="Every decision and customer action, as it happens. Click a row to open that customer.">
        <LiveFeed onSelect={onSelect} />
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 lg:col-span-8">
        <Panel title="Guardrail" icon={ShieldCheck} info="Every AI proposal is checked against the rules before anything is sent. Rejected proposals get one chance to be fixed; otherwise the rule engine takes over."
          action={<button onClick={() => go('guardrail')} className="text-xs text-ok hover:underline">See catches →</button>}>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border border-ok/40 bg-ok/10 glow-ok">
              <AnimatedNumber value={o.guard.sentOutsideRules} className="text-3xl font-bold text-ok" />
            </div>
            <div>
              <p className="font-semibold">offers sent outside the rules</p>
              <p className="text-xs text-muted">Every send passed the validator. Always.</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {[['AI proposals', o.guard.aiProposals, 'text-ai'], ['Caught & blocked', o.guard.aiRejected, 'text-bad'], ['Fixed by AI', o.guard.correctedByAI, 'text-warn'], ['Rule-engine fallback', o.guard.fallbackUsed, 'text-muted']].map(([k, v, c]) => (
              <div key={k} className="rounded-xl border border-line bg-panel2 px-3 py-2"><dt className="text-faint">{k}</dt><dd className={`num text-lg font-bold ${c}`}>{v}</dd></div>
            ))}
          </dl>
        </Panel>
        <Panel title="Offer funnel" icon={Filter} info="From decision to purchase. Synthetic customers respond according to their predicted behaviour; Telegram testers respond for real.">
          <Funnel steps={[
            { label: 'Decisions made', value: o.counts.decisions, color: 'var(--idle)' },
            { label: 'Passed rules & sent', value: o.counts.sent, color: 'var(--info)' },
            { label: 'Claimed', value: o.counts.claimed, color: 'var(--ai)', info: 'Telegram: tapped Claim. Synthetic: used the coupon.' },
            { label: 'Redeemed (bought)', value: o.counts.redeemed, color: 'var(--ok)' },
          ]} />
          <p className="mt-4 text-xs text-muted">Telegram: <b className="text-ink">{o.counts.telegramUsers}</b> testers · {o.counts.why} asked "why?" · {o.counts.dismissed} said "not now" · {o.counts.optedOut} opted out</p>
        </Panel>
      </div>

      <Panel className="lg:col-span-7" title="Does it work? Conversion by group" icon={BarChart3}
        info="Conversion with an offer vs the control group, per quadrant. Persuadables should show the biggest gap; Sure Things barely move. That's why they don't get discounts.">
        {hasResults ? (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={o.byQuadrant.map((b) => ({ ...b, label: `${b.label} (${b.treated} vs ${b.control})`, treatedPct: +(b.convTreated * 100).toFixed(1), controlPct: +(b.convControl * 100).toFixed(1) }))} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="label" stroke="var(--faint)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--faint)" fontSize={10} tickLine={false} axisLine={false} unit="%" />
                <Tooltip cursor={{ fill: 'var(--panel-2)' }} contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--line-strong)', borderRadius: 10, fontSize: 12 }} formatter={(v, n) => [`${v}%`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="treatedPct" name="With offer" fill="var(--ok)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="controlPct" name="Control" fill="var(--info)" fillOpacity={0.55} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty icon={BarChart3} title="No results yet">Hit <b>Launch campaign</b>. The engine will hold back a control group so you can see the real effect of each offer.</Empty>}
      </Panel>

      <Panel className="lg:col-span-5" title="Offer mix" icon={PieIcon} info="What kinds of offers the engine chose. A healthy mix uses free nudges and points where discounts aren't needed.">
        {mix.length ? (
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={mix} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={3} stroke="var(--panel)" strokeWidth={2}>
                  {mix.map((m, i) => <Cell key={m.name} fill={MIX_COLORS[i % MIX_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--line-strong)', borderRadius: 10, fontSize: 12 }} />
                <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty icon={PieIcon} title="Nothing sent yet" />}
      </Panel>
    </div>
  );
}
