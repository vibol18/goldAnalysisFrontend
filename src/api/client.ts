/** Typed fetch helpers for the GoldSight API. */
import type {
  AppSettings,
  BacktestResult,
  CalendarEvent,
  CalendarResponse,
  CandlesResponse,
  ChartAnnotationsResponse,
  ChartMode,
  ConceptBacktestResponse,
  ChatMessage,
  ConceptsResponse,
  ConfluenceResponse,
  LearnResponse,
  NewsResponse,
  Overview,
  Signal,
  SignalStats,
  StatsResults,
} from '../types';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch (err) {
    throw new ApiError(0, `Cannot reach GoldSight backend: ${String(err)}`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* non-json error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export interface Alert {
  id: number;
  time: string;
  type: 'signal' | 'entry' | 'tp' | 'sl' | 'test';
  timeframe: string;
  action: string;
  grade: string;
  price: number | null;
  message: string;
  channels: string[];
}

export interface AlertSettings {
  timeframes: string[];
  min_grade: 'A+' | 'A' | 'B';
  channels: {
    browser: boolean;
    sound: boolean;
    toast: boolean;
    telegram: boolean;
    email: boolean;
  };
  telegram_configured: boolean;
  email_configured: boolean;
  disclaimer: string;
}

export interface AlertTestResult {
  sent: boolean;
  results: { telegram: string; email: string };
}

export const api = {
  overview: () => request<Overview>('/api/market/overview'),

  candles: (timeframe: string) =>
    request<CandlesResponse>(
      `/api/market/candles?timeframe=${encodeURIComponent(timeframe)}`,
    ),

  currentSignal: (timeframe: string) =>
    request<Signal>(
      `/api/signals/current?timeframe=${encodeURIComponent(timeframe)}&save=true`,
    ),

  signalHistory: (limit = 200) =>
    request<{ signals: Signal[]; stats: SignalStats }>(
      `/api/signals/history?limit=${limit}`,
    ),

  signalStats: () => request<SignalStats>('/api/signals/stats'),

  backtest: (years = 5) =>
    request<BacktestResult>(`/api/backtest?years=${years}`),

  statsResults: (years = 5) =>
    request<StatsResults>(`/api/stats/results?years=${years}`),

  calendar: () => request<CalendarResponse>('/api/calendar'),

  dailyRisk: () => request<{
    warning: string; breached: boolean; near_limit: boolean;
    realised_pct: number; limit_pct: number;
  }>('/api/risk/daily'),

  journal: (limit = 200) => request<{
    trades: Array<Record<string, unknown>>;
    daily: { warning: string; breached: boolean };
    disclaimer: string;
  }>(`/api/journal?limit=${limit}`),

  conceptBacktest: (years = 5) =>
    request<ConceptBacktestResponse>(`/api/backtest/concepts?years=${years}`),

  chatHistory: () =>
    request<{ messages: ChatMessage[]; llm_configured: boolean; provider: string | null }>(
      '/api/chat/history',
    ),

  clearChat: () => request<{ status: string }>('/api/chat/history', { method: 'DELETE' }),

  news: () => request<NewsResponse>('/api/news'),

  chartAnnotations: (timeframe: string, showAll = false, mode: ChartMode = 'clean') =>
    request<ChartAnnotationsResponse>(
      `/api/chart/annotations?timeframe=${encodeURIComponent(timeframe)}`
      + `&show_all=${showAll}&mode=${encodeURIComponent(mode)}`,
    ),

  concepts: (timeframe: string) =>
    request<ConceptsResponse>(`/api/concepts?timeframe=${encodeURIComponent(timeframe)}`),

  confluence: (timeframe: string) =>
    request<ConfluenceResponse>(`/api/confluence?timeframe=${encodeURIComponent(timeframe)}`),

  learn: () => request<LearnResponse>('/api/learn'),

  events: () => request<{ events: CalendarEvent[] }>('/api/events'),

  saveEvents: (events: CalendarEvent[]) =>
    request<{ events: Array<Record<string, unknown>>; status: string }>('/api/events', {
      method: 'POST',
      body: JSON.stringify({ events }),
    }),

  settings: () => request<AppSettings>('/api/settings'),

  alertsSettings: () => request<AlertSettings>('/api/alerts/settings'),

  saveAlertsSettings: (payload: AlertSettings) =>
    request<AlertSettings>('/api/alerts/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  alerts: () => request<{ alerts: Alert[]; count: number }>('/api/alerts'),

  testAlerts: () =>
    request<AlertTestResult>('/api/alerts/test', { method: 'POST' }),

  positionSize: (body: {
    account_size: number;
    risk_pct: number;
    stop_distance: number;
    price: number;
  }) =>
    request<{
      risk_amount: number;
      units: number;
      lots_std: number;
      notional: number | null;
      disclaimer: string;
    }>('/api/risk/position-size', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export interface ChatMeta {
  llm_configured: boolean;
  price?: number | null;
  candle?: {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    stale: boolean;
    source?: string | null;
  } | null;
}

/**
 * Stream a chat message via SSE. Returns the full text when finished.
 * `onDelta` is called for each incremental chunk, `onMeta` with the fresh
 * market snapshot attached to this reply.
 */
export async function streamChat(
  message: string,
  history: { role: string; content: string }[],
  onDelta: (chunk: string) => void,
  onMeta?: (meta: ChatMeta) => void,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawError = false;
  let errorText = '';

  const handleEvent = (event: string, data: string) => {
    if (event === 'error') {
      try {
        const obj = JSON.parse(data) as { error?: string };
        errorText = obj.error ?? 'stream error';
      } catch {
        errorText = data;
      }
      sawError = true;
      return;
    }
    if (event === 'meta') {
      if (onMeta) {
        try {
          onMeta(JSON.parse(data) as ChatMeta);
        } catch {
          /* ignore malformed meta */
        }
      }
      return;
    }
    if (event === 'done') return;
    try {
      const obj = JSON.parse(data) as { delta?: string };
      if (obj.delta) onDelta(obj.delta);
    } catch {
      /* partial json — ignore */
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) handleEvent(event, dataLines.join('\n'));
    }
  }
  if (sawError && errorText) {
    throw new ApiError(502, errorText);
  }
}

/**
 * Subscribe to the alerts SSE stream. `onStatus` reports connection changes.
 * Returns a cleanup function that closes the stream and removes listeners.
 */
export function streamAlerts(
  onAlert: (alert: Alert) => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  const source = new EventSource('/api/alerts/stream');

  const handleOpen = () => onStatus?.(true);
  const handleError = () => onStatus?.(false);
  const handleAlert = (event: Event) => {
    const data = (event as MessageEvent).data;
    if (!data) return;
    try {
      onAlert(JSON.parse(data) as Alert);
    } catch {
      /* ignore malformed alert payloads */
    }
  };

  source.addEventListener('open', handleOpen);
  source.addEventListener('error', handleError);
  source.addEventListener('alert', handleAlert);

  return () => {
    source.removeEventListener('open', handleOpen);
    source.removeEventListener('error', handleError);
    source.removeEventListener('alert', handleAlert);
    source.close();
  };
}
