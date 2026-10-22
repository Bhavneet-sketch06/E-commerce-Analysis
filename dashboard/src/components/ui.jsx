import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, animate } from 'framer-motion';
import { Info as InfoIcon, X } from 'lucide-react';

export function Panel({ title, icon: Icon, info, action, className = '', children, bodyClass = 'p-5' }) {
  return (
    <section className={`panel flex flex-col ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon size={15} className="shrink-0 text-muted" />}
            <h2 className="truncate text-[13px] font-semibold tracking-wide text-ink">{title}</h2>
            {info && <Info text={info} />}
          </div>
          {action}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Info({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      <button type="button" aria-label="What is this?" className="text-faint transition hover:text-ink"><InfoIcon size={13} /></button>
      <AnimatePresence>
        {open && (
          <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-lg border border-line-strong bg-panel2 p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-xl">
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Pill({ className = '', children }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}

export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), className = '' }) {
  const ref = useRef(null);
  const prev = useRef(0);
  useEffect(() => {
    const controls = animate(prev.current, value || 0, {
      duration: 0.9, ease: 'easeOut',
      onUpdate: (v) => { if (ref.current) ref.current.textContent = format(v); },
    });
    prev.current = value || 0;
    return () => controls.stop();
  }, [value]);
  return <span ref={ref} className={`num ${className}`}>{format(value || 0)}</span>;
}

export function Button({ variant = 'ghost', className = '', children, ...props }) {
  const styles = {
    primary: 'bg-ok text-[#04121a] hover:brightness-110 glow-ok font-semibold',
    ghost: 'border border-line-strong bg-panel2 text-ink hover:border-ok/60',
    danger: 'border border-bad/50 bg-bad/10 text-bad hover:bg-bad/20',
    ai: 'border border-ai/50 bg-ai/15 text-ai hover:bg-ai/25 font-semibold',
  };
  return (
    <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${checked ? 'border-ok/60 bg-ok/30' : 'border-line-strong bg-panel2'}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full transition ${checked ? 'translate-x-4 bg-ok' : 'translate-x-0.5 bg-faint'}`} />
    </button>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {Icon && <div className="mb-1 rounded-2xl border border-line bg-panel2 p-3 text-faint"><Icon size={22} /></div>}
      <p className="font-semibold text-ink">{title}</p>
      <div className="max-w-sm text-sm text-muted">{children}</div>
    </div>
  );
}

// Semicircle "fuel gauge" for budget use.
export function Gauge({ value, max, today, todayMax, size = 180 }) {
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const frac = Math.min(1, max ? value / max : 0);
  const tFrac = Math.min(1, todayMax ? today / todayMax : 0);
  const arc = (f, rad) => {
    const a = Math.PI * (1 - f);
    return `M ${cx - rad} ${cy} A ${rad} ${rad} 0 0 1 ${cx + rad * Math.cos(a)} ${cy - rad * Math.sin(a)}`;
  };
  const color = frac > 0.9 ? 'var(--bad)' : frac > 0.7 ? 'var(--warn)' : 'var(--ok)';
  return (
    <svg viewBox={`0 0 ${size} ${size / 2 + 16}`} className="w-full max-w-[220px]" role="img" aria-label={`Budget ${Math.round(frac * 100)}% used`}>
      <path d={arc(1, r)} stroke="var(--line)" strokeWidth="12" fill="none" strokeLinecap="round" />
      {frac > 0 && <motion.path d={arc(frac, r)} stroke={color} strokeWidth="12" fill="none" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />}
      <path d={arc(1, r - 17)} stroke="var(--line)" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7" />
      {tFrac > 0 && <path d={arc(tFrac, r - 17)} stroke="var(--info)" strokeWidth="4" fill="none" strokeLinecap="round" />}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const a = Math.PI * (1 - t);
        return <line key={t} x1={cx + (r + 9) * Math.cos(a)} y1={cy - (r + 9) * Math.sin(a)} x2={cx + (r + 4) * Math.cos(a)} y2={cy - (r + 4) * Math.sin(a)} stroke="var(--faint)" strokeWidth="1.5" />;
      })}
      <text x={cx} y={cy - 14} textAnchor="middle" className="num" fill="var(--ink)" fontSize="26" fontWeight="700">{Math.round(frac * 100)}%</text>
      <text x={cx} y={cy + 2} textAnchor="middle" fill="var(--muted)" fontSize="10" letterSpacing="1.5">BUDGET USED</text>
    </svg>
  );
}

export function Drawer({ open, onClose, children, width = 'max-w-2xl' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className={`fixed inset-y-0 right-0 z-50 flex w-full ${width} flex-col border-l border-line-strong bg-bg shadow-2xl`} initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 260 }}>
            <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 rounded-lg border border-line bg-panel p-1.5 text-muted hover:text-ink"><X size={16} /></button>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function Modal({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="panel w-full max-w-lg" initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink"><X size={18} /></button>
            </header>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Telegram-style message bubble preview.
export function TelegramBubble({ headline, message, coupon, compact = false }) {
  return (
    <div className="rounded-2xl rounded-tl-sm border border-[#2b5278]/40 bg-[#182533] p-3.5 text-[13px] leading-relaxed text-[#e9eef3] shadow-lg">
      <p className="font-bold">{headline}</p>
      <p className={`mt-1.5 text-[#d5dde6] ${compact ? 'line-clamp-3' : ''}`}>{message}</p>
      {coupon && <p className="mt-2 text-[12px]">🎟️ Code: <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[#7fd1ff]">{coupon}</span></p>}
      {!compact && (
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px] text-[#7fb7e8]">
          {['🛒 Claim', '🤔 Why this?', '🙅 Not now'].map((b) => <span key={b} className="rounded-lg bg-[#2b5278]/40 py-1.5">{b}</span>)}
        </div>
      )}
    </div>
  );
}
