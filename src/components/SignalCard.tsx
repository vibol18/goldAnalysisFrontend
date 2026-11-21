import type { Signal } from '../types';

interface Props {
  signal: Signal | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

const ACTION_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  BUY: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', ring: 'ring-emerald-500/40' },
  SELL: { bg: 'bg-red-500/15', text: 'text-red-400', ring: 'ring-red-500/40' },
  HOLD: { bg: 'bg-slate-500/15', text: 'text-slate-300', ring: 'ring-slate-500/40' },
};

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className={`font-mono text-sm ${accent ?? 'text-white'}`}>{value}</span>
    </div>
  );
}

/** Gold (XAU/USD) BUY/SELL/HOLD card with confidence and entry/SL/TP levels. */
export default function SignalCard({ signal, loading, error, onRefresh }: Props) {
  if (error) {
    return (
      <div className="card border-red-500/30">
        <p className="text-red-400 text-sm">{error}</p>
        {onRefresh && (
          <button className="btn-ghost mt-3" onClick={onRefresh}>
            Retry
          </button>
        )}
      </div>
    );
  }
  if (!signal || loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-20 bg-white/5 rounded-lg" />
        <div className="h-4 w-2/3 bg-white/5 rounded mt-3" />
      </div>
    );
  }
  if (!signal.action || signal.error) {
    return (
      <div className="card border-amber-500/30 bg-amber-500/5">
        <p className="text-sm font-semibold text-amber-300">Signal unavailable</p>
        <p className="mt-1 text-xs text-amber-200/80">
          {signal.error ??
            'Live XAU/USD data is unavailable, so no signal can be calculated.'}
        </p>
        {onRefresh && (
          <button className="btn-ghost mt-3" onClick={onRefresh}>
            Retry
          </button>
        )}
      </div>
    );
  }

  const style = ACTION_STYLES[signal.action] ?? ACTION_STYLES.HOLD;
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ml = signal.ml_probability;

  return (
    <div className={`card ring-1 ${style.ring} ${style.bg}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className={`text-4xl font-black tracking-tight ${style.text}`}>
              {signal.action}
            </span>
            <span className="rounded bg-gold/15 px-2 py-1 text-xs font-bold text-gold">
              GRADE {signal.grade ?? '—'}
            </span>
            <div className="flex flex-col">
              <span className="label">Confidence</span>
              <span className="text-xl font-bold text-white">{signal.confidence.toFixed(1)}%</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            XAU/USD gold · {signal.timeframe} · price {fmt(signal.price)} $/oz ·{' '}
            {signal.data_synthetic
              ? '⚠ fallback data'
              : signal.data_stale
                ? '⚠ cached data (market data delayed)'
                : 'live market data'}
          </p>
        </div>
        <div className="text-right">
          <div className="label">Rule score</div>
          <div className="font-mono text-sm text-white">
            {signal.rule_score > 0 ? '+' : ''}
            {signal.rule_score.toFixed(2)}
            {ml !== null && ml !== undefined && (
              <span className="ml-2 text-slate-400">
                ML {Math.round(ml * 100)}%
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-3 border-t border-white/5">
        <Row label="Entry ($/oz)" value={fmt(signal.entry)} />
        <Row label="Stop loss ($/oz)" value={fmt(signal.stop_loss)} accent="text-red-400" />
        <Row label="Take profit 1 ($/oz)" value={fmt(signal.take_profit1)} accent="text-emerald-400" />
        <Row label="Take profit 2 ($/oz)" value={fmt(signal.take_profit2)} accent="text-emerald-400" />
        {signal.take_profit3 != null && (
          <Row label="Take profit 3 ($/oz)" value={fmt(signal.take_profit3)} accent="text-emerald-400" />
        )}
        <Row label="Risk : Reward" value={`1 : ${signal.risk_reward.toFixed(1)}`} />
        <Row label="ATR ($/oz)" value={fmt(signal.atr)} />
      </div>

      <div className="mt-3 text-sm text-slate-300 leading-relaxed">
        <p className="font-medium text-white/90">
          {signal.explanation.narrative ?? signal.explanation.summary}
        </p>
        {signal.invalidation && (
          <p className="mt-1 text-[11px] text-amber-200/70">
            Invalidation: {signal.invalidation}
          </p>
        )}
        <ul className="mt-1.5 space-y-1 list-disc list-inside text-slate-400 text-xs">
          {signal.explanation.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-[10px] text-amber-200/60">
        ⚠ Signals can be wrong — always manage risk. Not financial advice.
      </p>
    </div>
  );
}
