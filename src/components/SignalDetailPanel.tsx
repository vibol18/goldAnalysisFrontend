import { memo, type ReactNode } from 'react';
import type { ConfluenceFactor, Explanation, RuleComponent, Signal } from '../types';

interface Props {
  signal: Signal | null;
  onClose: () => void;
}

const DISCLAIMER =
  "Educational analysis only. Not financial advice. Signals can be wrong. Never risk money you can't afford to lose.";

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

function toneForAction(action: string | null) {
  if (action === 'BUY') return 'text-emerald-400';
  if (action === 'SELL') return 'text-red-400';
  return 'text-slate-300';
}

function toneForDirection(direction: string) {
  if (direction === 'bullish') return 'text-emerald-400';
  if (direction === 'bearish') return 'text-red-400';
  return 'text-slate-400';
}

function fmt(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/5 pt-4 first:border-0 first:pt-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Level({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className={`font-mono text-sm ${value == null ? 'text-slate-500' : tone}`}>
        {value == null ? '—' : `${fmt(value)} $/oz`}
      </span>
    </div>
  );
}

/** Fixed right-side drawer explaining exactly why a signal was produced. */
const SignalDetailPanel = memo(function SignalDetailPanel({ signal, onClose }: Props) {
  if (!signal) return null;

  const exp: Explanation = signal.explanation;
  const checklist = buildChecklist(signal);
  const concepts = signal.concepts ?? [];
  const invalidation =
    signal.invalidation ?? exp.invalidation ?? exp.confluence?.invalidation ?? null;
  const whyNotTrading = (exp as Explanation & { why_not_trading?: string }).why_not_trading;
  const vetoReasons = exp.confluence?.veto_reasons ?? [];
  const showWhyNot =
    signal.action === 'HOLD' || (whyNotTrading != null && whyNotTrading !== '');
  const narrative = exp.narrative ?? exp.summary;
  const showResult =
    signal.status != null || signal.hit != null || signal.result_pct != null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Signal explanation"
        className="absolute inset-y-0 right-0 w-96 max-w-full overflow-y-auto border-l border-white/10 bg-surface shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-white/5 bg-surface/95 px-4 py-3 backdrop-blur">
          <div>
            <h2 className="text-sm font-bold text-white">Why this signal</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">
              XAU/USD · {signal.timeframe} · {new Date(signal.created_at).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={onClose}
            aria-label="Close details"
          >
            ✕ Close
          </button>
        </div>

        <div className="space-y-5 px-4 py-4">
          <Section title="Direction">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-black tracking-tight ${toneForAction(signal.action)}`}>
                  {signal.action ?? '—'}
                </span>
                <span className="rounded bg-gold/15 px-2 py-1 text-xs font-bold text-gold">
                  GRADE {signal.grade ?? '—'}
                </span>
              </div>
              <div className="text-right">
                <span className="label">Confidence</span>
                <span className="text-lg font-bold text-white">
                  {signal.confidence.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
              <span>
                Rule score{' '}
                <b className={signal.rule_score >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {signal.rule_score >= 0 ? '+' : ''}
                  {signal.rule_score.toFixed(2)}
                </b>
              </span>
              {signal.ml_probability != null && (
                <span>ML {Math.round(signal.ml_probability * 100)}%</span>
              )}
              {signal.data_stale && <span className="text-amber-300">cached data</span>}
              {signal.data_synthetic && <span className="text-amber-300">fallback data</span>}
            </div>
          </Section>

          <Section title="Trade plan">
            <div className="grid grid-cols-2 gap-3">
              <Level label="Entry" value={signal.entry} tone="text-white" />
              <Level label="Stop loss" value={signal.stop_loss} tone="text-red-400" />
              <Level label="Take profit 1" value={signal.take_profit1} tone="text-emerald-400" />
              <Level label="Take profit 2" value={signal.take_profit2} tone="text-emerald-400" />
              {signal.take_profit3 != null && (
                <Level label="Take profit 3" value={signal.take_profit3} tone="text-emerald-400" />
              )}
              <div className="flex flex-col gap-0.5">
                <span className="label">Risk : Reward</span>
                <span className="font-mono text-sm text-white">
                  1 : {signal.risk_reward.toFixed(1)}
                </span>
              </div>
            </div>
          </Section>

          <Section title="Confluence checklist">
            {checklist.length === 0 ? (
              <p className="text-[11px] text-slate-500">No factor breakdown was recorded.</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {checklist.map((item) => (
                  <li key={item.key} className="flex items-start gap-2 text-[11px]">
                    <span
                      className={`mt-px font-bold ${item.positive ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {item.positive ? '✓' : '✕'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-slate-200">{item.name}</span>
                        <span
                          className={`shrink-0 font-mono ${item.positive ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                          {item.value >= 0 ? '+' : ''}
                          {item.value.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 text-[10px] text-slate-500">
                        <span className="truncate" title={item.note}>
                          {item.note || '—'}
                        </span>
                        <span className="shrink-0">w {item.weight.toFixed(2)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Analyst narrative">
            <p className="text-xs leading-relaxed text-slate-300">{narrative}</p>
            {exp.reasons.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] text-slate-500">
                {exp.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
          </Section>

          {showWhyNot && (
            <Section title="Why I'm NOT trading">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-200">
                {whyNotTrading ||
                  (vetoReasons.length > 0
                    ? vetoReasons.join('; ')
                    : 'Confluence did not clear the confidence threshold required for a live trade.')}
              </div>
            </Section>
          )}

          {invalidation && (
            <Section title="Invalidation">
              <p className="text-[11px] leading-relaxed text-amber-200/80">{invalidation}</p>
            </Section>
          )}

          {concepts.length > 0 && (
            <Section title={`Concepts used (${concepts.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {concepts.slice(0, 20).map((concept, i) => (
                  <span
                    key={`${concept.type}-${i}`}
                    className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px]"
                  >
                    <span className="text-slate-200">{concept.type.replace(/_/g, ' ')}</span>
                    <span className={toneForDirection(concept.direction)}>
                      {' '}
                      · {concept.direction}
                    </span>
                    <span className="text-slate-500"> · {concept.strength.toFixed(2)}</span>
                  </span>
                ))}
                {concepts.length > 20 && (
                  <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                    +{concepts.length - 20} more
                  </span>
                )}
              </div>
            </Section>
          )}

          {showResult && (
            <Section title="Live result">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {signal.status && (
                  <span className="rounded bg-white/5 px-2 py-0.5 text-slate-300">
                    {signal.status}
                  </span>
                )}
                {signal.hit && (
                  <span
                    className={`rounded px-2 py-0.5 font-semibold ${
                      signal.hit === 'TP'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-red-500/15 text-red-400'
                    }`}
                  >
                    {signal.hit}
                  </span>
                )}
                {signal.result_pct != null && (
                  <span
                    className={`font-mono ${
                      signal.result_pct >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {signal.result_pct >= 0 ? '+' : ''}
                    {signal.result_pct.toFixed(2)}%
                  </span>
                )}
              </div>
            </Section>
          )}

          <p className="border-t border-white/5 pt-4 text-[10px] leading-relaxed text-amber-200/60">
            {DISCLAIMER}
          </p>
        </div>
      </aside>
    </div>
  );
});

export default SignalDetailPanel;
