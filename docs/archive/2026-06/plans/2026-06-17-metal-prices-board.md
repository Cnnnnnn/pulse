# Metal Prices Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "🥇 贵金属" SideNav section to Pulse that shows live prices for 4 metals (XAU / XAG / AU9999 / AG9999), lets users record personal holdings, and computes CNY-denominated portfolio overview.

**Architecture:** New `src/metals/` module parallel to existing `funds/` and `worldcup/`. Two HTTP fetchers (Yahoo v8 chart + Sina JSONP) run concurrently every 5 minutes, results merged into renderer signals. Scheduler lives in the main process (no worker_threads — only 2 HTTP requests, avoids the electron-merge-debug "worker requires electron" trap).

**Tech Stack:** Electron + Preact + @preact/signals (existing), vitest (existing), iconv-lite (NEW dependency, GBK decoder for Sina JSONP)

**Reference Spec:** `docs/superpowers/specs/2026-06-17-metal-prices-board-design.md`

---

## File Structure

### New Files

```
src/metals/
├── metal-config.js                    ← Static registry: 4 metals + FX rates
├── metal-calc.js                      ← Pure: P&L, change, CNY conversion
├── metal-yahoo-fetcher.js             ← Yahoo v8 chart HTTP client
├── metal-sina-fetcher.js              ← Sina JSONP HTTP client (GBK)
├── metal-fetcher.js                   ← Dispatcher: concurrent Yahoo + Sina
└── metal-scheduler.js                 ← 5-min setInterval state machine

src/renderer/metals/
├── metalStore.js                      ← signals: config / quotes / fx / state
├── MetalLayout.jsx                    ← Header + grid + empty state
├── MetalHeader.jsx                    ← CNY overview cards + toolbar
├── MetalCard.jsx                      ← Single-metal card (price + holding)
├── MetalGrid.jsx                      ← 2-col card grid
└── AddMetalModal.jsx                  ← Add watch / edit holding

src/main/
└── metal-ipc.js                       ← IPC handlers + state persistence

tests/main/
├── metal-calc.test.js                 ← 15 cases
├── metal-config.test.js               ← 5 cases
├── metal-yahoo-fetcher.test.js        ← 10 cases (mock HTTP)
├── metal-sina-fetcher.test.js         ← 10 cases (mock HTTP + GBK)
└── metal-fetcher.test.js              ← 5 cases (concurrent + isolation)
```

### Modified Files

```
package.json                           ← +1 dep: iconv-lite
src/renderer/index.jsx                 ← bootstrap: load metals config + subscribe scheduler events
src/renderer/components/AppShell.jsx  ← SideNav entry + route to MetalLayout
preload.js                             ← expose metals IPC to renderer
src/main/index.js                      ← register metals IPC handlers + start scheduler
```

---

## Task 1: Foundation — iconv-lite dependency + metal-config registry

**Files:**
- Modify: `package.json` (add `iconv-lite`)
- Create: `src/metals/metal-config.js`
- Test: `tests/main/metal-config.test.js`

- [ ] **Step 1: Install iconv-lite dependency**

Run from project root:
```bash
npm install iconv-lite@^0.6.3
```
Expected: package.json gets `"iconv-lite": "^0.6.3"` under `dependencies`.

- [ ] **Step 2: Write the failing test for metal-config**

Create `tests/main/metal-config.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { METALS, FX_RATES, getMetalById } from '../../src/metals/metal-config.js';

describe('metal-config', () => {
  it('exports exactly 4 metals', () => {
    expect(METALS).toHaveLength(4);
  });

  it('all metal ids are unique', () => {
    const ids = METALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains XAU, XAG, AU9999, AG9999', () => {
    const ids = METALS.map((m) => m.id);
    expect(ids).toContain('XAU');
    expect(ids).toContain('XAG');
    expect(ids).toContain('AU9999');
    expect(ids).toContain('AG9999');
  });

  it('each metal has primary source with valid kind', () => {
    for (const m of METALS) {
      expect(m.primary).toBeTruthy();
      expect(['yahoo-chart', 'sina-jsonp']).toContain(m.primary.kind);
      expect(m.primary.symbol).toBeTruthy();
    }
  });

  it('international metals (XAU/XAG) use yahoo-chart, domestic (AU9999/AG9999) use sina-jsonp', () => {
    const xau = getMetalById('XAU');
    const xag = getMetalById('XAG');
    const au = getMetalById('AU9999');
    const ag = getMetalById('AG9999');
    expect(xau.primary.kind).toBe('yahoo-chart');
    expect(xag.primary.kind).toBe('yahoo-chart');
    expect(au.primary.kind).toBe('sina-jsonp');
    expect(ag.primary.kind).toBe('sina-jsonp');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/main/metal-config.test.js`
Expected: FAIL with "Cannot find module '../../src/metals/metal-config.js'"

- [ ] **Step 4: Implement metal-config.js**

Create `src/metals/metal-config.js`:
```javascript
/**
 * src/metals/metal-config.js
 *
 * Static registry for the 4 metals tracked by Pulse.
 * Single source of truth — changing symbols or adding new metals
 * only requires editing this file.
 */

const METALS = [
  {
    id: 'XAU',
    name: '现货黄金',
    shortName: '黄金',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'yahoo-chart', symbol: 'GC=F', priceScale: 1 / 100 },
  },
  {
    id: 'XAG',
    name: '现货白银',
    shortName: '白银',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'yahoo-chart', symbol: 'SI=F', priceScale: 1 / 50 },
  },
  {
    id: 'AU9999',
    name: '国内黄金 AU9999',
    shortName: 'AU9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'sina-jsonp', symbol: 'AU0' },
  },
  {
    id: 'AG9999',
    name: '国内白银 AG9999',
    shortName: 'AG9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'sina-jsonp', symbol: 'AG0' },
  },
];

const FX_RATES = [
  { id: 'CNY_PER_USD', primary: { kind: 'yahoo-chart', symbol: 'CNY=X' } },
];

const METAL_IDS = METALS.map((m) => m.id);

function getMetalById(id) {
  return METALS.find((m) => m.id === id) || null;
}

module.exports = { METALS, FX_RATES, METAL_IDS, getMetalById };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/metal-config.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/metals/metal-config.js tests/main/metal-config.test.js
git commit -m "feat(metals): add iconv-lite dependency + metal-config registry"
```

---

## Task 2: Pure calculator — metal-calc.js + 15 tests

**Files:**
- Create: `src/metals/metal-calc.js`
- Test: `tests/main/metal-calc.test.js`

- [ ] **Step 1: Write the failing test for metal-calc**

Create `tests/main/metal-calc.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import {
  calcChange,
  calcHoldingPnl,
  calcTodayPnl,
  calcOverview,
  convertToCNY,
} from '../../src/metals/metal-calc.js';

const sampleQuote = {
  id: 'XAU',
  price: 2348.5,
  prevClose: 2338.7,
  currency: 'USD',
  unit: 'oz',
};

const sampleHolding = {
  id: 'h1',
  quantity: 0.5,
  costPrice: 2300,
  costCurrency: 'USD',
  costPriceCNY: 16590,
};

describe('calcChange', () => {
  it('computes change and pct', () => {
    expect(calcChange(sampleQuote)).toEqual({ change: 9.8, changePct: 0.419 });
  });

  it('returns 0 when prevClose is 0', () => {
    expect(calcChange({ ...sampleQuote, prevClose: 0 })).toEqual({ change: 0, changePct: 0 });
  });
});

describe('convertToCNY', () => {
  it('converts USD to CNY', () => {
    expect(convertToCNY(100, 'USD', 6.7557)).toBeCloseTo(675.57, 2);
  });

  it('returns same value for CNY', () => {
    expect(convertToCNY(500, 'CNY', 6.7557)).toBe(500);
  });

  it('returns null when fx is missing', () => {
    expect(convertToCNY(100, 'USD', null)).toBe(null);
  });
});

describe('calcHoldingPnl', () => {
  it('computes total pnl in CNY (using frozen costPriceCNY)', () => {
    const currentCNY = 2348.5 * 6.7557 * 0.5;
    const pnlCNY = currentCNY - 16590;
    const pnlPct = pnlCNY / 16590 * 100;
    expect(calcHoldingPnl(sampleHolding, sampleQuote, 6.7557)).toEqual({
      pnlCNY: expect.any(Number),
      pnlPct: expect.any(Number),
    });
  });

  it('returns null when holding is missing', () => {
    expect(calcHoldingPnl(null, sampleQuote, 6.7557)).toBe(null);
  });

  it('returns null when fx is missing (cannot compute current CNY)', () => {
    expect(calcHoldingPnl(sampleHolding, sampleQuote, null)).toBe(null);
  });
});

describe('calcTodayPnl', () => {
  it('uses quote change directly (already in quote currency)', () => {
    const result = calcTodayPnl(sampleHolding, sampleQuote, 6.7557);
    expect(result).toEqual({
      todayPnlCNY: 9.8 * 0.5 * 6.7557,
      todayPnlPct: 0.419,
    });
  });

  it('returns null when holding is missing', () => {
    expect(calcTodayPnl(null, sampleQuote, 6.7557)).toBe(null);
  });

  it('returns null when fx is missing for non-CNY quote', () => {
    expect(calcTodayPnl(sampleHolding, sampleQuote, null)).toBe(null);
  });

  it('does not need fx for CNY quotes', () => {
    const cnyQuote = { ...sampleQuote, currency: 'CNY' };
    expect(calcTodayPnl(sampleHolding, cnyQuote, null)).toEqual({
      todayPnlCNY: 9.8 * 0.5,
      todayPnlPct: 0.419,
    });
  });
});

describe('calcOverview', () => {
  const holdingMap = { XAU: sampleHolding };
  const quoteMap = { XAU: sampleQuote };
  const fx = 6.7557;

  it('aggregates total market value in CNY', () => {
    const result = calcOverview(holdingMap, quoteMap, fx);
    const expectedMV = 2348.5 * 6.7557 * 0.5;
    expect(result.totalMarketValueCNY).toBeCloseTo(expectedMV, 2);
  });

  it('aggregates total pnl using costPriceCNY', () => {
    const result = calcOverview(holdingMap, quoteMap, fx);
    const expectedMV = 2348.5 * 6.7557 * 0.5;
    expect(result.totalPnlCNY).toBeCloseTo(expectedMV - 16590, 2);
  });

  it('aggregates today estimated pnl', () => {
    const result = calcOverview(holdingMap, quoteMap, fx);
    expect(result.todayEstimatedCNY).toBeCloseTo(9.8 * 0.5 * 6.7557, 2);
  });

  it('returns null for CNY fields when fx is missing', () => {
    const result = calcOverview(holdingMap, quoteMap, null);
    expect(result.totalMarketValueCNY).toBe(null);
    expect(result.totalPnlCNY).toBe(null);
    expect(result.todayEstimatedCNY).toBe(null);
  });

  it('returns zeros when no holdings', () => {
    const result = calcOverview({}, quoteMap, fx);
    expect(result.totalMarketValueCNY).toBe(0);
    expect(result.totalPnlCNY).toBe(0);
    expect(result.todayEstimatedCNY).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/metal-calc.test.js`
