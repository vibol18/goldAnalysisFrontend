import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LogicalRange,
  SeriesMarker,
  UTCTimestamp,
} from 'lightweight-charts';
import type { CandlesResponse, ChartMarker, ChartMode, Signal } from '../types';

export interface OverlayToggles {
  ema: boolean;
  bollinger: boolean;
  rsi: boolean;
  macd: boolean;
  volume: boolean;
  signals: boolean;
}

export interface ConceptToggleState {
  structure: boolean;
  smc: boolean;
  classic: boolean;
  price_action: boolean;
  mtf: boolean;
  macro: boolean;
}

export interface ConceptOverlay {
  type: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  start_time: string | null;
  end_time: string | null;
  top: number | null;
  bottom: number | null;
  strength: number;
  status: 'active' | 'mitigated' | 'invalidated';
  notes: string;
  category: string;
  meta: Record<string, unknown>;
}

export interface ChartAnnotation {
  id: string;
  type: string;
  category: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  status: 'active' | 'mitigated' | 'invalidated';
  label: string;
  top: number | null;
  bottom: number | null;
  price: number | null;
  start_time: string | null;
  end_time: string | null;
  extend_right: boolean;
  strength: number;
  notes: string;
  meta: Record<string, unknown>;
}

export interface SignalMarker {
  id: number;
  time: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  grade: string;
  price: number;
  status: 'open' | 'closed';
  hit: string | null;
  entry: number;
  stop_loss: number;
  take_profit1: number;
  take_profit2: number;
  take_profit3: number | null;
  result_pct: number | null;
  explanation: Record<string, unknown> | null;
}

export interface CandleTick {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CandleChartHandle {
  timeframe: string;
  updateCandle: (tick: CandleTick) => void;
  applyAnnotations: (annotations: ChartAnnotation[], signalMarkers: SignalMarker[]) => void;
  scrollToRealTime: () => void;
  isFollowing: () => boolean;
  zoomTo: (iso: string) => void;
}

interface Props {
  data: CandlesResponse;
  toggles: OverlayToggles;
  currentSignal?: Signal | null;
  concepts?: ConceptOverlay[];
  conceptToggles?: ConceptToggleState;
  highlightType?: string | null;
  annotations?: ChartAnnotation[];
  signalMarkers?: SignalMarker[];
  annotationToggles?: Record<string, boolean>;
  showAll?: boolean;
  mode?: ChartMode;
  onMarkerClick?: (marker: SignalMarker) => void;
}

type BarTime = UTCTimestamp;
type RGB = readonly [number, number, number];
type RemovableSeries = Parameters<IChartApi['removeSeries']>[0];
type Direction = 'bullish' | 'bearish' | 'neutral';
type CandleSeries = ISeriesApi<'Candlestick'>;
type VolumeSeries = ISeriesApi<'Histogram'>;

interface LinePoint {
  time: BarTime;
  value: number;
}

interface DrawItem {
  id: string;
  type: string;
  category: string;
  direction: Direction;
  status: 'active' | 'mitigated' | 'invalidated';
  label: string;
  top: number | null;
  bottom: number | null;
  price: number | null;
  start_time: string | null;
  end_time: string | null;
  extend_right: boolean;
  strength: number;
  fromAnnotation: boolean;
}

interface ChartDataRef {
  sortedTimes: number[];
  candleTimes: Set<number>;
  timeToIndex: Map<number, number>;
  firstTime: number;
  lastTime: number;
  barInterval: number;
  extendTime: BarTime;
}

interface AnnotationEntry {
  kind: 'series' | 'line';
  ref: RemovableSeries | IPriceLine;
  series: RemovableSeries[];
  priceLines: IPriceLine[];
  geometry: string;
  values: string;
  update: (item: DrawItem, hlType: string | null) => void;
}

type AnnotationMap = Map<string, AnnotationEntry>;

interface MarkerState {
  signature: string;
  markers: SeriesMarker<BarTime>[];
}

interface DrawContext {
  chart: IChartApi;
  candleSeries: CandleSeries;
  dataRef: ChartDataRef;
}

type ApplyAnnotationsFn = (
  annotations: ChartAnnotation[] | undefined,
  signalMarkers: SignalMarker[] | undefined,
) => void;

const UP = '#26a69a';
const DOWN = '#ef5350';
const BULL: RGB = [38, 166, 154];
const BEAR: RGB = [239, 83, 80];
const NEUTRAL: RGB = [245, 197, 24];
const BLUE: RGB = [59, 130, 246];

const RECT_TYPES = new Set([
  'fvg', 'ifvg', 'order_block', 'breaker_block', 'mitigation_block', 'ote',
  'supply_demand', 'sr_zone', 'premium_discount', 'dealing_range',
  'volume_profile', 'ichimoku',
]);
const LINE_TYPES = new Set([
  'equal_highs', 'equal_lows', 'pdh', 'pdl', 'pwh', 'pwl', 'session_high',
  'session_low', 'htf_level', 'daily_open', 'midnight_open', 'vwap',
  'anchored_vwap',
]);
const MARKER_TYPES = new Set([
  'bos', 'choch', 'mss', 'liquidity_sweep', 'breakout', 'retest', 'engulfing',
  'pin_bar', 'double_top', 'double_bottom', 'head_shoulders',
  'inverse_head_shoulders', 'displacement', 'judas_swing', 'power_of_three',
]);

const ANN_BOX_TYPES = new Set([
  'fvg_box', 'ob_box', 'breaker_box', 'premium_zone', 'discount_zone',
  'ote_zone', 'sr_zone', 'supply_demand_zone', 'volume_profile_zone',
  'ichimoku_zone',
]);
const ANN_LINE_TYPES = new Set([
  'eqh_line', 'eql_line', 'pdh_line', 'pdl_line', 'pwh_line', 'pwl_line',
  'session_high_line', 'session_low_line', 'equilibrium_line', 'pivot_line',
  'vwap_line', 'daily_open_line', 'htf_level_line', 'trendline', 'channel_line',
  'bos_line', 'choch_line', 'entry_line', 'sl_line', 'tp1_line', 'tp2_line',
  'tp3_line',
]);
const ANN_MARKER_TYPES = new Set([
  'sweep_marker', 'swing_label', 'displacement_marker', 'candlestick_marker',
  'chart_pattern_marker',
]);

const LINE_TITLES: Record<string, string> = {
  equal_highs: 'EQH', equal_lows: 'EQL', pdh: 'PDH', pdl: 'PDL',
  pwh: 'PWH', pwl: 'PWL', session_high: 'SESS H', session_low: 'SESS L',
  htf_level: 'HTF', daily_open: 'D O', midnight_open: 'MDN',
  vwap: 'VWAP', anchored_vwap: 'aVWAP',
};
const MARKER_LABELS: Record<string, string> = {
  bos: 'BOS', choch: 'CHoCH', mss: 'MSS', liquidity_sweep: 'Sweep',
  breakout: 'Breakout', retest: 'Retest', engulfing: 'Engulf',
  pin_bar: 'Pin Bar', double_top: 'Double Top', double_bottom: 'Double Bottom',
  head_shoulders: 'H&S', inverse_head_shoulders: 'Inv H&S',
  displacement: 'Displacement', judas_swing: 'Judas', power_of_three: 'Po3',
};
const ANN_MARKER_LABELS: Record<string, string> = {
  sweep_marker: 'SWEEP', displacement_marker: 'DISP',
  candlestick_marker: 'CANDLE', chart_pattern_marker: 'PATTERN',
};

/** Convert parallel arrays into lightweight-charts line data (nulls dropped). */
function toLineData(
  times: number[],
  values: (number | null)[],
): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const v = values[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      out.push({ time: times[i] as BarTime, value: v });
    }
  }
  return out;
}

