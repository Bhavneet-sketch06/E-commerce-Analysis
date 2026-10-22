import { useState } from 'react';
import { X } from 'lucide-react';

export function setIn(obj, path, value) {
  const next = structuredClone(obj);
  const keys = path.split('.');
  let node = next;
  for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]];
  node[keys[keys.length - 1]] = value;
  return next;
}

export function getIn(obj, path) {
  return path.split('.').reduce((n, k) => (n == null ? n : n[k]), obj);
}

// A number input that sits inside a sentence.
export function Num({ value, onChange, min, max, step = 1, prefix, suffix, width = 'w-16', error, label }) {
  return (
    <span className={`mx-0.5 inline-flex items-center rounded-lg border bg-panel2 px-1.5 align-baseline transition focus-within:border-ok ${error ? 'border-bad' : 'border-line-strong'}`}>
      {prefix && <span className="text-xs text-faint">{prefix}</span>}
      <input type="number" aria-label={label} value={value ?? ''} min={min} max={max} step={step}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className={`num ${width} bg-transparent py-0.5 text-center text-sm font-semibold text-ok outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`} />
      {suffix && <span className="text-xs text-faint">{suffix}</span>}
    </span>
  );
}

export function DateField({ value, onChange, label }) {
  return <input type="date" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="num mx-0.5 rounded-lg border border-line-strong bg-panel2 px-2 py-0.5 text-sm font-semibold text-ok outline-none focus:border-ok" />;
}

export function TextField({ value, onChange, label, className = 'w-44' }) {
  return <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`mx-0.5 rounded-lg border border-line-strong bg-panel2 px-2 py-0.5 text-sm font-semibold text-ok outline-none focus:border-ok ${className}`} />;
}

export function Chip({ on, onClick, children, tone = 'ok' }) {
  const tones = { ok: 'border-ok/50 bg-ok/15 text-ok', bad: 'border-bad/50 bg-bad/15 text-bad' };
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`rounded-full border px-2.5 py-1 text-xs transition ${on ? tones[tone] : 'border-line-strong bg-panel2 text-faint line-through decoration-faint/60 hover:text-muted'}`}>
      {children}
    </button>
  );
}

export function TagInput({ values, onChange, placeholder }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line-strong bg-panel2 p-2">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full border border-bad/40 bg-bad/10 px-2 py-0.5 text-xs text-bad">
          {v}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}><X size={11} /></button>
        </span>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add}
        placeholder={placeholder} className="min-w-32 flex-1 bg-transparent px-1 text-xs outline-none" />
    </div>
  );
}

export function Slider({ value, onChange, min, max, step = 1, format = (v) => v, label }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs"><span className="text-muted">{label}</span><b className="num text-sm text-ink">{format(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full" />
    </label>
  );
}
