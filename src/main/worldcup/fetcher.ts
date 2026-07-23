/**
 * src/main/worldcup/fetcher.ts
 *
 * v2.9.0 世界杯专栏 — server-side fetch Football.TXT
 *
 * 数据源: openfootball/worldcup 公共数据集 (CC0-1.0)
 *   URL: https://raw.githubusercontent.com/openfootball/worldcup/master/2026--usa/cup.txt
 *
 * 复用 http-client.js (Phase 12) 统一 timeout/retry
 * 复用 state-store.js (Phase 12) 24h 缓存
 *
 * 0 鉴权, 0 限流, 0 CORS (server-side)
 */
"use strict";

const { HttpClient } = require("../http-client.ts");
const stateStore = require("../state-store.ts");
const { parseWorldcupTxt } = require("./parser.ts");
const { mainLog } = require("../log.ts");

const FIXTURES_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup/master/2026--usa/cup.txt";
const FINALS_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup/master/2026--usa/cup_finals.txt";
const CACHE_KEY = "worldcup:fixtures:txt";
const FINALS_CACHE_KEY = "worldcup:finals:txt";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MIN_MATCH_COUNT = 70;
const FETCH_TIMEOUT_MS = 8000;

let _http: any = null;
function _getHttp(): any {
  if (!_http) _http = new HttpClient({ timeout: FETCH_TIMEOUT_MS });
  return _http;
}

function _cacheLooksComplete(txt: string): boolean {
  try {
    const data = parseWorldcupTxt(txt);
    return data.matches.length >= MIN_MATCH_COUNT;
  } catch {
    return false;
  }
}

export async function loadFixturesTxt(opts: any = {}): Promise<any> {
  const force = !!(opts && opts.force);
  if (!force) {
    try {
      const cached = stateStore.loadWorldcupTxt();
      if (
        cached &&
        cached.txt &&
        cached.ts &&
        Date.now() - cached.ts < CACHE_TTL_MS &&
        _cacheLooksComplete(cached.txt)
      ) {
        return { ok: true, txt: cached.txt, cached: true, ts: cached.ts };
      }
    } catch (err: any) {
      mainLog.warn("[worldcup/fetcher] cache read failed", {
        msg: err && err.message,
      });
    }
  }

  try {
    const r = await _getHttp().get(FIXTURES_URL, { timeout: FETCH_TIMEOUT_MS });
    if (!r || r.error) {
      const reason = r && r.error ? r.error : "unknown";
      return { ok: false, reason };
    }
    const txt = r.body || (typeof r === "string" ? r : null);
    if (!txt || typeof txt !== "string") {
      return { ok: false, reason: "empty_body" };
    }
    try {
      stateStore.saveWorldcupTxt({ txt, ts: Date.now() });
    } catch (err: any) {
      mainLog.warn("[worldcup/fetcher] cache write failed", {
        msg: err && err.message,
      });
    }
    return { ok: true, txt, cached: false, ts: Date.now() };
  } catch (err: any) {
    mainLog.warn("[worldcup/fetcher] fetch threw", { msg: err && err.message });
    return { ok: false, reason: "threw", error: err && err.message };
  }
}

function _cacheFinalsLooksComplete(txt: string): boolean {
  try {
    const data = parseWorldcupTxt(txt);
    const withNum = (data.matches || []).filter(
      (m: any) => typeof m.matchNum === "number",
    );
    return withNum.length >= 28;
  } catch {
    return false;
  }
}

export async function loadFinalsTxt(opts: any = {}): Promise<any> {
  try {
    const http = (opts && opts.http) || _getHttp();
    const r = await http.get(FINALS_URL, { timeout: FETCH_TIMEOUT_MS });
    if (!r || r.error) {
      const reason = r && r.error ? r.error : "unknown";
      return { ok: false, reason };
    }
    const txt = r.body || (typeof r === "string" ? r : null);
    if (!txt || typeof txt !== "string") {
      return { ok: false, reason: "empty_body" };
    }
    return { ok: true, txt };
  } catch (err: any) {
    mainLog.warn("[worldcup/fetcher] finals fetch threw", {
      msg: err && err.message,
    });
    return { ok: false, reason: "threw", error: err && err.message };
  }
}

export async function fetchWorldcupFixtures(opts: any = {}): Promise<any> {
  const r = await loadFixturesTxt(opts);
  if (!r.ok) return r;
  try {
    const data = parseWorldcupTxt(r.txt);
    return { ok: true, data, cached: r.cached, ts: r.ts };
  } catch (err: any) {
    mainLog.warn("[worldcup/fetcher] parse failed", {
      msg: err && err.message,
    });
    return { ok: false, reason: "parse_failed", error: err && err.message };
  }
}

module.exports = {
  fetchWorldcupFixtures,
  loadFixturesTxt,
  loadFinalsTxt,
  FIXTURES_URL,
  FINALS_URL,
  FINALS_CACHE_KEY,
  CACHE_TTL_MS,
  MIN_MATCH_COUNT,
};