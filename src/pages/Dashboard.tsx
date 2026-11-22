import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CandleChart from '../components/CandleChart';
import type {
  CandleChartHandle,
  ChartAnnotation,
  ConceptToggleState,
  OverlayToggles,
  SignalMarker,
} from '../components/CandleChart';
import ConfluencePanel from '../components/ConfluencePanel';
import SignalCard from '../components/SignalCard';
import SignalDetailPanel from '../components/SignalDetailPanel';
import Disclaimer from '../components/Disclaimer';
import PositionSizeCalculator from '../components/PositionSizeCalculator';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { useLiveEvent, useLiveStream, type LiveEvent } from '../lib/liveStream';
import type {
  CalendarResponse, CandlesResponse, ChartAnnotationsResponse, ChartMode, ConceptsResponse,
  ConfluenceResponse, NewsResponse, Overview, Signal,
} from '../types';

const TIMEFRAMES = ['15m', '1h', '4h', '1D'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

function safeExternalUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function markerFromSignal(s: Signal): SignalMarker {
  return {
    id: s.id ?? Date.now(),
    time: s.signal_time || s.created_at,
    action: s.action ?? 'HOLD',
    grade: s.grade ?? 'C',
    price: s.price,
    status: (s.status as SignalMarker['status']) ?? 'open',
    hit: s.hit ?? null,
    entry: s.entry,
    stop_loss: s.stop_loss,
    take_profit1: s.take_profit1,
    take_profit2: s.take_profit2,
    take_profit3: s.take_profit3 ?? null,
    result_pct: s.result_pct ?? null,
    explanation: s.explanation as unknown as Record<string, unknown>,
  };
}

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const tfParam = searchParams.get('tf') as Timeframe | null;
  const [timeframe, setTimeframe] = useState<Timeframe>(
    tfParam && TIMEFRAMES.includes(tfParam) ? tfParam : '1h',
  );
  const [mode, setMode] = useState<ChartMode>('clean');
  const [sideOpen, setSideOpen] = useState(true);
  const [hoverType, setHoverType] = useState<string | null>(null);
  const navigate = useNavigate();
  const highlightType = hoverType ?? searchParams.get('concept');
  const { setTimeframe: setLiveTimeframe } = useLiveStream();
  const [conceptToggles, setConceptToggles] = useState<ConceptToggleState>({
    structure: true, smc: true, classic: true,
    price_action: true, mtf: true, macro: true,
  });
  const [annotationToggles, setAnnotationToggles] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const [toggles, setToggles] = useState<OverlayToggles>({
    ema: false,
    bollinger: false,
    rsi: true,
    macd: false,
    volume: true,
    signals: true,
  });

  const [liveTick, setLiveTick] = useState<{
    price: number;
    change_pct: number;
    time: string;
    bid?: number;
    ask?: number;
    spread?: number;
    source?: string;
  } | null>(null);
  const [liveMacro, setLiveMacro] = useState<Overview['correlations'] | null>(null);
  const [liveNews, setLiveNews] = useState<NewsResponse | null>(null);
  const [liveSignal, setLiveSignal] = useState<Signal | null>(null);
  const [liveResult, setLiveResult] = useState<{
    id: number; status: string; hit: string | null; result_pct: number | null;
  } | null>(null);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [markers, setMarkers] = useState<SignalMarker[]>([]);
  const [detail, setDetail] = useState<Signal | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const chartRef = useRef<CandleChartHandle>(null);
  const tickAt = useRef(0);
  const lastPrice = useRef<number | null>(null);
  const seenSignals = useRef<Set<number>>(new Set());
  const reloadRef = useRef<() => void>(() => undefined);

  const overview = usePolling<Overview>(() => api.overview(), 0, []);
  const signal = usePolling<Signal>(() => api.currentSignal(timeframe), 0, [timeframe]);
  const candles = usePolling<CandlesResponse>(() => api.candles(timeframe), 0, [timeframe]);
  const news = usePolling<NewsResponse>(() => api.news(), 0, []);
  const concepts = usePolling<ConceptsResponse>(() => api.concepts(timeframe), 0, [timeframe]);
  const confluence = usePolling<ConfluenceResponse>(() => api.confluence(timeframe), 0, [timeframe]);
  const chartData = usePolling<ChartAnnotationsResponse>(
    () => api.chartAnnotations(timeframe, showAll, mode), 0, [timeframe, showAll, mode],
  );
  const calendar = usePolling<CalendarResponse>(() => api.calendar(), 60_000, []);
  const livePrice = usePolling<{
    state?: string; source?: string; bid?: number | null; ask?: number | null;
    verification?: { state?: string; max_difference_usd?: number; tolerance_usd?: number };
  }>(() => api.livePrice(), 5_000, []);
  const dailyRisk = usePolling<{
    warning: string; breached: boolean; near_limit: boolean;
    realised_pct: number; limit_pct: number;
  }>(() => api.dailyRisk(), 60_000, []);

  const reloadAll = useCallback(() => {
    overview.reload(); signal.reload(); candles.reload(); news.reload();
    concepts.reload(); confluence.reload(); chartData.reload();
  }, [overview.reload, signal.reload, candles.reload, news.reload,
      concepts.reload, confluence.reload, chartData.reload]);
  reloadRef.current = reloadAll;

  useEffect(() => {
    setLiveTimeframe(timeframe);
    setLiveTick(null);
    setLiveMacro(null);
    setLiveSignal(null);
    setLiveResult(null);
    lastPrice.current = null;
  }, [timeframe, setLiveTimeframe]);

  useEffect(() => {
    if (chartData.data) {
      setAnnotations(chartData.data.annotations);
      setMarkers(chartData.data.signal_markers);
    }
  }, [chartData.data]);

  useEffect(() => {
    chartRef.current?.applyAnnotations(annotations, markers);
  }, [annotations, markers]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 260);
    return () => window.clearTimeout(id);
  }, [flash]);

  useLiveEvent((event: LiveEvent) => {
    switch (event.type) {
      case 'tick': {
        const at = Date.now();
        if (at - tickAt.current < 120) return;
        tickAt.current = at;
        const price = Number(event.price);
        if (Number.isFinite(price)) {
          if (lastPrice.current !== null) setFlash(price >= lastPrice.current ? 'up' : 'down');
          lastPrice.current = price;
          setLiveTick({
            price,
            change_pct: Number(event.change_pct) || 0,
            time: String(event.time ?? ''),
            bid: typeof event.bid === 'number' ? event.bid : undefined,
            ask: typeof event.ask === 'number' ? event.ask : undefined,
            spread: typeof event.spread === 'number' ? event.spread : undefined,
            source: typeof event.source === 'string' ? event.source : undefined,
          });
        }
        break;
      }
      case 'candle_update':
      case 'candle_close': {
        if (event.timeframe !== timeframe) break;
        const candle = event.candle as Record<string, number> | undefined;
        if (candle && Number.isFinite(candle.time)) {
          chartRef.current?.updateCandle({
            time: Math.floor(candle.time),
            open: candle.open, high: candle.high, low: candle.low,
            close: candle.close, volume: candle.volume,
          });
        }
        if (event.type === 'candle_close') reloadRef.current();
        break;
      }
      case 'annotations': {
        if (event.timeframe === timeframe && Array.isArray(event.annotations)) {
          setAnnotations(event.annotations as ChartAnnotation[]);
        }
        break;
      }
      case 'signal': {
        const incoming = event.signal as Signal | undefined;
        if (!incoming) break;
        if (incoming.id && seenSignals.current.has(incoming.id)) break;
        if (incoming.id) seenSignals.current.add(incoming.id);
        setLiveSignal(incoming);
        setDetail(incoming);
        setMarkers((prev) => [...prev, markerFromSignal(incoming)]);
        break;
      }
      case 'signal_result': {
        const id = Number(event.id);
        const status = String(event.status ?? '');
        const hit = (event.hit as string | null) ?? null;
        const resultPct = event.result_pct == null ? null : Number(event.result_pct);
        setMarkers((prev) => prev.map((m) => m.id === id ? {
          ...m,
          status: (status || m.status) as SignalMarker['status'],
          hit: hit ?? null,
          result_pct: resultPct ?? m.result_pct,
        } : m));
        setLiveResult({ id, status, hit, result_pct: resultPct });
        setLiveSignal((prev) => prev && prev.id === id ? {
          ...prev, status: status || prev.status, hit: hit ?? null,
          result_pct: resultPct ?? prev.result_pct,
        } : prev);
        break;
      }
      case 'macro':
        setLiveMacro(event as unknown as Overview['correlations']);
        break;
      case 'news':
        setLiveNews(event as unknown as NewsResponse);
        break;
      case 'resync':
        reloadRef.current();
        break;
      default:
        break;
    }
  }, [timeframe]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const gold = overview.data?.gold ?? {};
  const cor = liveMacro ?? overview.data?.correlations ?? {};
  const closes = candles.data?.candles.close ?? [];
  const lastCandleClose = [...closes].reverse().find((v): v is number => v !== null);
  const displayPrice = liveTick?.price ?? lastCandleClose ?? gold.price;
  const change = liveTick?.change_pct ?? gold.change_pct ?? 0;
  const up = change >= 0;
  const isStale = candles.data?.stale ?? gold.stale ?? overview.data?.meta.stale ?? false;
  const hasCandles = (candles.data?.candles.time.length ?? 0) > 0;
  const lastUpdated = overview.data?.meta.last_updated;
  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleString()
    : 'unknown';
  const secondsAgo = lastUpdated
    ? Math.max(0, Math.floor((now - new Date(lastUpdated).getTime()) / 1000))
    : null;

  const staleNote = !hasCandles && (candles.error || gold.error || overview.error)
    ? 'Live XAU/USD data is unavailable. No prices are being fabricated — add TWELVE_DATA_API_KEY to backend/.env or wait for Yahoo Finance rate limiting to clear.'
    : isStale
      ? `Showing the last real cached snapshot (updated ${updatedLabel}). Live data sources are currently unavailable.`
      : null;

  const toggle = (key: keyof OverlayToggles) =>
    setToggles((t) => ({ ...t, [key]: !t[key] }));

  const toggleConcept = (key: keyof ConceptToggleState) =>
    setConceptToggles((t) => ({ ...t, [key]: !t[key] }));

  const changeMode = (next: ChartMode) => {
    setMode(next);
    setToggles((t) => ({
      ...t,
      ema: next === 'classic' || next === 'full',
      bollinger: next === 'classic',
    }));
  };

  const baseSignal = liveSignal ?? signal.data;
  const currentSignal = baseSignal && liveResult &&
    (liveResult.id === baseSignal.id || baseSignal.id == null)
    ? {
        ...baseSignal,
        status: liveResult.status || baseSignal.status,
        hit: liveResult.hit ?? baseSignal.hit,
        result_pct: liveResult.result_pct ?? baseSignal.result_pct,
      }
    : baseSignal;
  const newsData = liveNews ?? news.data;

  const openMarker = useCallback((marker: SignalMarker) => {
    const explanation = marker.explanation as unknown as Signal['explanation'] | null;
    if (!explanation) return;
    setDetail({
      id: marker.id,
      action: marker.action,
      confidence: Number(explanation.confluence?.confidence ?? 0),
      final_score: Number(explanation.confluence?.score ?? 0),
      rule_score: Number(explanation.rule_score ?? 0),
      ml_probability: explanation.ml_probability ?? null,
      entry: marker.entry,
      stop_loss: marker.stop_loss,
      take_profit1: marker.take_profit1,
      take_profit2: marker.take_profit2,
      take_profit3: marker.take_profit3,
      risk_reward: Number(explanation.trade_plan?.risk_reward ?? 0),
      atr: 0,
      price: marker.price,
      timeframe,
      explanation,
      created_at: marker.time,
      signal_time: marker.time,
      grade: marker.grade,
      entry_zone: explanation.trade_plan?.entry_zone ?? null,
      invalidation: explanation.invalidation,
      confluence: explanation.confluence ?? null,
      status: marker.status,
      hit: marker.hit,
      result_pct: marker.result_pct,
    });
  }, [timeframe]);

  return (
    <div className="space-y-4">
      <Disclaimer className="text-center" />

      {/* price header */}
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <span
            className={`inline-block min-w-[8.5rem] rounded text-3xl font-black text-white font-mono tabular-nums transition-colors duration-200 ${
              flash === 'up' ? 'bg-emerald-500/15' : flash === 'down' ? 'bg-red-500/15' : ''
            }`}
          >
            {displayPrice !== undefined && displayPrice !== null
              ? displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : 'N/A'}
          </span>
          <span className="text-xs text-slate-500">$/oz</span>
          <span className="inline-block min-w-[4.5rem] text-sm font-semibold tabular-nums text-right">
            <span className={up ? 'text-emerald-400' : 'text-red-400'}>
              {Number.isFinite(change) ? `${up ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%` : ''}
            </span>
          </span>
          <span className="text-xs text-slate-500">XAU/USD (Gold)</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              displayPrice === undefined || displayPrice === null
                ? 'bg-slate-500/15 text-slate-400'
                : isStale
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-emerald-500/15 text-emerald-400'
            }`}
          >
            {displayPrice === undefined || displayPrice === null
              ? 'NO DATA'
              : isStale ? 'STALE' : 'LIVE'}
          </span>
          {secondsAgo !== null && (
            <span className={`text-[10px] ${isStale ? 'text-amber-200/70' : 'text-slate-500'}`}>
              {secondsAgo}s ago
            </span>
          )}
          {liveTick?.source && (
            <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-slate-400">
              {liveTick.source === 'mt5'
                ? 'MT5 LIVE'
                : liveTick.source === 'rest'
                  ? 'SPOT REST LIVE'
                  : liveTick.source.toUpperCase()}
            </span>
          )}
          {liveTick?.bid !== undefined && liveTick?.ask !== undefined && (
            <span className="text-[10px] text-slate-500">
              Bid {liveTick.bid.toFixed(2)} · Ask {liveTick.ask.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex gap-5 text-xs">
          <div>
            <span className="label">Gold day high ($/oz)</span>
            <span className="font-mono text-white">
              {gold.day_high !== undefined && gold.day_high !== null ? gold.day_high.toFixed(2) : 'N/A'}
            </span>
          </div>
          <div>
            <span className="label">Gold day low ($/oz)</span>
            <span className="font-mono text-white">
              {gold.day_low !== undefined && gold.day_low !== null ? gold.day_low.toFixed(2) : 'N/A'}
            </span>
          </div>
          <div>
            <span className="label">Prev gold close ($/oz)</span>
            <span className="font-mono text-white">
              {gold.prev_close !== undefined && gold.prev_close !== null ? gold.prev_close.toFixed(2) : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {staleNote && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ⚠ {staleNote}
        </div>
      )}

      {livePrice.data?.verification?.state === 'UNVERIFIED' && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          ⚠ UNVERIFIED price: sources differ by ${livePrice.data.verification.max_difference_usd?.toFixed(2)}
          {' '}(tolerance ${livePrice.data.verification.tolerance_usd?.toFixed(2)}). New signals are paused.
        </div>
      )}
      {livePrice.data?.source && livePrice.data.source !== 'mt5' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          MT5 bridge offline — using {livePrice.data.source} as an APPROXIMATE fallback.
        </div>
      )}

      {calendar.data?.countdown?.next && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
          calendar.data.blocking_now
            ? 'border-red-500/30 bg-red-500/10 text-red-200'
            : 'border-white/10 bg-white/[0.03] text-slate-300'
        }`}>
          <span>
            {calendar.data.blocking_now ? '⛔ Signals blocked — ' : '▣ Next event: '}
            <strong>{calendar.data.countdown.next.title}</strong>
            {' · '}{new Date(calendar.data.countdown.next.time).toUTCString()}
          </span>
          <span className="font-mono">
            {calendar.data.blocking_now
              ? `${calendar.data.blocking?.hours_away ?? 0}h away`
              : `${calendar.data.countdown.hours_until ?? 0}h countdown`}
          </span>
          <button type="button" className="btn-ghost !py-0.5 !px-2" onClick={() => navigate('/calendar')}>
            Manage
          </button>
        </div>
      )}

      {/* signal card */}
      <SignalCard
        signal={currentSignal}
        loading={signal.loading}
        error={signal.error}
        onRefresh={() => void signal.reload()}
      />

      <ConfluencePanel
        data={confluence.data}
        loading={confluence.loading}
        error={confluence.error}
      />

      {/* correlated markets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(['DXY', 'US10Y', 'SPX'] as const).map((key) => {
          const info = cor[key];
          const chg = info?.change_pct ?? 0;
          const hasPrice = info?.price !== undefined && info?.price !== null;
          const label =
            key === 'DXY' ? 'US Dollar (DXY)' : key === 'US10Y' ? 'US 10Y Yield' : 'S&P 500';
          const inverse = key !== 'SPX';
          return (
            <div key={key} className="card !p-3.5">
              <div className="flex items-center justify-between">
                <span className="label">{label}</span>
                <span
                  className={`text-xs font-semibold ${chg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {info?.change_pct !== undefined && info?.change_pct !== null
                    ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`
                    : '—'}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-mono text-lg text-white">
                  {hasPrice
                    ? `${info!.price!.toLocaleString(undefined, { maximumFractionDigits: 3 })}${info?.unit ?? ''}`
                    : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-500">
                  {!hasPrice
                    ? 'unavailable'
                    : inverse
                      ? chg < 0
                        ? '▲ tailwind for gold'
                        : '▼ headwind for gold'
                      : chg > 0
                        ? 'risk-on context'
                        : 'risk-off context'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* chart card */}
      <div className="card overflow-hidden !p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-3">
          <div className="flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                className={`btn ${tf === timeframe ? 'btn-gold' : 'btn-ghost'}`}
                onClick={() => setTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['ema', 'EMA 20/50/200'],
                ['bollinger', 'Bollinger'],
                ['rsi', 'RSI'],
                ['macd', 'MACD'],
                ['volume', 'Volume'],
                ['signals', 'Signals'],
              ] as [keyof OverlayToggles, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                className={`btn text-xs ${toggles[key] ? 'btn-active' : 'btn-ghost'}`}
                onClick={() => toggle(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">
            Mode
          </span>
          {([
            ['clean', 'Clean'], ['smart_money', 'Smart Money'],
            ['classic', 'Classic'], ['full', 'Full'],
          ] as [ChartMode, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`btn text-[10px] ${mode === key ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => changeMode(key)}
            >
              {label}
            </button>
          ))}
          <button
            className={`btn text-[10px] ${showAll ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => setShowAll((v) => !v)}
            title="Bypass ranking and show every detected drawing"
          >
            {showAll ? 'Showing all' : 'Show all'}
          </button>
          <span className="text-[10px] text-slate-500 ml-auto">
            Showing {chartData.data?.shown ?? annotations.length} of{' '}
            {chartData.data?.detected ?? concepts.data?.count ?? 0}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">
            Draw
          </span>
          {([
            ['fvg_box', 'FVG'], ['ob_box', 'OB'], ['eqh_line', 'Liquidity'],
            ['bos_line', 'Structure'], ['ote_zone', 'OTE'],
          ] as [string, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`btn text-[10px] ${annotationToggles[key] !== false ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setAnnotationToggles((t) => ({ ...t, [key]: t[key] === false }))}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">
            Concepts
          </span>
          {([
            ['structure', 'Structure'],
            ['smc', 'Smart money'],
            ['classic', 'Classic TA'],
            ['price_action', 'Price action'],
            ['mtf', 'Multi-TF'],
            ['macro', 'Macro'],
          ] as [keyof ConceptToggleState, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`btn text-[10px] ${conceptToggles[key] ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => toggleConcept(key)}
            >
              {label}
            </button>
          ))}
          <span className="text-[10px] text-slate-500 ml-auto">
            {concepts.data?.count ?? 0} detected · XAU/USD ($/oz)
          </span>
        </div>
        {concepts.error && (
          <div className="mb-2 text-[11px] text-amber-300/80">Concept detection: {concepts.error}</div>
        )}
        {candles.data?.stale && (
          <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            ⚠ Stale chart data — showing the last real candles from {updatedLabel}.
            No synthetic prices are used.
          </div>
        )}
        {candles.data && hasCandles ? (
          <CandleChart
            ref={chartRef}
            data={candles.data}
            toggles={toggles}
            currentSignal={currentSignal}
            concepts={concepts.data?.concepts}
            conceptToggles={conceptToggles}
            highlightType={highlightType}
            annotations={annotations}
            signalMarkers={markers}
            annotationToggles={annotationToggles}
            showAll={showAll}
            mode={mode}
            onMarkerClick={openMarker}
          />
        ) : (
          <div className="h-[500px] flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
            <span className="text-slate-400">XAU/USD (Gold) chart unavailable</span>
            <span className="text-xs text-center max-w-md">
              {candles.error ??
                'No live candles could be fetched. Configure TWELVE_DATA_API_KEY in backend/.env to use Twelve Data, or wait for Yahoo Finance rate limiting to clear.'}
            </span>
          </div>
        )}
        <div className="mt-2 rounded-lg border border-slate-700/40 bg-slate-900/30">
          <button
            className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold text-slate-300"
            onClick={() => setSideOpen((v) => !v)}
          >
            Concepts on chart
            <span className="text-slate-500">{sideOpen ? '▾' : '▸'}</span>
          </button>
          {sideOpen && (
            <div className="grid max-h-52 grid-cols-2 gap-1 overflow-y-auto px-3 pb-2 md:grid-cols-3">
              {Object.entries(
                annotations.reduce<Record<string, ChartAnnotation[]>>((acc, item) => {
                  (acc[item.type] ||= []).push(item);
                  return acc;
                }, {}),
              ).sort((a, b) => b[1].length - a[1].length).map(([type, items]) => (
                <div
                  key={type}
                  className="flex items-center gap-2 rounded px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700/40"
                  onMouseEnter={() => setHoverType(type)}
                  onMouseLeave={() => setHoverType(null)}
                  onClick={() => {
                    const at = items.find((i) => i.end_time || i.start_time);
                    if (at?.end_time || at?.start_time) {
                      chartRef.current?.zoomTo(at.end_time || at.start_time || '');
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    className="accent-amber-400"
                    checked={annotationToggles[type] !== false}
                    onChange={() => setAnnotationToggles((t) => ({ ...t, [type]: t[type] === false }))}
                  />
                  <span className="truncate">{type.replace(/_/g, ' ')}</span>
                  <span className="ml-auto text-slate-500">{items.length}</span>
                </div>
              ))}
              {annotations.length === 0 && (
                <span className="col-span-3 px-2 py-2 text-[10px] text-slate-500">
                  No drawings in this mode. Try Smart Money or Show all.
                </span>
              )}
            </div>
          )}
        </div>
        <div className="mt-2 flex gap-4 text-[11px] text-slate-500">
          <span className="text-emerald-400">━ gold support {candles.data?.levels.support?.toFixed(2) ?? '—'}$/oz</span>
          <span className="text-red-400">━ gold resistance {candles.data?.levels.resistance?.toFixed(2) ?? '—'}$/oz</span>
        </div>
      </div>

      {/* news sentiment */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">Gold news sentiment</h3>
          {newsData && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                newsData.sentiment_label === 'bullish'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : newsData.sentiment_label === 'bearish'
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-slate-500/15 text-slate-300'
              }`}
            >
              {newsData.sentiment_label} ({newsData.sentiment.toFixed(2)})
            </span>
          )}
        </div>
        {newsData && newsData.items.length > 0 ? (
          <ul className="space-y-1.5 text-xs">
            {newsData.items.slice(0, 6).map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-slate-600">•</span>
                <a
                  href={safeExternalUrl(item.link) ? item.link : undefined}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-slate-300 hover:text-gold truncate"
                >
                  {item.title}
                </a>
                <span className="text-slate-600 shrink-0">{item.source}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">
            {newsData?.error ?? 'No headlines available right now.'}
          </p>
        )}
      </div>

      {dailyRisk.data?.warning && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${
          dailyRisk.data.breached
            ? 'border-red-500/40 bg-red-500/10 text-red-200'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        }`}>
          ⚠ {dailyRisk.data.warning}
        </div>
      )}

      {/* risk tools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PositionSizeCalculator price={displayPrice ?? 0} signal={currentSignal} />
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-2">Signal alerts</h3>
          <p className="text-xs text-slate-400 mb-3">
            Get a browser notification whenever a new XAU/USD gold BUY or SELL signal appears while this app is open.
          </p>
          <button className="btn-gold" onClick={() => navigate('/settings')}>
            Configure alerts →
          </button>
          <p className="text-[10px] text-slate-500 mt-3">
            Choose timeframes, minimum grade and channels in Settings.
            Alerts are best-effort and may be delayed. Not financial advice.
          </p>
        </div>
      </div>

      <SignalDetailPanel signal={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
