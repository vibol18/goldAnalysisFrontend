import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { WS_BASE } from '../config';

export type LiveState = 'connecting' | 'live' | 'reconnecting' | 'stale';

export interface LiveStatus {
  state: LiveState;
  lastUpdate: number | null;
  attempts: number;
}

export interface LiveEvent {
  type: string;
  ts?: string;
  [key: string]: unknown;
}

export interface LiveStreamValue {
  status: LiveStatus;
  timeframe: string;
  setTimeframe: (tf: string) => void;
  subscribe: (handler: (event: LiveEvent) => void) => () => void;
  send: (message: Record<string, unknown>) => void;
  reconnect: () => void;
  lastTick: { price: number; change_pct: number; time: string } | null;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;
const FLUSH_MS = 100;
const RESYNC_GRACE_MS = 250;
const IMMEDIATE_TYPES = new Set(['signal', 'signal_result', 'candle_close', 'status', 'resync']);
const HIDDEN_CRITICAL_TYPES = new Set(['status', 'signal', 'signal_result', 'resync', 'subscribed']);

function streamUrl(): string {
  return `${WS_BASE}/ws/stream`;
}

const LiveStreamContext = createContext<LiveStreamValue | null>(null);

/** Provides the single app-wide market stream socket and event fan-out. */
export function LiveStreamProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<LiveStatus>({
    state: 'connecting',
    lastUpdate: null,
    attempts: 0,
  });
  const [timeframeState, setTimeframeState] = useState('1h');
  const [lastTick, setLastTick] = useState<{
    price: number;
    change_pct: number;
    time: string;
  } | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<(event: LiveEvent) => void>>(new Set());
  const reconnectTimerRef = useRef<number | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const resyncTimerRef = useRef<number | null>(null);
  const bufferRef = useRef<Map<string, LiveEvent>>(new Map());

  const mountedRef = useRef(false);
  const timeframeRef = useRef('1h');
  const stateRef = useRef<LiveState>('connecting');
  const attemptsRef = useRef(0);
  const lastUpdateRef = useRef<number | null>(null);
  const lastPublishRef = useRef(0);
  const lastTickUpdateRef = useRef(0);
  const needsResyncRef = useRef(false);
  const openRef = useRef<() => void>(() => undefined);

  const dispatch = useCallback((event: LiveEvent) => {
    for (const handler of Array.from(handlersRef.current)) {
      try {
        handler(event);
      } catch {
        void 0;
      }
    }
  }, []);

  const emitResync = useCallback(
    (reason: string) => {
      dispatch({ type: 'resync', reason, ts: new Date().toISOString() });
    },
    [dispatch],
  );

  const markHealthy = useCallback(() => {
    const now = Date.now();
    lastUpdateRef.current = now;
    attemptsRef.current = 0;
    if (now - lastPublishRef.current >= FLUSH_MS) {
      lastPublishRef.current = now;
      setStatus({ state: stateRef.current, lastUpdate: now, attempts: 0 });
    }
  }, []);

  const changeState = useCallback((next: LiveState) => {
    stateRef.current = next;
    setStatus({ state: next, lastUpdate: lastUpdateRef.current, attempts: attemptsRef.current });
  }, []);

