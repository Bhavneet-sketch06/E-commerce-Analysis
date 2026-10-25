import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, CalendarRange, BellRing, Zap, Users, Tags, Gift, ShieldCheck, PartyPopper, History, Loader2, RotateCcw, Save, Undo2, AlertTriangle, XCircle, Plus, Trash2, ChevronDown } from 'lucide-react';
import { api, useApi } from '../api.jsx';
import { ago, inr, OFFER_LABEL, QUAD, TRIGGER } from '../format.js';
import { Button, Panel, Toggle } from '../components/ui.jsx';
import { Chip, DateField, Num, setIn, TagInput, TextField } from '../components/fields.jsx';

const EXAMPLES = [
  'Max 10% off Electronics during Diwali week',
  'Never message anyone after 9pm',
  'Raise the budget to 2 lakh and keep 15% as a control group',
  "Don't send offers to people who return more than 30% of orders",
  'Give Sure Things up to 300 bonus points',
];
const QUAD_ORDER = ['persuadable', 'sure_thing', 'lost_cause', 'do_not_disturb'];
const OFFER_ORDER = ['percent_off', 'flat_off', 'free_shipping', 'cart_recovery', 'bonus_points', 'points_reminder', 'nudge'];

function Sentence({ children }) {
  return <p className="leading-[2.3] text-[15px] text-ink">{children}</p>;
}

function Impact({ before, after }) {
  const rows = [
    ['Offers sent', before.sent, after.sent, (v) => v],
    ['Discount spend (expected)', before.expectedDiscountCost, after.expectedDiscountCost, inr, true],
    ['Extra revenue (expected)', before.expectedIncrementalRevenue, after.expectedIncrementalRevenue, inr],
    ['Profit (expected)', before.expectedProfit, after.expectedProfit, inr],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {rows.map(([k, b, a, f, lowerBetter]) => {
        const d = a - b;
        const good = lowerBetter ? d < 0 : d > 0;
        return (
          <div key={k} className="rounded-xl border border-line bg-panel2 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-faint">{k}</p>
            <p className="num text-sm font-semibold text-ink">{f(a)}</p>
            {Math.abs(d) > 0.5 && <p className={`num text-[11px] ${good ? 'text-ok' : 'text-bad'}`}>{d > 0 ? '▲' : '▼'} {f(Math.abs(d))}</p>}
          </div>
        );
      })}
    </div>
  );
}

