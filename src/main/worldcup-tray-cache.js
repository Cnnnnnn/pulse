/**
 * src/main/worldcup-tray-cache.js
 *
 * v2.22: 给 tray 用的 worldcup cache facade.
 * 复用 stateStore.loadWorldcupTxt / loadWorldcupScores (持久化) + parseWorldcupTxt
 * (v2.19 已 ship 纯解析器) + matchKey / matchKickoffUtcMs (纯工具).
 *
 * 设计原则:
 *   - createWorldcupTrayCache({ statePath }) 工厂, 无副作用
 *   - getTodayLive() → { ok, date, matches, ts } 给 tray 显示当天比赛 + 比分
 *   - getUpcoming(limit) → { ok, matches, ts } 给 tray 显示即将开始的 N 场
 *   - getTraySummary() → { ok, live, final, pre, lastUpdatedTs } 给 tray 显示头部状态
 *   - 直读 state.json (避开 stateStore 的 schema migration 包装, 与 ai-usage-cache 同思路)
 */
const fs = require("fs");
const { parseWorldcupTxt } = require("./worldcup/parser");
const { matchKey, matchKickoffUtcMs } = require("./worldcup/match-key");

function _readState(statePath) {
  if (!statePath) return null;
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return null;
    return j;
  } catch {
    return null;
  }
}

function _readField(state, key) {
  if (!state || !state[key] || typeof state[key] !== "object") return null;
  return state[key];
}

/**
 * @param {{ statePath?: string }} opts
 */
function createWorldcupTrayCache(opts = {}) {
  const statePath = opts.statePath;

  function _loadMatches() {
    const state = _readState(statePath);
    if (!state) return { ok: false, reason: "no_data" };
    const txtBlock = _readField(state, "worldcup_txt");
    if (!txtBlock || typeof txtBlock.txt !== "string") {
      return { ok: false, reason: "no_fixtures" };
    }
    let parsed;
    try {
      parsed = parseWorldcupTxt(txtBlock.txt);
    } catch {
      return { ok: false, reason: "parse_error" };
    }
    const matches = parsed && Array.isArray(parsed.matches) ? parsed.matches : [];
    const scoresBlock = _readField(state, "worldcup_scores");
    const scoresMap =
      scoresBlock && scoresBlock.entries && typeof scoresBlock.entries === "object"
        ? scoresBlock.entries
        : {};
    // attach scores
    for (const m of matches) {
      const k = matchKey(m);
      const sc = scoresMap[k];
      if (sc) m.score = sc;
    }
    return { ok: true, matches, scoresMap, ts: txtBlock.ts };
  }

  function getTodayLive() {
    const r = _loadMatches();
    if (!r.ok) return r;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const todays = r.matches.filter((m) => m.date === todayStr);
    return {
      ok: true,
      date: todayStr,
      matches: todays.map(_toTrayMatch),
      ts: r.ts,
    };
  }

  function getUpcoming(limit = 3) {
    const r = _loadMatches();
    if (!r.ok) return r;
    const nowMs = Date.now();
    const upcoming = r.matches
      .filter((m) => {
        // exclude finished (no future kickoff) AND exclude live (already in today section)
        if (m.score && (m.score.status === "final" || m.score.status === "live"))
          return false;
        const ks = matchKickoffUtcMs(m);
        return typeof ks === "number" && ks > nowMs;
      })
      .sort((a, b) => matchKickoffUtcMs(a) - matchKickoffUtcMs(b))
      .slice(0, limit);
    return {
      ok: true,
      matches: upcoming.map(_toTrayMatch),
      ts: r.ts,
    };
  }

  function getTraySummary() {
    const state = _readState(statePath);
    if (!state) return { ok: false, reason: "no_data" };
    const scoresBlock = _readField(state, "worldcup_scores");
    if (!scoresBlock || !scoresBlock.entries) {
      return { ok: true, live: 0, final: 0, pre: 0, lastUpdatedTs: null };
    }
    let live = 0;
    let final = 0;
    let pre = 0;
    let lastUpdatedTs = null;
    for (const k of Object.keys(scoresBlock.entries)) {
      const e = scoresBlock.entries[k];
      if (!e || typeof e !== "object") continue;
      if (e.status === "live") live++;
      else if (e.status === "final") final++;
      else if (e.status === "pre") pre++;
      if (typeof e.updatedAt === "number") {
        if (lastUpdatedTs === null || e.updatedAt > lastUpdatedTs)
          lastUpdatedTs = e.updatedAt;
      }
    }
    return { ok: true, live, final, pre, lastUpdatedTs, ts: scoresBlock.ts || null };
  }

  return { getTodayLive, getUpcoming, getTraySummary };
}

/**
 * 把内部 match 简化成 tray 用的轻量形状.
 * 去掉 parser 的全部原始字段, 只留 tray 显示所需.
 */
function _toTrayMatch(m) {
  return {
    key: matchKey(m),
    date: m.date,
    time: m.time,
    team1: m.team1,
    team2: m.team2,
    stage: m.stage || "",
    kickoffUtcMs: matchKickoffUtcMs(m),
    score: m.score
      ? {
          ft: m.score.ft || null,
          status: m.score.status || null,
          clock: m.score.clock || null,
        }
      : null,
  };
}

module.exports = { createWorldcupTrayCache };