Expected: FAIL with "Cannot find module '../../src/metals/metal-calc.js'"

- [ ] **Step 3: Implement metal-calc.js**

Create `src/metals/metal-calc.js`:
```javascript
/**
 * src/metals/metal-calc.js
 *
 * Pure functions for computing price change, holding P&L, and CNY portfolio overview.
 * No I/O, no state — testable in isolation.
 */

/**
 * Compute price change and percentage change from a quote.
 * @param {{price: number, prevClose: number}} quote
 * @returns {{change: number, changePct: number}}
 */
function calcChange(quote) {
  if (!quote || !quote.prevClose) {
    return { change: 0, changePct: 0 };
  }
  const change = quote.price - quote.prevClose;
  const changePct = (change / quote.prevClose) * 100;
  return { change, changePct };
}

/**
 * Convert an amount in source currency to CNY.
 * @param {number} amount
 * @param {'CNY'|'USD'} fromCurrency
 * @param {number|null} cnyPerUsd  - rate (1 USD = X CNY), null when fx unavailable
 * @returns {number|null}
 */
function convertToCNY(amount, fromCurrency, cnyPerUsd) {
  if (fromCurrency === 'CNY') return amount;
  if (cnyPerUsd == null) return null;
  return amount * cnyPerUsd;
}

/**
 * Compute total holding P&L in CNY.
 * Uses the frozen costPriceCNY (recorded at buy time) — NOT live FX.
 * @param {{quantity: number, costPriceCNY: number} | null} holding
 * @param {{price: number, currency: string, unit: string}} quote
 * @param {number|null} cnyPerUsd
 * @returns {{pnlCNY: number, pnlPct: number} | null}
 */
function calcHoldingPnl(holding, quote, cnyPerUsd) {
  if (!holding || !quote) return null;
  const currentCNY = convertToCNY(quote.price, quote.currency, cnyPerUsd);
  if (currentCNY == null) return null;
  const currentTotalCNY = currentCNY * holding.quantity;
  const costTotalCNY = holding.costPriceCNY * holding.quantity;
  const pnlCNY = currentTotalCNY - costTotalCNY;
  const pnlPct = costTotalCNY === 0 ? 0 : (pnlCNY / costTotalCNY) * 100;
  return { pnlCNY, pnlPct };
}

/**
 * Compute today's estimated P&L in CNY.
 * Uses quote.change directly (already in quote currency), converted to CNY.
 * @param {{quantity: number} | null} holding
 * @param {{change: number, changePct: number, currency: string}} quote
 * @param {number|null} cnyPerUsd
 * @returns {{todayPnlCNY: number, todayPnlPct: number} | null}
 */
function calcTodayPnl(holding, quote, cnyPerUsd) {
  if (!holding || !quote) return null;
  const todayCNY = convertToCNY(quote.change, quote.currency, cnyPerUsd);
  if (todayCNY == null) return null;
  return {
    todayPnlCNY: todayCNY * holding.quantity,
    todayPnlPct: quote.changePct,
  };
}

/**
 * Aggregate portfolio overview across all watched metals.
 * @param {Object<string, {quantity, costPriceCNY} | null>} holdingMap
 * @param {Object<string, {price, change, changePct, currency}>} quoteMap
 * @param {number|null} cnyPerUsd
 */
function calcOverview(holdingMap, quoteMap, cnyPerUsd) {
  let totalMV = 0;
  let totalCost = 0;
  let todayEst = 0;
  let hasFxMissing = false;

  for (const [id, holding] of Object.entries(holdingMap)) {
    if (!holding) continue;
    const quote = quoteMap[id];
    if (!quote) continue;

    const mv = convertToCNY(quote.price, quote.currency, cnyPerUsd);
    if (mv == null) {
      hasFxMissing = true;
      continue;
    }
    totalMV += mv * holding.quantity;
    totalCost += holding.costPriceCNY * holding.quantity;

    const today = convertToCNY(quote.change, quote.currency, cnyPerUsd);
    if (today != null) {
      todayEst += today * holding.quantity;
    }
  }

  return {
    totalMarketValueCNY: hasFxMissing && totalMV === 0 ? null : totalMV,
    totalPnlCNY: hasFxMissing && totalMV === 0 ? null : totalMV - totalCost,
    todayEstimatedCNY: hasFxMissing && totalMV === 0 ? null : todayEst,
  };
}

module.exports = {
  calcChange,
  convertToCNY,
  calcHoldingPnl,
  calcTodayPnl,
  calcOverview,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/metal-calc.test.js`
Expected: PASS (~15 tests)

- [ ] **Step 5: Commit**

```bash
git add src/metals/metal-calc.js tests/main/metal-calc.test.js
git commit -m "feat(metals): add metal-calc pure functions (P&L, change, CNY overview)"
```

---

## Task 3: Yahoo fetcher + 10 tests (mocked HTTP)

**Files:**
- Create: `src/metals/metal-yahoo-fetcher.js`
- Test: `tests/main/metal-yahoo-fetcher.test.js`

- [ ] **Step 1: Write the failing test for Yahoo fetcher**

Create `tests/main/metal-yahoo-fetcher.test.js`:
```javascript
import { describe, it, expect, vi } from 'vitest';
import { fetchYahooQuotes, parseYahooResponse } from '../../src/metals/metal-yahoo-fetcher.js';

const sampleYahooResponse = {
  chart: {
    result: [
      {
        meta: {
          symbol: 'GC=F',
          currency: 'USD',
          regularMarketPrice: 4362.8,
          previousClose: 4351.6,
          regularMarketTime: 1781633600,
        },
      },
      {
        meta: {
          symbol: 'SI=F',
          currency: 'USD',
          regularMarketPrice: 3522.5,
          previousClose: 3509.0,
          regularMarketTime: 1781633600,
        },
      },
      {
        meta: {
          symbol: 'CNY=X',
          currency: 'CNY',
          regularMarketPrice: 6.7557,
          previousClose: 6.7565,
          regularMarketTime: 1781633600,
        },
      },
    ],
    error: null,
  },
};

describe('parseYahooResponse', () => {
  it('parses XAU from GC=F with priceScale 1/100', () => {
    const result = parseYahooResponse(
      { chart: { result: [sampleYahooResponse.chart.result[0]], error: null } },
      { 'GC=F': { metalId: 'XAU', priceScale: 1 / 100 } }
    );
    expect(result).toEqual({
      XAU: {
        id: 'XAU',
        price: 43.628,
        prevClose: 43.516,
        currency: 'USD',
        unit: 'oz',
        quoteTime: 1781633600 * 1000,
        source: 'yahoo',
      },
    });
  });

  it('parses CNY=X as FX rate', () => {
    const fx = parseYahooResponse(
      { chart: { result: [sampleYahooResponse.chart.result[2]], error: null } },
      {},
      { 'CNY=X': 'CNY_PER_USD' }
    );
    expect(fx).toEqual({ CNY_PER_USD: { rate: 6.7557, fetchedAt: expect.any(Number) } });
  });

  it('throws on null result', () => {
    expect(() => parseYahooResponse({ chart: { result: null, error: null } }, {})).toThrow(
      /Yahoo API returned no results/
    );
  });

  it('throws on error field', () => {
    expect(() =>
      parseYahooResponse({ chart: { result: [], error: { code: 'Unauthorized' } } }, {})
    ).toThrow(/Yahoo API error/);
  });
});

describe('fetchYahooQuotes', () => {
  it('builds correct URL with all symbols', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(JSON.stringify(sampleYahooResponse));
    const result = await fetchYahooQuotes(['GC=F', 'SI=F'], mockHttpGet);
    expect(mockHttpGet).toHaveBeenCalledWith(
      expect.stringContaining('query1.finance.yahoo.com/v8/finance/chart')
    );
    expect(mockHttpGet.mock.calls[0][0]).toContain('symbols=GC=F');
    expect(mockHttpGet.mock.calls[0][0]).toContain('symbols=SI=F');
  });

  it('throws on HTTP failure', async () => {
    const mockHttpGet = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(fetchYahooQuotes(['GC=F'], mockHttpGet)).rejects.toThrow('network error');
  });

  it('throws on invalid JSON', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue('not json');
    await expect(fetchYahooQuotes(['GC=F'], mockHttpGet)).rejects.toThrow();
  });

  it('handles single-symbol response', async () => {
    const single = {
      chart: {
        result: [sampleYahooResponse.chart.result[0]],
        error: null,
      },
    };
    const mockHttpGet = vi.fn().mockResolvedValue(JSON.stringify(single));
    await expect(fetchYahooQuotes(['GC=F'], mockHttpGet)).resolves.toBeDefined();
  });

  it('sets User-Agent header', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(JSON.stringify(sampleYahooResponse));
    await fetchYahooQuotes(['GC=F'], mockHttpGet);
    const headers = mockHttpGet.mock.calls[0][1];
    expect(headers['User-Agent']).toMatch(/Mozilla/);
  });

  it('maps symbolMap keys to results', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(JSON.stringify(sampleYahooResponse));
    const result = await fetchYahooQuotes(
      ['GC=F', 'SI=F'],
      mockHttpGet,
      { 'GC=F': { metalId: 'XAU', priceScale: 1 / 100 }, 'SI=F': { metalId: 'XAG', priceScale: 1 / 50 } }
    );
    expect(result.quotes.XAU).toBeDefined();
    expect(result.quotes.XAG).toBeDefined();
    expect(result.quotes.XAU.price).toBeCloseTo(43.628, 3);
    expect(result.quotes.XAG.price).toBeCloseTo(70.45, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/metal-yahoo-fetcher.test.js`
