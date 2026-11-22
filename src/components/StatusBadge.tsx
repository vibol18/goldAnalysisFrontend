import { memo } from 'react';
import { useLiveStream } from '../lib/liveStream';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import type { Overview } from '../types';

function StatusBadgeBase() {
  const { status, lastTick } = useLiveStream();
  const { state, lastUpdate, attempts } = status;
  const overview = usePolling<Overview>(() => api.overview(), 30_000, []);
  const live = usePolling(() => api.livePrice(), 5_000, []);
  const source = live.data?.source || overview.data?.meta?.source;
  const feedState = String(live.data?.state || '').toUpperCase();
  const verification = String(live.data?.verification?.state || '');
  const tickAge = live.data?.age_seconds;
  const bid = live.data?.bid;
  const ask = live.data?.ask;
  const sourceLabel = source === 'mt5'
    ? 'MT5'
    : source === 'twelvedata'
      ? 'Twelve Data'
      : source === 'oanda'
        ? 'OANDA'
      : source === 'rest'
        ? 'Spot REST'
        : source === 'yfinance' || source === 'yahoo-chart'
          ? 'Yahoo — approximate'
          : source || null;

  const config = {
    live: {
      label: 'LIVE',
      dot: 'bg-emerald-400 animate-pulse',
      cls: 'bg-emerald-500/15 text-emerald-400',
    },
    connecting: {
      label: 'CONNECTING…',
      dot: 'bg-sky-400',
      cls: 'bg-sky-500/15 text-sky-300',
    },
    reconnecting: {
      label: `RECONNECTING${attempts ? ` (${attempts})` : ''}…`,
      dot: 'bg-amber-400 animate-pulse',
      cls: 'bg-amber-500/15 text-amber-300',
    },
    stale: {
      label: 'STALE',
      dot: 'bg-orange-400',
      cls: 'bg-orange-500/15 text-orange-300',
    },
  }[state];

  const ago = lastUpdate ? Math.max(0, Math.round((Date.now() - lastUpdate) / 1000)) : null;
  const feedLabel = verification === 'UNVERIFIED'
    ? 'UNVERIFIED'
    : feedState === 'DELAYED' || feedState === 'STALE' ? feedState : null;
  const feedClass = feedLabel === 'UNVERIFIED' || feedLabel === 'STALE'
    ? 'bg-red-500/15 text-red-400'
    : 'bg-amber-500/15 text-amber-300';
  const title = `Stream ${state}${sourceLabel ? ` · ${sourceLabel}` : ''}${ago !== null ? ` · last update ${ago}s ago` : ''}${
    bid != null && ask != null ? ` · bid ${bid.toFixed(2)} / ask ${ask.toFixed(2)}` : ''
  }${tickAge != null ? ` · tick ${tickAge}s ago` : ''}${
    lastTick ? ` · XAU/USD ${lastTick.price.toFixed(2)} $/oz` : ''
  }`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${config.cls}`}
      title={title}
      role="status"
      aria-live="polite"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
      {sourceLabel && <span className="max-w-28 truncate font-normal">{sourceLabel}</span>}
      {ago !== null && state === 'stale' && <span className="font-normal">{ago}s</span>}
      {feedLabel && (
        <span className={`rounded px-1.5 py-0.5 ${feedClass}`}>{feedLabel}</span>
      )}
      {bid != null && ask != null && (
        <span className="font-mono font-normal">{bid.toFixed(2)}/{ask.toFixed(2)}</span>
      )}
      {tickAge != null && <span className="font-normal">{tickAge.toFixed(1)}s</span>}
    </span>
  );
}

export default memo(StatusBadgeBase);
