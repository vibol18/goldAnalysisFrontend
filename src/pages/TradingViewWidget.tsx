import { useEffect } from 'react';
import Disclaimer from '../components/Disclaimer';

declare global {
  interface Window {
    TradingView?: unknown;
  }
}

export default function TradingViewWidget() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      const tradingView = (window as unknown as {
        TradingView?: new (options: Record<string, unknown>) => unknown;
      }).TradingView;
      if (!tradingView) return;
      new tradingView({
        autosize: true,
        symbol: 'FOREXCOM:XAUUSD',
        interval: '60',
        timezone: 'Asia/Phnom_Penh',
        theme: 'dark',
        style: '1',
        locale: 'en',
        hide_legend: false,
        save_image: false,
        container_id: 'tradingview-chart',
      });
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  return (
    <div className="space-y-4">
      <Disclaimer className="text-center" />
      <div className="card border border-amber-400/30 text-xs text-amber-200">
        <strong>Display only.</strong> This official TradingView widget shows FOREXCOM:XAUUSD.
        Meas Pro signals are calculated only from Meas Pro's own active data source.
      </div>
      <div className="card overflow-hidden !p-0">
        <div id="tradingview-chart" className="h-[650px] w-full" />
      </div>
    </div>
  );
}
