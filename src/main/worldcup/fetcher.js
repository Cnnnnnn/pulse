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

const { HttpClient } = require("../http-client.ts");
const stateStore = require("../state-store.ts");
const { parseWorldcupTxt } = require("./parser");
const { mainLog } = require("../log.ts");

const FIXTURES_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup/master/2026--usa/cup.txt";
const FINALS_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup/master/2026--usa/cup_finals.txt";
const CACHE_KEY = "worldcup:fixtures:txt";
const FINALS_CACHE_KEY = "worldcup:finals:txt"; // 当前未启用 (see loadFinalsTxt)
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

function _cacheFinalsLooksComplete(txt) {
  // ponytail: 暂未启用 (loadFinalsTxt 不持久化). 留作未来世界赛 store.
  try {
    const data = parseWorldcupTxt(txt);
    const withNum = (data.matches || []).filter(
      (m) => typeof m.matchNum === "number",
    );
    return withNum.length >= 28; // 16 R32 + 8 R16 + 4 QF + 2 SF + 1 季军 + 1 Final = 32
  } catch {
    return false;
  }
}

/**
 * Load knockout-stage TXT (cup_finals.txt) — independent URL from group-stage.
 *
 * ponytail: 不引入新 cache 层. 24h 进程内 cache 由 caller 控制 (e.g. bracket IPC 调
 * 时被上层 30s 节流). state-store 不动. 后续若需持久化再加 worldcup_finals_txt key.
 *
 * @param {{ force?: boolean, http?: object }} [opts]
 * @returns {Promise<{ok: boolean, txt?: string, reason?: string}>}
 */
async function loadFinalsTxt(opts = {}) {
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
  } catch (err) {
    mainLog.warn("[worldcup/fetcher] finals fetch threw", {
      msg: err && err.message,
    });
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
  loadFinalsTxt,
  FIXTURES_URL,
  FINALS_URL,
  FINALS_CACHE_KEY,
  CACHE_TTL_MS,
  MIN_MATCH_COUNT,
};