function isoToSeconds(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function snapToCandle(sec: number | null, sorted: number[]): number | null {
  if (sec === null || sorted.length === 0) return null;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < sec) lo = mid + 1;
    else hi = mid;
  }
  const upper = sorted[lo];
  const lower = sorted[Math.max(0, lo - 1)];
  return Math.abs(upper - sec) <= Math.abs(lower - sec) ? upper : lower;
}

function categoryEnabled(category: string, toggles?: ConceptToggleState): boolean {
  if (!toggles) return true;
  const value = (toggles as unknown as Record<string, boolean>)[category];
  return value === undefined ? true : value;
}

function annotationEnabled(type: string, toggles?: Record<string, boolean>): boolean {
  if (!toggles) return true;
  return toggles[type] !== false;
}

function directionRgb(direction: Direction): RGB {
  if (direction === 'bullish') return BULL;
  if (direction === 'bearish') return BEAR;
  return NEUTRAL;
}

function rgba(rgb: RGB, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

function statusFactor(status: DrawItem['status']): number {
  if (status === 'active') return 1;
  if (status === 'mitigated') return 0.6;
  return 0.35;
}

function fromAnnotation(a: ChartAnnotation): DrawItem {
  return {
    id: `ann:${a.id}`,
    type: a.type,
    category: a.category,
    direction: a.direction,
    status: a.status,
    label: a.label || a.type,
    top: a.top,
    bottom: a.bottom,
    price: a.price,
    start_time: a.start_time,
    end_time: a.end_time,
    extend_right: a.extend_right,
    strength: a.strength,
    fromAnnotation: true,
  };
}

function fromConcept(c: ConceptOverlay, index: number): DrawItem {
  const raw = (c.meta as Record<string, unknown>).label;
  const label = typeof raw === 'string' && raw
    ? raw
    : c.type.replace(/_/g, ' ').toUpperCase().slice(0, 12);
  return {
    id: `concept:${index}`,
    type: c.type,
    category: c.category,
    direction: c.direction,
    status: c.status,
    label,
    top: c.top,
    bottom: c.bottom,
    price: c.top,
    start_time: c.start_time,
    end_time: c.end_time,
    extend_right: false,
    strength: c.strength,
    fromAnnotation: false,
  };
}

function annotationLineRgb(type: string, direction: Direction): RGB {
  if (type === 'equilibrium_line' || type === 'bos_line' || type === 'choch_line') {
    return NEUTRAL;
  }
  if (type === 'sl_line' || direction === 'bearish') return BEAR;
  if (type === 'entry_line' || type.startsWith('tp') || direction === 'bullish') {
    return BULL;
  }
  return NEUTRAL;
}

function markerRgb(type: string, direction: Direction): RGB {
  if (type === 'sweep_marker') {
    if (direction === 'bullish') return BLUE;
    if (direction === 'bearish') return BEAR;
    return NEUTRAL;
  }
  return directionRgb(direction);
}

function markerLabel(item: DrawItem): string {
  if (item.type === 'swing_label') return item.label || 'SWING';
  return ANN_MARKER_LABELS[item.type]
    ?? MARKER_LABELS[item.type]
    ?? item.type.toUpperCase().slice(0, 8);
}

const PURPLE: RGB = [139, 92, 246];
const SLATE: RGB = [148, 163, 184];

function annotationZoneRgb(type: string, direction: Direction): RGB {
  if (type.includes('ob_box') || type === 'breaker_box') {
    return direction === 'bearish' ? PURPLE : BLUE;
  }
  if (type === 'sr_zone' || type === 'volume_profile_zone' || type === 'ichimoku_zone') return SLATE;
  if (type === 'ote_zone') return BLUE;
  return directionRgb(direction);
}

interface SignalCluster {
  time: BarTime;
  index: number;
  text: string;
  count: number;
  marker: SignalMarker;
}

/** One grade-only marker per signal; nearby ones cluster into a counted marker. */
function clusterSignalMarkers(
  signals: SignalMarker[],
  sortedTimes: number[],
  candleTimes: Set<number>,
  timeToIndex: Map<number, number>,
  limit: number,
): SignalCluster[] {
  const sorted = [...signals].sort((a, b) =>
    (isoToSeconds(a.time) ?? 0) - (isoToSeconds(b.time) ?? 0));
  const clusters: SignalCluster[] = [];
  for (const sm of sorted) {
    if (sm.action !== 'BUY' && sm.action !== 'SELL') continue;
    const sec = isoToSeconds(sm.time);
    const snapped = sec !== null && candleTimes.has(sec as BarTime)
      ? sec : snapToCandle(sec, sortedTimes);
    if (snapped === null || !candleTimes.has(snapped as BarTime)) continue;
    const index = timeToIndex.get(snapped) ?? -1;
    const last = clusters[clusters.length - 1];
    if (last && index >= 0 && last.index >= 0
        && index - last.index <= 6 && last.marker.action === sm.action) {
      last.count += 1;
      if (sm.id >= last.marker.id) last.marker = sm;
    } else {
      clusters.push({ time: snapped as BarTime, index, text: '', count: 1, marker: sm });
    }
  }
  for (const cluster of clusters) {
    const grade = cluster.marker.grade || 'C';
    const glyph = cluster.marker.hit === 'TP' ? ' ✓' : cluster.marker.hit === 'SL' ? ' ✕' : '';
    cluster.text = `${grade}${cluster.count > 1 ? ` ×${cluster.count}` : ''}${glyph}`;
  }
  return clusters.slice(-limit);
}

/** Keep axis labels from colliding: minimum price gap between kept labels. */
function nonCollidingLevels(
  levels: { price: number; type: string; label: string; color: string }[],
  minGap: number,
): Set<string> {
  const kept = new Set<string>();
  let last: number | null = null;
  for (const level of [...levels].sort((a, b) => a.price - b.price)) {
    if (last === null || Math.abs(level.price - last) >= minGap) {
      kept.add(level.type);
      last = level.price;
    }
  }
  return kept;
}

function entryZonePrice(signal: Signal): number | null {
  const raw = (signal as unknown as Record<string, unknown>).entry_zone;
  if (Array.isArray(raw) && raw.length >= 2) {
    const lo = Number(raw[0]);
    const hi = Number(raw[1]);
    if (Number.isFinite(lo) && Number.isFinite(hi)) return (lo + hi) / 2;
    return null;
  }
  if (raw && typeof raw === 'object') {
    const z = raw as Record<string, unknown>;
    const lo = Number(z.low ?? z.min ?? z.bottom);
    const hi = Number(z.high ?? z.max ?? z.top);
    if (Number.isFinite(lo) && Number.isFinite(hi)) return (lo + hi) / 2;
  }
  return null;
}

function removeAnnotationEntry(ctx: DrawContext, entry: AnnotationEntry): void {
  for (const s of entry.series) ctx.chart.removeSeries(s);
  for (const pl of entry.priceLines) ctx.candleSeries.removePriceLine(pl);
}

function scrollToLive(
  chart: IChartApi | null,
  guard: { current: boolean },
  following: { current: boolean },
): void {
  if (!chart) return;
  following.current = true;
  guard.current = true;
  chart.timeScale().scrollToRealTime();
  window.setTimeout(() => { guard.current = false; }, 120);
}

interface DrawAnnotationsParams {
  annotations?: ChartAnnotation[];
  concepts?: ConceptOverlay[];
  conceptToggles?: ConceptToggleState;
  annotationToggles?: Record<string, boolean>;
  highlightType?: string | null;
  showAll?: boolean;
  toggles: OverlayToggles;
  signalMarkers?: SignalMarker[];
  currentSignal?: Signal | null;
  baseMarkers: SeriesMarker<BarTime>[];
  annotationState: AnnotationMap;
  markerState: { current: MarkerState };
  signalByTime: { current: Map<BarTime, SignalMarker> };
}

/**
 * Draw/reconcile all annotation overlays and chart markers. Used both for the
 * initial chart render and for live `applyAnnotations` updates so that both
 * paths produce identical output without recreating the chart or candles.
 */
function drawAnnotations(ctx: DrawContext, params: DrawAnnotationsParams): void {
  const { chart, candleSeries, dataRef } = ctx;
  const { sortedTimes, candleTimes, timeToIndex, firstTime, lastTime, extendTime } = dataRef;
  const {
    annotations, concepts, conceptToggles, annotationToggles, highlightType,
    showAll, toggles, signalMarkers, currentSignal, baseMarkers,
    annotationState, markerState, signalByTime,
  } = params;

  if (sortedTimes.length === 0) return;

  const hlType = highlightType ? highlightType.toLowerCase() : null;
  const visibleRange = chart.timeScale().getVisibleLogicalRange();
  const visibleBars = visibleRange ? visibleRange.to - visibleRange.from : sortedTimes.length;
  const showText = visibleBars < 140;

  const sourceDraws: DrawItem[] = annotations !== undefined
    ? annotations.map(fromAnnotation)
    : (concepts ?? []).map(fromConcept);
  const sortedDraws = [...sourceDraws].sort((a, b) => {
    const ta = isoToSeconds(a.end_time) ?? isoToSeconds(a.start_time) ?? 0;
    const tb = isoToSeconds(b.end_time) ?? isoToSeconds(b.start_time) ?? 0;
    return tb - ta;
  });
  const draws = showAll ? sortedDraws : sortedDraws.slice(0, 60);

  const labelledAnnotations = new Set<string>();
  {
    const priced = draws
      .filter((d) => d.fromAnnotation && typeof d.price === 'number' && Number.isFinite(d.price))
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    const median = priced.length
      ? priced[Math.floor(priced.length / 2)].price ?? 0 : 0;
    const minGap = Math.max(Math.abs(median) * 0.0015, 0.25);
    let lastPrice: number | null = null;
    let count = 0;
    for (const item of priced) {
      const price = item.price ?? 0;
      if (count >= 8) break;
      if (lastPrice === null || Math.abs(price - lastPrice) >= minGap) {
        labelledAnnotations.add(item.id);
        lastPrice = price;
        count += 1;
      }
    }
  }

  const conceptMarkers: SeriesMarker<BarTime>[] = [];
  const killzoneTimes = new Set<number>();
  const seenIds = new Set<string>();

  for (const item of draws) {
    if (item.fromAnnotation) {
      if (item.status === 'invalidated') continue;
      if (!categoryEnabled(item.category, conceptToggles)) continue;
      if (!annotationEnabled(item.type, annotationToggles)
          && !annotationEnabled(item.type.toLowerCase(), annotationToggles)) {
        continue;
      }
    } else if (!categoryEnabled(item.category, conceptToggles)) {
      continue;
    }

    const type = item.type.toLowerCase();
    const isRect = ANN_BOX_TYPES.has(type) || RECT_TYPES.has(type);
    const isLine = ANN_LINE_TYPES.has(type) || LINE_TYPES.has(type);
    const isKillzone = type === 'killzone_shade' || type === 'killzone';
    const isMarker = !isRect && !isLine && !isKillzone
      && (ANN_MARKER_TYPES.has(type) || MARKER_TYPES.has(type));
    if (!isRect && !isLine && !isMarker && !isKillzone) continue;

    const startSec = isoToSeconds(item.start_time);
    const endSec = isoToSeconds(item.end_time);
    const effStart = startSec ?? endSec;
    const effEnd = endSec ?? startSec;
    if (
      effStart !== null &&
      effEnd !== null &&
      (effEnd < firstTime || effStart > lastTime)
    ) {
      continue;
    }

    const startTime = snapToCandle(effStart, sortedTimes);
    const endTime = snapToCandle(effEnd, sortedTimes);
    const anchorTime = startTime ?? endTime;
    if (anchorTime === null) continue;

    const dim = hlType !== null && hlType !== type;
    const strong = hlType !== null && hlType === type;
    const rgb = isRect ? annotationZoneRgb(type, item.direction) : directionRgb(item.direction);
    const sf = statusFactor(item.status);
    const linePrice = item.price ?? item.top;

    if (isMarker) {
      const bull = item.direction === 'bullish';
      const bear = item.direction === 'bearish';
      const sweep = type === 'sweep_marker';
      conceptMarkers.push({
        time: anchorTime as BarTime,
        position: bear ? 'aboveBar' : bull ? 'belowBar' : 'inBar',
        shape: sweep ? 'circle' : bull ? 'arrowUp' : bear ? 'arrowDown' : 'circle',
        color: rgba(markerRgb(type, item.direction), dim ? 0.3 : 0.95),
        text: showText ? markerLabel(item) : '',
        size: sweep ? 1 : strong ? 2 : 1,
      });
      continue;
    }

    if (isLine && linePrice !== null && Number.isFinite(linePrice)) {
      const aIdx = timeToIndex.get(startTime ?? anchorTime) ?? 0;
      let bIdx = timeToIndex.get(endTime ?? startTime ?? anchorTime) ?? aIdx;
      if (bIdx <= aIdx) bIdx = Math.min(aIdx + 1, sortedTimes.length - 1);
      const hasSegment = (type === 'bos_line' || type === 'choch_line') && bIdx > aIdx;
      const geometry = JSON.stringify([
        type, item.direction, aIdx, bIdx, hasSegment, dim, strong, item.label,
      ]);
      const values = JSON.stringify([linePrice]);
      seenIds.add(item.id);

      const existing = annotationState.get(item.id);
      if (existing && existing.geometry === geometry) {
        if (existing.values !== values) existing.update(item, hlType);
      } else {
        if (existing) removeAnnotationEntry(ctx, existing);
        const pl = candleSeries.createPriceLine({
          price: linePrice,
          color: rgba(annotationLineRgb(type, item.direction), dim ? 0.25 : 0.9),
          lineWidth: strong ? 2 : 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: labelledAnnotations.has(item.id),
          title: item.label || LINE_TITLES[type] || type.toUpperCase().slice(0, 10),
        });
        let segment: ISeriesApi<'Line'> | null = null;
        if (hasSegment) {
          segment = chart.addLineSeries({
            color: rgba(NEUTRAL, 0.9),
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          segment.setData([
            { time: sortedTimes[aIdx] as BarTime, value: linePrice },
            { time: sortedTimes[bIdx] as BarTime, value: linePrice },
          ]);
        }
        annotationState.set(item.id, {
          kind: 'line',
          ref: pl,
          series: segment ? [segment as unknown as RemovableSeries] : [],
          priceLines: [pl],
          geometry,
          values,
          update: (next, hl) => {
            const np = next.price ?? next.top;
            const ndim = hl !== null && hl !== next.type.toLowerCase();
            const nstrong = hl !== null && hl === next.type.toLowerCase();
            pl.applyOptions({
              price: np as number,
              color: rgba(
                annotationLineRgb(next.type.toLowerCase(), next.direction),
                ndim ? 0.25 : 0.9,
              ),
              lineWidth: nstrong ? 2 : 1,
              title: next.label
                || LINE_TITLES[next.type.toLowerCase()]
                || next.type.toUpperCase().slice(0, 10),
            });
            if (segment && np !== null && Number.isFinite(np)) {
              segment.update({ time: sortedTimes[aIdx] as BarTime, value: np });
              segment.update({ time: sortedTimes[bIdx] as BarTime, value: np });
            }
          },
        });
      }
    }

    if (isRect && item.top !== null && item.bottom !== null &&
        Number.isFinite(item.top) && Number.isFinite(item.bottom)) {
      let aIdx = timeToIndex.get(startTime ?? endTime ?? anchorTime);
      let bIdx = timeToIndex.get(endTime ?? startTime ?? anchorTime);
      if (aIdx !== undefined && bIdx !== undefined) {
        if (aIdx > bIdx) [aIdx, bIdx] = [bIdx, aIdx];
        if (bIdx === aIdx) {
          if (aIdx + 1 < sortedTimes.length) bIdx = aIdx + 1;
          else if (aIdx - 1 >= 0) aIdx = aIdx - 1;
        }
        const startIdx = aIdx;
        const endIdx = bIdx;
        const baseAlpha = item.status === 'active' ? 0.11 : 0.04;
        const fillAlpha = Math.min(
          0.16,
          baseAlpha * (dim ? 0.3 : 1) * (strong ? 1.4 : 1) * (item.fromAnnotation ? 1 : sf / 0.6),
        );
        const fill = rgba(rgb, fillAlpha);
        const edge = rgba(rgb, Math.min(0.6, fillAlpha * 3.2));
        const points: LinePoint[] = [
          { time: sortedTimes[aIdx] as BarTime, value: item.top },
          { time: sortedTimes[bIdx] as BarTime, value: item.top },
        ];
        if (item.extend_right) points.push({ time: extendTime, value: item.top });
        const geometry = JSON.stringify([
          type, item.direction, aIdx, bIdx, item.extend_right, dim, strong,
          item.status, item.fromAnnotation,
        ]);
        const values = JSON.stringify([item.top, item.bottom]);
        seenIds.add(item.id);

        const existing = annotationState.get(item.id);
        if (existing && existing.geometry === geometry) {
          if (existing.values !== values) existing.update(item, hlType);
        } else {
          if (existing) removeAnnotationEntry(ctx, existing);
          const series = chart.addBaselineSeries({
            baseValue: { type: 'price', price: item.bottom },
            topFillColor1: fill,
            topFillColor2: fill,
            bottomFillColor1: fill,
            bottomFillColor2: fill,
            topLineColor: edge,
            bottomLineColor: edge,
            lineVisible: true,
            lineWidth: 1,
            pointMarkersVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          series.setData(points);
          annotationState.set(item.id, {
            kind: 'series',
            ref: series as unknown as RemovableSeries,
            series: [series as unknown as RemovableSeries],
            priceLines: [],
            geometry,
            values,
            update: (next, hl) => {
              const ndim = hl !== null && hl !== next.type.toLowerCase();
              const nstrong = hl !== null && hl === next.type.toLowerCase();
              const nsf = statusFactor(next.status);
              const nbase = next.status === 'active' ? 0.11 : 0.04;
              const nfa = Math.min(
                0.16,
                nbase * (ndim ? 0.3 : 1) * (nstrong ? 1.4 : 1)
                  * (next.fromAnnotation ? 1 : nsf / 0.6),
              );
              const nfill = rgba(rgb, nfa);
              const nedge = rgba(rgb, Math.min(0.6, nfa * 3.2));
              const bottom = next.bottom as number;
              const top = next.top as number;
              series.applyOptions({
                baseValue: { type: 'price' as const, price: bottom },
                topFillColor1: nfill,
                topFillColor2: nfill,
                bottomFillColor1: nfill,
                bottomFillColor2: nfill,
                topLineColor: nedge,
                bottomLineColor: nedge,
              });
              const nextPoints: LinePoint[] = [
                { time: sortedTimes[startIdx] as BarTime, value: top },
                { time: sortedTimes[endIdx] as BarTime, value: top },
              ];
              if (item.extend_right) nextPoints.push({ time: extendTime, value: top });
              for (const p of nextPoints) series.update(p);
            },
          });
        }
      }
    }

    if (isKillzone) {
      const aIdx = timeToIndex.get(startTime ?? anchorTime);
      const bIdx = timeToIndex.get(endTime ?? anchorTime);
      if (aIdx !== undefined && bIdx !== undefined) {
        const lo = Math.min(aIdx, bIdx);
        const hi = Math.max(aIdx, bIdx);
        for (let i = lo; i <= hi; i += 1) killzoneTimes.add(sortedTimes[i]);
      }
    }
  }

  if (killzoneTimes.size > 0) {
    const kzId = '__killzone__';
    const values = sortedTimes.map((t) => (killzoneTimes.has(t) ? '1' : '0')).join('');
    const geometry = `killzone:${values}`;
    seenIds.add(kzId);
    const existing = annotationState.get(kzId);
    if (!existing || existing.geometry !== geometry) {
      if (existing) removeAnnotationEntry(ctx, existing);
      const kz = chart.addBaselineSeries({
        priceScaleId: 'kz',
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(245,197,24,0.14)',
        topFillColor2: 'rgba(245,197,24,0.14)',
        bottomFillColor1: 'rgba(245,197,24,0)',
        bottomFillColor2: 'rgba(245,197,24,0)',
        topLineColor: 'rgba(245,197,24,0)',
        bottomLineColor: 'rgba(245,197,24,0)',
        lineVisible: false,
        pointMarkersVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      chart.priceScale('kz').applyOptions({ scaleMargins: { top: 0, bottom: 0.97 } });
      kz.setData(
        sortedTimes.map((t) => ({
          time: t as BarTime,
          value: killzoneTimes.has(t) ? 1 : 0,
        })),
      );
      annotationState.set(kzId, {
        kind: 'series',
        ref: kz as unknown as RemovableSeries,
        series: [kz as unknown as RemovableSeries],
        priceLines: [],
        geometry,
        values: geometry,
        update: () => {},
      });
    }
  }

  for (const [id, entry] of annotationState) {
    if (!seenIds.has(id)) {
      removeAnnotationEntry(ctx, entry);
      annotationState.delete(id);
    }
  }

  const signalForChart: SeriesMarker<BarTime>[] = [];
  const smByTime = new Map<BarTime, SignalMarker>();
  const clusters = toggles.signals
    ? clusterSignalMarkers(signalMarkers ?? [], sortedTimes, candleTimes,
        timeToIndex, showAll ? 60 : 15)
    : [];
  for (const cluster of clusters) {
    const buy = cluster.marker.action === 'BUY';
    signalForChart.push({
      time: cluster.time,
      position: buy ? 'belowBar' : 'aboveBar',
      color: buy ? UP : DOWN,
      shape: buy ? 'arrowUp' : 'arrowDown',
      text: cluster.text,
    });
    smByTime.set(cluster.time, cluster.marker);
  }

  const lastBarTime = sortedTimes[sortedTimes.length - 1];
  const action = currentSignal?.action;
  const finalMarkers = [...baseMarkers];
  if (
    lastBarTime !== undefined &&
    (action === 'BUY' || action === 'SELL') &&
    toggles.signals &&
    !smByTime.has(lastBarTime as BarTime)
  ) {
    const buy = action === 'BUY';
    const current: SeriesMarker<BarTime> = {
      time: lastBarTime as BarTime,
      position: buy ? 'belowBar' : 'aboveBar',
      color: buy ? UP : DOWN,
      shape: buy ? 'arrowUp' : 'arrowDown',
      text: currentSignal?.grade || 'C',
    };
    const idx = finalMarkers.findIndex((m) => m.time === current.time);
    if (idx >= 0) finalMarkers[idx] = current;
    else finalMarkers.push(current);
  }

  const allMarkers = [
    ...(toggles.signals ? finalMarkers : []),
    ...signalForChart,
    ...conceptMarkers,
  ].sort((a, b) => a.time - b.time);
  const markerSignature = JSON.stringify(
    allMarkers.map((m) => [m.time, m.position, m.color, m.shape, m.text ?? '', m.size ?? 0]),
  );
  if (markerState.current.signature !== markerSignature) {
    candleSeries.setMarkers(allMarkers);
    markerState.current = { signature: markerSignature, markers: allMarkers };
  }
  signalByTime.current = smByTime;
}

const CandleChart = forwardRef<CandleChartHandle, Props>(function CandleChart({
  data,
  toggles,
  currentSignal,
  concepts,
  conceptToggles,
  highlightType,
  annotations,
  signalMarkers,
  annotationToggles,
  showAll,
  onMarkerClick,
}, ref) {
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<CandleSeries | null>(null);
  const volSeriesRef = useRef<VolumeSeries | null>(null);
  const timeframeRef = useRef<string>('');
  const lastTickRef = useRef<{ time: number; index: number } | null>(null);
  const annotationStateRef = useRef<AnnotationMap>(new Map());
  const markerStateRef = useRef<MarkerState>({ signature: '', markers: [] });
  const followingRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const chartDataRef = useRef<ChartDataRef | null>(null);
  const signalByTimeRef = useRef<Map<BarTime, SignalMarker>>(new Map());
  const applyAnnotationsRef = useRef<ApplyAnnotationsFn | null>(null);
  const updateCandleRef = useRef<((tick: CandleTick) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    get timeframe(): string {
      return timeframeRef.current;
    },
    updateCandle: (tick: CandleTick) => {
      updateCandleRef.current?.(tick);
    },
    applyAnnotations: (anns: ChartAnnotation[], sigs: SignalMarker[]) => {
      applyAnnotationsRef.current?.(anns, sigs);
    },
    scrollToRealTime: () => {
      scrollToLive(chartRef.current, programmaticScrollRef, followingRef);
    },
    isFollowing: () => followingRef.current,
    zoomTo: (iso: string) => {
      const chart = chartRef.current;
      const idx = isoToSeconds(iso);
      const times = chartDataRef.current?.sortedTimes;
      if (!chart || idx === null || !times?.length) return;
      const snapped = snapToCandle(idx, times);
      const at = snapped !== null ? times.indexOf(snapped) : -1;
      if (at < 0) return;
      programmaticScrollRef.current = true;
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, at - 18),
        to: Math.min(times.length - 1, at + 18),
      });
      window.setTimeout(() => { programmaticScrollRef.current = false; }, 150);
    },
  }), []);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.06)' },
        horzLines: { color: 'rgba(148,163,184,0.06)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(245,197,24,0.4)', labelBackgroundColor: '#b8940f' },
        horzLine: { color: 'rgba(245,197,24,0.4)', labelBackgroundColor: '#b8940f' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148,163,184,0.15)',
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: 'rgba(148,163,184,0.15)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      autoSize: true,
      handleScale: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: { type: 'price', precision: 2, minMove: 0.1 },
    });

    const { open, high, low, close, volume } = data.candles;
    const time = (data.candles.time ?? []).map(
      (t) => Math.floor(t > 1e12 ? t / 1000 : t) as BarTime,
    );
    const candles = time
      .map((t, i) => ({
        time: t,
        open: open[i] as number,
        high: high[i] as number,
        low: low[i] as number,
        close: close[i] as number,
      }))
      .filter((c) => Number.isFinite(c.close));
    candleSeries.setData(candles);

    const candleTimes = new Set(candles.map((c) => c.time));
    const sortedTimes = Array.from(new Set(candles.map((c) => Number(c.time)))).sort(
      (a, b) => a - b,
    );
    const timeToIndex = new Map(sortedTimes.map((t, i) => [t, i]));
    const firstTime = sortedTimes[0] ?? 0;
    const lastTime = sortedTimes[sortedTimes.length - 1] ?? 0;
    const barInterval = sortedTimes.length > 1
      ? Math.max(1, sortedTimes[sortedTimes.length - 1] - sortedTimes[sortedTimes.length - 2])
      : 86400;
    const extendTime = (lastTime + barInterval * 3) as BarTime;

    const chartData: ChartDataRef = {
      sortedTimes,
      candleTimes,
      timeToIndex,
      firstTime,
      lastTime,
      barInterval,
      extendTime,
    };
    chartDataRef.current = chartData;
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    timeframeRef.current = data.timeframe;
    followingRef.current = true;
    lastTickRef.current = sortedTimes.length > 0
      ? { time: sortedTimes[sortedTimes.length - 1], index: sortedTimes.length - 1 }
      : null;

    const markers: SeriesMarker<BarTime>[] = (data.markers ?? [])
      .map((m: ChartMarker) => ({
        time: Math.floor(m.time > 1e12 ? m.time / 1000 : m.time) as BarTime,
        position: m.position,
        color: m.color,
        shape: m.shape,
        text: m.text,
      }))
      .filter((m) => candleTimes.has(m.time))
      .sort((a, b) => a.time - b.time);

    const priceLines: IPriceLine[] = [];
    const createdSeries: RemovableSeries[] = [];

    const ctx: DrawContext = { chart, candleSeries, dataRef: chartData };

    applyAnnotationsRef.current = (anns, sigs) => {
      drawAnnotations(ctx, {
        annotations: anns,
        concepts,
        conceptToggles,
        annotationToggles,
        highlightType,
        showAll,
        toggles,
        signalMarkers: sigs,
        currentSignal,
        baseMarkers: markers,
        annotationState: annotationStateRef.current,
        markerState: markerStateRef,
        signalByTime: signalByTimeRef,
      });
    };

    updateCandleRef.current = (tick: CandleTick) => {
      const eventTimeframe = (tick as CandleTick & { timeframe?: string }).timeframe;
      if (eventTimeframe !== undefined && eventTimeframe !== timeframeRef.current) return;
      if (chartDataRef.current !== chartData || candleSeriesRef.current !== candleSeries) return;

      const sec = Math.floor(tick.time);
      const last = lastTickRef.current;
      if (last && sec < last.time) return;

      candleSeries.update({
        time: sec as BarTime,
        open: tick.open,
        high: tick.high,
        low: tick.low,
        close: tick.close,
      });

      const vol = volSeriesRef.current;
      if (vol && tick.volume !== undefined) {
        vol.update({
          time: sec as BarTime,
          value: tick.volume,
          color: tick.close >= tick.open
            ? 'rgba(38,166,154,0.35)'
            : 'rgba(239,83,80,0.35)',
        });
      }

      if (!last || sec > last.time) {
        const index = (last?.index ?? sortedTimes.length - 1) + 1;
        sortedTimes.push(sec);
        candleTimes.add(sec as BarTime);
        timeToIndex.set(sec, index);
        chartData.lastTime = sec;
        chartData.extendTime = (sec + barInterval * 3) as BarTime;
        lastTickRef.current = { time: sec, index };
      }

      if (followingRef.current) {
        scrollToLive(chart, programmaticScrollRef, followingRef);
      }
    };

    applyAnnotationsRef.current(annotations, signalMarkers);

    const handleClick: Parameters<IChartApi['subscribeClick']>[0] = (param) => {
      if (!onMarkerClick) return;
      let t: number | undefined;
      if (param.time !== undefined) t = Number(param.time);
      else if (param.logical !== undefined) {
        const idx = Number(param.logical);
        if (idx >= 0 && idx < sortedTimes.length) t = sortedTimes[idx];
      }
      if (t === undefined) return;
      const sm = signalByTimeRef.current.get(t as BarTime);
      if (sm) onMarkerClick(sm);
    };
    chart.subscribeClick(handleClick);

    interface LevelSpec {
      type: string;
      price: number;
      label: string;
      color: string;
      width: 1 | 2;
      style: LineStyle;
    }
    const levelSpecs: LevelSpec[] = [];
    const signalAction = currentSignal?.action;
    if (currentSignal && (signalAction === 'BUY' || signalAction === 'SELL')) {
      const tp3 = (currentSignal as unknown as Record<string, unknown>).take_profit3;
      const plan: [number | null | undefined, string, string][] = [
        [entryZonePrice(currentSignal), 'ENTRY', '#f5c518'],
        [currentSignal.stop_loss, 'SL', '#ef5350'],
        [currentSignal.take_profit1, 'TP1', '#26a69a'],
        [currentSignal.take_profit2, 'TP2', '#26a69a'],
        [typeof tp3 === 'number' ? tp3 : null, 'TP3', '#26a69a'],
      ];
      const seenPrices = new Set<number>();
      for (const [price, label, color] of plan) {
        if (price === null || price === undefined || !Number.isFinite(price)) continue;
        const rounded = Math.round(price * 10) / 10;
        if (seenPrices.has(rounded)) continue;
        seenPrices.add(rounded);
        levelSpecs.push({ type: label, price, label, color, width: 2, style: LineStyle.Solid });
      }
    }
    const sup = data.levels.support;
    const res = data.levels.resistance;
    if (sup !== null && sup !== undefined && Number.isFinite(sup)) {
      levelSpecs.push({ type: 'SUP', price: sup, label: 'SUP', color: '#26a69a', width: 1, style: LineStyle.Dashed });
    }
    if (res !== null && res !== undefined && Number.isFinite(res)) {
      levelSpecs.push({ type: 'RES', price: res, label: 'RES', color: '#ef5350', width: 1, style: LineStyle.Dashed });
    }
    const atrEstimate = candles.length > 1
      ? Math.max(...candles.slice(-20).map((c) => c.high - c.low)) : 1;
    const labelled = nonCollidingLevels(levelSpecs, Math.max(atrEstimate * 0.25, 0.5));
    for (const spec of levelSpecs) {
      priceLines.push(candleSeries.createPriceLine({
        price: spec.price,
        color: spec.color,
        lineWidth: spec.width,
        lineStyle: spec.style,
        axisLabelVisible: labelled.has(spec.type),
        title: spec.label,
      }));
    }

    if (toggles.volume) {
      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      });
      volSeriesRef.current = volSeries;
      chart.priceScale('vol').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      volSeries.setData(
        time
          .map((t, i) => ({
            time: t,
            value: volume[i] ?? 0,
            color:
              (close[i] ?? 0) >= (open[i] ?? 0)
                ? 'rgba(38,166,154,0.35)'
                : 'rgba(239,83,80,0.35)',
          }))
          .filter((p) => p.value > 0),
      );
      createdSeries.push(volSeries as unknown as RemovableSeries);
    }

    const emaSeries: ISeriesApi<'Line'>[] = [];
    if (toggles.ema) {
      const styles: { key: string; color: string; width: 1 | 2 }[] = [
        { key: 'ema20', color: '#f5c518', width: 2 },
        { key: 'ema50', color: '#60a5fa', width: 1 },
        { key: 'ema200', color: '#c084fc', width: 1 },
      ];
      for (const s of styles) {
        const series = chart.addLineSeries({
          color: s.color,
          lineWidth: s.width,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData(toLineData(time, data.overlays[s.key] ?? []));
        emaSeries.push(series);
        createdSeries.push(series as unknown as RemovableSeries);
      }
    }

    if (toggles.bollinger) {
      for (const key of ['bb_high', 'bb_mid', 'bb_low']) {
        const color = key === 'bb_mid' ? '#94a3b8' : 'rgba(148,163,184,0.45)';
        const series = chart.addLineSeries({
          color,
          lineWidth: 1,
          lineStyle: key === 'bb_mid' ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData(toLineData(time, data.overlays[key] ?? []));
        emaSeries.push(series);
        createdSeries.push(series as unknown as RemovableSeries);
      }
    }

    chart.timeScale().fitContent();

    let rsiChart: IChartApi | null = null;
    if (toggles.rsi && rsiRef.current) {
      rsiChart = createChart(rsiRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: 'rgba(148,163,184,0.05)' },
          horzLines: { color: 'rgba(148,163,184,0.05)' },
        },
        rightPriceScale: { borderColor: 'rgba(148,163,184,0.15)' },
        timeScale: { visible: false, borderColor: 'rgba(148,163,184,0.15)' },
        autoSize: true,
        height: 110,
      });
      const rsiSeries = rsiChart.addLineSeries({
        color: '#f5c518',
        lineWidth: 2,
        priceLineVisible: false,
      });
      rsiSeries.setData(toLineData(time, data.panes.rsi ?? []));
      rsiSeries.createPriceLine({
        price: 70,
        color: 'rgba(239,83,80,0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: '70',
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: 'rgba(38,166,154,0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: '30',
      });
      rsiChart.timeScale().fitContent();
    }

    let macdChart: IChartApi | null = null;
    if (toggles.macd && macdRef.current) {
      macdChart = createChart(macdRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: 'rgba(148,163,184,0.05)' },
          horzLines: { color: 'rgba(148,163,184,0.05)' },
        },
        rightPriceScale: { borderColor: 'rgba(148,163,184,0.15)' },
        timeScale: { visible: true, borderColor: 'rgba(148,163,184,0.15)' },
        autoSize: true,
        height: 110,
      });
      const hist = macdChart.addHistogramSeries({
        priceLineVisible: false,
        lastValueVisible: false,
      });
      hist.setData(
        time
          .map((t, i) => {
            const v = data.panes.macd_hist?.[i];
            if (v === null || v === undefined || !Number.isFinite(v)) return null;
            return {
              time: t,
              value: v,
              color: v >= 0 ? 'rgba(38,166,154,0.7)' : 'rgba(239,83,80,0.7)',
            };
          })
          .filter((p): p is { time: BarTime; value: number; color: string } => p !== null),
      );
      const macdLine = macdChart.addLineSeries({
        color: '#60a5fa',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      macdLine.setData(toLineData(time, data.panes.macd ?? []));
      const sigLine = macdChart.addLineSeries({
        color: '#f5c518',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sigLine.setData(toLineData(time, data.panes.macd_signal ?? []));
      macdChart.timeScale().fitContent();
    }

    const handleVisibleRange = (range: LogicalRange | null) => {
      if (!range || programmaticScrollRef.current) return;
      const lastIdx = lastTickRef.current?.index ?? sortedTimes.length - 1;
      followingRef.current = range.to >= lastIdx - 3;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRange);

    const rangeUnsubscribers: (() => void)[] = [];
    const syncFrom = (source: IChartApi, targets: IChartApi[]) => {
      const handler = (range: LogicalRange | null) => {
        if (!range) return;
        for (const t of targets) {
          t.timeScale().setVisibleLogicalRange(range);
        }
      };
      source.timeScale().subscribeVisibleLogicalRangeChange(handler);
      rangeUnsubscribers.push(() => {
        source.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
      });
    };
    const targets: IChartApi[] = [chart];
    if (rsiChart) targets.push(rsiChart);
    if (macdChart) targets.push(macdChart);
    for (const t of targets) {
      if (t !== chart) syncFrom(t, targets.filter((x) => x !== t));
    }
    syncFrom(chart, targets.filter((x) => x !== chart));

    return () => {
      chart.unsubscribeClick(handleClick);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRange);
      for (const unsub of rangeUnsubscribers) unsub();
      for (const entry of annotationStateRef.current.values()) {
        removeAnnotationEntry(ctx, entry);
      }
      annotationStateRef.current.clear();
      markerStateRef.current = { signature: '', markers: [] };
      signalByTimeRef.current.clear();
      for (const p of priceLines) candleSeries.removePriceLine(p);
      for (const s of createdSeries) chart.removeSeries(s);
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
      chartDataRef.current = null;
      lastTickRef.current = null;
      timeframeRef.current = '';
      applyAnnotationsRef.current = null;
      updateCandleRef.current = null;
      chart.remove();
      rsiChart?.remove();
      macdChart?.remove();
    };
  }, [
    data,
    toggles,
    currentSignal,
    concepts,
    conceptToggles,
    highlightType,
    annotationToggles,
    showAll,
    onMarkerClick,
  ]);

  useEffect(() => {
    applyAnnotationsRef.current?.(annotations, signalMarkers);
  }, [annotations, signalMarkers]);

  return (
    <div className="relative flex flex-col gap-1">
      <span className="absolute left-2 top-2 z-10 rounded border border-gold/20 bg-[#0b0d12]/80 px-2 py-1 text-[10px] font-semibold text-gold">
        XAU/USD (Gold) · {data.timeframe}
      </span>
      <div ref={mainRef} className="w-full h-[500px]" />
      {toggles.rsi && (
        <div className="relative">
          <span className="absolute left-2 top-1 z-10 text-[10px] text-gold/80">
            RSI (14)
          </span>
          <div ref={rsiRef} className="w-full h-[110px]" />
        </div>
      )}
      {toggles.macd && (
        <div className="relative">
          <span className="absolute left-2 top-1 z-10 text-[10px] text-slate-400">
            MACD (12,26,9)
          </span>
          <div ref={macdRef} className="w-full h-[110px]" />
        </div>
      )}
    </div>
  );
});

export default CandleChart;
