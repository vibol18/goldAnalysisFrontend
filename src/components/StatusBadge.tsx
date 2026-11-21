import { memo } from 'react';
import { useLiveStream } from '../lib/liveStream';

function StatusBadgeBase() {
  const { status, lastTick } = useLiveStream();
  const { state, lastUpdate, attempts } = status;

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
  const title = `Stream ${state}${ago !== null ? ` · last update ${ago}s ago` : ''}${
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
      {ago !== null && state === 'stale' && <span className="font-normal">{ago}s</span>}
    </span>
  );
}

export default memo(StatusBadgeBase);
