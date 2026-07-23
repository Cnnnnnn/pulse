/**
 * src/main/games/exchange-rates.ts
 *
 * Frankfurter v2 每日外币兑 CNY 汇率缓存。
 * ponytail: 进程内 Map 缓存 + 同币种 inflight 去重；升级路径见 TTL / last-good stale。
 */
"use strict";

const { fetchJson } = require("./normalize");
const { logFetchError } = require("./log");

const FRANKFURTER_URL = "https://api.frankfurter.dev/v2/rates";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function isValidCurrency(code: string): boolean {
  return typeof code === "string" && /^[A-Z]{3}$/.test(code) && code !== "CNY";
}

function normalizeCurrencies(currencies: string[]): string[] {
  const set = new Set<string>();
  for (const c of currencies || []) {
    if (isValidCurrency(c)) set.add(c);
  }
  return [...set];
}

function parseFrankfurterEntry(data: any, base: string): any {
  if (!Array.isArray(data)) return null;
  const entry = data.find(
    (e: any) =>
      e
      && e.base === base
      && e.quote === "CNY"
      && typeof e.rate === "number"
      && Number.isFinite(e.rate)
      && e.rate > 0,
  );
  if (!entry) return null;
  const { date } = entry;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { rate: entry.rate, date };
}

export function createExchangeRateService({
  fetchJson: fetch = fetchJson,
  now = () => Date.now(),
  ttlMs = DEFAULT_TTL_MS,
}: any = {}): any {
  const cache = new Map<string, any>();
  const inflight = new Map<string, Promise<void>>();

  async function fetchRate(currency: string): Promise<any> {
    const url = `${FRANKFURTER_URL}?base=${currency}&quotes=CNY`;
    const data = await fetch(url);
    const parsed = parseFrankfurterEntry(data, currency);
    if (!parsed) return null;
    const fetchedAt = now();
    return {
      rate: parsed.rate,
      date: parsed.date,
      fetchedAt,
      expiresAt: fetchedAt + ttlMs,
    };
  }

  async function refreshCurrency(currency: string): Promise<void> {
    if (inflight.has(currency)) {
      await inflight.get(currency);
      return;
    }
    const job = (async () => {
      try {
        const fresh = await fetchRate(currency);
        if (fresh) cache.set(currency, fresh);
      } catch (err) {
        logFetchError(`exchange-rates:${currency}`, err);
      } finally {
        inflight.delete(currency);
      }
    })();
    inflight.set(currency, job);
    await job;
  }

  async function getRates(currencies: string[]): Promise<any> {
    const codes = normalizeCurrencies(currencies);
    if (codes.length === 0) {
      return { rates: {}, date: null, fetchedAt: null, stale: false };
    }

    const refreshTasks: Promise<void>[] = [];
    for (const code of codes) {
      const entry = cache.get(code);
      const t = now();
      if (entry && t < entry.expiresAt) continue;
      refreshTasks.push(refreshCurrency(code));
    }
    await Promise.all(refreshTasks);

    const rates: Record<string, number> = {};
    let latestDate: string | null = null;
    let latestFetchedAt: number | null = null;
    let stale = false;
    const t = now();

    for (const code of codes) {
      const entry = cache.get(code);
      if (!entry) {
        stale = true;
        continue;
      }
      if (t >= entry.expiresAt) stale = true;
      rates[code] = entry.rate;
      if (!latestDate || entry.date > latestDate) latestDate = entry.date;
      if (latestFetchedAt == null || entry.fetchedAt > latestFetchedAt) {
        latestFetchedAt = entry.fetchedAt;
      }
    }

    if (Object.keys(rates).length === 0) {
      return { rates: {}, date: null, fetchedAt: null, stale: true };
    }

    return {
      rates,
      date: latestDate,
      fetchedAt:
        latestFetchedAt != null
          ? new Date(latestFetchedAt).toISOString()
          : null,
      stale,
    };
  }

  return { getRates };
}

export const exchangeRateService = createExchangeRateService();

module.exports = {
  createExchangeRateService,
  exchangeRateService,
  isValidCurrency,
};