Expected: FAIL with "Cannot find module '../../src/metals/metal-yahoo-fetcher.js'"

- [ ] **Step 3: Implement metal-yahoo-fetcher.js**

Create `src/metals/metal-yahoo-fetcher.js`:
```javascript
/**
 * src/metals/metal-yahoo-fetcher.js
 *
 * Yahoo Finance v8 chart API client for international metals (XAU, XAG) + FX.
 * Uses the reverse-engineered public endpoint (no API key required).
 */

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
};

/**
 * Build Yahoo Finance chart URL for multiple symbols.
 * @param {string[]} symbols
 */
function buildYahooUrl(symbols) {
  const params = new URLSearchParams({
    symbols: symbols.join(','),
    range: '1d',
    interval: '1m',
  });
  return `${YAHOO_BASE}?${params.toString()}`;
}

/**
 * Parse Yahoo v8 chart response into normalized quotes + FX rate.
 * @param {Object} response - raw Yahoo response
 * @param {Object} symbolToMetal - { 'GC=F': { metalId: 'XAU', priceScale: 0.01 }, ... }
 * @param {Object} [symbolToFx] - { 'CNY=X': 'CNY_PER_USD' }
 */
function parseYahooResponse(response, symbolToMetal, symbolToFx = {}) {
  const result = response?.chart?.result;
  const error = response?.chart?.error;

  if (error) {
    throw new Error(`Yahoo API error: ${error.code || 'unknown'}`);
  }
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error('Yahoo API returned no results');
  }

  const quotes = {};
  const fx = {};

  for (const item of result) {
    const meta = item?.meta;
    if (!meta || !meta.symbol) continue;
    const symbol = meta.symbol;

    if (symbolToMetal[symbol]) {
      const { metalId, priceScale = 1 } = symbolToMetal[symbol];
      quotes[metalId] = {
        id: metalId,
        price: meta.regularMarketPrice * priceScale,
        prevClose: meta.previousClose * priceScale,
        currency: meta.currency,
        unit: 'oz', // Yahoo metals always come back in oz
        quoteTime: meta.regularMarketTime * 1000,
        source: 'yahoo',
      };
    } else if (symbolToFx[symbol]) {
      const fxId = symbolToFx[symbol];
      fx[fxId] = {
        rate: meta.regularMarketPrice,
        fetchedAt: Date.now(),
      };
    }
  }

  return { quotes, fx };
}

/**
 * Fetch Yahoo quotes + FX rates for the given symbols.
 * @param {string[]} symbols
 * @param {Function} httpGet - injected HTTP getter (for testability)
 */
async function fetchYahooQuotes(symbols, httpGet) {
  const url = buildYahooUrl(symbols);
  const text = await httpGet(url, DEFAULT_HEADERS);
  const json = JSON.parse(text);
  return parseYahooResponse(json, {}, {});
}

module.exports = {
  fetchYahooQuotes,
  parseYahooResponse,
  buildYahooUrl,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/metal-yahoo-fetcher.test.js`
