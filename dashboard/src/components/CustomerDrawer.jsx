import { useState } from 'react';
import { Send, ShoppingCart, Star, MapPin, Languages, Loader2 } from 'lucide-react';
import { api, useApi } from '../api.jsx';
import { inr, pct, QUAD } from '../format.js';
import { Button, Drawer, Pill } from './ui.jsx';
import DecisionCard from './DecisionCard.jsx';

const LANG = { en: 'English', hi: 'Hindi', pa: 'Punjabi' };

function Dial({ value, label, color }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg width="78" height="78" viewBox="0 0 78 78" role="img" aria-label={`${label} ${Math.round(value * 100)}%`}>
        <circle cx="39" cy="39" r={r} stroke="var(--line)" strokeWidth="7" fill="none" />
        <circle cx="39" cy="39" r={r} stroke={color} strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 39 39)" />
        <text x="39" y="44" textAnchor="middle" className="num" fill="var(--ink)" fontSize="15" fontWeight="700">{Math.round(value * 100)}%</text>
      </svg>
      <span className="label mt-1 !text-[10px]">{label}</span>
    </div>
  );
}

export default function CustomerDrawer({ id, onClose }) {
  const { data, reload } = useApi(id ? `/customers/${id}` : null, { deps: [id] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const sendNow = async () => {
    setBusy(true); setMsg(null);
    try {
      const d = await api(`/decide/${id}`, { method: 'POST', body: {} });
      setMsg(d.status === 'sent' ? 'Offer sent ✓' : `Not sent: ${d.blockers?.[0]?.message || d.status}`);
      reload();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const c = data?.customer;
  const f = data?.features;
  const s = data?.scores;
  const q = s && QUAD[s.quadrant];
  return (
    <Drawer open={!!id} onClose={onClose}>
      {!data ? <div className="flex h-64 items-center justify-center text-muted"><Loader2 className="animate-spin" /></div> : (
        <div className="space-y-5 p-6">
          <div>
            <p className="label">Customer 360 · {c.id}</p>
            <h2 className="mt-1 text-2xl font-bold text-ink">{c.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="flex items-center gap-1"><MapPin size={12} />{c.city}</span>
              <span className="flex items-center gap-1"><Languages size={12} />{LANG[c.language]}</span>
              <span>· {c.ageBand}</span>
              <Pill className="border-line-strong bg-panel2 text-ink">{f.segment}</Pill>
              <Pill className={`${q.tw} border-current/40`} >{q.label}</Pill>
              {c.telegramId && <Pill className="border-info/40 bg-info/10 text-info">Telegram{c.username ? ` @${c.username}` : ''}</Pill>}
              {c.optedOut && <Pill className="border-bad/40 bg-bad/10 text-bad">Opted out</Pill>}
            </div>
          </div>

          <div className="panel grid grid-cols-3 gap-2 p-4">
            <Dial value={s.pBase} label="Buys anyway" color="var(--info)" />
            <Dial value={s.pOffer} label="With an offer" color="var(--ok)" />
            <Dial value={f.churnRisk} label="Churn risk" color={f.churnRisk > 0.6 ? 'var(--bad)' : 'var(--warn)'} />
            <p className="col-span-3 mt-1 text-center text-xs text-muted">{q.hint} An offer changes their chance of buying by <b className="num text-ink">{(s.uplift * 100).toFixed(1)} pts</b>.</p>
          </div>

          {!!data.signals.length && (
            <div className="panel p-4">
              <p className="label mb-2">What the engine noticed</p>
              <ul className="space-y-1.5 text-sm text-ink">{data.signals.map((x) => <li key={x}>• {x}</li>)}</ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ['Lifetime value', inr(f.lifetimeValue)], ['Orders', f.lifetimeOrders], ['Avg order', inr(f.aov)],
              ['Last order', f.recencyDays == null ? 'never' : `${f.recencyDays}d ago`], ['Uses coupons', pct(f.discountShare, 0)],
              ['Returns', pct(f.returnRate, 0)], ['Visits (30d)', f.visits30d], ['Favourite', f.topCategory],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-panel2 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-faint">{k}</p>
                <p className="num mt-0.5 truncate font-semibold text-ink">{v}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel2 p-3 text-sm">
              <p className="label mb-1.5 flex items-center gap-1.5"><ShoppingCart size={12} />Cart</p>
              {c.cart?.items?.length ? (
                <>
                  {c.cart.items.map((i, k) => <p key={k} className="flex justify-between text-xs text-muted"><span className="truncate">{i.product}</span><span className="num">{inr(i.priceInr)}</span></p>)}
                  <p className="num mt-1 text-right font-semibold">{inr(c.cart.valueInr)} · {f.cartAgeHours}h old</p>
                </>
              ) : <p className="text-xs text-faint">Empty</p>}
            </div>
            <div className="rounded-xl border border-line bg-panel2 p-3 text-sm">
              <p className="label mb-1.5 flex items-center gap-1.5"><Star size={12} />Reward points</p>
              <p className="num text-xl font-bold">{c.pointsBalance}</p>
              <p className="text-xs text-muted">{c.pointsExpiringSoon ? `${c.pointsExpiringSoon} expire within 30 days` : 'none expiring soon'}</p>
            </div>
          </div>

          <div className="panel p-4">
            <p className="label mb-3">Recent orders</p>
            {c.orders.length === 0 ? <p className="text-sm text-faint">No orders yet</p> : (
              <ol className="relative space-y-2 border-l border-line pl-4">
                {c.orders.slice(-8).reverse().map((o, k) => (
                  <li key={k} className="text-xs">
                    <span className="absolute -left-[4.5px] mt-1 h-2 w-2 rounded-full bg-line-strong" />
                    <span className="num text-faint">{o.date.slice(0, 10)}</span> · <span className="text-ink">{o.products.join(', ')}</span>
                    <span className="num text-muted"> · {inr(o.valueInr)}</span>
                    {o.usedCoupon && <span className="text-warn"> · coupon {o.discountPct}%</span>}
                    {o.returned && <span className="text-bad"> · returned</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={sendNow} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Decide &amp; send now</Button>
            {msg && <span className="text-sm text-muted">{msg}</span>}
          </div>

          {data.decisions.length > 0 && (
            <div className="space-y-3">
              <p className="label">Offer history</p>
              {data.decisions.map((d) => <DecisionCard key={d.id} d={d} />)}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
