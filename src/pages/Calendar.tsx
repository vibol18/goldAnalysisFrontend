import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { useLiveStream } from '../lib/liveStream';
import Disclaimer from '../components/Disclaimer';
import type { CalendarEvent, CalendarResponse } from '../types';

const IMPACT_STYLE: Record<string, string> = {
  high: 'text-red-300 bg-red-500/10 border-red-500/30',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  low: 'text-slate-300 bg-white/5 border-white/10',
};

function toInput(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
}

function fromInput(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function useCountdown(iso: string | null | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!iso) return null;
  const delta = new Date(iso).getTime() - now;
  if (!Number.isFinite(delta)) return null;
  const sign = delta < 0 ? '-' : '';
  const abs = Math.abs(delta);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  return `${sign}${days > 0 ? `${days}d ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Editable economic calendar with high-impact signal blocking and countdown. */
export default function CalendarPage() {
  const { data, error, loading, reload } = usePolling<CalendarResponse>(
    () => api.calendar(), 30_000, [],
  );
  const { status } = useLiveStream();
  const [draft, setDraft] = useState<CalendarEvent[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const countdown = useCountdown(data?.countdown?.next?.time);

  useEffect(() => {
    if (data && !dirty) {
      setDraft(data.editable_events.map((e) => ({ ...e })));
    }
  }, [data, dirty]);

  function update(index: number, patch: Partial<CalendarEvent>) {
    setDraft((prev) => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
    setDirty(true);
  }

  function addEvent() {
    setDraft((prev) => [...prev, {
      title: 'New event', time: new Date(Date.now() + 3_600_000).toISOString(),
      impact: 'medium', forecast: '', actual: '', previous: '',
    }]);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      await api.saveEvents(draft);
      setDirty(false);
      setMessage('Calendar saved. High-impact events block signals for 12 hours.');
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save calendar');
    } finally {
      setSaving(false);
    }
  }

  const blocking = data?.blocking_now;

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-white">Economic calendar</h1>
              <p className="text-xs text-slate-400 mt-1">
                Edit events, block signals around high-impact releases, and track the next event.
              </p>
            </div>
            <span className={`text-[10px] uppercase tracking-wider ${status.state === 'live' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {status.state === 'live' ? 'LIVE' : 'STALE'}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="rounded-xl border border-gold/20 bg-gold/5 px-4 py-3">
              <span className="label">Next event in</span>
              <div className="font-mono text-2xl font-bold text-gold">{countdown ?? 'N/A'}</div>
              <div className="text-xs text-slate-400">
                {data?.countdown?.next
                  ? `${data.countdown.next.title} · ${new Date(data.countdown.next.time).toUTCString()}`
                  : 'No upcoming events'}
              </div>
            </div>
            <div className={`rounded-xl border px-4 py-3 ${blocking ? 'border-red-500/40 bg-red-500/10' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
              <span className="label">Signal filter</span>
              <div className={`text-sm font-bold ${blocking ? 'text-red-300' : 'text-emerald-300'}`}>
                {blocking ? 'SIGNALS BLOCKED' : 'SIGNALS ALLOWED'}
              </div>
              <div className="text-xs text-slate-400">
                {blocking
                  ? `${data?.blocking?.name} in ${data?.blocking?.hours_away}h`
                  : `${data?.block_window_hours ?? 12}h window around high-impact events`}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <h2 className="text-base font-bold text-white mb-3">Upcoming feed</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(data?.events ?? []).filter((e) => new Date(e.time).getTime() >= Date.now())
              .slice(0, 12).map((e, i) => (
                <div key={`${e.title}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-300">{e.title}</span>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase ${IMPACT_STYLE[e.impact] ?? IMPACT_STYLE.low}`}>
                    {e.impact}
                  </span>
                  <span className="shrink-0 font-mono text-slate-500">
                    {new Date(e.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            {!data?.events?.length && <p className="text-sm text-slate-500">No events available.</p>}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-bold text-white">Your events (editable)</h2>
          <div className="flex items-center gap-2">
            <button className="btn-ghost" type="button" onClick={addEvent}>+ Add event</button>
            <button className="btn-gold" type="button" onClick={save} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save calendar'}
            </button>
          </div>
        </div>
        {message && <p className="text-xs text-gold mb-2">{message}</p>}
        {error && <p className="text-xs text-red-300 mb-2">{error}</p>}
        {loading && !data && <p className="text-sm text-slate-400">Loading calendar…</p>}
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 text-left">
              <th className="py-2 pr-2">Title</th><th className="py-2 pr-2">Time (UTC)</th>
              <th className="py-2 pr-2">Impact</th><th className="py-2 pr-2">Forecast</th>
              <th className="py-2 pr-2">Actual</th><th className="py-2 pr-2">Previous</th><th />
            </tr>
          </thead>
          <tbody>
            {draft.map((e, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="py-1.5 pr-2"><input className="input w-36" value={e.title} onChange={(ev) => update(i, { title: ev.target.value })} /></td>
                <td className="py-1.5 pr-2"><input className="input w-40" type="datetime-local" value={toInput(e.time)} onChange={(ev) => update(i, { time: fromInput(ev.target.value) })} /></td>
                <td className="py-1.5 pr-2">
                  <select className="input w-24" value={e.impact} onChange={(ev) => update(i, { impact: ev.target.value as CalendarEvent['impact'] })}>
                    <option value="high">high</option><option value="medium">medium</option><option value="low">low</option>
                  </select>
                </td>
                <td className="py-1.5 pr-2"><input className="input w-20" value={e.forecast ?? ''} onChange={(ev) => update(i, { forecast: ev.target.value })} /></td>
                <td className="py-1.5 pr-2"><input className="input w-20" value={e.actual ?? ''} onChange={(ev) => update(i, { actual: ev.target.value })} /></td>
                <td className="py-1.5 pr-2"><input className="input w-20" value={e.previous ?? ''} onChange={(ev) => update(i, { previous: ev.target.value })} /></td>
                <td className="py-1.5"><button className="btn-ghost" type="button" onClick={() => { setDraft((prev) => prev.filter((_, j) => j !== i)); setDirty(true); }}>✕</button></td>
              </tr>
            ))}
            {!draft.length && <tr><td colSpan={7} className="py-4 text-slate-500">No custom events yet. Add one to block signals around a release.</td></tr>}
          </tbody>
        </table>
      </div>
      <Disclaimer />
    </section>
  );
}
