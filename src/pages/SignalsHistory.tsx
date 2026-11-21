import { Fragment, useMemo, useState } from 'react';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { useLiveEvent } from '../lib/liveStream';
import Disclaimer from '../components/Disclaimer';
import type { ConfluenceFactor, RuleComponent, Signal, SignalStats } from '../types';

type ActionFilter = 'ALL' | 'BUY' | 'SELL' | 'HOLD';

function statusBadge(sig: Signal) {
  if (sig.status === 'closed') {
    const win = sig.hit === 'TP';
    return (
      <span
        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
          win ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        }`}
      >
        {win ? 'HIT TP' : 'HIT SL'}
      </span>
    );
  }
  if (sig.action === 'HOLD') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-500/20 text-slate-400">
        N/A
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-300">
      OPEN {sig.result_pct !== null && sig.result_pct !== undefined ? `${sig.result_pct >= 0 ? '+' : ''}${sig.result_pct.toFixed(2)}%` : ''}
    </span>
  );
}

interface ChecklistItem {
  key: string;
  name: string;
  weight: number;
  value: number;
  positive: boolean;
  note: string;
}

function buildChecklist(signal: Signal): ChecklistItem[] {
  const exp = signal.explanation;
  const raw: Array<ConfluenceFactor | RuleComponent> = exp.factors ?? exp.components ?? [];
  return raw.map((item, i) => {
    if ('type' in item) {
      return {
        key: `${item.type}-${i}`,
        name: item.type.replace(/_/g, ' '),
        weight: item.weight,
        value: item.contribution,
        positive: item.contribution >= 0,
        note: item.notes,
      };
    }
    return {
      key: `${item.name}-${i}`,
      name: item.name.replace(/_/g, ' '),
      weight: item.weight,
      value: item.score,
      positive: item.score >= 0,
      note: item.why,
    };
  });
}

function rowKey(signal: Signal) {
  return String(signal.id ?? `${signal.created_at}-${signal.action}`);
}

/** Inline, non-fixed renderer for the expanded "Why" row. */
function WhyDetail({ signal }: { signal: Signal }) {
  const exp = signal.explanation;
  const items = buildChecklist(signal);
  const narrative = exp.narrative ?? exp.summary;
  const invalidation =
    signal.invalidation ?? exp.invalidation ?? exp.confluence?.invalidation ?? null;

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-slate-300">{narrative}</p>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-2 text-[11px]">
              <span className={item.positive ? 'text-emerald-400' : 'text-red-400'}>
                {item.positive ? '✓' : '✕'}
              </span>
              <span className="font-mono text-slate-300">{item.name}</span>
              <span className="flex-1 truncate text-slate-500" title={item.note}>
                {item.note}
              </span>
              <span className="font-mono text-slate-500">w {item.weight.toFixed(2)}</span>
              <span
                className={`font-mono ${item.positive ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {item.value >= 0 ? '+' : ''}
                {item.value.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {invalidation && (
        <p className="text-[11px] text-amber-200/70">Invalidation: {invalidation}</p>
      )}
      {!narrative && items.length === 0 && !invalidation && (
        <p className="text-[11px] text-slate-500">No explanation recorded for this signal.</p>
      )}
    </div>
  );
}

/** Signal history table with live outcomes + accuracy stats. */
export default function SignalsHistory() {
  const [action, setAction] = useState<ActionFilter>('ALL');
  const [limit, setLimit] = useState(100);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());

  const toggleWhy = (key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const { data, error, loading, reload } = usePolling(
    () => api.signalHistory(limit),
    0,
    [limit],
  );

  useLiveEvent((event) => {
    if (event.type === 'signal' || event.type === 'signal_result') void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const rows = data?.signals ?? [];
    return action === 'ALL' ? rows : rows.filter((s) => s.action === action);
  }, [data, action]);

  const stats: SignalStats | undefined = data?.stats;

  return (
    <div className="space-y-4">
      <Disclaimer className="text-center" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-white">Gold signal history (XAU/USD)</h1>
        <div className="flex gap-1.5">
          {(['ALL', 'BUY', 'SELL', 'HOLD'] as ActionFilter[]).map((a) => (
            <button
              key={a}
              className={`btn text-xs ${action === a ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setAction(a)}
            >
              {a}
            </button>
          ))}
          <button className="btn-ghost text-xs" onClick={() => void reload()}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* accuracy summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card">
          <span className="label">Signals</span>
          <span className="text-xl font-bold text-white">{stats?.total ?? 0}</span>
        </div>
        <div className="card">
          <span className="label">Closed</span>
          <span className="text-xl font-bold text-white">{stats?.closed ?? 0}</span>
        </div>
        <div className="card">
          <span className="label">Hit TP</span>
          <span className="text-xl font-bold text-emerald-400">{stats?.hit_tp ?? 0}</span>
        </div>
        <div className="card">
          <span className="label">Hit SL</span>
          <span className="text-xl font-bold text-red-400">{stats?.hit_sl ?? 0}</span>
        </div>
        <div className="card">
          <span className="label">Win rate</span>
          <span className="text-xl font-bold text-gold">
            {stats ? stats.win_rate.toFixed(1) : '0.0'}%
          </span>
        </div>
      </div>

      {stats && stats.closed === 0 && (
        <p className="text-xs text-slate-500">
          No closed signals yet — outcomes appear once price touches a stop-loss or
          take-profit after a BUY/SELL signal. Educational only, not financial advice.
        </p>
      )}

      {/* table */}
      <div className="card overflow-x-auto !p-0">
        {loading && filtered.length === 0 ? (
          <div className="p-6 text-slate-500 text-sm">Loading signals…</div>
        ) : error ? (
          <div className="p-6 text-red-400 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-slate-500 text-sm">
            No signals yet. Visit the Dashboard to generate one.
          </div>
        ) : (
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/5">
                {['Time', 'TF', 'Action', 'Conf%', 'Entry ($/oz)', 'SL ($/oz)', 'TP2 ($/oz)', 'Score', 'ML%', 'Result', 'Status', 'Why'].map(
                  (h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const key = rowKey(s);
                const open = expanded.has(key);
                return (
                  <Fragment key={key}>
                    <tr className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-3 py-2 font-mono text-slate-400 whitespace-nowrap">
                        {new Date(s.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">{s.timeframe}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-bold ${
                              s.action === 'BUY'
                                ? 'text-emerald-400'
                                : s.action === 'SELL'
                                  ? 'text-red-400'
                                  : 'text-slate-400'
                            }`}
                          >
                            {s.action}
                          </span>
                          {s.grade && (
                            <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold text-gold">
                              G {s.grade}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono">{s.confidence.toFixed(0)}</td>
                      <td className="px-3 py-2 font-mono">{s.entry.toFixed(2)}</td>
                      <td className="px-3 py-2 font-mono text-red-300">
                        {s.stop_loss.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 font-mono text-emerald-300">
                        {s.take_profit2.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {s.rule_score > 0 ? '+' : ''}
                        {s.rule_score.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {s.ml_probability !== null && s.ml_probability !== undefined
                          ? `${(s.ml_probability * 100).toFixed(0)}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {s.result_pct !== null && s.result_pct !== undefined
                          ? `${s.result_pct >= 0 ? '+' : ''}${s.result_pct.toFixed(2)}%`
                          : '—'}
                      </td>
                      <td className="px-3 py-2">{statusBadge(s)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-[10px]"
                          onClick={() => toggleWhy(key)}
                          aria-expanded={open}
                        >
                          {open ? 'Hide' : 'Why'}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <td colSpan={12} className="px-4 py-3">
                          <WhyDetail signal={s} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-center">
        <button className="btn-ghost text-xs" onClick={() => setLimit((l) => Math.min(500, l + 100))}>
          Load more
        </button>
      </div>
    </div>
  );
}
