import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Disclaimer from '../components/Disclaimer';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { LearnResponse } from '../types';

const CATEGORY_LABELS: Record<string, string> = {
  structure: 'A · Market structure',
  smc: 'B · Smart money / ICT',
  classic: 'C · Classic technical analysis',
  price_action: 'D · Price action & candlesticks',
  mtf: 'E · Multi-timeframe',
  macro: 'F · Macro & sentiment',
};

/** Educational catalogue of every concept the engine can detect on gold. */
export default function Learn() {
  const navigate = useNavigate();
  const { data, error, loading } = usePolling<LearnResponse>(() => api.learn(), 0, []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const concepts = useMemo(() => {
    return (data?.concepts ?? []).filter((c) => {
      const matchesCategory = category === 'all' || c.category === category;
      const q = query.trim().toLowerCase();
      const matchesQuery = !q || `${c.title} ${c.type} ${c.definition}`.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [data, query, category]);

  const grouped = useMemo(() => {
    const out = new Map<string, typeof concepts>();
    for (const c of concepts) {
      if (!out.has(c.category)) out.set(c.category, []);
      out.get(c.category)!.push(c);
    }
    return [...out.entries()];
  }, [concepts]);

  return (
    <div className="space-y-4">
      <Disclaimer className="text-center" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Learn the concepts</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {data?.total ?? 0} XAU/USD trading concepts detected in real gold candles
          </p>
        </div>
        <input
          className="input w-56"
          placeholder="Search concepts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search concepts"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['all', ...(data?.categories ?? [])].map((key) => (
          <button
            key={key}
            className={`btn text-xs ${category === key ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => setCategory(key)}
          >
            {key === 'all' ? 'All' : (CATEGORY_LABELS[key] ?? key.replace(/_/g, ' '))}
          </button>
        ))}
      </div>

      {loading && !data && <div className="card animate-pulse text-slate-500 text-sm">Loading concept library…</div>}
      {error && <div className="card text-red-400 text-sm">{error}</div>}

      {grouped.map(([key, items]) => (
        <div key={key} className="space-y-2">
          <h2 className="text-sm font-semibold text-gold pt-2">
            {CATEGORY_LABELS[key] ?? key.replace(/_/g, ' ')} · {items.length}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((c) => (
              <div key={c.type} className="card flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">{c.title}</h3>
                  <span className="font-mono text-[9px] text-slate-600">{c.type}</span>
                </div>
                <p className="text-xs text-slate-400 mt-2 flex-1">{c.definition}</p>
                <p className="text-[10px] text-slate-500 mt-2 italic">{c.example}</p>
                <button
                  className="btn-ghost text-xs mt-3 self-start"
                  onClick={() => navigate(`/?concept=${encodeURIComponent(c.type)}`)}
                >
                  Show me on the chart →
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {data && concepts.length === 0 && (
        <div className="card text-slate-500 text-sm">No concepts match that search.</div>
      )}

      <p className="text-[10px] text-slate-500 text-center">
        Educational analysis only. Not financial advice. Signals can be wrong.
        Never risk money you can't afford to lose.
      </p>
    </div>
  );
}
