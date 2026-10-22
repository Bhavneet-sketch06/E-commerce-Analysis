import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, MessagesSquare, ShieldCheck, SlidersHorizontal, FlaskConical, Moon, Sun, Rocket, Sparkles, Loader2 } from 'lucide-react';
import { api, LiveProvider, useApi, useLive } from './api.jsx';
import { Button, Modal, Toggle } from './components/ui.jsx';
import CustomerDrawer from './components/CustomerDrawer.jsx';
import Overview from './pages/Overview.jsx';
import Segments from './pages/Segments.jsx';
import Decisions from './pages/Decisions.jsx';
import Guardrail from './pages/Guardrail.jsx';
import Rules from './pages/Rules.jsx';
import Simulator from './pages/Simulator.jsx';

const PAGES = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, Comp: Overview },
  { id: 'segments', label: 'Segments', icon: Users, Comp: Segments },
  { id: 'decisions', label: 'Decisions', icon: MessagesSquare, Comp: Decisions },
  { id: 'guardrail', label: 'Guardrail', icon: ShieldCheck, Comp: Guardrail },
  { id: 'rules', label: 'Rules', icon: SlidersHorizontal, Comp: Rules },
  { id: 'simulator', label: 'Simulator', icon: FlaskConical, Comp: Simulator },
];

function useHashPage() {
  const read = () => (window.location.hash.replace('#/', '') || 'overview');
  const [page, setPage] = useState(read);
  useEffect(() => {
    const on = () => setPage(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [page, (p) => { window.location.hash = `/${p}`; }];
}

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('oe-theme', theme); } catch {}
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

function LaunchModal({ open, onClose, ai }) {
  const [limit, setLimit] = useState(40);
  const [useAI, setUseAI] = useState(ai);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { setUseAI(ai); }, [ai]);
  const go = async () => {
    setBusy(true); setResult(null);
    try { setResult(await api('/launch', { method: 'POST', body: { limit, useAI } })); } catch (e) { setResult({ error: e.message }); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Launch campaign">
      <div className="space-y-5">
        <p className="text-sm text-muted">The engine ranks customers by <b className="text-ink">expected extra profit</b> (uplift × basket × margin), then decides for each one. All Telegram testers are always included. Every offer passes the guardrail before it is sent.</p>
        <label className="block">
          <span className="flex justify-between text-sm"><span>Synthetic customers to target</span><b className="num">{limit}</b></span>
          <input type="range" min="10" max="200" step="10" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="mt-2 w-full" />
        </label>
        <div className="flex items-center justify-between rounded-xl border border-line bg-panel2 px-4 py-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium"><Sparkles size={14} className="text-ai" />Let Claude personalise offers</p>
            <p className="text-xs text-muted">{ai ? 'Slower and costs API credits. Off = the rule engine only (instant).' : 'No API key set: the rule engine only.'}</p>
          </div>
          <Toggle checked={useAI && ai} onChange={(v) => setUseAI(v)} label="Use AI" />
        </div>
        {result && (result.error ? <p className="text-sm text-bad">{result.error}</p> : (
          <p className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm">✅ Done: <b>{result.sent}</b> sent · {result.holdout} control · {result.blocked} blocked · {result.skipped} skipped</p>
        ))}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={go} disabled={busy}>{busy ? <><Loader2 size={15} className="animate-spin" /> Running… watch the live feed</> : <><Rocket size={15} /> Launch</>}</Button>
        </div>
      </div>
    </Modal>
  );
}

function Shell() {
  const [page, setPage] = useHashPage();
  const [theme, toggleTheme] = useTheme();
  const [customer, setCustomer] = useState(null);
  const [launch, setLaunch] = useState(false);
  const { connected } = useLive();
  const { data: meta } = useApi('/meta', { live: false });
  const { data: ov } = useApi('/overview');
  const current = PAGES.find((p) => p.id === page) || PAGES[0];
  const Page = current.Comp;

  return (
    <div className="min-h-screen pb-20 lg:pb-0 lg:pl-60">
      {/* Left rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-panel/80 backdrop-blur lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-ok/40 bg-ok/10 glow-ok">
            <div className="h-3 w-3 rounded-full bg-ok" />
            <div className="absolute inset-1.5 rounded-full border border-ok/50" />
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight tracking-wide">OFFER ENGINE</p>
            <p className="text-[11px] text-muted">Parvaaz Bazaar</p>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {PAGES.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setPage(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${page === id ? 'bg-ok/10 text-ok shadow-[inset_2px_0_0_var(--ok)]' : 'text-muted hover:bg-panel2 hover:text-ink'}`}>
              <Icon size={17} />{label}
              {id === 'guardrail' && ov?.guard?.aiRejected > 0 && <span className="num ml-auto rounded-md bg-bad/15 px-1.5 text-[11px] text-bad">{ov.guard.aiRejected}</span>}
            </button>
          ))}
        </nav>
        <div className="m-3 rounded-xl border border-line bg-panel2 p-3 text-xs text-muted">
          <p className="label mb-1 !text-[10px]">Population</p>
          <p><b className="num text-ink">{meta?.population ?? '…'}</b> customers · <b className="num text-info">{ov?.counts.telegramUsers ?? 0}</b> on Telegram</p>
          <p className="mt-1">Rules <b className="text-ink">v{ov?.ruleVersion?.version ?? '…'}</b></p>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{current.label}</h1>
            <p className="truncate text-xs text-muted">{ov?.campaign?.name ?? 'Campaign'} · {ov?.campaign?.startDate} → {ov?.campaign?.endDate}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className={`hidden items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wider sm:flex ${connected ? 'border-ok/40 text-ok' : 'border-warn/40 text-warn'}`}>
              {connected ? <span className="live-dot" /> : <span className="h-2 w-2 rounded-full bg-warn" />}{connected ? 'LIVE' : 'OFFLINE'}
            </span>
            <span className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] md:flex ${meta?.ai ? 'border-ai/40 text-ai' : 'border-line-strong text-muted'}`}>
              <Sparkles size={12} />{meta?.ai ? meta.model : 'Rules only'}
            </span>
            <button onClick={toggleTheme} aria-label="Toggle theme" className="rounded-xl border border-line-strong bg-panel2 p-2 text-muted hover:text-ink">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Button variant="primary" onClick={() => setLaunch(true)}><Rocket size={15} /><span className="hidden sm:inline">Launch campaign</span></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <Page onSelect={setCustomer} go={setPage} meta={meta} />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-panel/95 backdrop-blur lg:hidden">
        {PAGES.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setPage(id)} className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] ${page === id ? 'text-ok' : 'text-muted'}`}>
            <Icon size={18} />{label}
          </button>
        ))}
      </nav>

      <CustomerDrawer id={customer} onClose={() => setCustomer(null)} />
      <LaunchModal open={launch} onClose={() => setLaunch(false)} ai={!!meta?.ai} />
    </div>
  );
}

export default function App() {
  return <LiveProvider><Shell /></LiveProvider>;
}
