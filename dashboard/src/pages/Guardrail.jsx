import { ShieldCheck, ShieldAlert, Sparkles } from 'lucide-react';
import { useApi } from '../api.jsx';
import { VIOLATION } from '../format.js';
import { AnimatedNumber, Empty, Panel } from '../components/ui.jsx';
import DecisionCard from '../components/DecisionCard.jsx';

const CHECKS = [
  ['Discount within category, segment & margin limits', 'A 20% Electronics offer is impossible when the margin is 12%.'],
  ['Offer type allowed for this customer group', 'Sure Things never get discounts; Do Not Disturb gets nothing.'],
  ['Budget left today (with pacing)', 'Paid offers stop when the daily or campaign budget runs out.'],
  ['Frequency cap, cooldown, quiet hours, opt-out', 'Max 2 offers a week, 48h apart, no messages 22:00-08:00.'],
  ['Message matches the offer', 'Every %, ₹ amount and points figure in the text must equal the real offer, in English, Hindi or Punjabi digits.'],
  ['No invented codes, banned phrases or free-delivery promises', 'Coupon codes come from the system, never from the AI.'],
];

export default function Guardrail({ onSelect }) {
  const { data: o } = useApi('/overview');
  const { data: caught } = useApi('/decisions?guardrail=1&limit=40');
  const vc = Object.entries(o?.violationCounts || {}).sort((a, b) => b[1] - a[1]);
  const maxV = Math.max(1, ...vc.map(([, v]) => v));
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <section className="panel glow-ok relative overflow-hidden p-6 lg:col-span-5">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-ok/10 blur-2xl" />
        <ShieldCheck size={34} className="text-ok" />
        <p className="mt-4 text-sm text-muted">Offers sent outside the rules</p>
        <AnimatedNumber value={o?.guard.sentOutsideRules ?? 0} className="text-7xl font-bold text-ok" />
        <p className="mt-3 max-w-md text-sm text-muted">Claude chooses and writes offers, but it never has the last word. Each proposal goes through the validator. If it breaks a rule, Claude gets the exact problems and one chance to fix them. After that, the rule engine takes over.</p>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[['AI proposals', o?.guard.aiProposals, 'text-ai'], ['Blocked', o?.guard.aiRejected, 'text-bad'], ['Fixed by AI', o?.guard.correctedByAI, 'text-warn']].map(([k, v, c]) => (
            <div key={k} className="rounded-xl border border-line bg-panel2 py-3"><p className={`num text-2xl font-bold ${c}`}>{v ?? 0}</p><p className="text-[11px] text-faint">{k}</p></div>
          ))}
        </div>
      </section>

      <Panel className="lg:col-span-7" title="What the validator checks, every time" icon={ShieldCheck}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {CHECKS.map(([t, d]) => (
            <li key={t} className="rounded-xl border border-line bg-panel2 p-3">
              <p className="flex items-start gap-2 text-sm font-medium text-ink"><span className="text-ok">✓</span>{t}</p>
              <p className="mt-1 pl-5 text-xs text-muted">{d}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="lg:col-span-4" title="Most common catches" icon={ShieldAlert} info="Which rules the AI's first proposals broke most often. Useful for improving the prompt, or for spotting a rule that's too tight.">
        {vc.length === 0 ? <Empty icon={Sparkles} title="No catches yet">Run a campaign with AI on. Every blocked proposal appears here.</Empty> : (
          <ul className="space-y-3">
            {vc.map(([code, n]) => (
              <li key={code}>
                <div className="mb-1 flex justify-between text-xs"><span className="text-ink">{VIOLATION[code] || code}</span><b className="num text-bad">{n}</b></div>
                <div className="h-2 rounded-full bg-panel2"><div className="h-full rounded-full bg-bad" style={{ width: `${(n / maxV) * 100}%`, boxShadow: '0 0 10px var(--bad)' }} /></div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="space-y-4 lg:col-span-8">
        <p className="label">The wall: AI proposals the guardrail stopped</p>
        {!caught ? <div className="panel scanline h-32" /> : caught.length === 0 ? (
          <div className="panel"><Empty icon={ShieldCheck} title="Clean so far">No AI proposal has broken a rule yet. Try lowering a category limit on the Rules page, then launch again with AI on.</Empty></div>
        ) : caught.map((d) => <DecisionCard key={d.id} d={d} onSelect={onSelect} />)}
      </div>
    </div>
  );
}