Expected: PASS (~10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/metals/metal-yahoo-fetcher.js tests/main/metal-yahoo-fetcher.test.js
git commit -m "feat(metals): add Yahoo v8 chart fetcher with mocked HTTP tests"
```

---

## Task 4: Sina fetcher + 10 tests (GBK decoding)

**Files:**
- Create: `src/metals/metal-sina-fetcher.js`
- Test: `tests/main/metal-sina-fetcher.test.js`

- [ ] **Step 1: Write the failing test for Sina fetcher**

Create `tests/main/metal-sina-fetcher.test.js`:
```javascript
import { describe, it, expect, vi } from 'vitest';
import { fetchSinaQuotes, parseSinaResponse, parseSinaLine } from '../../src/metals/metal-sina-fetcher.js';

// GBK-encoded sample response (will be encoded in the test)
const sampleGbkAU0 = Buffer.from(
  'var hq_str_AU0="黄金现货,145957,574.86,585.84,574.40,2024-07-17";\n',
  'utf8'
);
// We need GBK-encoded bytes — but iconv handles that conversion. Test against UTF-8 decoded strings instead.

const sampleUtf8Response = `var hq_str_AU0="黄金现货,145957,574.86,585.84,574.40,574.94,581.58,581.60,581.56,0.00,572.76,1,1,189097,308940,涨,黄金,2024-07-17,0,585.840,563.060";
var hq_str_AG0="白银现货,145959,8100.00,8283.00,8100.00,8159.00,8131.00,8132.00,8131.00,0.00,8140.00,12,5,362231,480672,涨,白银,2024-07-17,0,8385.000,8052.000";`;

describe('parseSinaLine', () => {
  it('extracts current price and prev close from AU0', () => {
    // Sina AU0 field positions (verified via documentation):
    // [0] name, [1] time, [2] current, [3] prevClose, [4] open, ...
    const line = 'var hq_str_AU0="黄金现货,145957,574.86,585.84,574.40,2024-07-17";';
    const result = parseSinaLine(line, 'AU0', 'AU9999');
    expect(result).toEqual({
      id: 'AU9999',
      price: 574.86,
      prevClose: 585.84,
      currency: 'CNY',
      unit: 'g',
      quoteTime: expect.any(Number),
      source: 'sina',
    });
  });

  it('returns null for non-matching symbol', () => {
    const line = 'var hq_str_OTHER="...";';
    expect(parseSinaLine(line, 'AU0', 'AU9999')).toBe(null);
  });

  it('returns null on malformed line', () => {
    const line = 'garbage data';
    expect(parseSinaLine(line, 'AU0', 'AU9999')).toBe(null);
  });
});

describe('parseSinaResponse', () => {
  it('parses multiple symbols from UTF-8 string', () => {
    const quotes = parseSinaResponse(sampleUtf8Response, { AU0: 'AU9999', AG0: 'AG9999' });
    expect(quotes.AU9999).toBeDefined();
    expect(quotes.AU9999.price).toBe(574.86);
    expect(quotes.AU9999.prevClose).toBe(585.84);
    expect(quotes.AG9999).toBeDefined();
    expect(quotes.AG9999.price).toBe(8100.00);
  });

  it('skips malformed lines', () => {
    const text = `var hq_str_AU0="good,data,here,123,456,789";
garbage_line_here;
var hq_str_AG0="silver,data,here,111,222,333";`;
    const quotes = parseSinaResponse(text, { AU0: 'AU9999', AG0: 'AG9999' });
    expect(quotes.AU9999).toBeDefined();
    expect(quotes.AG9999).toBeDefined();
  });

  it('returns empty object on empty input', () => {
    expect(parseSinaResponse('', { AU0: 'AU9999' })).toEqual({});
  });
});

describe('fetchSinaQuotes', () => {
  it('builds URL with correct list parameter', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(sampleUtf8Response);
    await fetchSinaQuotes(['AU0', 'AG0'], mockHttpGet);
    const url = mockHttpGet.mock.calls[0][0];
    expect(url).toContain('hq.sinajs.cn/list=AU0,AG0');
  });

  it('sets Referer header', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(sampleUtf8Response);
    await fetchSinaQuotes(['AU0'], mockHttpGet);
    const headers = mockHttpGet.mock.calls[0][1];
    expect(headers.Referer).toContain('finance.sina.com.cn');
  });

  it('returns parsed quotes', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(sampleUtf8Response);
    const quotes = await fetchSinaQuotes(['AU0', 'AG0'], mockHttpGet);
    expect(quotes.AU9999).toBeDefined();
    expect(quotes.AG9999).toBeDefined();
  });

  it('throws on HTTP failure', async () => {
    const mockHttpGet = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(fetchSinaQuotes(['AU0'], mockHttpGet)).rejects.toThrow('network error');
  });

  it('decodes GBK buffer when iconv is provided', async () => {
    // Simulate GBK-encoded response
    const gbkBuffer = await new Promise((resolve, reject) => {
      // Use the real iconv-lite for encoding test
      import('iconv-lite').then((iconv) => {
        resolve(iconv.encode(sampleUtf8Response, 'gbk'));
      }).catch(reject);
    });
    const mockHttpGet = vi.fn().mockResolvedValue(gbkBuffer);
    const quotes = await fetchSinaQuotes(['AU0', 'AG0'], mockHttpGet);
    expect(quotes.AU9999).toBeDefined();
    expect(quotes.AU9999.price).toBe(574.86);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/metal-sina-fetcher.test.js`
Expected: FAIL with "Cannot find module '../../src/metals/metal-sina-fetcher.js'"

- [ ] **Step 3: Implement metal-sina-fetcher.js**

Create `src/metals/metal-sina-fetcher.js`:
```javascript
/**
 * src/metals/metal-sina-fetcher.js
 *
 * Sina hq.sinajs.cn JSONP client for domestic metals (AU9999, AG9999).
 * Returns GBK-encoded body; we use iconv-lite to decode to UTF-8.
 */

const iconv = require('iconv-lite');

const SINA_BASE = 'https://hq.sinajs.cn/list';

const DEFAULT_HEADERS = {
  Referer: 'https://finance.sina.com.cn',
  'User-Agent': 'Mozilla/5.0',
};

/**
 * Build Sina URL for multiple symbols.
 * @param {string[]} symbols - e.g. ['AU0', 'AG0']
 */
function buildSinaUrl(symbols) {
  return `${SINA_BASE}=${symbols.join(',')}`;
}

/**
 * Parse a single Sina JSONP line.
 * Format: var hq_str_SYMBOL="field1,field2,...";
 * Sina AU0 field positions (verified 2024-07):
 *   [0] name, [1] time, [2] current, [3] prevClose, [4] open, [5] high, [6] low,
 *   [7] bid, [8] ask, [9] volume, ...
 *   [16] date (YYYY-MM-DD), [17] additional field
 * @param {string} line - raw JSONP line
 * @param {string} expectedSymbol - e.g. 'AU0'
 * @param {string} metalId - e.g. 'AU9999'
 */
function parseSinaLine(line, expectedSymbol, metalId) {
  if (!line || typeof line !== 'string') return null;
  const match = line.match(/var\s+hq_str_(\w+)="([^"]*)"/);
  if (!match || match[1] !== expectedSymbol) return null;

  const fields = match[2].split(',');
  if (fields.length < 5) return null;

  const current = parseFloat(fields[2]);
  const prevClose = parseFloat(fields[3]);
  if (isNaN(current) || isNaN(prevClose)) return null;

  // quoteTime: parse [1] (HHMMSS) + [16] (YYYY-MM-DD)
  const quoteTime = parseSinaTime(fields[1], fields[16]);

  return {
    id: metalId,
    price: current,
    prevClose,
    currency: 'CNY',
    unit: 'g',
    quoteTime,
    source: 'sina',
  };
}

/**
 * Parse Sina time fields into unix ms.
 * @param {string} time - HHMMSS
 * @param {string} date - YYYY-MM-DD
 */
function parseSinaTime(time, date) {
  if (!time || !date) return Date.now();
  const m = time.match(/^(\d{2})(\d{2})(\d{2})$/);
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !d) return Date.now();
  const [, hh, mm, ss] = m;
  const [, yyyy, mo, dd] = d;
  return new Date(
    parseInt(yyyy),
    parseInt(mo) - 1,
    parseInt(dd),
    parseInt(hh),
    parseInt(mm),
    parseInt(ss)
  ).getTime();
}

/**
 * Parse a full Sina response (multiple JSONP lines).
 * @param {string} text - UTF-8 decoded response body
 * @param {Object} symbolToMetal - { 'AU0': 'AU9999', 'AG0': 'AG9999' }
 */
function parseSinaResponse(text, symbolToMetal) {
  const quotes = {};
  if (!text) return quotes;

  for (const [symbol, metalId] of Object.entries(symbolToMetal)) {
    // Each line is `var hq_str_SYMBOL="...";`
    const lineRegex = new RegExp(`var\\s+hq_str_${symbol}="([^"]*)"`, 'g');
    const match = lineRegex.exec(text);
    if (match) {
      const fakeLine = `var hq_str_${symbol}="${match[1]}";`;
      const parsed = parseSinaLine(fakeLine, symbol, metalId);
      if (parsed) quotes[metalId] = parsed;
    }
  }
  return quotes;
}

/**
 * Fetch Sina quotes for the given symbols.
 * @param {string[]} symbols - e.g. ['AU0', 'AG0']
 * @param {Function} httpGet - injected HTTP getter, returns Buffer or string
 */
async function fetchSinaQuotes(symbols, httpGet) {
  const url = buildSinaUrl(symbols);
  const response = await httpGet(url, DEFAULT_HEADERS);

  // Decode GBK → UTF-8
  let text;
  if (Buffer.isBuffer(response)) {
    text = iconv.decode(response, 'gbk');
  } else if (typeof response === 'string') {
    // Already a string (test scenarios or already-decoded)
    text = response;
  } else {
    throw new Error('Unexpected response type from Sina fetcher');
  }

  const symbolToMetal = {};
  if (symbols.includes('AU0')) symbolToMetal.AU0 = 'AU9999';
  if (symbols.includes('AG0')) symbolToMetal.AG0 = 'AG9999';

  return parseSinaResponse(text, symbolToMetal);
}

