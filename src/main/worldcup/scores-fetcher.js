/**
 * src/main/worldcup/scores-fetcher.js
 *
 * v2.9.9 — 三层比分源 (优先级从高到低):
 *   1) ESPN fifa.world/scoreboard (进行中/完赛最准)
 *   2) worldcup26.ir /get/games
 *   3) openfootball cup.txt (兜底)
 * 只更新 eligibleKeys; 已完赛写入 state 后不再请求.
 */

const { HttpClient } = require("../http-client");
const stateStore = require("../state-store");
const { parseWorldcupTxt } = require("./parser");
const { matchKey } = require("./match-key");
const { FIXTURES_URL } = require("./fetcher");
const { fetchScoresFromWorldcup26 } = require("./scores-api-worldcup26");
const { fetchScoresFromEspn } = require("./scores-api-espn");
const { mainLog } = require("../log");

const FETCH_TIMEOUT_MS = 8000;

let _http = null;
function _getHttp() {
  if (!_http) _http = new HttpClient({ timeout: FETCH_TIMEOUT_MS });
  return _http;
}

function _scoreEntryFromMatch(match) {
  if (!match || !match.score || !match.score.ft) return null;
  return {
    ft: match.score.ft,
    ht: match.score.ht || null,
    status: match.score.status || "final",
    updatedAt: Date.now(),
    source: "openfootball",
  };
}

function _fixturesForKeys(allMatches, keys) {
  const keySet = new Set(keys);
  return (allMatches || []).filter((m) => keySet.has(matchKey(m)));
}

function _loadFixturesFromCache() {
  const cached = stateStore.loadWorldcupTxt();
  if (!cached || !cached.txt) return null;
  try {
    return parseWorldcupTxt(cached.txt);
  } catch (err) {
    mainLog.warn("[worldcup/scores-fetcher] cache parse failed", {
      msg: err && err.message,
    });
    return null;
  }
}

async function _fetchFreshTxt() {
  const r = await _getHttp().get(FIXTURES_URL, { timeout: FETCH_TIMEOUT_MS });
  if (!r || r.error) {
    return { ok: false, reason: r && r.error ? r.error : "fetch_failed" };
  }
  const txt = r.body || (typeof r === "string" ? r : null);
  if (!txt || typeof txt !== "string") {
    return { ok: false, reason: "empty_body" };
  }
  try {
    stateStore.saveWorldcupTxt({ txt, ts: Date.now() });
  } catch (err) {
    mainLog.warn("[worldcup/scores-fetcher] cache write failed", {
      msg: err && err.message,
    });
  }
  return { ok: true, data: parseWorldcupTxt(txt) };
}

/**
 * @param {string[]} eligibleKeys
 * @returns {Promise<{ok: boolean, scores?: object, updatedKeys?: string[], skipped?: boolean, reason?: string, sources?: object}>}
 */
async function refreshWorldcupScores(eligibleKeys) {
  const keys = Array.isArray(eligibleKeys) ? eligibleKeys.filter(Boolean) : [];
  const existing = stateStore.loadWorldcupScores() || { entries: {}, ts: 0 };

  if (keys.length === 0) {
    return {
      ok: true,
      scores: existing.entries,
      updatedKeys: [],
      skipped: true,
    };
  }

  try {
    let fixturesData = _loadFixturesFromCache();
    if (!fixturesData || !fixturesData.matches) {
      const fresh = await _fetchFreshTxt();
      if (!fresh.ok) {
        return { ok: false, reason: fresh.reason, scores: existing.entries };
      }
      fixturesData = fresh.data;
    }

    const targetFixtures = _fixturesForKeys(fixturesData.matches, keys);
    const merged = { ...(existing.entries || {}) };
    const updatedKeys = [];
    const sources = { espn: 0, worldcup26: 0, openfootball: 0 };

    // Layer 1: ESPN (进行中/完赛最准)
    const fromEspn = await fetchScoresFromEspn(
      _getHttp(),
      targetFixtures,
      matchKey,
    );
    for (const k of keys) {
      if (fromEspn[k]) {
        merged[k] = fromEspn[k];
        updatedKeys.push(k);
        sources.espn += 1;
      }
    }

    // Layer 2: worldcup26.ir
    const needWc26 = keys.filter((k) => !fromEspn[k]);
    const fromApi = await fetchScoresFromWorldcup26(
      _getHttp(),
      _fixturesForKeys(fixturesData.matches, needWc26),
      matchKey,
    );
    for (const k of needWc26) {
      if (fromApi[k]) {
        merged[k] = fromApi[k];
        updatedKeys.push(k);
        sources.worldcup26 += 1;
      }
    }

    // Layer 3: openfootball TXT (仅补仍未覆盖的场次)
    const missingKeys = keys.filter((k) => !fromEspn[k] && !fromApi[k]);
    if (missingKeys.length > 0) {
      const fresh = await _fetchFreshTxt();
      if (fresh.ok && fresh.data && fresh.data.matches) {
        const byKey = new Map();
        for (const m of fresh.data.matches) {
          byKey.set(matchKey(m), m);
        }
        for (const k of missingKeys) {
          const m = byKey.get(k);
          const entry = m ? _scoreEntryFromMatch(m) : null;
          if (entry) {
            merged[k] = entry;
            updatedKeys.push(k);
            sources.openfootball += 1;
          }
        }
      }
    }

    stateStore.saveWorldcupScores({ entries: merged, ts: Date.now() });
    return { ok: true, scores: merged, updatedKeys, sources };
  } catch (err) {
    mainLog.warn("[worldcup/scores-fetcher] refresh threw", {
      msg: err && err.message,
    });
    return {
      ok: false,
      reason: "threw",
      error: err && err.message,
      scores: existing.entries,
    };
  }
}

module.exports = {
  refreshWorldcupScores,
};
