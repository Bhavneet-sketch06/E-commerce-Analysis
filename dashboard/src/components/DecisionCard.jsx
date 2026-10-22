import { ShieldAlert, ShieldCheck, Sparkles, Cpu, ArrowRight } from 'lucide-react';
import { ago, offerText, QUAD, SOURCE, STATUS, VIOLATION } from '../format.js';
import { Pill, TelegramBubble } from './ui.jsx';

function proposalText(p) {
  if (!p) return '';
  if (p.action === 'skip') return 'Skip (send nothing)';
  return offerText({ ...p, points: p.points });
}

export function AttemptTrail({ attempts = [] }) {
  if (!attempts.length) return null;
  return (
    <ol className="space-y-2">
      {attempts.map((a, i) => (
        <li key={i} className="flex items-start gap-2.5 text-xs">
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${a.ok ? 'border-ok/40 bg-ok/10 text-ok' : 'border-bad/40 bg-bad/10 text-bad'}`}>
            {a.source === 'fallback' ? <Cpu size={11} /> : a.ok ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-ink">
              <span className="text-muted">{a.source === 'fallback' ? 'Rule engine' : a.source === 'ai_revision' ? 'Claude (fix)' : 'Claude'} proposed </span>
              <b>{a.error ? 'an error' : proposalText(a.proposal)}</b>
              {a.ms && <span className="num text-faint"> · {(a.ms / 1000).toFixed(1)}s</span>}
            </p>
            {a.error && <p className="mt-0.5 text-bad">{a.error}</p>}
            {!!a.violations?.length && (
              <div className="mt-1 flex flex-wrap gap-1">
                {a.violations.map((v, j) => (
                  <span key={j} title={v.message} className="rounded-md border border-bad/40 bg-bad/10 px-1.5 py-0.5 text-[11px] text-bad">✕ {v.message}</span>
                ))}
              </div>
            )}
            {a.ok && <p className="mt-0.5 text-ok">✓ passed every rule</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function DecisionCard({ d, onSelect }) {
  const st = STATUS[d.status];
  const q = QUAD[d.quadrant];
  return (
    <article className="panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <button className="font-semibold text-ink hover:text-ok" onClick={() => onSelect?.(d.customerId)}>{d.name}</button>
        {d.telegramId && <Pill className="border-info/40 bg-info/10 text-info">Telegram</Pill>}
        <Pill className={st.tw}>{st.label}</Pill>
        {d.source && <Pill className={SOURCE[d.source].tw}>{d.source !== 'fallback' && <Sparkles size={10} />}{SOURCE[d.source].label}</Pill>}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-faint">
          <span className={q.tw}>{q.label}</span>· {d.segment} · {d.trigger?.replace(/_/g, ' ')} · {ago(d.at)}
        </span>
      </header>
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          {d.offer && (
            <p className="flex items-center gap-2 text-sm">
              <span className="label !text-[10px]">Offer</span>
              <b className="text-ink">{offerText(d.offer)}</b>
              {d.offer.estCostInr > 0 && <span className="num text-xs text-muted">~₹{d.offer.estCostInr}</span>}
            </p>
          )}
          {!!d.signals?.length && (
            <ul className="space-y-1 text-xs text-muted">
              {d.signals.slice(0, 3).map((s) => <li key={s} className="flex gap-1.5"><ArrowRight size={12} className="mt-0.5 shrink-0 text-faint" />{s}</li>)}
            </ul>
          )}
          {d.reasoning && <p className="rounded-lg border border-ai/30 bg-ai/5 px-3 py-2 text-xs italic text-ink">“{d.reasoning}”</p>}
          <AttemptTrail attempts={d.attempts} />
          {d.status !== 'sent' && d.blockers?.length > 0 && (
            <div className="flex flex-wrap gap-1">{d.blockers.map((b) => <span key={b.code} className="rounded-md border border-line-strong bg-panel2 px-1.5 py-0.5 text-[11px] text-muted">{b.message}</span>)}</div>
          )}
          {d.outcome && (
            <p className="text-xs text-muted">
              Outcome{d.outcome.simulated ? ' (simulated)' : ''}: {d.outcome.purchased ? <span className="text-ok">bought ₹{d.outcome.orderValueInr.toLocaleString('en-IN')}</span> : <span>no purchase</span>}
              {d.response && <> · customer tapped <b>{d.response}</b></>}
            </p>
          )}
        </div>
        {d.status === 'sent' ? <TelegramBubble headline={d.headline} message={d.message} coupon={d.coupon} /> : <div className="hidden md:block" />}
      </div>
    </article>
  );
}