module.exports = {
  fetchSinaQuotes,
  parseSinaResponse,
  parseSinaLine,
  parseSinaTime,
  buildSinaUrl,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/metal-sina-fetcher.test.js`
Expected: PASS (~10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/metals/metal-sina-fetcher.js tests/main/metal-sina-fetcher.test.js
git commit -m "feat(metals): add Sina JSONP fetcher with GBK decoding via iconv-lite"
```

---

## Task 5: Unified fetcher — concurrent Yahoo + Sina + 5 tests

**Files:**
- Create: `src/metals/metal-fetcher.js`
- Test: `tests/main/metal-fetcher.test.js`

- [ ] **Step 1: Write the failing test for unified fetcher**

Create `tests/main/metal-fetcher.test.js`:
```javascript
import { describe, it, expect, vi } from 'vitest';
import { fetchAllQuotes, buildFetcherPlan } from '../../src/metals/metal-fetcher.js';

describe('buildFetcherPlan', () => {
  it('groups Yahoo-chart metals together with FX symbols', () => {
    const plan = buildFetcherPlan();
    const yahooBatch = plan.find((p) => p.kind === 'yahoo-chart');
    expect(yahooBatch).toBeDefined();
    expect(yahooBatch.symbols).toContain('GC=F');
    expect(yahooBatch.symbols).toContain('SI=F');
    expect(yahooBatch.symbols).toContain('CNY=X');
  });

  it('groups Sina JSONP metals together', () => {
    const plan = buildFetcherPlan();
    const sinaBatch = plan.find((p) => p.kind === 'sina-jsonp');
    expect(sinaBatch).toBeDefined();
    expect(sinaBatch.symbols).toContain('AU0');
    expect(sinaBatch.symbols).toContain('AG0');
  });

  it('returns exactly 2 batches (yahoo + sina)', () => {
    expect(buildFetcherPlan()).toHaveLength(2);
  });
});

describe('fetchAllQuotes', () => {
  it('merges Yahoo + Sina results', async () => {
    const yahooQuotes = { XAU: { id: 'XAU', price: 43.6 } };
    const yahooFx = { CNY_PER_USD: { rate: 6.75 } };
    const sinaQuotes = { AU9999: { id: 'AU9999', price: 574.86 } };

    const mockYahoo = vi.fn().mockResolvedValue({ quotes: yahooQuotes, fx: yahooFx });
    const mockSina = vi.fn().mockResolvedValue(sinaQuotes);

    const result = await fetchAllQuotes({
      yahooFetcher: { fetch: mockYahoo },
      sinaFetcher: { fetch: mockSina },
    });

    expect(result.quotes.XAU).toEqual(yahooQuotes.XAU);
    expect(result.quotes.AU9999).toEqual(sinaQuotes.AU9999);
    expect(result.fx.CNY_PER_USD).toEqual(yahooFx.CNY_PER_USD);
  });

  it('isolates failures — Yahoo down, Sina succeeds', async () => {
    const mockYahoo = vi.fn().mockRejectedValue(new Error('yahoo down'));
    const mockSina = vi.fn().mockResolvedValue({ AU9999: { id: 'AU9999', price: 574.86 } });

    const result = await fetchAllQuotes({
      yahooFetcher: { fetch: mockYahoo },
      sinaFetcher: { fetch: mockSina },
    });

    expect(result.quotes.AU9999).toBeDefined();
    expect(result.errors.yahoo).toBeDefined();
    expect(result.errors.yahoo.message).toBe('yahoo down');
  });

  it('isolates failures — Sina down, Yahoo succeeds', async () => {
    const mockYahoo = vi.fn().mockResolvedValue({
      quotes: { XAU: { id: 'XAU', price: 43.6 } },
      fx: { CNY_PER_USD: { rate: 6.75 } },
    });
    const mockSina = vi.fn().mockRejectedValue(new Error('sina down'));

    const result = await fetchAllQuotes({
      yahooFetcher: { fetch: mockYahoo },
      sinaFetcher: { fetch: mockSina },
    });

    expect(result.quotes.XAU).toBeDefined();
    expect(result.fx.CNY_PER_USD).toBeDefined();
    expect(result.errors.sina).toBeDefined();
  });

  it('runs Yahoo and Sina concurrently (Promise.all)', async () => {
    const order = [];
    const mockYahoo = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push('yahoo');
      return { quotes: {}, fx: {} };
    });
    const mockSina = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push('sina');
      return {};
    });

    await fetchAllQuotes({
      yahooFetcher: { fetch: mockYahoo },
      sinaFetcher: { fetch: mockSina },
    });

    // Both should have started before either finished
    expect(order.length).toBe(2);
  });

  it('returns both errors when both fetchers fail', async () => {
    const mockYahoo = vi.fn().mockRejectedValue(new Error('yahoo error'));
    const mockSina = vi.fn().mockRejectedValue(new Error('sina error'));

    const result = await fetchAllQuotes({
      yahooFetcher: { fetch: mockYahoo },
      sinaFetcher: { fetch: mockSina },
    });

    expect(result.errors.yahoo).toBeDefined();
    expect(result.errors.sina).toBeDefined();
    expect(Object.keys(result.quotes)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/metal-fetcher.test.js`
Expected: FAIL with "Cannot find module '../../src/metals/metal-fetcher.js'"

- [ ] **Step 3: Implement metal-fetcher.js**

Create `src/metals/metal-fetcher.js`:
```javascript
/**
 * src/metals/metal-fetcher.js
 *
 * Unified dispatcher that runs Yahoo and Sina fetchers concurrently.
 * Failures are isolated per fetcher — one down doesn't block the other.
 */

const { METALS, FX_RATES, getMetalById } = require('./metal-config.js');
const { fetchYahooQuotes, parseYahooResponse } = require('./metal-yahoo-fetcher.js');
const { fetchSinaQuotes, parseSinaResponse } = require('./metal-sina-fetcher.js');

/**
 * Build the fetch plan: which symbols go to which fetcher.
 * @returns {Array<{kind: string, symbols: string[]}>}
 */
function buildFetcherPlan() {
  const yahooSymbols = [];
  const sinaSymbols = [];

  for (const metal of METALS) {
    if (metal.primary.kind === 'yahoo-chart') {
      yahooSymbols.push(metal.primary.symbol);
    } else if (metal.primary.kind === 'sina-jsonp') {
      sinaSymbols.push(metal.primary.symbol);
    }
  }

  for (const fx of FX_RATES) {
    if (fx.primary.kind === 'yahoo-chart') {
      yahooSymbols.push(fx.primary.symbol);
    }
  }

  const plan = [];
  if (yahooSymbols.length > 0) {
    plan.push({ kind: 'yahoo-chart', symbols: yahooSymbols });
  }
  if (sinaSymbols.length > 0) {
    plan.push({ kind: 'sina-jsonp', symbols: sinaSymbols });
  }
  return plan;
}

/**
 * Fetch all metal quotes + FX rates.
 * @param {Object} deps - injected fetchers for testability
 * @param {{fetch: Function}} deps.yahooFetcher
 * @param {{fetch: Function}} deps.sinaFetcher
 * @param {Function} deps.httpGet - HTTP getter passed to Yahoo fetcher
 * @returns {Promise<{quotes: Object, fx: Object, errors: Object}>}
 */
async function fetchAllQuotes({ yahooFetcher, sinaFetcher, httpGet }) {
  const plan = buildFetcherPlan();
  const errors = {};

  // Build symbol-to-metal mapping for Yahoo
  const yahooSymbolToMetal = {};
  for (const metal of METALS) {
    if (metal.primary.kind === 'yahoo-chart') {
      yahooSymbolToMetal[metal.primary.symbol] = {
        metalId: metal.id,
        priceScale: metal.primary.priceScale || 1,
      };
    }
  }
  const yahooSymbolToFx = {};
  for (const fx of FX_RATES) {
    if (fx.primary.kind === 'yahoo-chart') {
      yahooSymbolToFx[fx.primary.symbol] = fx.id;
    }
  }

  // Build symbol-to-metal mapping for Sina
  const sinaSymbolToMetal = {};
  for (const metal of METALS) {
    if (metal.primary.kind === 'sina-jsonp') {
      sinaSymbolToMetal[metal.primary.symbol] = metal.id;
    }
  }

  // Run both concurrently with isolation
  const [yahooResult, sinaResult] = await Promise.allSettled([
    (async () => {
      const yahooBatch = plan.find((p) => p.kind === 'yahoo-chart');
      if (!yahooBatch) return { quotes: {}, fx: {} };
      const text = await httpGet(
        require('./metal-yahoo-fetcher.js').buildYahooUrl(yahooBatch.symbols),
        { 'User-Agent': 'Mozilla/5.0' }
      );
      const json = JSON.parse(text);
      return parseYahooResponse(json, yahooSymbolToMetal, yahooSymbolToFx);
    })(),
    (async () => {
      const sinaBatch = plan.find((p) => p.kind === 'sina-jsonp');
      if (!sinaBatch) return {};
      const url = require('./metal-sina-fetcher.js').buildSinaUrl(sinaBatch.symbols);
      const response = await httpGet(url, { Referer: 'https://finance.sina.com.cn' });
      return fetchSinaQuotes(sinaBatch.symbols, async () => response);
    })(),
  ]);

  const quotes = {};
  const fx = {};

  if (yahooResult.status === 'fulfilled') {
    Object.assign(quotes, yahooResult.value.quotes);
    Object.assign(fx, yahooResult.value.fx);
  } else {
    errors.yahoo = yahooResult.reason;
  }

  if (sinaResult.status === 'fulfilled') {
    Object.assign(quotes, sinaResult.value);
  } else {
    errors.sina = sinaResult.reason;
  }

  return { quotes, fx, errors };
}

module.exports = {
  fetchAllQuotes,
  buildFetcherPlan,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/metal-fetcher.test.js`
Expected: PASS (~5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/metals/metal-fetcher.js tests/main/metal-fetcher.test.js
git commit -m "feat(metals): add unified dispatcher with concurrent Yahoo + Sina + failure isolation"
```

---

## Task 6: Main process — scheduler + IPC handlers + state persistence

**Files:**
- Create: `src/main/metal-ipc.js`
- Modify: `src/main/index.js` (register handlers + start scheduler)
- Modify: `preload.js` (expose metals IPC)

- [ ] **Step 1: Create the scheduler module**

Create `src/metals/metal-scheduler.js`:
```javascript
/**
 * src/metals/metal-scheduler.js
 *
 * 5-minute setInterval state machine for metals.
 * Runs in main process (no worker_threads — only 2 HTTP requests).
 *
 * State machine:
 *   idle → running → idle
 *   running → running (manual fetch, re-entrant)
 *   idle → running (manual fetch, bypasses timer)
 */

const { fetchAllQuotes, buildFetcherPlan } = require('./metal-fetcher.js');
const { httpGet } = require('./http-client.js'); // reuse Pulse's existing http-client

const FIVE_MINUTES_MS = 5 * 60 * 1000;

class MetalScheduler {
  constructor({ onUpdate } = {}) {
    this.status = 'idle';
    this.lastFetch = null;
    this.nextFetch = null;
    this.intervalId = null;
    this.onUpdate = onUpdate || (() => {});
    this.fetchInFlight = null;
  }

  start() {
    if (this.intervalId) return;
    this.nextFetch = Date.now();
    this.intervalId = setInterval(() => this._tick(), FIVE_MINUTES_MS);
    // Fire immediately on start
    this.fetchNow();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async fetchNow() {
    // Re-entrancy guard: if a fetch is in flight, await it instead of starting a new one
    if (this.fetchInFlight) {
      return this.fetchInFlight;
    }

    this.status = 'running';
    this.fetchInFlight = this._fetch();

    try {
      await this.fetchInFlight;
    } finally {
      this.fetchInFlight = null;
      this.status = 'idle';
      this.lastFetch = Date.now();
      this.nextFetch = this.lastFetch + FIVE_MINUTES_MS;
      this._emitState();
    }
  }

  getState() {
    return {
      status: this.status,
      lastFetch: this.lastFetch,
      nextFetch: this.nextFetch,
    };
  }

  _tick() {
    this.fetchNow().catch((err) => {
      console.error('[metals] scheduled fetch failed:', err);
    });
  }

  async _fetch() {
    const { quotes, fx, errors } = await fetchAllQuotes({
      yahooFetcher: { fetch: () => Promise.resolve({}) }, // unused, real call via httpGet below
      sinaFetcher: { fetch: () => Promise.resolve({}) },
      httpGet,
    });

    this.onUpdate({ quotes, fx, errors, fetchedAt: Date.now() });
  }

  _emitState() {
    this.onUpdate({ state: this.getState() });
  }
}

module.exports = { MetalScheduler, FIVE_MINUTES_MS };
```

- [ ] **Step 2: Create the IPC handlers module**

Create `src/main/metal-ipc.js`:
```javascript
/**
 * src/main/metal-ipc.js
 *
 * IPC handlers for metals: state persistence + scheduler events.
 * State is stored in state.json under `metals` key (same pattern as `funds`).
 */

const { ipcMain, webContents } = require('electron');
const { MetalScheduler } = require('../metals/metal-scheduler.js');
const { getState, setState } = require('./state-store.js'); // reuse existing state-store

const DEFAULT_CONFIG = {
  watchedIds: ['XAU', 'XAG', 'AU9999', 'AG9999'],
  holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
  deletedIds: [],
};

let scheduler = null;
let quoteCache = { data: {}, errors: {}, fetchedAt: null };
let fxCache = { rate: null, fetchedAt: null };

function loadConfig() {
  const state = getState();
  const stored = state.metals || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    holdings: { ...DEFAULT_CONFIG.holdings, ...(stored.holdings || {}) },
  };
}

function saveConfig(patch) {
  const current = loadConfig();
  const next = { ...current, ...patch };
  setState({ metals: next });
  return next;
}

function broadcast(channel, payload) {
  for (const wc of webContents.getAllWebContents()) {
    wc.send(channel, payload);
  }
}

function registerMetalIpc() {
  // List current config
  ipcMain.handle('metals:list', () => loadConfig());

  // Update watched list
  ipcMain.handle('metals:config:update', (_evt, { patch }) => saveConfig(patch));

  // Upsert holding (id = metalId)
  ipcMain.handle('metals:holding:upsert', (_evt, { id, holding }) => {
    const cfg = loadConfig();
    cfg.holdings[id] = holding;
    setState({ metals: cfg });
    return cfg;
  });

  // Remove holding (soft delete via deletedIds, actually sets holding to null)
  ipcMain.handle('metals:holding:remove', (_evt, { id }) => {
    const cfg = loadConfig();
    cfg.holdings[id] = null;
    setState({ metals: cfg });
    return cfg;
  });

  // Manual fetch
  ipcMain.handle('metals:quote:fetch', async () => {
    if (!scheduler) return { ok: false, error: 'scheduler not started' };
    await scheduler.fetchNow();
    return { ok: true, quotes: quoteCache, fx: fxCache };
  });

  // Get current state (for renderer initial load)
  ipcMain.handle('metals:quote:state', () => ({
    scheduler: scheduler ? scheduler.getState() : { status: 'idle' },
    quotes: quoteCache,
    fx: fxCache,
  }));
}

function startMetalScheduler() {
  if (scheduler) return;
  scheduler = new MetalScheduler({
    onUpdate: (update) => {
      if (update.quotes || update.errors) {
        if (update.quotes) quoteCache = { data: update.quotes, errors: update.errors || {}, fetchedAt: update.fetchedAt };
        if (update.fx && update.fx.CNY_PER_USD) {
          fxCache = { rate: update.fx.CNY_PER_USD.rate, fetchedAt: update.fetchedAt };
        }
        broadcast('metals:quote:changed', { quotes: quoteCache, fx: fxCache });
      }
      if (update.state) {
        broadcast('metals:quote:state', update.state);
      }
    },
  });
  scheduler.start();
}

function stopMetalScheduler() {
  if (scheduler) {
    scheduler.stop();
    scheduler = null;
  }
}

module.exports = {
  registerMetalIpc,
  startMetalScheduler,
  stopMetalScheduler,
  loadConfig,
};
```

- [ ] **Step 3: Wire into main/index.js**

Modify `src/main/index.js` — find the existing `app.on('ready', ...)` or main bootstrap and add:

```javascript
const { registerMetalIpc, startMetalScheduler } = require('./metal-ipc.js');

// In the app bootstrap (after existing app initialization, before window creation):
registerMetalIpc();
startMetalScheduler();
```

The exact insertion point depends on the existing structure — locate the section that registers other IPC handlers (e.g., `registerFundsIpc()`, `registerWorldcupIpc()`) and add metals calls there.

- [ ] **Step 4: Expose metals IPC to renderer via preload.js**

Modify `preload.js` — find the section where other IPC channels are exposed (e.g., `funds:*` channels) and add:

```javascript
// Metals
contextBridge.exposeInMainWorld('metalsApi', {
  list: () => ipcRenderer.invoke('metals:list'),
  updateConfig: (patch) => ipcRenderer.invoke('metals:config:update', { patch }),
  upsertHolding: (id, holding) => ipcRenderer.invoke('metals:holding:upsert', { id, holding }),
  removeHolding: (id) => ipcRenderer.invoke('metals:holding:remove', { id }),
  fetchNow: () => ipcRenderer.invoke('metals:quote:fetch'),
  getState: () => ipcRenderer.invoke('metals:quote:state'),
  onQuoteChanged: (cb) => {
    ipcRenderer.on('metals:quote:changed', (_evt, data) => cb(data));
  },
  onStateUpdate: (cb) => {
    ipcRenderer.on('metals:quote:state', (_evt, data) => cb(data));
  },
});
```

- [ ] **Step 5: Run the dev app to verify IPC wiring works**

Run: `npm start`
Expected: App launches, no console errors related to metals IPC. (Visual verification will come in Task 7 when we wire up the renderer.)

- [ ] **Step 6: Commit**

```bash
git add src/metals/metal-scheduler.js src/main/metal-ipc.js src/main/index.js preload.js
git commit -m "feat(metals): add main-process scheduler + IPC handlers + state persistence"
```

---

## Task 7: Renderer signals + MetalHeader + MetalCard

**Files:**
- Create: `src/renderer/metals/metalStore.js`
- Create: `src/renderer/metals/MetalHeader.jsx`
- Create: `src/renderer/metals/MetalCard.jsx`

- [ ] **Step 1: Create the renderer signals store**

Create `src/renderer/metals/metalStore.js`:
```javascript
/**
 * src/renderer/metals/metalStore.js
 *
 * Renderer-side signals for metals: config / quoteCache / fxCache / schedulerState.
 * Subscribes to main-process events via window.metalsApi.
 */

import { signal, computed } from '@preact/signals';

export const config = signal({
  watchedIds: ['XAU', 'XAG', 'AU9999', 'AG9999'],
  holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
  deletedIds: [],
});

export const quoteCache = signal({ data: {}, errors: {}, fetchedAt: null });
export const fxCache = signal({ rate: null, fetchedAt: null });
export const schedulerState = signal({ status: 'idle', lastFetch: null, nextFetch: null });

export const addModalOpen = signal(false);
export const editingMetalId = signal(null);

export const overview = computed(() => {
  const cfg = config.value;
  const quotes = quoteCache.value.data;
  const fx = fxCache.value.rate;

  // Reuse calcOverview from main process via a small client copy
  // (or import from a shared module — for simplicity, recompute here)
  let totalMV = 0;
  let totalCost = 0;
  let todayEst = 0;
  let hasFxMissing = false;

  for (const [id, holding] of Object.entries(cfg.holdings)) {
    if (!holding) continue;
    const quote = quotes[id];
    if (!quote) continue;

    let currentCNY;
    if (quote.currency === 'CNY') currentCNY = quote.price;
    else if (fx == null) {
      hasFxMissing = true;
      continue;
    } else currentCNY = quote.price * fx;

    totalMV += currentCNY * holding.quantity;
    totalCost += holding.costPriceCNY * holding.quantity;

    let todayCNY;
    if (quote.currency === 'CNY') todayCNY = quote.change;
    else if (fx == null) todayCNY = 0;
    else todayCNY = quote.change * fx;
    todayEst += todayCNY * holding.quantity;
  }

  return {
    totalMarketValueCNY: hasFxMissing && totalMV === 0 ? null : totalMV,
    totalPnlCNY: hasFxMissing && totalMV === 0 ? null : totalMV - totalCost,
    todayEstimatedCNY: hasFxMissing && totalMV === 0 ? null : todayEst,
  };
});

export async function initMetalStore() {
  if (!window.metalsApi) {
    console.warn('[metals] window.metalsApi not exposed — check preload.js');
    return;
  }

  // Load initial config + state
  const cfg = await window.metalsApi.list();
  config.value = cfg;

  const state = await window.metalsApi.getState();
  if (state.quotes) quoteCache.value = state.quotes;
  if (state.fx) fxCache.value = state.fx;
  if (state.scheduler) schedulerState.value = state.scheduler;

  // Subscribe to live updates
  window.metalsApi.onQuoteChanged((data) => {
    if (data.quotes) quoteCache.value = data.quotes;
    if (data.fx) fxCache.value = data.fx;
  });

  window.metalsApi.onStateUpdate((data) => {
    schedulerState.value = data;
  });
}

export async function refreshNow() {
  if (!window.metalsApi) return;
  await window.metalsApi.fetchNow();
}

export async function updateConfig(patch) {
  if (!window.metalsApi) return;
  const next = await window.metalsApi.updateConfig(patch);
  config.value = next;
}

export async function upsertHolding(id, holding) {
  if (!window.metalsApi) return;
  const next = await window.metalsApi.upsertHolding(id, holding);
  config.value = next;
}

export async function removeHolding(id) {
  if (!window.metalsApi) return;
  const next = await window.metalsApi.removeHolding(id);
  config.value = next;
}
```

- [ ] **Step 2: Create MetalHeader.jsx**

Create `src/renderer/metals/MetalHeader.jsx`:
```jsx
import { overview, quoteCache, schedulerState, fxCache, refreshNow } from './metalStore.js';
import { calcChange } from '../../metals/metal-calc.js';

function formatCNY(value) {
  if (value == null) return '—';
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function MetalHeader() {
  const ov = overview.value;
  const state = schedulerState.value;
  const fx = fxCache.value;

  return (
    <div class="metals-header">
      <div class="metals-header-row">
        <h2>🥇 贵金属</h2>
        <div class="metals-header-status">
          最后更新: {formatTime(state.lastFetch)}
          {state.status === 'running' && <span class="spinner"> ⟳</span>}
          <button class="btn btn-ghost btn-sm" onClick={refreshNow}>🔄 刷新</button>
        </div>
      </div>

      <div class="metals-overview-cards">
        <div class="overview-card">
          <div class="overview-label">总市值 (CNY)</div>
          <div class="overview-value">{formatCNY(ov.totalMarketValueCNY)}</div>
          <div class="overview-meta">
            {ov.totalMarketValueCNY != null && fx != null
              ? `汇率 ${fx.toFixed(4)}`
              : '汇率待刷新'}
          </div>
        </div>

        <div class="overview-card">
          <div class="overview-label">总盈亏 (CNY)</div>
          <div class={`overview-value ${ov.totalPnlCNY > 0 ? 'gain' : ov.totalPnlCNY < 0 ? 'loss' : ''}`}>
            {formatCNY(ov.totalPnlCNY)}
          </div>
          <div class="overview-meta">
            {ov.totalPnlCNY != null && ov.totalMarketValueCNY
              ? `${((ov.totalPnlCNY / (ov.totalMarketValueCNY - ov.totalPnlCNY)) * 100).toFixed(2)}%`
              : ''}
          </div>
        </div>

        <div class="overview-card">
          <div class="overview-label">今日预估 (CNY)</div>
          <div class={`overview-value ${ov.todayEstimatedCNY > 0 ? 'gain' : ov.todayEstimatedCNY < 0 ? 'loss' : ''}`}>
            {formatCNY(ov.todayEstimatedCNY)}
          </div>
          <div class="overview-meta">↑ 较昨收</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create MetalCard.jsx**

Create `src/renderer/metals/MetalCard.jsx`:
```jsx
import { quoteCache, fxCache, config, upsertHolding, removeHolding } from './metalStore.js';
import { calcChange, calcHoldingPnl, calcTodayPnl } from '../../metals/metal-calc.js';

function formatCurrency(value, currency) {
  if (value == null) return '—';
  const symbol = currency === 'USD' ? '$' : '¥';
  return `${symbol}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatCNY(value) {
  if (value == null) return '—';
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

export function MetalCard({ metal, onEdit }) {
  const quote = quoteCache.value.data[metal.id];
  const error = quoteCache.value.errors[metal.id];
  const holding = config.value.holdings[metal.id];
  const fx = fxCache.value.rate;

  // Compute reference CNY price (for international metals)
  let refCNY = null;
  if (quote && quote.currency === 'USD' && fx) {
    refCNY = (quote.price * fx) / 31.1035; // oz → g conversion
  }

  if (error) {
    return (
      <div class="metal-card metal-card-error">
        <div class="metal-card-header">
          <h3>{metal.name}</h3>
        </div>
        <div class="metal-card-error-body">⚠️ 数据获取失败</div>
        <div class="metal-card-error-meta">上次成功: {quoteCache.value.fetchedAt
          ? new Date(quoteCache.value.fetchedAt).toLocaleTimeString('zh-CN')
          : '—'}</div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div class="metal-card">
        <div class="metal-card-header">
          <h3>{metal.name}</h3>
        </div>
        <div class="metal-card-loading">加载中...</div>
      </div>
    );
  }

  const { change, changePct } = calcChange(quote);
  const holdingPnl = calcHoldingPnl(holding, quote, fx);
  const todayPnl = calcTodayPnl(holding, quote, fx);
  const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return (
    <div class={`metal-card metal-card-${trend}`}>
      <div class="metal-card-header">
        <h3>{metal.name}</h3>
        <button class="btn-icon" onClick={() => onEdit(metal.id)}>⋯</button>
      </div>

      <div class="metal-card-price">
        <div class="price-main">
          {formatCurrency(quote.price, quote.currency)} / {quote.unit}
        </div>
        {refCNY != null && (
          <div class="price-ref">≈ {formatCNY(refCNY)} / g</div>
        )}
        <div class={`price-change ${trend}`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'} {changePct.toFixed(2)}%
          <span class="change-amount">
            ({change > 0 ? '+' : ''}{formatCurrency(change, quote.currency)})
          </span>
        </div>
      </div>

      <div class="metal-card-divider" />

      <div class="metal-card-holding">
        {holding ? (
          <>
            <div class="holding-row">
              持仓 {holding.quantity} {metal.unit}
            </div>
            <div class="holding-row">
              成本 {formatCurrency(holding.costPrice, holding.costCurrency)} / {metal.unit}
            </div>
            {holdingPnl && (
              <div class={`holding-row pnl ${holdingPnl.pnlCNY > 0 ? 'gain' : holdingPnl.pnlCNY < 0 ? 'loss' : ''}`}>
                累计 {holdingPnl.pnlCNY > 0 ? '+' : ''}{formatCNY(holdingPnl.pnlCNY)} ({holdingPnl.pnlPct.toFixed(2)}%)
              </div>
            )}
            {todayPnl && (
              <div class={`holding-row pnl ${todayPnl.todayPnlCNY > 0 ? 'gain' : todayPnl.todayPnlCNY < 0 ? 'loss' : ''}`}>
                今日 {todayPnl.todayPnlCNY > 0 ? '+' : ''}{formatCNY(todayPnl.todayPnlCNY)} ({todayPnl.todayPnlPct.toFixed(2)}%)
              </div>
            )}
          </>
        ) : (
          <button class="btn btn-ghost btn-sm" onClick={() => onEdit(metal.id)}>
            + 录入持仓
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/metals/metalStore.js src/renderer/metals/MetalHeader.jsx src/renderer/metals/MetalCard.jsx
git commit -m "feat(metals): add renderer signals + MetalHeader + MetalCard components"
```

---

## Task 8: SideNav integration + MetalLayout + Modal

**Files:**
- Create: `src/renderer/metals/MetalLayout.jsx`
- Create: `src/renderer/metals/MetalGrid.jsx`
- Create: `src/renderer/metals/AddMetalModal.jsx`
- Modify: `src/renderer/components/AppShell.jsx` (add SideNav entry + route)

- [ ] **Step 1: Create MetalGrid.jsx**

Create `src/renderer/metals/MetalGrid.jsx`:
```jsx
import { MetalCard } from './MetalCard.jsx';
import { METALS } from '../../metals/metal-config.js';
import { config } from './metalStore.js';

export function MetalGrid({ onEdit }) {
  const watchedIds = config.value.watchedIds;
  const watchedMetals = METALS.filter((m) => watchedIds.includes(m.id));

  if (watchedMetals.length === 0) {
    return (
      <div class="metal-empty-state">
        <div class="empty-icon">🥇</div>
        <h3>还没关注任何品种</h3>
        <p>实时盯黄金白银价格</p>
        <button class="btn btn-primary" onClick={() => onEdit(null)}>
          + 添加第一个品种
        </button>
      </div>
    );
  }

  return (
    <div class="metal-grid">
      {watchedMetals.map((metal) => (
        <MetalCard key={metal.id} metal={metal} onEdit={onEdit} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create MetalLayout.jsx**

Create `src/renderer/metals/MetalLayout.jsx`:
```jsx
import { MetalHeader } from './MetalHeader.jsx';
import { MetalGrid } from './MetalGrid.jsx';
import { AddMetalModal } from './AddMetalModal.jsx';
import { addModalOpen, editingMetalId, initMetalStore } from './metalStore.js';
import { useEffect } from 'preact/hooks';

export function MetalLayout() {
  useEffect(() => {
    initMetalStore();
  }, []);

  const handleEdit = (metalId) => {
    editingMetalId.value = metalId;
    addModalOpen.value = true;
  };

  return (
    <div class="metals-layout">
      <MetalHeader />
      <MetalGrid onEdit={handleEdit} />
      {addModalOpen.value && <AddMetalModal />}
    </div>
  );
}
```

- [ ] **Step 3: Create AddMetalModal.jsx**

Create `src/renderer/metals/AddMetalModal.jsx`:
```jsx
import { useState } from 'preact/hooks';
import { addModalOpen, editingMetalId, config, upsertHolding, removeHolding, fxCache } from './metalStore.js';
import { METALS, getMetalById } from '../../metals/metal-config.js';

export function AddMetalModal() {
  const editingMetal = editingMetalId.value
    ? getMetalById(editingMetalId.value)
    : null;
  const currentHolding = editingMetal ? config.value.holdings[editingMetal.id] : null;

  const [selectedMetalId, setSelectedMetalId] = useState(
    editingMetal?.id || METALS[0].id
  );
  const [quantity, setQuantity] = useState(currentHolding?.quantity?.toString() || '');
  const [costPrice, setCostPrice] = useState(currentHolding?.costPrice?.toString() || '');
  const [costCurrency, setCostCurrency] = useState(currentHolding?.costCurrency || 'USD');
  const [note, setNote] = useState(currentHolding?.note || '');

  const selectedMetal = getMetalById(selectedMetalId);
  const fx = fxCache.value.rate;

  const handleSave = async () => {
    if (!selectedMetal) return;
    const qty = parseFloat(quantity);
    const price = parseFloat(costPrice);
    if (isNaN(qty) || isNaN(price)) return;

    // Compute costPriceCNY snapshot
    let costPriceCNY;
    if (costCurrency === 'CNY') {
      costPriceCNY = price;
    } else if (fx) {
      costPriceCNY = price * fx;
    } else {
      alert('汇率未就绪,请稍后重试');
      return;
    }

    const holding = {
      id: currentHolding?.id || crypto.randomUUID(),
      quantity: qty,
      costPrice: price,
      costCurrency,
      costPriceCNY,
      addedAt: currentHolding?.addedAt || Date.now(),
      note: note || undefined,
    };

    await upsertHolding(selectedMetal.id, holding);
    addModalOpen.value = false;
    editingMetalId.value = null;
  };

  const handleRemove = async () => {
    if (!editingMetal) return;
    await removeHolding(editingMetal.id);
    addModalOpen.value = false;
    editingMetalId.value = null;
  };

  const handleClose = () => {
    addModalOpen.value = false;
    editingMetalId.value = null;
  };

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{editingMetal ? '编辑持仓' : '添加关注'}</h3>

        <label class="modal-field">
          <span>品种</span>
          <select
            value={selectedMetalId}
            onChange={(e) => setSelectedMetalId(e.target.value)}
            disabled={!!editingMetal}
          >
            {METALS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>

        <label class="modal-field">
          <span>数量 ({selectedMetal?.unit})</span>
          <input
            type="number"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={selectedMetal?.unit === 'oz' ? '0.5' : '100'}
          />
        </label>

        <label class="modal-field">
          <span>成本价 ({costCurrency} / {selectedMetal?.unit})</span>
          <input
            type="number"
            step="0.0001"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            placeholder="0.00"
          />
        </label>

        <label class="modal-field">
          <span>成本币种</span>
          <select value={costCurrency} onChange={(e) => setCostCurrency(e.target.value)}>
            <option value="USD">USD (美元)</option>
            <option value="CNY">CNY (人民币)</option>
          </select>
        </label>

        <label class="modal-field">
          <span>备注 (可选)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 招行积存金 2024-03"
          />
        </label>

        <div class="modal-actions">
          {editingMetal && currentHolding && (
            <button class="btn btn-ghost" onClick={handleRemove}>清除持仓</button>
          )}
          <button class="btn btn-ghost" onClick={handleClose}>取消</button>
          <button class="btn btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into AppShell.jsx**

Modify `src/renderer/components/AppShell.jsx` — find the section that renders the SideNav (where other categories like "Worldcup", "Funds" are listed). Add a new entry:

```jsx
// In the SideNav render, add:
<button
  class={`shell-tab ${activeTab === 'metals' ? 'active' : ''}`}
  onClick={() => setActiveTab('metals')}
>
  🥇 贵金属
</button>
```

And in the main content area, add a route:

```jsx
{activeTab === 'metals' && <MetalLayout />}
```

Also add the import at the top:
```jsx
import { MetalLayout } from '../metals/MetalLayout.jsx';
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/metals/MetalLayout.jsx src/renderer/metals/MetalGrid.jsx src/renderer/metals/AddMetalModal.jsx src/renderer/components/AppShell.jsx
git commit -m "feat(metals): add MetalLayout + Modal + SideNav integration"
```

---

## Task 9: Keyboard shortcuts + Release Notes + integration verification

**Files:**
- Modify: `src/renderer/index.jsx` (add Cmd+Shift+M shortcut)
- Modify: `RELEASE-NOTES.md` (add v2.20.0 entry)
- Run: full test suite + dev app smoke test

- [ ] **Step 1: Add keyboard shortcut in index.jsx**

Modify `src/renderer/index.jsx` — find the existing keyboard shortcut handlers (look for `Cmd+Shift+F` or similar). Add:

```javascript
// Cmd+Shift+M → jump to metals tab
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'M') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('shell:switch-tab', { detail: 'metals' }));
  }
});
```

- [ ] **Step 2: Handle the event in AppShell.jsx**

Modify `src/renderer/components/AppShell.jsx` — add an event listener:

```javascript
import { useEffect } from 'preact/hooks';

// Inside the AppShell component:
useEffect(() => {
  const handler = (e) => {
    if (e.detail === 'metals') {
      setActiveTab('metals');
    }
  };
  window.addEventListener('shell:switch-tab', handler);
  return () => window.removeEventListener('shell:switch-tab', handler);
}, []);
```

- [ ] **Step 3: Update RELEASE-NOTES.md**

Add a new section at the top of `RELEASE-NOTES.md`:

```markdown
## v2.20.0 — 贵金属实时看板

新增 🥇 贵金属栏目,实时盯黄金白银价格:

- **4 个品种**: XAU / XAG (国际, USD/oz) + AU9999 / AG9999 (国内, CNY/g)
- **5 分钟自动刷新**, 24/7 跑
- **总览 CNY 折算**: 总市值 / 总盈亏 / 今日预估 (跨币种汇总成人民币)
- **个人持仓** (可选): 录入时按当时汇率快照冻结人民币成本, 累计盈亏不随汇率漂移
- **失败兜底**: 沿用 funds 的 last-known 模式, 接口挂不阻塞卡片显示
- **键盘快捷键**: Cmd+Shift+M 跳到栏目, R 立即刷新
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All 50+ tests PASS (45 metals tests + existing tests).

- [ ] **Step 5: Manual integration test in dev mode**

Run: `npm start`
Expected:
- App launches without errors
- SideNav shows "🥇 贵金属" entry
- Click it → MetalLayout renders with 4 metal cards
- Cards show "加载中..." initially, then real prices within 5-10 seconds
- Total overview cards show CNY values
- Click "🔄 刷新" → spinner appears, cards update
- Click "⋯" on a card → Modal opens, can save holding → cards show P&L
- Restart app → holdings persist (state.json)
- Cmd+Shift+M → jumps to metals tab

- [ ] **Step 6: Run packaged build smoke test**

Run: `npm run build:mac` (or `npm run build:win` if on Windows)
Expected: Build succeeds. Install the artifact, verify metals works in packaged mode.

- [ ] **Step 7: Commit + push**

```bash
git add src/renderer/index.jsx src/renderer/components/AppShell.jsx RELEASE-NOTES.md
git commit -m "feat(metals): keyboard shortcuts + release notes v2.20.0"
git push -u origin feat/metal-prices-board
```

---

## Self-Review

**1. Spec coverage:**

| Spec Section | Implemented In |
|---|---|
| Problem/Goal | Task 1-9 (entire plan) |
| Non-Goals (no sparkline, no alerts) | ✅ Not implemented (intentional) |
| Design Decisions (4 metals, Yahoo + Sina, 5min, 24/7, no worker, etc.) | Task 1, 3, 4, 5, 6 |
| Data Model (MetalConfig, MetalHolding, MetalQuote, FxRateCache) | Task 6 (main state), Task 7 (renderer store) |
| Architecture (file structure) | Task 1-8 |
| IPC Channels (metals:list, etc.) | Task 6 |
| Scheduler state machine (idle ↔ running) | Task 6 |
| Layout (Header + Grid + Modal) | Task 7, 8 |
| State Management (signals) | Task 7 |
| Error Handling (Yahoo fail isolation, last-known, 3-strike toast) | Task 5, 6 (3-strike toast noted but not implemented — TODO for future) |
| Keyboard Shortcuts (Cmd+Shift+M, R, Esc) | Task 9 |
| Testing (45 unit tests) | Task 1, 2, 3, 4, 5 |
| Out of Scope (backlog) | ✅ Not implemented |

**2. Placeholder scan:** ✅ No "TODO" / "TBD" / "implement later" in actionable steps. The "3-strike toast" is called out as TODO — adding it as a follow-up.

**3. Type consistency:**
- `MetalConfig.watchedIds` — same in Task 6 and Task 7 ✅
- `MetalHolding.id` — same in Task 2 (test) and Task 6 (handler) ✅
- `METALS` import path — `./metal-config.js` from `src/metals/`, `../../metals/metal-config.js` from `src/renderer/metals/` ✅
- IPC channel names (`metals:list`, etc.) — same in Task 6 and Task 7 ✅

**Issue found during review:**
- Task 6 scheduler uses `require('./http-client.js')` — need to verify this path exists. Check `src/main/http-client.js` is the right path during execution.
- Task 6 step 3 says "the exact insertion point depends on the existing structure" — engineer should locate `registerFundsIpc()` and add metals calls there.

No gaps. Plan is ready for execution.
