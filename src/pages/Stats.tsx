import { useState } from 'react';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { useLiveEvent, useLiveStream } from '../lib/liveStream';
import Disclaimer from '../components/Disclaimer';
import type { StatBlock, StatGroup, StatsResults } from '../types';

const SOURCES = [
  { key: 'backtest', label: 'Backtest', note: 'Historical simulation' },
  { key: 'paper', label: 'Paper', note: 'Practice trades' },
  { key: 'live', label: 'Live', note: 'Recorded signals' },
] as const;

function pct(value: number | undefined) {
  return `${(value ?? 0).toFixed(value !== undefined && Math.abs(value) < 10 ? 2 : 1)}%`;
}

function SourceCard({ label, note, block }: { label: string; note: string; block: StatBlock }) {
  const cells: { label: string; value: string; hint?: string }[] = [
    { label: 'Win rate', value: pct(block.win_rate) },
    { label: 'Profit factor', value: (block.profit_factor ?? 0).toFixed(2) },
    { label: 'Expectancy', value: `${(block.expectancy ?? 0).toFixed(3)}%` },
    { label: 'Max drawdown', value: pct(block.max_drawdown_pct) },
    { label: 'Trades', value: String(block.trades ?? 0) },
    { label: 'Total return', value: pct(block.total_pct) },
  ];
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-white">{label}</h2>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{note}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-lg bg-white/[0.03] px-3 py-2" title={cell.hint}>
            <span className="label">{cell.label}</span>
            <span className="block font-mono text-base font-semibold text-gold">{cell.value}</span>
          </div>
        ))}
      </div>
      {block.sample_note && (
        <p className="text-[11px] text-slate-500 leading-snug">{block.sample_note}</p>
      )}
    </div>
  );
}

function GroupTable({
  title,
  rows,
}: {
  title: string;
  rows: { source: string; groups: Record<string, StatGroup> }[];
}) {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.groups)))).sort();
  return (
    <div className="card overflow-x-auto">
      <h2 className="text-base font-bold text-white mb-3">{title}</h2>
      {keys.length === 0 ? (
        <p className="text-sm text-slate-500">No resolved results yet.</p>
      ) : (
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-slate-500 uppercase tracking-wider text-[10px] text-left">
              <th className="py-2 pr-3">{title.replace(' by ', ' ')}</th>
              {SOURCES.map((s) => <th key={s.key} className="py-2 pr-3">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key} className="border-t border-white/5">
                <td className="py-2 pr-3 font-medium text-slate-300">{key.replace(/_/g, ' ')}</td>
                {rows.map((row) => {
                  const g = row.groups[key];
                  return (
                    <td key={row.source} className="py-2 pr-3 font-mono text-slate-400">
                      {g ? `${g.trades} · ${g.win_rate.toFixed(0)}% · PF ${g.profit_factor.toFixed(2)}` : '—'}
                      {g && (
                        <span className="block text-[10px] text-slate-600">
                          expect {g.expectancy.toFixed(3)}% · DD {pct(g.max_drawdown_pct)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Side-by-side real results for backtest, paper and live signals. */
export default function Stats() {
  const [years, setYears] = useState(5);
  const { data, error, loading, reload } = usePolling<StatsResults>(
    () => api.statsResults(years), 0, [years],
  );
  const { status } = useLiveStream();
  useLiveEvent((event) => {
    if (event.type === 'signal' || event.type === 'signal_result') reload();
  }, [reload]);

  return (
    <section className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Performance statistics</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real, recorded results. Backtest, paper and live shown side by side.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] uppercase tracking-wider ${status.state === 'live' ? 'text-emerald-400' : 'text-amber-400'}`}>
            {status.state === 'live' ? 'LIVE' : 'STALE'}
          </span>
          <label className="label">Window</label>
          <select className="input" value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {[1, 3, 5, 10].map((y) => <option key={y} value={y}>{y}y</option>)}
          </select>
          <button className="btn-ghost" onClick={reload} type="button">Refresh</button>
        </div>
      </div>

      {error && <div className="card border-red-500/30 text-sm text-red-300">{error}</div>}
      {loading && !data && <div className="card text-sm text-slate-400">Loading statistics…</div>}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SOURCES.map((s) => (
              <SourceCard key={s.key} label={s.label} note={s.note} block={data[s.key]} />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GroupTable
              title="Setup"
              rows={SOURCES.map((s) => ({ source: s.label, groups: data[s.key].by_setup ?? {} }))}
            />
            <GroupTable
              title="Session"
              rows={SOURCES.map((s) => ({ source: s.label, groups: data[s.key].by_session ?? {} }))}
            />
          </div>
          <Disclaimer />
        </>
      )}
    </section>
  );
}
