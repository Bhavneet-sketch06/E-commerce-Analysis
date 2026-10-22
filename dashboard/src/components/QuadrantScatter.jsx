import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ReferenceArea, ReferenceLine, Cell } from 'recharts';
import { QUAD, pct } from '../format.js';

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const c = payload[0].payload;
  return (
    <div className="rounded-lg border border-line-strong bg-panel2 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-ink">{c.name} {c.telegram && <span className="text-info">· Telegram</span>}</p>
      <p className="text-muted">{c.segment} · {c.city}</p>
      <p className={`mt-1 ${QUAD[c.quadrant].tw}`}>{QUAD[c.quadrant].label}</p>
      <p className="num mt-1 text-muted">buys anyway {pct(c.pBase)} · offer adds {(c.uplift * 100).toFixed(1)} pts</p>
    </div>
  );
}

export default function QuadrantScatter({ rows = [], targeting = { persuadableMinUplift: 0.07, sureThingMinBase: 0.3 }, onSelect, height = 320, highlight }) {
  const data = rows.map((r) => ({ ...r, x: Math.min(r.pBase, 0.95), y: Math.max(-0.12, Math.min(r.uplift, 0.3)), z: r.telegram ? 140 : 36 }));
  const yT = targeting.persuadableMinUplift;
  const xT = targeting.sureThingMinBase;
  const label = (text, color) => ({ value: text, position: 'insideTopLeft', fill: color, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, offset: 8 });
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
          <ReferenceArea x1={0} x2={1} y1={yT} y2={0.32} fill="var(--ok)" fillOpacity={0.06} stroke="none" label={label('PERSUADABLE', 'var(--ok)')} />
          <ReferenceArea x1={xT} x2={1} y1={0} y2={yT} fill="var(--info)" fillOpacity={0.06} stroke="none" label={label('SURE THING', 'var(--info)')} />
          <ReferenceArea x1={0} x2={xT} y1={0} y2={yT} fill="var(--idle)" fillOpacity={0.05} stroke="none" label={label('LOST CAUSE', 'var(--idle)')} />
          <ReferenceArea x1={0} x2={1} y1={-0.13} y2={0} fill="var(--bad)" fillOpacity={0.06} stroke="none" label={{ ...label('DO NOT DISTURB', 'var(--bad)'), position: 'insideBottomLeft' }} />
          <ReferenceLine y={yT} stroke="var(--ok)" strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          <ReferenceLine x={xT} stroke="var(--info)" strokeDasharray="4 4" strokeOpacity={0.5} />
          <XAxis type="number" dataKey="x" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} stroke="var(--faint)" fontSize={10} tickLine={false}
            label={{ value: 'Chance they buy anyway →', position: 'insideBottom', offset: -10, fill: 'var(--muted)', fontSize: 11 }} />
          <YAxis type="number" dataKey="y" domain={[-0.13, 0.32]} tickFormatter={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`} stroke="var(--faint)" fontSize={10} tickLine={false} width={36}
            label={{ value: 'Extra chance from an offer (pts) →', angle: -90, position: 'insideLeft', offset: 12, fill: 'var(--muted)', fontSize: 11, dy: 90 }} />
          <ZAxis type="number" dataKey="z" range={[20, 160]} />
          <Tooltip content={<Tip />} cursor={{ strokeDasharray: '3 3', stroke: 'var(--line-strong)' }} />
          <Scatter data={data} onClick={(p) => onSelect?.(p.id ?? p.payload?.id)} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.id} fill={QUAD[d.quadrant].color} fillOpacity={highlight && highlight !== d.quadrant ? 0.12 : d.telegram ? 1 : 0.65}
                stroke={d.telegram ? 'var(--ink)' : 'none'} strokeWidth={d.telegram ? 1.5 : 0} cursor="pointer" />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
