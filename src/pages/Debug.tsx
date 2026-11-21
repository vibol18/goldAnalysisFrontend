import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Disclaimer from '../components/Disclaimer';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { CandlesResponse, Concept, ConceptsResponse } from '../types';

const TIMEFRAMES = ['15m', '1h', '4h', '1D'] as const;
const NO_CONCEPTS: Concept[] = [];

function fmtNum(n: number | null | undefined) {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(2);
}

function metaPreview(meta: Record<string, unknown> | undefined) {
  if (!meta || Object.keys(meta).length === 0) return '—';
  let full: string;
  try {
    full = JSON.stringify(meta);
  } catch {
    return '—';
  }
  return full.length > 140 ? `${full.slice(0, 140)}…` : full;
}

function toneForDirection(direction: string) {
  if (direction === 'bullish') return 'text-emerald-400';
  if (direction === 'bearish') return 'text-red-400';
  return 'text-slate-400';
}

/** Debug view: every detection ending on the latest candle of the chosen timeframe. */
export default function Debug() {
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>('15m');
  const concepts = usePolling<ConceptsResponse>(
    () => api.concepts(timeframe),
    30_000,
    [timeframe],
  );
  const candles = usePolling<CandlesResponse>(
    () => api.candles(timeframe),
    30_000,
    [timeframe],
  );

  const conceptData = concepts.data?.timeframe === timeframe ? concepts.data : null;
  const candleData = candles.data?.timeframe === timeframe ? candles.data : null;

  const all = conceptData?.concepts ?? NO_CONCEPTS;

  const latestCandleMs = useMemo(() => {
    const times = candleData?.candles?.time ?? [];
    if (!times.length) return null;
    const last = times[times.length - 1];
    return typeof last === 'number' && Number.isFinite(last) ? last * 1000 : null;
  }, [candleData]);

  const targetMs = useMemo(() => {
    if (latestCandleMs != null) return latestCandleMs;
    const ends = all
      .map((c) => (c.end_time ? Date.parse(c.end_time) : NaN))
      .filter((t) => Number.isFinite(t));
    return ends.length ? Math.max(...ends) : null;
  }, [latestCandleMs, all]);

  const detections = useMemo(() => {
    if (targetMs == null) return all;
    const scored = all.map((concept) => ({
      concept,
      diff: concept.end_time
        ? Math.abs(Date.parse(concept.end_time) - targetMs)
        : Number.POSITIVE_INFINITY,
    }));
    const best = scored.reduce(
      (min, entry) => Math.min(min, entry.diff),
      Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(best)) return all;
    return scored.filter((entry) => entry.diff <= best + 1000).map((entry) => entry.concept);
  }, [all, targetMs]);

  const detectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const concept of detections) {
      counts[concept.category] = (counts[concept.category] ?? 0) + 1;
    }
    return counts;
  }, [detections]);

  const byCategory = conceptData?.by_category ?? {};
  const stale = conceptData?.stale ?? false;
  const error = concepts.error ?? conceptData?.error;
  const candleError = candles.error ?? candleData?.error;

  return (
    <div className="space-y-4">
      <Disclaimer className="text-center" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Detection debug · XAU/USD</h1>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Latest candle {targetMs != null ? new Date(targetMs).toLocaleString() : 'unknown'} ·{' '}
            {timeframe}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              className={`btn text-xs ${tf === timeframe ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
          <Link to="/" className="btn-ghost text-xs">
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card">
          <span className="label">Total detections</span>
          <span className="text-xl font-bold text-white">
            {conceptData?.count ?? all.length}
          </span>
        </div>
        <div className="card">
          <span className="label">On latest candle</span>
          <span className="text-xl font-bold text-gold">{detections.length}</span>
        </div>
        <div className="card">
          <span className="label">Categories</span>
          <span className="text-xl font-bold text-white">{Object.keys(byCategory).length}</span>
        </div>
        <div className="card">
          <span className="label">Data</span>
          <span
            className={`text-sm font-bold ${
              error || candleError ? 'text-red-400' : stale ? 'text-amber-300' : 'text-emerald-400'
            }`}
          >
            {error || candleError ? 'ERROR' : stale ? 'STALE' : 'LIVE'}
          </span>
        </div>
      </div>

      {error && <div className="card text-red-400 text-xs">{error}</div>}
      {candleError && (
        <div className="card text-amber-300 text-xs">Candles: {candleError}</div>
      )}
      {concepts.loading && !conceptData && (
        <div className="card animate-pulse text-slate-500 text-sm">Loading detections…</div>
      )}

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-white">Counts by category</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(detectionCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => (
              <span
                key={category}
                className="rounded bg-white/5 px-2 py-1 text-[11px] text-slate-300"
              >
                {category.replace(/_/g, ' ')}{' '}
                <span className="font-mono text-gold">{count}</span>
              </span>
            ))}
          {Object.keys(detectionCounts).length === 0 && (
            <span className="text-xs text-slate-500">None on this candle.</span>
          )}
        </div>
        {Object.keys(byCategory).length > 0 && (
          <p className="mt-2 text-[10px] text-slate-500">
            Session totals:{' '}
            {Object.entries(byCategory)
              .map(([key, value]) => `${key.replace(/_/g, ' ')} ${value}`)
              .join(' · ')}
          </p>
        )}
      </div>

      <div className="card">
        <p className="text-[11px] leading-relaxed text-amber-200/70">
          Causality: every detection is computed only from candles that existed at or before its{' '}
          <code className="text-gold">end_time</code>. Future candles cannot change past detections —
          refreshing or switching timeframes only adds detections on newer candles, while the latest
          candle can still change until it closes.
        </p>
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full text-xs min-w-[1000px]">
          <thead>
            <tr className="text-left text-slate-400 border-b border-white/5">
              {[
                'Type',
                'Category',
                'Direction',
                'Status',
                'Strength',
                'Top ($/oz)',
                'Bottom ($/oz)',
                'Label / notes',
                'Meta',
              ].map((header) => (
                <th key={header} className="px-3 py-2 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detections.map((concept, i) => {
              const label =
                typeof concept.meta?.label === 'string' ? concept.meta.label : null;
              const preview = metaPreview(concept.meta);
              return (
                <tr
                  key={`${concept.type}-${concept.end_time ?? 'none'}-${i}`}
                  className="border-b border-white/5 hover:bg-white/[0.03]"
                >
                  <td className="px-3 py-1.5 font-mono text-slate-200">
                    {concept.type.replace(/_/g, ' ')}
                  </td>
                  <td className="px-3 py-1.5 text-slate-500">
                    {concept.category.replace(/_/g, ' ')}
                  </td>
                  <td className={`px-3 py-1.5 font-semibold ${toneForDirection(concept.direction)}`}>
                    {concept.direction}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400">{concept.status}</td>
                  <td className="px-3 py-1.5 font-mono text-gold">
                    {fmtNum(concept.strength)}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{fmtNum(concept.top)}</td>
                  <td className="px-3 py-1.5 font-mono">{fmtNum(concept.bottom)}</td>
                  <td className="max-w-[260px] px-3 py-1.5 text-slate-400">
                    {label && <span className="text-slate-200">{label} — </span>}
                    <span className="text-slate-500">{concept.notes || '—'}</span>
                  </td>
                  <td
                    className="max-w-[220px] truncate px-3 py-1.5 font-mono text-[10px] text-slate-500"
                    title={preview === '—' ? undefined : JSON.stringify(concept.meta)}
                  >
                    {preview}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {detections.length === 0 && !concepts.loading && (
          <div className="p-6 text-slate-500 text-sm">
            No detections on this candle for {timeframe}.
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-500 text-center">
        Educational analysis only. Not financial advice. Signals can be wrong. Never risk money
        you can&apos;t afford to lose.
      </p>
    </div>
  );
}
