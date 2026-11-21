import type { ConfluenceResponse } from '../types';

interface Props {
  data: ConfluenceResponse | null | undefined;
  loading?: boolean;
  error?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  structure: 'Structure',
  smc: 'Smart money',
  classic: 'Classic TA',
  price_action: 'Price action',
  mtf: 'Multi-timeframe',
  macro: 'Macro',
};

function toneFor(action: string) {
  if (action === 'BUY') return 'text-emerald-400';
  if (action === 'SELL') return 'text-red-400';
  return 'text-slate-300';
}

/** Confluence gauge + factor-by-factor breakdown for the current signal. */
export default function ConfluencePanel({ data, loading, error }: Props) {
  if (error) {
    return <div className="card text-red-400 text-xs">{error}</div>;
  }
  if (loading && !data) {
    return <div className="card animate-pulse text-slate-500 text-sm">Scoring confluence…</div>;
  }
  if (!data) return null;

  const cf = data.confluence;
  const scorePct = Math.round((cf.score + 1) / 2 * 100);
  const positive = cf.score >= 0;
  const maxCategory = Math.max(...Object.values(cf.categories).map(Math.abs), 1);

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Confluence</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {data.concept_count} concepts detected · {data.timeframe} · XAU/USD
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-1 text-xs font-bold ${toneFor(cf.action)} bg-white/5`}>
            {cf.action}
          </span>
          <span className="rounded px-2 py-1 text-xs font-bold text-gold bg-gold/10">
            Grade {cf.grade}
          </span>
          <span className="font-mono text-sm text-white">{cf.confidence.toFixed(0)}%</span>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
          <span>Bearish</span>
          <span>Score {cf.score >= 0 ? '+' : ''}{cf.score.toFixed(2)}</span>
          <span>Bullish</span>
        </div>
        <div className="h-2 rounded bg-slate-700/50 overflow-hidden">
          <div
            className={`h-full ${positive ? 'bg-emerald-500/70' : 'bg-red-500/70'}`}
            style={{ width: `${scorePct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-4">
        {Object.entries(cf.categories).map(([key, value]) => (
          <div key={key}>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{CATEGORY_LABELS[key] ?? key}</span>
              <span className={`font-mono ${value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {value >= 0 ? '+' : ''}{value.toFixed(2)}
              </span>
            </div>
            <div className="h-1 rounded bg-slate-700/40 mt-0.5">
              <div
                className={`h-full ${value >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'}`}
                style={{ width: `${Math.min(100, Math.abs(value) / maxCategory * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {cf.factors.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <h4 className="text-[11px] font-semibold text-slate-300 mb-2">Factors</h4>
          <ul className="space-y-1 max-h-52 overflow-y-auto pr-1">
            {cf.factors.map((f, i) => (
              <li key={`${f.type}-${i}`} className="flex items-start gap-2 text-[11px]">
                <span className={f.contribution >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {f.contribution >= 0 ? '✓' : '✕'}
                </span>
                <span className="font-mono text-slate-300 w-32 shrink-0">
                  {f.type.replace(/_/g, ' ')}
                </span>
                <span className="text-slate-500 flex-1 truncate" title={f.notes}>
                  {f.notes}
                </span>
                <span className={`font-mono ${f.contribution >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {f.contribution >= 0 ? '+' : ''}{f.contribution.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
        <div>
          <span className="text-emerald-400">Agreeing:</span>{' '}
          <span className="text-slate-400">
            {cf.agreeing.length ? cf.agreeing.join(', ').replace(/_/g, ' ') : 'none'}
          </span>
        </div>
        <div>
          <span className="text-red-400">Against:</span>{' '}
          <span className="text-slate-400">
            {cf.disagreeing.length ? cf.disagreeing.join(', ').replace(/_/g, ' ') : 'none'}
          </span>
        </div>
      </div>

      {cf.veto_reasons.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          HOLD — {cf.veto_reasons.join('; ')}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-300 leading-relaxed border-t border-white/5 pt-3">
        {data.explanation.narrative ?? data.explanation.summary}
      </p>
      {cf.invalidation && (
        <p className="mt-2 text-[10px] text-amber-200/70">
          Invalidation: {cf.invalidation}
        </p>
      )}
      <p className="mt-3 text-[10px] text-amber-200/60">
        Educational analysis only. Not financial advice. Signals can be wrong.
        Never risk money you can't afford to lose.
      </p>
    </div>
  );
}
