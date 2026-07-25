/**
 * src/metals/metal-sina-hf-fetcher.ts
 *
 * Sina hq.sinajs.cn client for international spot metals + FX.
 * Replaces the dead Yahoo v8 chart fetcher. The `hf_*` symbols are already
 * denominated in USD/oz, so NO priceScale conversion is needed (unlike the old
 * Yahoo GC=F/SI=F futures path).
 *
 * Same endpoint as the domestic `metal-sina-fetcher.js` (hq.sinajs.cn) but the
 * row layout differs — this module parses the `hf_*` / `USDCNY` shapes only.
 *
 * Field layout (verified 2026-06-17 against live data):
 *
 *   hf_GC / hf_SI (15 fields):
 *     [0] current   [1] (empty)   [2] bid   [3] ask   [4] high   [5] low
 *     [6] time (HH:MM:SS)   [7] prevClose   [8] settle   [9-11] misc
 *     [12] date (YYYY-MM-DD)   [13] name (GBK, unused)   [14] misc
 *
 *   USDCNY (11 fields):
 *     [0] time (HH:MM:SS)
 *     [1] bid   [2] (empty)   [3] ask   [4] (misc)
 *     [5] mid      ← we surface this as the USD→CNY rate
 *     [6] prevMid   [7] prevBid   [8] prevAsk
 *     [9] name (GBK, unused)   [10] date (YYYY-MM-DD)
 *
 * GBK note: only number / ASCII fields are parsed. The Chinese name comes from
 * local metal-config.ts, so no iconv-lite dependency is needed — same trick as
 * the domestic sina fetcher.
 *
 * HTTP abstraction: injected `httpGet(url, headers) => Promise<string>`.
 */

const SINA_BASE = 'https://hq.sinajs.cn/list';

const DEFAULT_HEADERS = {
  Referer: 'https://finance.sina.com.cn',
  'User-Agent': 'Mozilla/5.0',
};

// hf metal field indices
const HF_PRICE = 0;
const HF_PREV_CLOSE = 7;
const HF_TIME = 6;
const HF_DATE = 12;

// USDCNY field indices
const FX_MID = 5;
const FX_TIME = 0;
const FX_DATE = 10;

/**
 * Build Sina URL for multiple symbols (hf_* or USDCNY).
 */
export function buildHfUrl(symbols: any) {
  return `${SINA_BASE}=${symbols.join(',')}`;
}

/**
 * Parse Sina time fields into unix ms.
 */
export function parseHfTime(time: any, date: any) {
  if (!time || !date) return Date.now();
  const m = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !d) return Date.now();
  return new Date(
    parseInt(d[1], 10),
    parseInt(d[2], 10) - 1,
    parseInt(d[3], 10),
    parseInt(m[1], 10),
    parseInt(m[2], 10),
    parseInt(m[3], 10),
  ).getTime();
}

/**
 * Parse a single hf_* metal line into a normalized quote.
 */
export function parseHfMetalLine(payload: any, metalId: any, meta: any) {
  const fields = payload.split(',');
  if (fields.length < HF_DATE + 1) return null;

  const price = parseFloat(fields[HF_PRICE]);
  const prevClose = parseFloat(fields[HF_PREV_CLOSE]);
  if (!Number.isFinite(price) || !Number.isFinite(prevClose)) return null;

  return {
    id: metalId,
    price,
    prevClose,
    currency: meta.currency,
    unit: meta.unit,
    quoteTime: parseHfTime(fields[HF_TIME], fields[HF_DATE]),
    source: 'sina-hf',
  };
}

/**
 * Parse a USDCNY line into an FX rate.
 */
export function parseHfFxLine(payload: any) {
  const fields = payload.split(',');
  if (fields.length < FX_MID + 1) return null;

  const rate = parseFloat(fields[FX_MID]);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return {
    rate,
    fetchedAt: Date.now(),
    quoteTime: parseHfTime(fields[FX_TIME], fields[FX_DATE]),
  };
}

/**
 * Parse a full Sina response for hf_* + USDCNY symbols.
 */
export function parseHfResponse(text: any, symbolToMetal: any, symbolToFx: any) {
  const quotes: any = {};
  const fx: any = {};
  if (!text) return { quotes, fx };

  for (const [symbol, entry] of Object.entries(symbolToMetal)) {
    const re = new RegExp(`var\\s+hq_str_${symbol}="([^"]*)"`);
    const m = text.match(re);
    if (!m) continue;
    const parsed = parseHfMetalLine(m[1], (entry as any).metalId, (entry as any).meta);
    if (parsed) quotes[(entry as any).metalId] = parsed;
  }

  for (const [symbol, fxId] of Object.entries(symbolToFx)) {
    const re = new RegExp(`var\\s+hq_str_${symbol}="([^"]*)"`);
    const m = text.match(re);
    if (!m) continue;
    const parsed = parseHfFxLine(m[1]);
    if (parsed) fx[fxId as string] = parsed;
  }

  return { quotes, fx };
}

/**
 * Fetch international metals (hf_GC, hf_SI) + FX (USDCNY) in one HTTP call.
 */
export async function fetchHfQuotes(symbols: any, httpGet: any, symbolToMetal: any, symbolToFx: any) {
  const url = buildHfUrl(symbols);
  const response = await httpGet(url, DEFAULT_HEADERS);

  if (typeof response !== 'string') {
    throw new Error('Unexpected response type from Sina hf fetcher (expected string)');
  }

  return parseHfResponse(response, symbolToMetal, symbolToFx);
}