function PlainEnglish({ onApplied, onEdit }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const run = async (t = text) => {
    if (!t.trim()) return;
    setText(t); setBusy(true); setErr(null); setRes(null);
    try { setRes(await api('/rules/nl', { method: 'POST', body: { text: t } })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setSaving(true);
    try {
      const out = await api('/rules', { method: 'PUT', body: { rules: res.rules, note: text, by: 'Marketing (plain English)' } });
      setRes(null); setText(''); onApplied(out.version);
    } catch (e) { setErr(e.data?.check?.errors?.[0]?.message || e.message); } finally { setSaving(false); }
  };
  return (
    <section className="panel relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-ai/15 blur-3xl" />
      <div className="flex items-center gap-2"><Wand2 size={16} className="text-ai" /><h2 className="font-semibold">Change the rules in plain English</h2></div>
      <p className="mt-1 text-sm text-muted">Type what you want. Claude turns it into exact rule changes, and you see the impact before anything is saved.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} placeholder="e.g. Max 10% off Electronics during Diwali week"
          className="flex-1 rounded-xl border border-ai/40 bg-panel2 px-4 py-2.5 text-sm outline-none placeholder:text-faint focus:border-ai" />
        <Button variant="ai" onClick={() => run()} disabled={busy || !text.trim()}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Preview change</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => <button key={e} onClick={() => run(e)} className="rounded-full border border-line-strong bg-panel2 px-2.5 py-1 text-[11px] text-muted hover:border-ai/50 hover:text-ai">{e}</button>)}
      </div>
      {err && <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
      <AnimatePresence>
        {res && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-3 rounded-xl border border-ai/30 bg-ai/5 p-4">
            <p className="text-sm"><b>Claude understood:</b> {res.summary}</p>
            {res.question && <p className="text-sm text-warn">❓ {res.question}</p>}
            {res.diff.length > 0 ? (
              <ul className="space-y-1 text-sm">{res.diff.map((d) => <li key={d.path} className="flex gap-2"><span className="text-ai">→</span>{d.text}</li>)}</ul>
            ) : <p className="text-sm text-muted">No rule would change.</p>}
            {res.rejected?.length > 0 && <p className="text-xs text-warn">Ignored: {res.rejected.map((r) => `${r.path} (${r.reason})`).join(', ')}</p>}
            {[...res.check.errors, ...res.check.warnings].map((w) => <p key={w.message} className={`flex items-start gap-1.5 text-xs ${res.check.errors.includes(w) ? 'text-bad' : 'text-warn'}`}><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w.message}</p>)}
            {res.diff.length > 0 && <><p className="label !text-[10px]">Forecast impact (one campaign wave)</p><Impact before={res.impact.before} after={res.impact.after} /></>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={apply} disabled={saving || !res.diff.length || res.check.errors.length > 0}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Apply</Button>
              {res.diff.length > 0 && <Button onClick={() => { onEdit(res.rules); setRes(null); }}>Tweak in editor</Button>}
              <Button onClick={() => setRes(null)}>Discard</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Versions({ versions, current, onRollback }) {
  const [open, setOpen] = useState(null);
  const [diff, setDiff] = useState({});
  const toggle = async (n) => {
    setOpen(open === n ? null : n);
    if (!diff[n]) { const d = await api(`/rules/versions/${n}/diff`); setDiff((x) => ({ ...x, [n]: d.diff })); }
  };
  return (
    <ol className="space-y-2">
      {versions.map((v) => (
        <li key={v.version} className={`rounded-xl border px-3 py-2.5 ${v.version === current ? 'border-ok/50 bg-ok/5' : 'border-line bg-panel2'}`}>
          <button className="flex w-full items-start gap-2 text-left" onClick={() => toggle(v.version)}>
            <span className={`num rounded-md px-1.5 py-0.5 text-xs font-bold ${v.version === current ? 'bg-ok/20 text-ok' : 'bg-line text-muted'}`}>v{v.version}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{v.note || 'Edited'}</span>
              <span className="text-[11px] text-faint">{v.by} · {ago(v.at)}</span>
            </span>
            <ChevronDown size={14} className={`mt-1 text-faint transition ${open === v.version ? 'rotate-180' : ''}`} />
          </button>
          {open === v.version && (
            <div className="mt-2 space-y-2 border-t border-line pt-2">
              {!diff[v.version] ? <Loader2 size={14} className="animate-spin text-muted" /> : diff[v.version].length === 0 ? <p className="text-xs text-faint">Starting rules</p> : (
                <ul className="space-y-0.5 text-xs text-muted">{diff[v.version].map((d) => <li key={d.path}>• {d.text}</li>)}</ul>
              )}
              {v.version !== current && <Button className="!py-1 text-xs" onClick={() => onRollback(v.version)}><RotateCcw size={12} /> Roll back to v{v.version}</Button>}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function Rules({ meta }) {
  const { data, reload } = useApi('/rules', { live: false });
  const { data: versions, reload: reloadVersions } = useApi('/rules/versions');
  const [draft, setDraft] = useState(null);
  const [check, setCheck] = useState({ errors: [], warnings: [], diff: [] });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { if (data && !draft) setDraft(structuredClone(data.rules)); }, [data]);
  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(() => api('/rules/check', { method: 'POST', body: { rules: draft } }).then((r) => setCheck({ ...r.check, diff: r.diff })).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [draft]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const afterSave = async (v) => {
    const fresh = await api('/rules');
    setDraft(structuredClone(fresh.rules)); reload(); reloadVersions(); setNote('');
    flash(`Saved as v${v}. The engine uses it from the very next decision.`);
  };
  const save = async () => {
    setSaving(true);
    try { const out = await api('/rules', { method: 'PUT', body: { rules: draft, note: note || check.diff.slice(0, 2).map((d) => d.text).join('; ') } }); await afterSave(out.version); }
    catch (e) { flash(e.data?.check?.errors?.[0]?.message || e.message); } finally { setSaving(false); }
  };
  const rollback = async (version) => {
    const out = await api('/rules/rollback', { method: 'POST', body: { version } });
    await afterSave(out.version);
  };

  const errFields = useMemo(() => new Set(check.errors.map((e) => e.field)), [check]);
  if (!draft) return <div className="panel scanline h-60" />;
  const set = (path) => (v) => setDraft((d) => setIn(d, path, v));
  const r = draft;
  const fieldMsgs = (prefix) => [...check.errors, ...check.warnings].filter((w) => w.field.startsWith(prefix));
  const Msgs = ({ prefix }) => fieldMsgs(prefix).map((w) => (
    <p key={w.field + w.message} className={`mt-2 flex items-start gap-1.5 text-xs ${check.errors.includes(w) ? 'text-bad' : 'text-warn'}`}>
      {check.errors.includes(w) ? <XCircle size={12} className="mt-0.5 shrink-0" /> : <AlertTriangle size={12} className="mt-0.5 shrink-0" />}{w.message}
    </p>
  ));
  const cats = Object.keys(r.categories);

  return (
    <div className="grid gap-4 pb-28 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-8">
        <PlainEnglish onApplied={afterSave} onEdit={(rules) => setDraft(rules)} />

        <Panel title="Campaign" icon={CalendarRange}>
          <Sentence>
            Run <TextField value={r.campaign.name} onChange={set('campaign.name')} label="Campaign name" /> from <DateField value={r.campaign.startDate} onChange={set('campaign.startDate')} label="Start" /> to <DateField value={r.campaign.endDate} onChange={set('campaign.endDate')} label="End" /> with a total budget of <Num prefix="₹" width="w-24" step={5000} value={r.campaign.budgetInr} onChange={set('campaign.budgetInr')} label="Budget" error={errFields.has('campaign.budgetInr')} />.
            {' '}Spread spending evenly across days <span className="inline-flex translate-y-1"><Toggle checked={r.campaign.dailyPacing} onChange={set('campaign.dailyPacing')} label="Daily pacing" /></span>.
            {' '}Keep <Num suffix="%" value={r.campaign.controlGroupPct} onChange={set('campaign.controlGroupPct')} min={0} max={50} label="Control group" /> of customers as a control group (no offers) to prove the offers work.
            {' '}Offers stay valid for <Num suffix="h" value={r.campaign.offerValidityHours} onChange={set('campaign.offerValidityHours')} label="Validity" />.
          </Sentence>
          <Msgs prefix="campaign" />
        </Panel>

        <Panel title="Contact limits" icon={BellRing} info="Protects customers from spam. These apply to every message, including free ones.">
          <Sentence>
            Send each person at most <Num value={r.contact.maxOffersPerWeek} onChange={set('contact.maxOffersPerWeek')} min={0} max={14} label="Offers per week" /> offers a week, at least <Num suffix="h" value={r.contact.cooldownHours} onChange={set('contact.cooldownHours')} label="Cooldown" /> apart.
            {' '}Stay quiet from <Num suffix=":00" value={r.contact.quietHoursStart} onChange={set('contact.quietHoursStart')} min={0} max={23} width="w-10" label="Quiet start" /> to <Num suffix=":00" value={r.contact.quietHoursEnd} onChange={set('contact.quietHoursEnd')} min={0} max={23} width="w-10" label="Quiet end" /> (IST).
            {' '}Give anyone who ignores <Num value={r.contact.pauseAfterIgnored} onChange={set('contact.pauseAfterIgnored')} min={1} label="Pause after" /> offers in a row a break (offers that expire unanswered count as ignored).
            {' '}After someone buys, send them nothing for <Num suffix="h" value={r.contact.noOffersAfterPurchaseHours} onChange={set('contact.noOffersAfterPurchaseHours')} min={0} label="No offers after purchase" />: they'd buy again anyway.
          </Sentence>
          <Msgs prefix="contact" />
        </Panel>

        <Panel title="When to reach out (automatic)" icon={Zap} info="The autopilot checks every customer on a schedule and acts at the right moment. Each moment still goes through targeting, contact limits and the guardrail, so a trigger never forces an offer."
          action={<span className="flex items-center gap-2 text-xs text-muted">Autopilot <Toggle checked={r.triggers.enabled} onChange={set('triggers.enabled')} label="Autopilot" /></span>}>
          <div className={`space-y-2 ${r.triggers.enabled ? '' : 'pointer-events-none opacity-50'}`}>
            <Sentence>Check every customer every <Num suffix="min" value={r.triggers.scanEveryMinutes} onChange={set('triggers.scanEveryMinutes')} min={1} width="w-12" label="Scan every" />.</Sentence>
            {[
              ['cartAbandoned', 'cart_abandoned', <>When a cart sits untouched for <Num suffix="min" value={r.triggers.cartAbandoned.afterMinutes} onChange={set('triggers.cartAbandoned.afterMinutes')} min={1} width="w-12" label="Cart after" />, remind them (up to <Num suffix="h" value={r.triggers.cartAbandoned.maxHours} onChange={set('triggers.cartAbandoned.maxHours')} min={1} width="w-12" label="Cart max hours" /> later, once per cart).</>],
              ['browseAbandoned', 'browse_abandoned', <>When someone views a category <Num suffix="×" value={r.triggers.browseAbandoned.minViews} onChange={set('triggers.browseAbandoned.minViews')} min={2} width="w-10" label="Min views" /> within <Num suffix="days" value={r.triggers.browseAbandoned.withinDays} onChange={set('triggers.browseAbandoned.withinDays')} min={1} max={30} width="w-10" label="Within days" /> without buying, nudge them <Num suffix="min" value={r.triggers.browseAbandoned.afterMinutes} onChange={set('triggers.browseAbandoned.afterMinutes')} min={0} width="w-12" label="Browse after" /> after their last look.</>],
              ['winBack', 'win_back', <>When a customer is <Num suffix="×" step={0.1} value={r.triggers.winBack.overdueRatio} onChange={set('triggers.winBack.overdueRatio')} min={1} width="w-12" label="Overdue ratio" /> overdue compared with their usual gap between orders (and at least <Num suffix="days" value={r.triggers.winBack.minDaysSinceOrder} onChange={set('triggers.winBack.minDaysSinceOrder')} min={1} width="w-12" label="Min days" /> since the last one), try to win them back. At most once every <Num suffix="days" value={r.triggers.winBack.repeatAfterDays} onChange={set('triggers.winBack.repeatAfterDays')} min={1} width="w-12" label="Win-back repeat" />.</>],
              ['pointsExpiring', 'points_expiring', <>When at least <Num value={r.triggers.pointsExpiring.minPoints} onChange={set('triggers.pointsExpiring.minPoints')} min={1} label="Points min" /> reward points are about to expire, remind them. At most once every <Num suffix="days" value={r.triggers.pointsExpiring.repeatAfterDays} onChange={set('triggers.pointsExpiring.repeatAfterDays')} min={1} width="w-10" label="Points repeat" />.</>],
            ].map(([key, trig, text]) => (
              <div key={key} className={`flex items-start gap-3 rounded-xl border border-line p-3 ${r.triggers[key].enabled ? 'bg-panel2/50' : 'bg-panel2/10 opacity-60'}`}>
                <span className="mt-1 text-lg">{TRIGGER[trig].emoji}</span>
                <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-muted">{TRIGGER[trig].label}</p><Sentence>{text}</Sentence></div>
                <span className="mt-1"><Toggle checked={r.triggers[key].enabled} onChange={set(`triggers.${key}.enabled`)} label={`${TRIGGER[trig].label} trigger`} /></span>
              </div>
            ))}
            <Sentence>Act on up to <Num value={r.triggers.syntheticPerScan} onChange={set('triggers.syntheticPerScan')} min={0} max={50} width="w-10" label="Synthetic per scan" /> synthetic customers per scan (rule engine only, so it costs nothing). Telegram testers are always checked.</Sentence>
          </div>
          <Msgs prefix="triggers" />
        </Panel>

        <Panel title="Who can get what" icon={Users} info="The heart of the strategy. Tap an offer to allow or block it for that group. The discount cap applies to every % or ₹ offer for the group.">
          <div className="space-y-3">
            {QUAD_ORDER.map((q) => {
              const cfg = r.targeting.quadrants[q];
              const toggle = (t) => set(`targeting.quadrants.${q}.allowedOffers`)(cfg.allowedOffers.includes(t) ? cfg.allowedOffers.filter((x) => x !== t) : [...cfg.allowedOffers, t]);
              return (
                <div key={q} className="rounded-xl border border-line bg-panel2/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`text-sm font-bold ${QUAD[q].tw}`}>{QUAD[q].label} <span className="font-normal text-faint">· {QUAD[q].hint}</span></p>
                    <span className="text-xs text-muted">max discount <Num suffix="%" value={cfg.maxDiscountPct} onChange={set(`targeting.quadrants.${q}.maxDiscountPct`)} min={0} max={60} width="w-10" label={`${q} max discount`} /></span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {OFFER_ORDER.map((t) => <Chip key={t} on={cfg.allowedOffers.includes(t)} onClick={() => toggle(t)}>{OFFER_LABEL[t]}</Chip>)}
                  </div>
                </div>
              );
            })}
          </div>
          <Sentence>
            A customer counts as <b className="text-ok">Persuadable</b> when an offer adds at least <Num suffix="pts" value={Math.round(r.targeting.persuadableMinUplift * 100)} onChange={(v) => set('targeting.persuadableMinUplift')(v / 100)} min={1} max={30} width="w-10" label="Persuadable threshold" /> to their chance of buying,
            {' '}and as a <b className="text-info">Sure Thing</b> when they'd buy anyway with at least <Num suffix="%" value={Math.round(r.targeting.sureThingMinBase * 100)} onChange={(v) => set('targeting.sureThingMinBase')(v / 100)} min={5} max={90} width="w-10" label="Sure thing threshold" /> probability.
          </Sentence>
          <Msgs prefix="targeting" />
        </Panel>

        <Panel title="Category limits" icon={Tags} info="Each category has a real margin. Even if you set a higher cap, the engine never lets a discount eat into the minimum margin.">
          <div className="grid gap-2 sm:grid-cols-2">
            {cats.map((c) => {
              const cfg = r.categories[c];
              const margin = meta?.categories?.[c]?.marginPct ?? 0;
              const hard = Math.max(0, margin - r.margin.minMarginAfterDiscountPct);
              const eff = Math.min(cfg.maxDiscountPct, hard);
              return (
                <div key={c} className={`rounded-xl border p-3 transition ${cfg.enabled ? 'border-line bg-panel2/50' : 'border-line bg-panel2/20 opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{meta?.categories?.[c]?.emoji} {c}</p>
                    <Toggle checked={cfg.enabled} onChange={set(`categories.${c}.enabled`)} label={`${c} enabled`} />
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <input type="range" min={0} max={50} value={cfg.maxDiscountPct} onChange={(e) => set(`categories.${c}.maxDiscountPct`)(Number(e.target.value))} className="flex-1" aria-label={`${c} max discount`} disabled={!cfg.enabled} />
                    <span className="num w-10 text-right text-sm font-bold text-ok">{cfg.maxDiscountPct}%</span>
                  </div>
                  <p className="mt-1 text-[11px] text-faint">margin {margin}% → never more than <b className={eff < cfg.maxDiscountPct ? 'text-warn' : 'text-muted'}>{eff}%</b> off</p>
                </div>
              );
            })}
          </div>
          <Msgs prefix="categories" />
        </Panel>

        <Panel title="Offer settings" icon={Gift}>
          <div className="space-y-1">
            <Sentence>% off: between <Num suffix="%" value={r.offers.percent_off.minPct} onChange={set('offers.percent_off.minPct')} width="w-10" label="Min %" /> and <Num suffix="%" value={r.offers.percent_off.maxPct} onChange={set('offers.percent_off.maxPct')} width="w-10" label="Max %" />, on orders above <Num prefix="₹" value={r.offers.percent_off.minOrderInr} onChange={set('offers.percent_off.minOrderInr')} width="w-16" label="Min order" />. <Toggle checked={r.offers.percent_off.enabled} onChange={set('offers.percent_off.enabled')} label="% off enabled" /></Sentence>
            <Sentence>Flat ₹ off: between <Num prefix="₹" value={r.offers.flat_off.minInr} onChange={set('offers.flat_off.minInr')} label="Min ₹" /> and <Num prefix="₹" value={r.offers.flat_off.maxInr} onChange={set('offers.flat_off.maxInr')} label="Max ₹" />, on orders above <Num prefix="₹" value={r.offers.flat_off.minOrderInr} onChange={set('offers.flat_off.minOrderInr')} width="w-16" label="Flat min order" />. <Toggle checked={r.offers.flat_off.enabled} onChange={set('offers.flat_off.enabled')} label="Flat enabled" /></Sentence>
            <Sentence>Abandoned carts: up to <Num suffix="%" value={r.offers.cart_recovery.maxPct} onChange={set('offers.cart_recovery.maxPct')} width="w-10" label="Cart max %" /> off to bring them back. <Toggle checked={r.offers.cart_recovery.enabled} onChange={set('offers.cart_recovery.enabled')} label="Cart recovery enabled" /></Sentence>
            <Sentence>Bonus points: between <Num value={r.offers.bonus_points.minPoints} onChange={set('offers.bonus_points.minPoints')} label="Min points" /> and <Num value={r.offers.bonus_points.maxPoints} onChange={set('offers.bonus_points.maxPoints')} label="Max points" /> points (1 point = ₹0.25). <Toggle checked={r.offers.bonus_points.enabled} onChange={set('offers.bonus_points.enabled')} label="Points enabled" /></Sentence>
            <Sentence>Remind people about expiring points when at least <Num value={r.offers.points_reminder.minPoints} onChange={set('offers.points_reminder.minPoints')} label="Reminder min points" /> are about to expire. <Toggle checked={r.offers.points_reminder.enabled} onChange={set('offers.points_reminder.enabled')} label="Reminder enabled" /></Sentence>
            <Sentence>Free delivery on orders above <Num prefix="₹" value={r.offers.free_shipping.minOrderInr} onChange={set('offers.free_shipping.minOrderInr')} label="Free delivery min order" />. <Toggle checked={r.offers.free_shipping.enabled} onChange={set('offers.free_shipping.enabled')} label="Free delivery enabled" /></Sentence>
          </div>
          <Msgs prefix="offers" />
        </Panel>

        <Panel title="Safety" icon={ShieldCheck}>
          <Sentence>
            Always keep at least <Num suffix="%" value={r.margin.minMarginAfterDiscountPct} onChange={set('margin.minMarginAfterDiscountPct')} width="w-10" label="Margin floor" /> margin after any discount.
            {' '}Don't send offers to customers who return more than <Num suffix="%" value={Math.round(r.exclusions.maxReturnRate * 100)} onChange={(v) => set('exclusions.maxReturnRate')(v / 100)} width="w-10" label="Max return rate" /> of their orders.
            {' '}Keep messages under <Num value={r.message.maxChars} onChange={set('message.maxChars')} label="Max chars" /> characters.
          </Sentence>
          <p className="mb-1.5 mt-3 text-xs text-muted">Words the AI must never use (press Enter to add):</p>
          <TagInput values={r.message.bannedPhrases} onChange={set('message.bannedPhrases')} placeholder="add a phrase…" />
          <Msgs prefix="message" />
        </Panel>

        <Panel title="Festive windows" icon={PartyPopper} info="During a window, the listed categories may go a few % deeper (still never below the margin floor)."
          action={<Button className="!py-1 text-xs" onClick={() => set('windows')([...r.windows, { name: 'New window', start: r.campaign.startDate, end: r.campaign.endDate, extraDiscountPct: 5, categories: [] }])}><Plus size={12} /> Add</Button>}>
          <div className="space-y-3">
            {r.windows.length === 0 && <p className="text-sm text-faint">No festive windows.</p>}
            {r.windows.map((w, i) => (
              <div key={i} className="rounded-xl border border-line bg-panel2/50 p-3">
                <Sentence>
                  <TextField value={w.name} onChange={set(`windows.${i}.name`)} label="Window name" className="w-36" /> from <DateField value={w.start} onChange={set(`windows.${i}.start`)} label="Window start" /> to <DateField value={w.end} onChange={set(`windows.${i}.end`)} label="Window end" />: allow <Num prefix="+" suffix="%" value={w.extraDiscountPct} onChange={set(`windows.${i}.extraDiscountPct`)} width="w-10" label="Extra %" /> extra on
                  <button className="ml-2 inline-flex translate-y-0.5 text-faint hover:text-bad" aria-label="Remove window" onClick={() => set('windows')(r.windows.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                </Sentence>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {cats.map((c) => <Chip key={c} on={w.categories.includes(c)} onClick={() => set(`windows.${i}.categories`)(w.categories.includes(c) ? w.categories.filter((x) => x !== c) : [...w.categories, c])}>{c}</Chip>)}
                </div>
              </div>
            ))}
          </div>
          <Msgs prefix="windows" />
        </Panel>
      </div>

      <aside className="space-y-4 xl:col-span-4">
        <div className="xl:sticky xl:top-20">
          <Panel title="Version history" icon={History} info="Every saved change becomes a new version, so you can see who changed what, and roll back in one click.">
            {versions ? <Versions versions={versions} current={data?.version?.version} onRollback={rollback} /> : <Loader2 className="animate-spin text-muted" />}
          </Panel>
        </div>
      </aside>

      <AnimatePresence>
        {check.diff.length > 0 && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-3 bottom-20 z-30 mx-auto max-w-4xl lg:bottom-5 lg:left-64">
            <div className="panel flex flex-col gap-3 border-ok/40 p-4 shadow-2xl sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{check.diff.length} unsaved change{check.diff.length > 1 ? 's' : ''} {check.errors.length > 0 && <span className="text-bad">· {check.errors.length} problem{check.errors.length > 1 ? 's' : ''} to fix</span>}</p>
                <p className="truncate text-xs text-muted">{check.diff.slice(0, 3).map((d) => d.text).join(' · ')}</p>
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="rounded-lg border border-line-strong bg-panel2 px-3 py-2 text-sm outline-none focus:border-ok sm:w-48" />
              <div className="flex gap-2">
                <Button onClick={() => setDraft(structuredClone(data.rules))}><Undo2 size={14} /> Discard</Button>
                <Button variant="primary" onClick={save} disabled={saving || check.errors.length > 0}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save v{(data?.version?.version ?? 0) + 1}</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed right-5 top-20 z-50 rounded-xl border border-ok/40 bg-panel px-4 py-3 text-sm shadow-2xl glow-ok">{toast}</motion.div>}
      </AnimatePresence>
    </div>
  );
}
