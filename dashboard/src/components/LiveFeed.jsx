import { AnimatePresence, motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useLive } from '../api.jsx';
import { offerText, QUAD, SOURCE, VIOLATION } from '../format.js';
import { Empty } from './ui.jsx';

const EVENT = {
  claimed: ['🎟️', 'claimed their coupon', 'text-ok'],
  redeemed: ['💰', 'ordered with a coupon', 'text-ok'],
  joined: ['👋', 'joined on Telegram', 'text-info'],
  cart_abandoned: ['🛒', 'walked away from their cart', 'text-warn'],
  dismissed: ['🙅', 'passed on an offer', 'text-muted'],
  why: ['🤔', 'asked "why this offer?"', 'text-ai'],
  opted_out: ['🔕', 'opted out of offers', 'text-bad'],
  opted_in: ['🔔', 'turned offers back on', 'text-info'],
  add_to_cart: ['➕', 'added to cart', 'text-muted'],
  browse: ['👀', 'is browsing', 'text-muted'],
  order: ['📦', 'placed an order', 'text-ok'],
  delivered: null,
};

function Row({ ev, onSelect }) {
  const time = new Date(ev.receivedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let icon; let title; let sub; let tone; let id;
  if (ev.kind === 'decision') {
    const d = ev.decision;
    id = d.customerId;
    const caught = d.attempts?.find((a) => a.source !== 'fallback' && !a.ok && a.violations?.length);
    if (d.status === 'sent') { icon = '✓'; tone = 'text-ok border-ok/40 bg-ok/10'; title = <><b>{d.name}</b> · {offerText(d.offer)}</>; }
    else if (d.status === 'holdout') { icon = '◌'; tone = 'text-info border-info/40 bg-info/10'; title = <><b>{d.name}</b> held out (control group)</>; }
    else if (d.status === 'blocked') { icon = '✕'; tone = 'text-bad border-bad/40 bg-bad/10'; title = <><b>{d.name}</b> blocked</>; }
    else { icon = '–'; tone = 'text-muted border-line-strong bg-panel2'; title = <><b>{d.name}</b> skipped</>; }
    sub = (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={QUAD[d.quadrant]?.tw}>{QUAD[d.quadrant]?.label}</span>
        {d.source && <span className="text-faint">· {SOURCE[d.source]?.label}</span>}
        {d.status === 'blocked' && d.blockers?.[0] && <span className="text-faint">· {d.blockers[0].message}</span>}
        {caught && <span className="text-bad">· 🛡 caught: {VIOLATION[caught.violations[0].code] || caught.violations[0].code}</span>}
        {d.telegramId && <span className="text-info">· Telegram</span>}
      </span>
    );
  } else if (ev.kind === 'event') {
    const e = ev.event;
    const meta = EVENT[e.type];
    if (!meta) return null;
    id = e.customerId;
    icon = meta[0]; tone = 'border-line-strong bg-panel2';
    title = <><b>{e.name || e.customerId}</b> <span className={meta[2]}>{meta[1]}</span>{e.orderValueInr ? <> · ₹{e.orderValueInr.toLocaleString('en-IN')}</> : null}</>;
    sub = e.simulated ? <span className="text-faint">simulated customer response</span> : e.product ? <span className="text-faint">{e.product}</span> : e.category ? <span className="text-faint">{e.category}</span> : null;
  } else if (ev.kind === 'rules') {
    icon = '⚙'; tone = 'text-warn border-warn/40 bg-warn/10';
    title = <>Rules updated to <b>v{ev.version}</b></>; sub = <span className="text-faint">{ev.note} · {ev.by}</span>;
  } else if (ev.kind === 'campaign') {
    icon = '🚀'; tone = 'border-ok/40 bg-ok/10';
    title = ev.phase === 'start' ? <>Campaign launched <span className="text-muted">({ev.useAI ? 'AI on' : 'rules only'})</span></> : <>Campaign done: <b>{ev.summary.sent}</b> sent</>;
  } else if (ev.kind === 'reset') {
    icon = '↺'; tone = 'border-line-strong bg-panel2'; title = 'Activity reset';
  } else return null;

  return (
    <motion.li layout initial={{ opacity: 0, x: 24, height: 0 }} animate={{ opacity: 1, x: 0, height: 'auto' }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      <button type="button" onClick={() => id && onSelect?.(id)} className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-panel2">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${tone}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">{title}</span>
          {sub && <span className="mt-0.5 block truncate text-[11px] text-muted">{sub}</span>}
        </span>
        <span className="num shrink-0 pt-0.5 text-[10px] text-faint">{time}</span>
      </button>
    </motion.li>
  );
}

export default function LiveFeed({ onSelect, limit = 40 }) {
  const { events, connected } = useLive();
  const shown = events.filter((e) => !(e.kind === 'event' && (e.event.type === 'delivered' || e.event.type === 'browse'))).slice(0, limit);
  return (
    <div className="flex h-full flex-col">
      {!connected && <p className="mb-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">Reconnecting to the live feed…</p>}
      {shown.length === 0 ? (
        <Empty icon={Radio} title="Waiting for activity">Launch a campaign, or ask a classmate to start the Telegram bot. Every decision appears here live.</Empty>
      ) : (
        <ul className="-mx-2 space-y-0.5 overflow-y-auto">
          <AnimatePresence initial={false}>{shown.map((ev) => <Row key={ev.key} ev={ev} onSelect={onSelect} />)}</AnimatePresence>
        </ul>
      )}
    </div>
  );
}
