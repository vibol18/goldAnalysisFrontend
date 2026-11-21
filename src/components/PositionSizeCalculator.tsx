import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Signal } from '../types';

interface Props {
  price: number;
  signal?: Signal | null;
}

interface SizeResult {
  risk_amount: number;
  units: number;
  lots_std: number;
  notional: number | null;
  disclaimer: string;
}

/** Position size calculator: account size, risk %, stop distance -> units. */
export default function PositionSizeCalculator({ price, signal }: Props) {
  const [account, setAccount] = useState('10000');
  const [riskPct, setRiskPct] = useState('1');
  const [stopDistance, setStopDistance] = useState('10');
  const [result, setResult] = useState<SizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (signal && signal.action !== 'HOLD' && signal.stop_loss) {
      const distance = Math.abs((signal.entry || signal.price) - signal.stop_loss);
      if (Number.isFinite(distance) && distance > 0) setStopDistance(distance.toFixed(2));
    }
  }, [signal?.id, signal?.action, signal?.entry, signal?.stop_loss, signal?.price]);

  const linked = signal && signal.action !== 'HOLD' && signal.stop_loss ? signal : null;
  const effectivePrice = linked ? (linked.entry || linked.price || price) : price;

  const calculate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.positionSize({
        account_size: Number(account),
        risk_pct: Number(riskPct),
        stop_distance: Number(stopDistance),
        price: effectivePrice,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-white">Gold position size (XAU/USD)</h3>
        {linked && (
          <span className="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[10px] text-gold">
            Linked: {linked.action} {linked.grade ?? ''}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label" htmlFor="ps-account">Account ($)</label>
          <input
            id="ps-account"
            className="input font-mono"
            value={account}
            inputMode="decimal"
            onChange={(e) => setAccount(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="ps-risk">Risk %</label>
          <input
            id="ps-risk"
            className="input font-mono"
            value={riskPct}
            inputMode="decimal"
            onChange={(e) => setRiskPct(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="ps-stop">Stop dist ($/oz)</label>
          <input
            id="ps-stop"
            className="input font-mono"
            value={stopDistance}
            inputMode="decimal"
            onChange={(e) => setStopDistance(e.target.value)}
          />
        </div>
      </div>
      <button className="btn-gold mt-3" onClick={() => void calculate()} disabled={busy}>
        {busy ? 'Calculating…' : 'Calculate'}
      </button>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {result && (
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-white/5 pt-3">
          <div>
            <span className="label">Risk amount</span>
            <span className="font-mono text-white">${result.risk_amount.toFixed(2)}</span>
          </div>
          <div>
            <span className="label">Units (oz)</span>
            <span className="font-mono text-gold">{result.units.toFixed(2)}</span>
          </div>
          <div>
            <span className="label">Std lots (100 oz)</span>
            <span className="font-mono text-white">{result.lots_std.toFixed(3)}</span>
          </div>
          {result.notional !== null && (
            <div>
              <span className="label">Gold notional</span>
              <span className="font-mono text-white">${result.notional.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-slate-500 mt-3">
        Sizing controls risk per trade; it cannot prevent losses. Not financial advice.
      </p>
    </div>
  );
}