  const flushBuffer = useCallback(() => {
    flushTimerRef.current = null;
    if (bufferRef.current.size === 0) return;
    const batch = Array.from(bufferRef.current.values());
    bufferRef.current.clear();
    for (const event of batch) dispatch(event);
  }, [dispatch]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(flushBuffer, FLUSH_MS);
  }, [flushBuffer]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current || reconnectTimerRef.current !== null) return;
    const index = Math.min(Math.max(attemptsRef.current - 1, 0), BACKOFF_MS.length - 1);
    const delay = BACKOFF_MS[index];
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      openRef.current();
    }, delay);
  }, []);

  const handleDisconnect = useCallback(() => {
    if (!mountedRef.current || reconnectTimerRef.current !== null) return;
    socketRef.current = null;
    if (resyncTimerRef.current !== null) {
      window.clearTimeout(resyncTimerRef.current);
      resyncTimerRef.current = null;
    }
    needsResyncRef.current = true;
    attemptsRef.current += 1;
    stateRef.current = 'reconnecting';
    setStatus({
      state: 'reconnecting',
      lastUpdate: lastUpdateRef.current,
      attempts: attemptsRef.current,
    });
    scheduleReconnect();
  }, [scheduleReconnect]);

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(message));
    } catch {
      void 0;
    }
  }, []);

  const closeSocket = useCallback(() => {
    const ws = socketRef.current;
    socketRef.current = null;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.close();
      } catch {
        void 0;
      }
    }
  }, []);

  const handleEvent = useCallback(
    (event: LiveEvent) => {
      markHealthy();
      const type = event.type;

      if (type === 'status') {
        const next = event.state;
        if (next === 'stale' || next === 'live' || next === 'reconnecting') {
          changeState(next);
        }
      } else if (type === 'subscribed') {
        changeState('live');
        if (needsResyncRef.current && resyncTimerRef.current === null) {
          resyncTimerRef.current = window.setTimeout(() => {
            resyncTimerRef.current = null;
            if (needsResyncRef.current) {
              needsResyncRef.current = false;
              if (!document.hidden) emitResync('reconnect');
            }
          }, RESYNC_GRACE_MS);
        }
      } else if (stateRef.current === 'connecting' || stateRef.current === 'reconnecting') {
        changeState('live');
      }

      if (type === 'resync') {
        needsResyncRef.current = false;
        if (resyncTimerRef.current !== null) {
          window.clearTimeout(resyncTimerRef.current);
          resyncTimerRef.current = null;
        }
      }

      if (document.hidden && !HIDDEN_CRITICAL_TYPES.has(type)) return;

      if (type === 'tick') {
        const price = event.price;
        const changePct = event.change_pct;
        const time = event.time;
        if (
          typeof price === 'number' &&
          typeof changePct === 'number' &&
          typeof time === 'string'
        ) {
          const now = Date.now();
          if (now - lastTickUpdateRef.current >= FLUSH_MS) {
            lastTickUpdateRef.current = now;
            setLastTick({ price, change_pct: changePct, time });
          }
        }
      }

      if (IMMEDIATE_TYPES.has(type)) {
        dispatch(event);
        return;
      }

      bufferRef.current.set(type, event);
      scheduleFlush();
    },
    [changeState, dispatch, emitResync, markHealthy, scheduleFlush],
  );

  const openSocket = useCallback(() => {
    if (!mountedRef.current) return;
    closeSocket();
    changeState('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(streamUrl());
    } catch {
      scheduleReconnect();
      return;
    }
    socketRef.current = ws;

    ws.onopen = () => {
      if (socketRef.current !== ws) return;
      send({ subscribe: 'XAUUSD', timeframe: timeframeRef.current });
    };
    ws.onmessage = (message: MessageEvent<string>) => {
      if (socketRef.current !== ws) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(message.data);
      } catch {
        return;
      }
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof (parsed as LiveEvent).type === 'string'
      ) {
        handleEvent(parsed as LiveEvent);
      }
    };
    ws.onerror = () => {
      if (socketRef.current !== ws) return;
      handleDisconnect();
    };
    ws.onclose = () => {
      if (socketRef.current !== ws) return;
      handleDisconnect();
    };
  }, [changeState, closeSocket, handleDisconnect, handleEvent, scheduleReconnect, send]);

  openRef.current = openSocket;

  const subscribe = useCallback((handler: (event: LiveEvent) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const reconnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    attemptsRef.current = 0;
    if (resyncTimerRef.current !== null) {
      window.clearTimeout(resyncTimerRef.current);
      resyncTimerRef.current = null;
    }
    needsResyncRef.current = true;
    closeSocket();
    openRef.current();
  }, [closeSocket]);

  const setTimeframe = useCallback(
    (tf: string) => {
      timeframeRef.current = tf;
      setTimeframeState(tf);
      send({ subscribe: 'XAUUSD', timeframe: tf });
    },
    [send],
  );

  const value = useMemo<LiveStreamValue>(
    () => ({
      status,
      timeframe: timeframeState,
      setTimeframe,
      subscribe,
      send,
      reconnect,
      lastTick,
    }),
    [lastTick, reconnect, send, setTimeframe, status, subscribe, timeframeState],
  );

  useEffect(() => {
    mountedRef.current = true;
    const onVisibility = () => {
      if (!mountedRef.current) return;
      bufferRef.current.clear();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (document.hidden) return;

      if (resyncTimerRef.current !== null) {
        window.clearTimeout(resyncTimerRef.current);
        resyncTimerRef.current = null;
      }
      needsResyncRef.current = false;
      emitResync('visibility');
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (stateRef.current !== 'stale') changeState('live');
      } else {
        needsResyncRef.current = true;
        stateRef.current = 'reconnecting';
        setStatus({
          state: 'reconnecting',
          lastUpdate: lastUpdateRef.current,
          attempts: attemptsRef.current,
        });
        scheduleReconnect();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    openRef.current();
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (resyncTimerRef.current !== null) {
        window.clearTimeout(resyncTimerRef.current);
        resyncTimerRef.current = null;
      }
      bufferRef.current.clear();
      closeSocket();
    };
  }, [changeState, closeSocket, emitResync, scheduleReconnect]);

  return <LiveStreamContext.Provider value={value}>{children}</LiveStreamContext.Provider>;
}

/** Access the shared live market stream. */
export function useLiveStream(): LiveStreamValue {
  const ctx = useContext(LiveStreamContext);
  if (!ctx) throw new Error('useLiveStream must be used inside a LiveStreamProvider');
  return ctx;
}

/** Subscribe a handler to live stream events for the life of this component. */
export function useLiveEvent(handler: (event: LiveEvent) => void, deps?: unknown[]): void {
  const { subscribe } = useLiveStream();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => subscribe((event) => handlerRef.current(event)), [subscribe, ...(deps ?? [])]);
}
