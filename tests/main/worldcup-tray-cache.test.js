/**
 * tests/main/worldcup-tray-cache.test.js
 *
 * v2.22 Task C1: worldcup-tray-cache facade — 给 tray 用的简化接口.
 * 底层复用 parseWorldcupTxt (v2.19) + matchKey / matchKickoffUtcMs (v2.19).
 *
 * 注意: vitest 强制 TZ=UTC, 所以 "today" 走 UTC 时钟. 测试 fixture 用真实
 * openfootball TXT 格式 (parser 严格依赖 `▪ Stage` + `Weekday Month Day`
 * 两个 header 行, 缺一不可).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { createWorldcupTrayCache } = require("../../src/main/worldcup-tray-cache");

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "worldcup-tray-cache-"));
  return path.join(dir, "state.json");
}

function writeState(statePath, obj) {
  fs.writeFileSync(statePath, JSON.stringify(obj), "utf-8");
}

/** YYYY-MM-DD (UTC, since vitest forces TZ=UTC) */
function todayStr(base) {
  const t = base || new Date();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

function offsetDay(base, days) {
  const t = new Date(base.getTime() + days * 24 * 3600_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 把 "YYYY-MM-DD" 转成 parser 期望的 `Wed June 17` 格式 (UTC).
 * parser 内部硬编码 year=2026, 所以如果测试跨年跑会失败 — 这是 known
 * fragility, 不在 C1 任务范围内修.
 */
function fmtWeekdayDate(yyyy_mm_dd) {
  const [y, m, d] = yyyy_mm_dd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
  const monthName = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][m - 1];
  return `${wd} ${monthName} ${d}`;
}

/**
 * 构造一个 openfootball 格式的 TXT, 包含一组 (date, time, team1, team2) 比赛.
 * @param {Array<{date: string, time: string, team1: string, team2: string}>} matches
 */
function buildTxt(matches) {
  const lines = ["= World Cup 2026", "", "▪ Group A"];
  let lastDate = null;
  for (const m of matches) {
    if (m.date !== lastDate) {
      lines.push(fmtWeekdayDate(m.date));
      lastDate = m.date;
    }
    lines.push(`  ${m.time} UTC-5  ${m.team1.padEnd(12, " ")} v ${m.team2.padEnd(16, " ")} @ ${m.team1} Stadium`);
  }
  return lines.join("\n");
}

describe("worldcup-tray-cache", () => {
  let statePath;
  beforeEach(() => {
    statePath = tmpStatePath();
  });
  afterEach(() => {
    try {
      fs.unlinkSync(statePath);
    } catch {}
  });

  it("returns ok:false (no data) when state.json is missing", () => {
    const cache = createWorldcupTrayCache({ statePath });
    const r = cache.getTodayLive();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_data");
  });

  it("getTodayLive filters matches by local today date", () => {
    const today = new Date();
    const todayS = todayStr();
    const tomorrowS = offsetDay(today, 1);
    const txt = buildTxt([
      { date: todayS, time: "13:00", team1: "Mexico", team2: "South Africa" },
      { date: tomorrowS, time: "14:00", team1: "Mexico", team2: "Canada" },
    ]);
    writeState(statePath, { apps: {}, worldcup_txt: { txt, ts: Date.now() } });
    const cache = createWorldcupTrayCache({ statePath });
    const r = cache.getTodayLive();
    expect(r.ok).toBe(true);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].team1).toBe("Mexico");
    expect(r.matches[0].team2).toBe("South Africa");
    expect(r.date).toBe(todayS);
  });

  it("getTodayLive attaches live scores from worldcup_scores", () => {
    const todayS = todayStr();
    const txt = buildTxt([
      { date: todayS, time: "13:00", team1: "Mexico", team2: "South Africa" },
    ]);
    writeState(statePath, {
      apps: {},
      worldcup_txt: { txt, ts: Date.now() },
      worldcup_scores: {
        entries: {
          // matchKey = `${date}|${time}|${team1}|${team2}`
          [`${todayS}|13:00|Mexico|South Africa`]: {
            ft: [2, 1],
            ht: [1, 0],
            status: "live",
            clock: "67'",
            updatedAt: Date.now(),
            source: "espn",
          },
        },
        ts: Date.now(),
      },
    });
    const cache = createWorldcupTrayCache({ statePath });
    const r = cache.getTodayLive();
    expect(r.ok).toBe(true);
    expect(r.matches[0].score).toBeDefined();
    expect(r.matches[0].score.ft).toEqual([2, 1]);
    expect(r.matches[0].score.status).toBe("live");
  });

  it("getUpcoming returns N matches sorted by kickoff", () => {
    // Anchored on "now + 1 day" so the test stays correct regardless of when
    // it runs: getUpcoming filters out past kickoffs (kickoffUtcMs > nowMs).
    const base = new Date(Date.now() + 24 * 3600 * 1000);
    const txt = buildTxt([
      { date: todayStr(base), time: "13:00", team1: "Mexico", team2: "South Africa" },
      { date: offsetDay(base, 1), time: "14:00", team1: "Brazil", team2: "Argentina" },
      { date: offsetDay(base, 2), time: "15:00", team1: "Spain", team2: "France" },
      { date: offsetDay(base, 3), time: "16:00", team1: "Germany", team2: "Italy" },
    ]);
    writeState(statePath, { apps: {}, worldcup_txt: { txt, ts: Date.now() } });
    const cache = createWorldcupTrayCache({ statePath });
    const r = cache.getUpcoming(2);
    expect(r.ok).toBe(true);
    expect(r.matches).toHaveLength(2);
    expect(r.matches[0].team1).toBe("Mexico");
    expect(r.matches[1].team1).toBe("Brazil");
  });

  it("getTraySummary counts live + final matches", () => {
    writeState(statePath, {
      apps: {},
      worldcup_txt: { txt: `World Cup 2026`, ts: Date.now() },
      worldcup_scores: {
        entries: {
          k1: { ft: [1, 0], ht: [0, 0], status: "live", clock: "30'", updatedAt: Date.now(), source: "espn" },
          k2: { ft: [2, 0], ht: [1, 0], status: "final", clock: null, updatedAt: Date.now(), source: "espn" },
          k3: { ft: [0, 0], ht: null, status: "pre", clock: null, updatedAt: Date.now(), source: "espn" },
        },
        ts: Date.now(),
      },
    });
    const cache = createWorldcupTrayCache({ statePath });
    const r = cache.getTraySummary();
    expect(r.ok).toBe(true);
    expect(r.live).toBe(1);
    expect(r.final).toBe(1);
    expect(r.pre).toBe(1);
  });

  it("malformed state.json (not JSON) → ok:false no_data", () => {
    fs.writeFileSync(statePath, "NOT JSON {{{", "utf-8");
    const cache = createWorldcupTrayCache({ statePath });
    const r = cache.getTodayLive();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_data");
  });
});
