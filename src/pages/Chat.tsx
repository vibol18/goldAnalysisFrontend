import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, streamChat } from '../api/client';
import type { ChatMeta } from '../api/client';
import Disclaimer from '../components/Disclaimer';
import type { ChatMessage } from '../types';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Why is gold moving today?',
  'Explain the current signal',
  'Is it a good time to buy?',
  'What do DXY and yields mean for gold?',
];

/** AI chat page with SSE streaming and live market context injection. */
export default function Chat() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [liveQuote, setLiveQuote] = useState<ChatMeta['candle']>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const hist = await api.chatHistory();
        setMessages(
          hist.messages.map((m: ChatMessage) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
        );
        setConfigured(hist.llm_configured);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || streaming) return;
    setInput('');
    setError(null);
    setStreaming(true);
    const history = [...messages];
    setMessages((m) => [...m, { role: 'user', content: message }, { role: 'assistant', content: '' }]);

    try {
      await streamChat(
        message,
        history.slice(-8),
        (delta) => {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: last.content + delta };
            }
            return copy;
          }          );
        },
        (meta) => {
          if (meta.candle) setLiveQuote(meta.candle);
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          copy[copy.length - 1] = {
            role: 'assistant',
            content: `⚠ ${msg}`,
          };
        }
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const clear = async () => {
    try {
      await api.clearChat();
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const lastAssistantEmpty =
    messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant' &&
    messages[messages.length - 1].content === '';

  return (
    <div className="space-y-4">
      <Disclaimer className="text-center" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-white">AI gold analyst</h1>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-2 py-1 rounded ${
              configured
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-amber-500/15 text-amber-300'
            }`}
          >
            {configured === null
              ? 'checking…'
              : configured
                ? 'LLM connected'
                : 'LLM not configured (see Settings)'}
          </span>
          <button className="btn-ghost text-xs" onClick={() => void clear()}>
            Clear chat
          </button>
        </div>
      </div>

      {liveQuote && (
        <div className="card flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-400">
            XAU/USD (Gold) · candle {new Date(liveQuote.time).toLocaleTimeString()}
          </span>
          <span className="font-mono text-lg text-white">
            {liveQuote.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $/oz
          </span>
          <span className={liveQuote.stale ? 'text-amber-300' : 'text-emerald-400'}>
            {liveQuote.stale ? 'STALE' : 'LIVE'}
          </span>
        </div>
      )}

      <div className="card flex flex-col h-[60vh] min-h-[380px]">
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-slate-400 text-sm max-w-md">
                Ask about gold: why prices moved, what the current signal means, or how
                DXY and yields are affecting XAU/USD. Context (live price, indicators,
                signal, news sentiment) is injected into every reply.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="btn-ghost text-xs" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-gold/15 text-gold-soft border border-gold/25'
                    : 'bg-white/5 text-slate-200 border border-white/10'
                }`}
              >
                <span className="block text-[9px] uppercase tracking-wider text-slate-500 mb-1">
                  {m.role === 'user' ? 'You' : 'GoldSight AI'}
                </span>
                {m.content || (lastAssistantEmpty && i === messages.length - 1 ? 'Thinking…' : '')}
                {streaming && i === messages.length - 1 && m.role === 'assistant' && (
                  <span className="caret" />
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

        <form onSubmit={onSubmit} className="mt-3 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Ask about gold… (e.g. Why is gold going up today?)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            maxLength={4000}
            aria-label="Chat message"
          />
          <button type="submit" className="btn-gold" disabled={streaming || !input.trim()}>
            {streaming ? '…' : 'Send'}
          </button>
        </form>
      </div>

      <p className="text-[10px] text-slate-500 text-center">
        AI replies are generated from live market context but can be wrong or stale.
        The assistant never promises profit. Educational analysis only — not financial advice.
      </p>
    </div>
  );
}
