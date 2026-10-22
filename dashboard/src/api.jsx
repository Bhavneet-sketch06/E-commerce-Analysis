import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { data, status: res.status });
  return data;
}

// Live feed: one EventSource shared by the whole app. `tick` changes whenever something happens,
// so pages can refetch.
const LiveContext = createContext({ events: [], tick: 0, connected: false });
export const useLive = () => useContext(LiveContext);

export function LiveProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [tick, setTick] = useState(0);
  const [connected, setConnected] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    let es;
    let retry;
    const connect = () => {
      es = new EventSource('/api/live');
      es.onopen = () => setConnected(true);
      es.onerror = () => { setConnected(false); es.close(); retry = setTimeout(connect, 3000); };
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data);
        ev.receivedAt = Date.now();
        ev.key = `${ev.receivedAt}-${Math.random()}`;
        if (ev.kind !== 'decision_update') setEvents((prev) => [ev, ...prev].slice(0, 80));
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setTick((t) => t + 1), 500);
      };
    };
    connect();
    return () => { es?.close(); clearTimeout(retry); };
  }, []);

  return <LiveContext.Provider value={{ events, tick, connected }}>{children}</LiveContext.Provider>;
}

// Fetch helper that refetches on live ticks (optionally).
export function useApi(path, { live = true, deps = [] } = {}) {
  const { tick } = useLive();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    if (!path) return;
    api(path).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [path]);
  useEffect(load, [load, live ? tick : 0, ...deps]);
  return { data, error, reload: load };
}
