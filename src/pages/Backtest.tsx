import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import Disclaimer from '../components/Disclaimer';
import type { BacktestResult, ConceptBacktestResponse } from '../types';

function Metric({
  label,
  value,
  tone = 'text-white',
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="card" title={hint}>
      <span className="label">{label}</span>
      <span className={`text-xl font-bold font-mono ${tone}`}>{value}</span>
      {hint && <p className="text-[10px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'text-white',
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div title={hint}>
      <span className="label">{label}</span>
      <span className={`block text-lg font-bold font-mono ${tone}`}>{value}</span>
    </div>
  );
}

/** Backtest page: metrics, equity curve, trade list, honesty notes. */
export default function Backtest() {
  const [years, setYears] = useState(5);
  const [sideFilter, setSideFilter] = useState<'all' | 'short' | 'long'>('all');
  const { data, error, loading, reload } = usePolling<BacktestResult>(
    () => api.backtest(years),
    0, // run once per years selection
    [years],
  );
  const conceptBt = usePolling<ConceptBacktestResponse>(
    () => api.conceptBacktest(years),
    0,
    [years],
  );

  const drops = data?.by_side?.short;
  const longs = data?.by_side?.long;
  const filteredTrades = (data?.trade_list ?? []).filter(
    (t) => sideFilter === 'all' || t.side === sideFilter,
  );

  const equity = (data?.equity_curve ?? []).map((p) => ({
    t: p.t.slice(0, 10),
    equity: Math.round(p.equity),
  }));
  const tradeBars = filteredTrades.slice(-30).map((t, i) => ({
    i,
    pnl: t.pnl,
  }));

  return (
    <div className="space-y-4">
      <Disclaimer className="text-center" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-white">
          Gold strategy backtest{' '}
          <span className="text-slate-500 font-normal text-sm">
            — concept-driven XAU/USD strategy over {years}y of daily data
          </span>
        </h1>
        <div className="flex gap-1.5">
          {[1, 3, 5, 10].map((y) => (
            <button
              key={y}
              className={`btn text-xs ${years === y ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setYears(y)}
            >
              {y}y
            </button>
          ))}
          <button className="btn-ghost text-xs" onClick={() => void reload()}>
            ↻ Rerun
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="card animate-pulse text-slate-500 text-sm">
          Running backtest over {years} years of data… (first run takes a few seconds)
        </div>
      )}
      {error && <div className="card text-red-400 text-sm">{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Metric
              label="Win rate"
              value={`${data.win_rate.toFixed(1)}%`}
              tone={data.win_rate >= 50 ? 'text-emerald-400' : 'text-amber-400'}
              hint="Winning trades / total trades"
            />
            <Metric
              label="Profit factor"
              value={data.profit_factor.toFixed(2)}
              tone={data.profit_factor >= 1 ? 'text-emerald-400' : 'text-red-400'}
              hint="Gross profit / gross loss"
            />
            <Metric
              label="Max drawdown"
              value={`-${data.max_drawdown_pct.toFixed(1)}%`}
              tone="text-red-400"
              hint="Largest peak-to-trough equity decline"
            />
            <Metric
              label="Sharpe (ann.)"
              value={data.sharpe.toFixed(2)}
              tone={data.sharpe >= 0 ? 'text-emerald-400' : 'text-red-400'}
              hint="Risk-adjusted return, annualised"
            />
            <Metric
              label="Total return"
              value={`${data.total_return_pct >= 0 ? '+' : ''}${data.total_return_pct.toFixed(1)}%`}
              tone={data.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <Metric label="Trades" value={String(data.trades)} hint={`${data.bars} daily bars tested`} />
          </div>

          {/* drop (short) performance — trade the drops, not the rallies */}
          {drops && longs && (
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Drop (SELL) performance</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    How the strategy performed when it predicted a price drop and traded it short.
                  </p>
                </div>
                <span className="text-[10px] text-slate-500">
                  {drops.trades} drop trade{drops.trades === 1 ? '' : 's'} in this window
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Stat
                  label="Drop win rate"
                  value={`${drops.win_rate.toFixed(1)}%`}
                  tone={drops.win_rate >= 50 ? 'text-emerald-400' : 'text-amber-400'}
                  hint="Winning short trades / all short trades"
                />
                <Stat
                  label="Profit factor"
                  value={drops.profit_factor.toFixed(2)}
                  tone={drops.profit_factor >= 1 ? 'text-emerald-400' : 'text-red-400'}
                  hint="Gross profit / gross loss on short trades"
                />
                <Stat
                  label="Net PnL"
                  value={`${drops.total_pnl >= 0 ? '+' : ''}$${drops.total_pnl.toFixed(2)}`}
                  tone={drops.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  hint="Total profit/loss from drop trades"
                />
                <Stat
                  label="Avg / trade"
                  value={`${drops.avg_pnl >= 0 ? '+' : ''}$${drops.avg_pnl.toFixed(2)}`}
                  tone={drops.avg_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  hint="Average PnL per short trade"
                />
              </div>
              <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-slate-400">
                <div>
                  Drops: <span className="font-mono text-white">{drops.wins}W / {drops.losses}L</span>
                  {' · '}avg <span className="font-mono text-white">{drops.avg_pnl_pct.toFixed(3)}%</span>
                  {' · '}gross <span className="font-mono text-emerald-400">+${drops.gross_profit.toFixed(2)}</span>
                  {' / '}<span className="font-mono text-red-400">-${drops.gross_loss.toFixed(2)}</span>
                </div>
                <div>
                  Rallies (long): <span className="font-mono text-white">{longs.wins}W / {longs.losses}L</span>
                  {' · '}win rate <span className="font-mono text-white">{longs.win_rate.toFixed(1)}%</span>
                  {' · '}net <span className={`font-mono ${longs.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${longs.total_pnl.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* equity curve */}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-3">Equity curve ($100k start)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equity} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f5c518" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f5c518" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="t"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={(v: string) => v.slice(2)}
                    minTickGap={60}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    width={70}
                    domain={['auto', 'auto']}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1a1d26',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`$${v.toLocaleString()}`, 'Equity']}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#f5c518"
                    strokeWidth={2}
                    fill="url(#eq)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* recent trade PnL */}
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-white">
                  Last {tradeBars.length}{' '}
                  {sideFilter === 'short' ? 'drop (SELL)' : sideFilter === 'long' ? 'rally (BUY)' : ''}{' '}
                  trades (PnL $)
                </h3>
                <div className="flex gap-1">
                  {([
                    ['all', 'All'],
                    ['short', 'Drops (SELL)'],
                    ['long', 'Rallies (BUY)'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      className={`btn text-xs ${sideFilter === key ? 'btn-active' : 'btn-ghost'}`}
                      onClick={() => setSideFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tradeBars}>
                    <XAxis dataKey="i" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} width={60} />
                    <Tooltip
                      contentStyle={{
                        background: '#1a1d26',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => [`$${v.toFixed(2)}`, 'PnL']}
                    />
                    <Bar dataKey="pnl">
                      {tradeBars.map((b) => (
                        <Cell key={b.i} fill={b.pnl >= 0 ? '#26a69a' : '#ef5350'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* assumptions + honesty */}
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-3">Assumptions & honesty</h3>
              <ul className="text-xs space-y-1.5 text-slate-400">
                <li>
                  Spread: <span className="font-mono text-white">${data.assumptions.spread_usd_per_oz}/oz</span>{' '}
                  · Commission: <span className="font-mono text-white">${data.assumptions.commission_usd_per_trade}/trade</span>
                </li>
                <li>
                  Risk per trade: <span className="font-mono text-white">{data.assumptions.risk_per_trade_pct}%</span>{' '}
                  of equity · SL {data.assumptions.sl_atr_mult} ATR · TP {data.assumptions.tp_atr_mult} ATR
                </li>
                <li>Initial equity: <span className="font-mono text-white">${data.assumptions.initial_equity.toLocaleString()}</span></li>
                <li className="text-amber-200/70 pt-2 border-t border-white/5">{data.note}</li>
                <li className="text-amber-200/70">
                  Slippage and swap/overnight financing are NOT modelled. Walk-forward ML
                  accuracy is reported separately on the Signals page context.
                </li>
                <li className="text-amber-200/70">
                  Past performance does not guarantee future results. Signals can be wrong.
                  Educational analysis only — not financial advice.
                </li>
              </ul>
            </div>
          </div>

          {/* trade list */}
          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="text-left text-slate-400 border-b border-white/5">
                  {['Entry time', 'Exit time', 'Side', 'Entry ($/oz)', 'Exit ($/oz)', 'Qty (oz)', 'PnL $', 'PnL %', 'Exit reason'].map(
                    (h) => (
                      <th key={h} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {[...filteredTrades].reverse().map((t, idx) => (
                  <tr key={`${t.entry_time}-${idx}`} className="border-b border-white/5">
                    <td className="px-3 py-1.5 font-mono text-slate-400">{t.entry_time.slice(0, 16)}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-400">{t.exit_time.slice(0, 16)}</td>
                    <td className={`px-3 py-1.5 font-bold ${t.side === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.side.toUpperCase()}
                    </td>
                    <td className="px-3 py-1.5 font-mono">{t.entry.toFixed(2)}</td>
                    <td className="px-3 py-1.5 font-mono">{t.exit.toFixed(2)}</td>
                    <td className="px-3 py-1.5 font-mono">{t.qty.toFixed(3)}</td>
                    <td className={`px-3 py-1.5 font-mono ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.pnl.toFixed(2)}
                    </td>
                    <td className={`px-3 py-1.5 font-mono ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.pnl_pct.toFixed(3)}%
                    </td>
                    <td className="px-3 py-1.5 text-slate-400">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* per-concept validation + full confluence replay */}
          {conceptBt.data && (
            <>
              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">
                    Concept confluence replay ({conceptBt.data.strategy.concepts_used} detections)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Win {conceptBt.data.strategy.win_rate.toFixed(1)}% · PF {conceptBt.data.strategy.profit_factor.toFixed(2)} ·
                    Expectancy {conceptBt.data.strategy.expectancy.toFixed(2)}% · Sharpe {conceptBt.data.strategy.sharpe.toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-200/70 mt-2">{conceptBt.data.strategy.note}</p>
              </div>

              <div className="card overflow-x-auto !p-0">
                <table className="w-full text-xs min-w-[760px]">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-white/5">
                      {['Concept', 'Family', 'Weight', 'Trades', 'Win %', 'PF', 'Expectancy %', 'Sharpe'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {conceptBt.data.per_concept.map((row) => (
                      <tr key={row.type} className="border-b border-white/5 hover:bg-white/[0.03]">
                        <td className="px-3 py-1.5 font-mono text-slate-200">{row.type.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-1.5 text-slate-500">{row.category}</td>
                        <td className="px-3 py-1.5 font-mono text-gold">{row.weight.toFixed(2)}</td>
                        <td className="px-3 py-1.5 font-mono">{row.trades}</td>
                        <td className={`px-3 py-1.5 font-mono ${row.win_rate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {row.win_rate.toFixed(1)}
                        </td>
                        <td className={`px-3 py-1.5 font-mono ${row.profit_factor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {row.profit_factor.toFixed(2)}
                        </td>
                        <td className={`px-3 py-1.5 font-mono ${row.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {row.expectancy.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-slate-400">{row.sharpe.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-500 text-center">
                Weights live in <code className="text-gold">backend/app/data/concept_weights.yaml</code> —
                down-weight concepts that do not help. Educational analysis only. Not financial advice.
              </p>
            </>
          )}
          {conceptBt.loading && !conceptBt.data && (
            <div className="card animate-pulse text-slate-500 text-sm">Validating every concept over {years} years of XAU/USD candles…</div>
          )}
          {conceptBt.error && <div className="card text-amber-300 text-sm">{conceptBt.error}</div>}
        </>
      )}
    </div>
  );
}
