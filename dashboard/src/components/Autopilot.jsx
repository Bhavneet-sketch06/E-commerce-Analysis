import { useEffect, useState } from 'react';
import { Zap, Loader2, Play } from 'lucide-react';
import { api, useApi } from '../api.jsx';
import { ago, TRIGGER } from '../format.js';
import { Button, Panel } from './ui.jsx';

function Countdown({ to }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!to) return null;
  const s = Math.max(0, Math.round((Date.parse(to) - Date.now()) / 1000));
  return <span className="num">{s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`}</span>;
}

const ORDER = ['cart_abandoned', 'browse_abandoned', 'win_back', 'points_expiring'];

export default function Autopilot({ go }) {
  const { data, reload } = useApi('/autopilot');
  const [busy, setBusy] = useState(false);
  const scan = async () => { setBusy(true); try { await api('/autopilot/scan', { method: 'POST' }); reload(); } finally { setBusy(false); } };
  const on = data?.rules?.enabled && data?.running;
  return (
    <Panel title="Autopilot: when to reach out" icon={Zap}
      info="The engine checks every customer every few minutes and acts on the right moment by itself: a cart left behind, a product they keep viewing, a regular who has gone quiet, points about to expire. Each moment still goes through the targeting, the rules and the guardrail."
      action={<Button className="!py-1 text-xs" onClick={scan} disabled={busy || !data?.rules?.enabled}>{busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Scan now</Button>}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className={`flex items-center gap-1.5 font-semibold ${on ? 'text-ok' : 'text-warn'}`}>{on ? <span className="live-dot" /> : <span className="h-2 w-2 rounded-full bg-warn" />}{on ? 'Watching' : data?.rules?.enabled === false ? 'Paused in rules' : 'Starting…'}</span>
        {data?.lastResult?.quietHours && <span className="text-info">🌙 Quiet hours: due moments wait until the morning</span>}
        {data?.lastScanAt && <span>last scan {ago(data.lastScanAt)}</span>}
        {on && data?.nextScanAt && <span>next in <Countdown to={data.nextScanAt} /></span>}
        <span><b className="num text-ink">{data?.expiredIgnored ?? 0}</b> unanswered offers counted as ignored</span>
        <button onClick={() => go('rules')} className="ml-auto text-ok hover:underline">Edit timing rules →</button>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {ORDER.map((k) => {
          const t = data?.byTrigger?.[k] || {};
          const enabled = data?.rules?.[{ cart_abandoned: 'cartAbandoned', browse_abandoned: 'browseAbandoned', win_back: 'winBack', points_expiring: 'pointsExpiring' }[k]]?.enabled;
          return (
            <div key={k} className={`rounded-xl border p-3 ${enabled ? 'border-line bg-panel2' : 'border-line bg-panel2/30 opacity-60'}`}>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink"><span className="text-base">{TRIGGER[k].emoji}</span>{TRIGGER[k].label}</p>
              <p className="num mt-1 text-2xl font-bold">{t.fired || 0}<span className="ml-1 text-xs font-normal text-muted">moments</span></p>
              <p className="text-[11px] text-muted">{t.sent || 0} sent · {t.blocked || 0} blocked · {t.holdout || 0} control</p>
              <p className="text-[11px] text-ok">{t.purchased || 0} bought after</p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
