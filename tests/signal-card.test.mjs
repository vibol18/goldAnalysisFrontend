import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const built = buildSync({
  entryPoints: ['src/components/SignalCard.tsx'],
  bundle: false,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  loader: { '.tsx': 'tsx' },
  write: false,
});
const module_ = { exports: {} };
new Function('require', 'module', 'exports', built.outputFiles[0].text)(
  require, module_, module_.exports,
);
const SignalCard = module_.exports.default;

const base = {
  confidence: 68, rule_score: 0.42, final_score: 0.5, ml_probability: 0.55,
  price: 3604.3, entry: 3604.3, stop_loss: 3582.73,
  take_profit1: 3625.87, take_profit2: 3647.43, take_profit3: null,
  risk_reward: 2, risk_reward_tp1: 1, risk_reward_tp2: 2, atr: 21.57,
  timeframe: '1h', grade: 'A', created_at: '2026-11-23T00:00:00Z',
  explanation: { narrative: 'setup', reasons: ['factor'], confluence: null },
};

test('HOLD card shows no trade and never shows entry/SL/TP/R:R numbers', () => {
  const html = renderToStaticMarkup(React.createElement(SignalCard, {
    signal: {
      ...base, action: 'HOLD', grade: 'C',
      explanation: {
        ...base.explanation,
        why_not_trading: 'No trade taken: HTF disagrees.',
        trade_plan: { entry_zone: null, direction: 'unconfirmed' },
      },
    },
  }));
  assert.match(html, /No active trade/);
  assert.match(html, /HTF disagrees/);
  assert.doesNotMatch(html, /Entry \(\$\/oz\)/);
  assert.doesNotMatch(html, /Stop loss \(\$\/oz\)/);
  assert.doesNotMatch(html, /Risk : Reward/);
});

test('BUY card shows correct direction, levels and both R:R values', () => {
  const html = renderToStaticMarkup(React.createElement(SignalCard, {
    signal: { ...base, action: 'BUY' },
  }));
  assert.match(html, /BUY/);
  assert.match(html, /3,604\.30/);
  assert.match(html, /3,582\.73/);
  assert.match(html, /3,625\.87/);
  assert.match(html, /3,647\.43/);
  assert.match(html, /TP1 1:1\.0/);
  assert.match(html, /TP2 1:2\.0/);
  assert.doesNotMatch(html, /No active trade/);
});

test('SELL card keeps the same levels but shows SELL wording', () => {
  const html = renderToStaticMarkup(React.createElement(SignalCard, {
    signal: { ...base, action: 'SELL', style: undefined },
  }));
  assert.match(html, /SELL/);
  assert.match(html, /TP1 1:1\.0/);
  assert.match(html, /TP2 1:2\.0/);
  assert.doesNotMatch(html, /No active trade/);
});
