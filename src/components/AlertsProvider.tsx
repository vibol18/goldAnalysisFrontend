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
import { api, streamAlerts } from '../api/client';
import type { Alert, AlertSettings, AlertTestResult } from '../api/client';

const MAX_ALERTS = 50;
const MAX_TOASTS = 6;
const TOAST_MS = 8000;

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  timeframes: ['15m', '1h', '4h'],
  min_grade: 'A',
  channels: {
    browser: false,
    sound: true,
    toast: true,
    telegram: false,
    email: false,
  },
  telegram_configured: false,
  email_configured: false,
  disclaimer: '',
};

interface Toast {
  id: number;
  type: Alert['type'];
  title: string;
  message: string;
}

const TOAST_STYLES: Record<Alert['type'], string> = {
  signal: 'border-gold/50 bg-[#171a22]/95 text-white',
  entry: 'border-sky-400/50 bg-sky-950/90 text-sky-50',
  tp: 'border-emerald-400/50 bg-emerald-950/90 text-emerald-50',
  sl: 'border-red-400/50 bg-red-950/90 text-red-50',
  test: 'border-violet-400/50 bg-violet-950/90 text-violet-50',
};

interface AlertsContextValue {
  alerts: Alert[];
  connected: boolean;
  settings: AlertSettings | null;
  saveSettings: (payload: AlertSettings) => Promise<void>;
  requestPermission: () => Promise<NotificationPermission>;
  testAlerts: () => Promise<AlertTestResult>;
  clearToasts: () => void;
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

/** Access the shared alerts stream, settings and delivery helpers. */
export function useAlerts(): AlertsContextValue {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error('useAlerts must be used inside an AlertsProvider');
  return ctx;
}

/** Provides live alerts and renders the in-app toast stack. */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const settingsRef = useRef<AlertSettings | null>(null);
  const toastSeq = useRef(0);
  const timersRef = useRef<Set<number>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const beep = useCallback(() => {
    try {
      const AudioCtor = window.AudioContext;
      if (!AudioCtor) return;
      let ctx = audioCtxRef.current;
      if (!ctx) {
        ctx = new AudioCtor();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch {
      /* Web Audio unavailable — stay silent */
    }
  }, []);

  const notify = useCallback((alert: Alert) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      new Notification(`GoldSight ${alert.type.toUpperCase()} · ${alert.timeframe}`, {
        body: alert.message,
      });
    } catch {
      /* browser notification blocked */
    }
  }, []);

  const handleAlert = useCallback(
    (alert: Alert) => {
      setAlerts((prev) => [...prev, alert].slice(-MAX_ALERTS));

      const current = settingsRef.current;
      if (current?.channels.sound) beep();
      if (current?.channels.browser) notify(alert);
      if (current && !current.channels.toast) return;

      const id = ++toastSeq.current;
      const grade = alert.grade ? ` · ${alert.grade}` : '';
      setToasts((prev) =>
        [
          ...prev,
          {
            id,
            type: alert.type,
            title: `${alert.type.toUpperCase()} · ${alert.timeframe}${grade}`,
            message: alert.message,
          },
        ].slice(-MAX_TOASTS),
      );

      const timer = window.setTimeout(() => {
        timersRef.current.delete(timer);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_MS);
      timersRef.current.add(timer);
    },
    [beep, notify],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.alertsSettings().catch(() => null),
      api.alerts().catch(() => null),
    ]).then(([loadedSettings, history]) => {
      if (!active) return;
      const next = loadedSettings ?? DEFAULT_ALERT_SETTINGS;
      setSettings(next);
      settingsRef.current = next;
      if (history) setAlerts(history.alerts.slice(-MAX_ALERTS));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => streamAlerts(handleAlert, setConnected), [handleAlert]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
      if (audioCtxRef.current) void audioCtxRef.current.close();
    },
    [],
  );

  const saveSettings = useCallback(async (payload: AlertSettings) => {
    const saved = await api.saveAlertsSettings(payload);
    const next = { ...payload, ...saved };
    setSettings(next);
    settingsRef.current = next;
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof Notification === 'undefined') return 'denied';
    return Notification.requestPermission();
  }, []);

  const testAlerts = useCallback(() => api.testAlerts(), []);

  const clearToasts = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const value = useMemo<AlertsContextValue>(
    () => ({
      alerts,
      connected,
      settings,
      saveSettings,
      requestPermission,
      testAlerts,
      clearToasts,
    }),
    [alerts, connected, settings, saveSettings, requestPermission, testAlerts, clearToasts],
  );

  return (
    <AlertsContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-xl backdrop-blur ${TOAST_STYLES[toast.type]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide">{toast.title}</span>
              <button
                type="button"
                aria-label="Dismiss alert"
                onClick={() => dismissToast(toast.id)}
                className="text-base leading-none opacity-60 transition-opacity hover:opacity-100"
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-xs opacity-90">{toast.message}</p>
          </div>
        ))}
      </div>
    </AlertsContext.Provider>
  );
}
