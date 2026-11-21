import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AlertSettings } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import Disclaimer from '../components/Disclaimer';
import { DEFAULT_ALERT_SETTINGS, useAlerts } from '../components/AlertsProvider';

/** Settings page: shows configuration status, data refresh, risk parameters. */
export default function Settings() {
  const { data, error, reload } = usePolling(() => api.settings(), 0, []);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { alerts, connected, settings, saveSettings, requestPermission, testAlerts, clearToasts } =
    useAlerts();
  const [draft, setDraft] = useState<AlertSettings>(settings ?? DEFAULT_ALERT_SETTINGS);
  const [alertSaveMsg, setAlertSaveMsg] = useState<string | null>(null);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );
  const [testResult, setTestResult] = useState<
    Awaited<ReturnType<typeof testAlerts>> | null
  >(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const toggleTimeframe = (tf: string) => {
    setDraft((d) => ({
      ...d,
      timeframes: d.timeframes.includes(tf)
        ? d.timeframes.filter((t) => t !== tf)
        : [...d.timeframes, tf],
    }));
  };

  const toggleChannel = (key: keyof AlertSettings['channels']) => {
    setDraft((d) => ({ ...d, channels: { ...d.channels, [key]: !d.channels[key] } }));
  };

  const saveAlerts = async () => {
    setSavingAlerts(true);
    setAlertSaveMsg(null);
    try {
      await saveSettings(draft);
      setAlertSaveMsg('Alert settings saved.');
    } catch (err) {
      setAlertSaveMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAlerts(false);
    }
  };

  const enableNotifications = async () => {
    try {
      setPermission(await requestPermission());
    } catch {
      setPermission('denied');
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testAlerts());
    } catch (err) {
      setTestResult({
        sent: false,
        results: {
          telegram: err instanceof Error ? err.message : String(err),
          email: 'not attempted',
        },
      });
    } finally {
      setTesting(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    setMsg(null);
    try {
      const res = await fetch('/api/market/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(`refresh failed (${res.status})`);
      setMsg('Market data cache cleared — fresh data will be fetched on next request.');
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Disclaimer className="text-center" />
      <h1 className="text-lg font-bold text-white">Settings</h1>

      {error && <div className="card text-red-400 text-sm">{error}</div>}

      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-3">AI chat provider</h3>
        {data && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Status</span>
              <span
                className={data.llm_configured ? 'text-emerald-400' : 'text-amber-300'}
              >
                {data.llm_configured ? `Connected (${data.llm_provider})` : 'Not configured'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Model</span>
              <span className="font-mono text-white">{data.llm_model ?? 'provider default'}</span>
            </div>
            <div className="rounded-lg bg-black/30 border border-white/10 p-3 text-xs text-slate-400">
              AI keys are configured by the server administrator and are never exposed
              to the browser. Restart the backend after changing server configuration.
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-3">Strategy parameters</h3>
        {data && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">ML horizon</span>
              <span className="font-mono text-white">{data.ml_horizon} candles</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Buy threshold</span>
              <span className="font-mono text-white">{data.buy_threshold}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Sell threshold</span>
              <span className="font-mono text-white">{data.sell_threshold}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Gold spread ($/oz)</span>
              <span className="font-mono text-white">${data.spread_usd}/oz</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Commission</span>
              <span className="font-mono text-white">${data.commission_usd}/trade</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Backtest window</span>
              <span className="font-mono text-white">{data.backtest_years} years</span>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-2">Market data</h3>
        <p className="text-xs text-slate-400 mb-3">
          Data comes from Yahoo Finance (yfinance) and is cached (60s intraday, 30min
          daily) to respect rate limits. If Yahoo throttles requests, the app falls
          back to cached or clearly-labelled fallback data.
        </p>
        <div className="flex gap-2">
          <button className="btn-gold" onClick={() => void refreshData()} disabled={refreshing}>
            {refreshing ? 'Clearing…' : 'Force data refresh'}
          </button>
          <button className="btn-ghost" onClick={() => void reload()}>
            Reload settings
          </button>
        </div>
        {msg && <p className="text-xs text-slate-400 mt-2">{msg}</p>}
        <p className="text-[10px] text-slate-600 mt-3">Storage is managed by the server.</p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Alerts</h3>
          <span
            className={`text-[10px] uppercase tracking-wider ${
              connected ? 'text-emerald-400' : 'text-slate-500'
            }`}
          >
            {connected ? 'Live stream' : 'Connecting…'}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-slate-400 mb-2">Timeframes</p>
            <div className="flex flex-wrap gap-3">
              {['15m', '1h', '4h', '1D'].map((tf) => (
                <label key={tf} className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={draft.timeframes.includes(tf)}
                    onChange={() => toggleTimeframe(tf)}
                    className="accent-gold"
                  />
                  {tf}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="alert-min-grade" className="block text-xs text-slate-400 mb-2">
              Minimum grade
            </label>
            <select
              id="alert-min-grade"
              value={draft.min_grade}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  min_grade: e.target.value as AlertSettings['min_grade'],
                }))
              }
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white"
            >
              <option value="A+">A+</option>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-2">Channels</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                [
                  ['browser', 'Browser'],
                  ['sound', 'Sound'],
                  ['toast', 'In-app toast'],
                  ['telegram', 'Telegram'],
                  ['email', 'Email'],
                ] as const
              ).map(([key, label]) => {
                const configured =
                  key === 'telegram'
                    ? settings?.telegram_configured === true
                    : key === 'email'
                      ? settings?.email_configured === true
                      : true;
                return (
                  <label
                    key={key}
                    title={configured ? undefined : 'Not configured — set credentials in backend/.env'}
                    className={`flex items-center gap-2 text-sm ${
                      configured ? 'text-slate-200' : 'text-slate-500 opacity-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={draft.channels[key]}
                      onChange={() => toggleChannel(key)}
                      className="accent-gold"
                    />
                    {label}
                    {!configured && <span className="text-[10px]">(not configured)</span>}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-slate-600">
              Telegram and email secrets come only from backend/.env — they are never
              exposed to the browser.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-gold" onClick={() => void saveAlerts()} disabled={savingAlerts}>
              {savingAlerts ? 'Saving…' : 'Save alert settings'}
            </button>
            <button
              className="btn-ghost"
              onClick={() => void enableNotifications()}
              disabled={permission === 'granted'}
            >
              {permission === 'granted' ? 'Notifications enabled' : 'Enable browser notifications'}
            </button>
            <button className="btn-ghost" onClick={() => void sendTest()} disabled={testing}>
              {testing ? 'Sending…' : 'Send test alert'}
            </button>
          </div>

          {alertSaveMsg && <p className="text-xs text-slate-400">{alertSaveMsg}</p>}
          {permission === 'denied' && (
            <p className="text-[10px] text-amber-300">Browser notifications are blocked for this site.</p>
          )}
          {testResult && (
            <div className="space-y-1 rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
              <p className={testResult.sent ? 'text-emerald-400' : 'text-amber-300'}>
                Test alert {testResult.sent ? 'sent' : 'not sent'}
              </p>
              <p className="text-slate-400">
                Telegram: <span className="text-slate-200">{testResult.results.telegram}</span>
              </p>
              <p className="text-slate-400">
                Email: <span className="text-slate-200">{testResult.results.email}</span>
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-white/5 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">
              Alert history {alerts.length > 0 && <span className="text-slate-500">({alerts.length})</span>}
            </p>
            <button
              className="text-[10px] text-slate-500 hover:text-slate-300"
              onClick={clearToasts}
            >
              Clear toasts
            </button>
          </div>
          {alerts.length === 0 ? (
            <p className="text-xs text-slate-500">No alerts yet.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {[...alerts].reverse().slice(0, 20).map((a, i) => (
                <li key={`${a.id}-${i}`} className="flex gap-2 border-b border-white/5 pb-1 text-xs">
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">{a.time}</span>
                  <span className="shrink-0 uppercase text-gold">{a.type}</span>
                  <span className="text-slate-300">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card border-amber-500/20 bg-amber-500/5">
        <h3 className="text-sm font-semibold text-amber-200 mb-2">Risk disclosure</h3>
        <p className="text-xs text-amber-100/80 leading-relaxed">
          Gold leveraged trading can wipe out your account. Signals produced by this app
          are experimental, based on historical patterns, and will sometimes be wrong.
          Backtested results include costs but exclude slippage and may not reflect live
          conditions. Never risk money you cannot afford to lose. This application is for
          education only and is not financial advice.
        </p>
      </div>
    </div>
  );
}
