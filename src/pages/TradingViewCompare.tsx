import { useState } from 'react';
import Disclaimer from '../components/Disclaimer';
import { api } from '../api/client';
import type { TradingViewComparisonResponse } from '../types';

const TIMEFRAMES = ['15m', '1h', '4h', '1D'] as const;

export default function TradingViewCompare() {
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>('1h');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<TradingViewComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [basisEnabled, setBasisEnabled] = useState(false);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api.compareTradingView(timeframe, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  }

  const diffs = result?.differences ?? [];
  const values = diffs.map((item) => item.close_diff);
  const min = values.length ? Math.min(...values, -0.2) : -0.2;
  const max = values.length ? Math.max(...values, 0.2) : 0.2;
  const range = Math.max(0.01, max - min);
  const points = values.map((value, index) =>
    `${values.length === 1 ? 50 : (index / (values.length - 1)) * 100},${80 - ((value - min) / range) * 70}`,
  ).join(' ');

  const medianClose = result?.metrics.close?.median ?? 0;

  return (
    <div className="space-y-4">
      <Disclaimer className="text-center" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Compare with TradingView</h1>
          <p className="text-[11px] text-slate-500">
            Upload only a CSV chart export for FOREXCOM:XAUUSD
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
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-xs text-slate-300"
        />
        <button type="button" className="btn-active text-xs" disabled={!file || loading} onClick={upload}>
          {loading ? 'Comparing…' : 'Compare'}
        </button>
      </div>

      {error && <div className="card text-xs text-red-400">{error}</div>}
      {result && (
        <>
          {basisEnabled && (
            <div className="card text-xs text-amber-300">
              Prices adjusted by {medianClose >= 0 ? '+' : ''}{medianClose.toFixed(2)} to match reference
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="card"><span className="label">Matched</span><span className="text-xl text-white">{result.matched}</span></div>
            {(['open', 'high', 'low', 'close'] as const).map((field) => (
              <div className="card" key={field}>
                <span className="label">{field} median difference</span>
                <span className="text-sm font-mono text-gold">${result.metrics[field]?.median?.toFixed(2) ?? '—'}</span>
              </div>
            ))}
          </div>

          <div className="card text-xs">
            <p>Within $0.20: <span className="font-bold text-gold">{result.within_20cents}%</span></p>
            <p>Detected reference timeframe: <span className="font-mono">{result.detected_reference_timeframe}</span></p>
            <p>Source: <span className="font-mono">{result.source || 'none'}</span> · {result.source_status} · {result.price_side.toUpperCase()}</p>
          </div>

          <div className="card">
            <h2 className="text-sm font-semibold text-white">Diagnosis</h2>
            <p className="mt-1 text-xs text-amber-300">{result.diagnosis.likely_cause}</p>
            <p className="mt-1 text-xs text-slate-400">{result.diagnosis.suggestion}</p>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={basisEnabled} onChange={(event) => setBasisEnabled(event.target.checked)} />
              Enable optional basis offset (default off)
            </label>
          </div>

          {diffs.length > 0 && (
            <div className="card">
              <h2 className="mb-2 text-sm font-semibold text-white">Close difference over time</h2>
              <svg viewBox="0 0 100 90" className="h-48 w-full" preserveAspectRatio="none">
                <line x1="0" y1="45" x2="100" y2="45" stroke="#64748b" strokeDasharray="2 2" />
                <polyline points={points} fill="none" stroke="#eab308" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          )}

          <div className="card overflow-x-auto !p-0">
            <table className="w-full min-w-[760px] text-xs">
              <thead><tr className="border-b border-white/5 text-left text-slate-400">
                {['UTC candle open', 'App O', 'H', 'L', 'Close', 'Reference close', 'Max diff'].map((h) =>
                  <th key={h} className="px-3 py-2">{h}</th>)}
              </tr></thead>
              <tbody>{result.worst.map((row) => (
                <tr key={row.time} className="border-b border-white/5">
                  <td className="px-3 py-1.5 font-mono">{row.time}</td>
                  <td className="px-3 py-1.5">{row.open.toFixed(2)}</td>
                  <td className="px-3 py-1.5">{row.high.toFixed(2)}</td>
                  <td className="px-3 py-1.5">{row.low.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-gold">{row.close.toFixed(2)}</td>
                  <td className="px-3 py-1.5">{row.reference_close.toFixed(2)}</td>
                  <td className="px-3 py-1.5 font-mono text-red-300">${row.max_difference.toFixed(2)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
