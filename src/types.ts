/** Shared API types for GoldSight frontend (strict TS). */

export interface Concept {
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

export interface ConfluenceFactor {
  type: string;
  category: string;
  direction: string;
  weight: number;
  strength: number;
  age: number;
  contribution: number;
  notes: string;
  status: string;
}

export interface ConfluenceResult {
  action: 'BUY' | 'SELL' | 'HOLD';
  grade: string;
  score: number;
  confidence: number;
  categories: Record<string, number>;
  factors: ConfluenceFactor[];
  agreeing: string[];
  disagreeing: string[];
  veto_reasons: string[];
  entry_zone: number[] | null;
  stop_loss: number | null;
  take_profit1: number | null;
  take_profit2: number | null;
  take_profit3: number | null;
  risk_reward: number;
  invalidation: string;
  regime: string;
  ml_probability: number | null;
  killzone_active: boolean;
  notes: string[];
}

export interface Explanation {
  summary: string;
  narrative?: string;
  reasons: string[];
  components: RuleComponent[];
  factors?: ConfluenceFactor[];
  rule_score: number;
  ml_probability: number | null;
  timeframe: string;
  grade?: string;
  invalidation?: string;
  confluence?: ConfluenceResult;
  agreeing?: string[];
  disagreeing?: string[];
  trade_plan?: {
    entry_zone: number[] | null;
    stop_loss: number | null;
    take_profit1: number | null;
    take_profit2: number | null;
    take_profit3: number | null;
    risk_reward: number;
  };
}

export interface RuleComponent {
  name: string;
  score: number;
  weight: number;
  why: string;
}

export interface Signal {
  id?: number;
  action: 'BUY' | 'SELL' | 'HOLD' | null;
  error?: string | null;
  confidence: number;
  final_score: number;
  rule_score: number;
  ml_probability: number | null;
  entry: number;
  stop_loss: number;
  take_profit1: number;
  take_profit2: number;
  risk_reward: number;
  atr: number;
  price: number;
  timeframe: string;
  explanation: Explanation;
  created_at: string;
  signal_time?: string;
  data_stale?: boolean;
  data_synthetic?: boolean;
  status?: string;
  hit?: string | null;
  result_pct?: number | null;
  grade?: string;
  entry_zone?: number[] | null;
  take_profit3?: number | null;
  invalidation?: string;
  confluence?: ConfluenceResult | null;
  concepts?: Concept[];
}

export interface SignalStats {
  total: number;
  closed: number;
  open: number;
  hit_tp: number;
  hit_sl: number;
  win_rate: number;
  avg_result_pct: number | null;
}

export interface ChartMarker {
  time: number;
  position: 'belowBar' | 'aboveBar' | 'inBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text?: string;
}

export interface CandlesResponse {
  ticker: string;
  symbol?: string;
  timeframe: string;
  stale: boolean;
  synthetic: boolean;
  error: string | null;
  candles: {
    time: number[];
    open: (number | null)[];
    high: (number | null)[];
    low: (number | null)[];
    close: (number | null)[];
    volume: number[];
  };
  overlays: Record<string, (number | null)[]>;
  panes: Record<string, (number | null)[]>;
  levels: { support: number | null; resistance: number | null };
  markers: ChartMarker[];
}

export interface CorrelationInfo {
  ticker: string;
  price?: number | null;
  change_pct?: number | null;
  unit?: string;
  stale?: boolean;
  synthetic?: boolean;
  error?: string | null;
}

export interface Overview {
  gold: {
    ticker?: string;
    symbol?: string;
    price?: number;
    prev_close?: number;
    change_pct?: number;
    day_high?: number;
    day_low?: number;
    open?: number;
    as_of?: string;
    stale?: boolean;
    source?: string | null;
    error?: string | null;
  };
  correlations: Record<string, CorrelationInfo>;
  meta: {
    stale?: boolean;
    synthetic?: boolean;
    source?: string | null;
    last_updated?: string | null;
    error?: string | null;
    gold_error?: string;
  };
}

export interface Trade {
  entry_time: string;
  exit_time: string;
  side: 'long' | 'short';
  entry: number;
  exit: number;
  qty: number;
  pnl: number;
  pnl_pct: number;
  reason: string;
}

export interface SideStats {
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number;
  total_pnl: number;
  avg_pnl: number;
  avg_pnl_pct: number;
  gross_profit: number;
  gross_loss: number;
}

export interface BacktestResult {
  years: number;
  bars: number;
  trades: number;
  win_rate: number;
  profit_factor: number;
  max_drawdown_pct: number;
  sharpe: number;
  total_return_pct: number;
  final_equity: number;
  assumptions: Record<string, number>;
  trade_list: Trade[];
  by_side: { short: SideStats; long: SideStats };
  equity_curve: { t: string; equity: number }[];
  note: string;
}

export interface ChatMessage {
  id: number;
  created_at: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface NewsItem {
  title: string;
  link: string;
  published: string;
  source: string;
}

export interface NewsResponse {
  items: NewsItem[];
  sentiment: number;
  sentiment_label: 'bullish' | 'bearish' | 'neutral';
  error: string | null;
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

export type ChartMode = 'clean' | 'smart_money' | 'classic' | 'full';

export interface ChartAnnotationsResponse {
  timeframe: string;
  symbol: string;
  annotations: ChartAnnotation[];
  signal_markers: SignalMarker[];
  total: number;
  shown: number;
  detected: number;
  mode: ChartMode;
  show_all: boolean;
  stale: boolean;
  error: string | null;
  disclaimer: string;
}

export interface LearnConcept {
  type: string;
  category: string;
  title: string;
  definition: string;
  example: string;
}

export interface LearnResponse {
  categories: string[];
  concepts: LearnConcept[];
  total: number;
  disclaimer: string;
}

export interface ConceptsResponse {
  timeframe: string;
  symbol: string;
  count: number;
  by_category: Record<string, number>;
  concepts: Concept[];
  stale: boolean;
  error: string | null;
  disclaimer: string;
}

export interface ConfluenceResponse {
  timeframe: string;
  symbol: string;
  confluence: ConfluenceResult;
  explanation: Explanation;
  concept_count: number;
  stale: boolean;
  disclaimer: string;
}

export interface ConceptPerformanceRow {
  type: string;
  category: string;
  weight: number;
  trades: number;
  win_rate: number;
  profit_factor: number;
  expectancy: number;
  max_drawdown_pct: number;
  sharpe: number;
}

export interface ConceptBacktestResponse {
  years: number;
  symbol: string;
  per_concept: ConceptPerformanceRow[];
  strategy: BacktestResult & {
    expectancy: number;
    concepts_used: number;
    disclaimer: string;
  };
  weights: Record<string, number>;
  stale: boolean;
  disclaimer: string;
}

export interface AppSettings {
  llm_provider: string | null;
  llm_configured: boolean;
  llm_model: string | null;
  ml_horizon: number;
  buy_threshold: number;
  sell_threshold: number;
  spread_usd: number;
  commission_usd: number;
  backtest_years: number;
  disclaimer: string;
}

export interface StatGroup {
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number;
  expectancy: number;
  max_drawdown_pct: number;
  total_pct: number;
  avg_win?: number;
  avg_loss?: number;
}

export interface StatBlock extends StatGroup {
  by_setup: Record<string, StatGroup>;
  by_session: Record<string, StatGroup>;
  sample_note?: string;
}

export interface StatsResults {
  years: number;
  backtest: StatBlock;
  paper: StatBlock;
  live: StatBlock;
  disclaimer: string;
}

export interface CalendarEvent {
  title: string;
  name?: string;
  time: string;
  impact: 'high' | 'medium' | 'low';
  country?: string;
  forecast?: string;
  expected?: string;
  actual?: string;
  previous?: string;
  source?: string;
}

export interface Countdown {
  available: boolean;
  next: CalendarEvent | null;
  hours_until?: number;
  days_until?: number;
  count?: number;
  source?: string;
}

export interface CalendarResponse {
  events: CalendarEvent[];
  editable_events: CalendarEvent[];
  countdown: Countdown;
  blocking: { name: string; time: string; hours_away: number } | null;
  blocking_now: boolean;
  block_window_hours: number;
  news_filter: string;
  checked_at: string;
  disclaimer: string;
}
