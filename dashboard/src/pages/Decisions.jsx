import { useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { useApi } from '../api.jsx';
import { Empty } from '../components/ui.jsx';
import DecisionCard from '../components/DecisionCard.jsx';

const FILTERS = [
  ['', 'All'], ['status=sent', 'Sent'], ['status=blocked', 'Blocked'], ['status=holdout', 'Control group'], ['status=skipped', 'Skipped'], ['telegram=1', 'Telegram only'],
  ['trigger=cart_abandoned', '🛒 Cart'], ['trigger=browse_abandoned', '👀 Browsed'], ['trigger=win_back', '💔 Win-back'], ['trigger=points_expiring', '⏳ Points'],
];

export default function Decisions({ onSelect }) {
  const [filter, setFilter] = useState('');
  const { data } = useApi(`/decisions?limit=60${filter ? `&${filter}` : ''}`, { deps: [filter] });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([f, label]) => (
          <button key={label} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1.5 text-xs transition ${filter === f ? 'border-ok/60 bg-ok/10 text-ok' : 'border-line-strong bg-panel2 text-muted hover:text-ink'}`}>{label}</button>
        ))}
        <p className="ml-auto text-xs text-muted">Every decision shows the customer signals, the AI's reasoning, each guardrail check, and the exact message sent.</p>
      </div>
      {!data ? <div className="panel scanline h-40" /> : data.length === 0 ? (
        <div className="panel"><Empty icon={MessagesSquare} title="No decisions yet">Launch a campaign or ask a classmate to try the bot.</Empty></div>
      ) : (
        <div className="grid gap-4 2xl:grid-cols-2">{data.map((d) => <DecisionCard key={d.id} d={d} onSelect={onSelect} />)}</div>
      )}
    </div>
  );
}
