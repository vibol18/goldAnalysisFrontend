import { useState } from 'react';
import Disclaimer from '../components/Disclaimer';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { CandleCheckResponse } from '../types';

const TIMEFRAMES = ['15m', '1h', '4h', '1D'] as const;

function fmt(value: number) {
  return value.toFixed(2);
}

export default function CandleCheck() {
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>('1h');
  const result = usePolling<CandleCheckResponse>(
    () => api.candleCheck(timeframe),
    30_000,
    [timeframe],
  );
  const data = result.data?.timeframe === timeframe ? result.data : null;
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <Disclaimer className="text-center" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Candle Check</h1>
          <p className="text-[11px] text-slate-500">Last 50 candles · active data series</p>
        </div>
        <div className="flex gap-1.5">
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

      {result.error && <div className="card text-xs text-red-400">{result.error}</div>}
      {meta && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Status', meta.status],
            ['Source', meta.source],
            ['Price side', meta.price_side.toUpperCase()],
            ['Symbol', meta.symbol],
            ['Broker', meta.broker || '—'],
            ['Server', meta.server || '—'],
            ['Digits', meta.digits == null ? '—' : String(meta.digits)],
            ['UTC offset', meta.timezone_offset_seconds == null ? '—' : `${meta.timezone_offset_seconds}s`],
            ['Stored in', meta.storage_timezone],
            ['Display zone', meta.display_timezone],
          ].map(([label, value]) => (
            <div className="card" key={label}>
              <span className="label">{label}</span>
              <span className="text-sm font-semibold text-white">{value}</span>
            </div>
          ))}
        </div>
      )}

      {meta && (
        <div className="card text-xs text-slate-300">
          <span className="text-slate-500">Higher timeframe building:</span>{' '}
          <span className="font-mono text-gold">{meta.higher_timeframe_build}</span>
        </div>
      )}

      {data && data.missing_bars.length > 0 && (
        <div className="card text-xs text-amber-300">
          Possible missing bars: {data.missing_bars.join(', ')}
        </div>
      )}

      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="border-b border-white/5 text-left text-slate-400">
              {['UTC', 'Local', 'Open', 'High', 'Low', 'Close', 'Tick volume'].map((heading) => (
                <th key={heading} className="px-3 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...data?.candles ?? []].reverse().map((candle) => (
              <tr key={candle.utc} className="border-b border-white/5">
                <td className="px-3 py-1.5 font-mono text-slate-300">{candle.utc}</td>
                <td className="px-3 py-1.5 font-mono text-slate-300">{candle.local}</td>
                <td className="px-3 py-1.5 font-mono">{fmt(candle.open)}</td>
                <td className="px-3 py-1.5 font-mono">{fmt(candle.high)}</td>
                <td className="px-3 py-1.5 font-mono">{fmt(candle.low)}</td>
                <td className="px-3 py-1.5 font-mono text-gold">{fmt(candle.close)}</td>
                <td className="px-3 py-1.5 font-mono">{candle.volume}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.candles.length === 0 && (
          <div className="p-6 text-sm text-slate-500">No candles available.</div>
        )}
      </div>
    </div>
  );
}
