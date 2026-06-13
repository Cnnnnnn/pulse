/**
 * src/main/worldcup/fetcher.js
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

const { HttpClient } = require("../http-client");
const stateStore = require("../state-store");
const { parseWorldcupTxt } = require("./parser");
const { mainLog } = require("../log");

const FIXTURES_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup/master/2026--usa/cup.txt";
const CACHE_KEY = "worldcup:fixtures:txt";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MIN_MATCH_COUNT = 70; // 当前 cup.txt 约 72 场; 旧解析仅识别 v 格式约 68 场
const FETCH_TIMEOUT_MS = 8000;

let _http = null;
function _getHttp() {
  if (!_http) _http = new HttpClient({ timeout: FETCH_TIMEOUT_MS });
  return _http;
}

function _cacheLooksComplete(txt) {
  try {
    const data = parseWorldcupTxt(txt);
    return data.matches.length >= MIN_MATCH_COUNT;
  } catch {
    return false;
  }
}

/**
 * Load cached TXT (if fresh) or fetch fresh from GitHub.
 *
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ok: boolean, txt?: string, cached?: boolean, ts?: number, reason?: string}>}
 */
async function loadFixturesTxt(opts = {}) {
  const force = !!(opts && opts.force);
  // 1) Check cache
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
    } catch (err) {
      mainLog.warn("[worldcup/fetcher] cache read failed", {
        msg: err && err.message,
      });
    }
  }

  // 2) Fetch fresh
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
    // 3) Persist
    try {
      stateStore.saveWorldcupTxt({ txt, ts: Date.now() });
    } catch (err) {
      mainLog.warn("[worldcup/fetcher] cache write failed", {
        msg: err && err.message,
      });
    }
    return { ok: true, txt, cached: false, ts: Date.now() };
  } catch (err) {
    mainLog.warn("[worldcup/fetcher] fetch threw", { msg: err && err.message });
    return { ok: false, reason: "threw", error: err && err.message };
  }
}

/**
 * Top-level helper: load + parse.
 *
 * @param {{ force?: boolean }} [opts]
 */
async function fetchWorldcupFixtures(opts = {}) {
  const r = await loadFixturesTxt(opts);
  if (!r.ok) return r;
  try {
    const data = parseWorldcupTxt(r.txt);
    return { ok: true, data, cached: r.cached, ts: r.ts };
  } catch (err) {
    mainLog.warn("[worldcup/fetcher] parse failed", {
      msg: err && err.message,
    });
    return { ok: false, reason: "parse_failed", error: err && err.message };
  }
}

module.exports = {
  fetchWorldcupFixtures,
  loadFixturesTxt,
  FIXTURES_URL,
  CACHE_TTL_MS,
  MIN_MATCH_COUNT,
};
