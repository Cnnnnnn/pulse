/**
 * tests/main/worldcup-bracket-ipc.test.js
 *
 * TDD for src/main/worldcup/bracket.js — IPC handler that
 * orchestrates fetcher → parser → scores → bracket-rules → state-store.
 *
 * Pattern: see worldcup-bracket-state-store.test.js for state-store helper.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
const fs = require("fs");
const os = require("os");
const path = require("path");

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-ipc-"));
  return path.join(dir, "state.json");
}

const FULL_GROUP_STANDINGS = {
  A: { winner: "Mexico", runnerUp: "South Africa", third: { name: "South Korea", pts: 3, gd: 0, gf: 2 } },
  B: { winner: "Canada", runnerUp: "Switzerland", third: { name: "Qatar", pts: 3, gd: 0, gf: 2 } },
  C: { winner: "Brazil", runnerUp: "Morocco", third: { name: "Scotland", pts: 3, gd: 0, gf: 2 } },
  D: { winner: "USA", runnerUp: "Paraguay", third: { name: "Australia", pts: 3, gd: 0, gf: 2 } },
  E: { winner: "Germany", runnerUp: "Curaçao", third: { name: "Ivory Coast", pts: 3, gd: 0, gf: 2 } },
  F: { winner: "Netherlands", runnerUp: "Japan", third: { name: "Sweden", pts: 3, gd: 0, gf: 2 } },
  G: { winner: "Belgium", runnerUp: "Egypt", third: { name: "Iran", pts: 3, gd: 0, gf: 2 } },
  H: { winner: "Spain", runnerUp: "Cape Verde", third: { name: "Saudi Arabia", pts: 3, gd: 0, gf: 2 } },
  I: { winner: "France", runnerUp: "Senegal", third: { name: "Iraq", pts: 3, gd: 0, gf: 2 } },
  J: { winner: "Argentina", runnerUp: "Algeria", third: { name: "Austria", pts: 3, gd: 0, gf: 2 } },
  K: { winner: "Portugal", runnerUp: "DR Congo", third: { name: "Colombia", pts: 3, gd: 0, gf: 2 } },
  L: { winner: "England", runnerUp: "Croatia", third: { name: "Ghana", pts: 3, gd: 0, gf: 2 } },
};

function stubFetcher() {
  return { ok: true, data: { name: "World Cup 2026", groups: [], matches: [] } };
}
function stubScores() { return {}; }
function stubTeamsData() { return []; }

describe("worldcup bracket IPC handler", () => {
  let statePath;
  beforeEach(() => { statePath = tmpStatePath(); });
  afterEach(() => {
    try { fs.rmSync(path.dirname(statePath), { recursive: true, force: true }); } catch {}
  });

  test("computeWorldcupBracket returns ok+snapshot and writes state", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: stubFetcher,
      scores: stubScores,
      teamsData: stubTeamsData,
      groupStandings: FULL_GROUP_STANDINGS,
    });
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBeDefined();
    expect(r.snapshot.r32).toHaveLength(16);
    const stateStore = require("../../src/main/state-store");
    const loaded = stateStore.loadWorldcupBracket(statePath);
    expect(loaded).toBeDefined();
    expect(loaded.r32).toHaveLength(16);
  });

  test("computeWorldcupBracket returns ok:false when fetcher throws", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => { throw new Error("network down"); },
    });
    expect(r.ok).toBe(false);
    expect(r.reason || r.error).toBeDefined();
    const stateStore = require("../../src/main/state-store");
    expect(stateStore.loadWorldcupBracket(statePath)).toBeNull();
  });

  test("computeWorldcupBracket returns ok:false when fetcher returns ok:false", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => ({ ok: false, reason: "fetch_failed" }),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });

  test("loadWorldcupBracket returns null when absent", () => {
    const { loadWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = loadWorldcupBracket({ statePath });
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBeNull();
  });

  test("loadWorldcupBracket returns saved snapshot after compute", async () => {
    const { computeWorldcupBracket, loadWorldcupBracket } = require("../../src/main/worldcup/bracket");
    await computeWorldcupBracket({
      statePath,
      fetcher: stubFetcher,
      scores: stubScores,
      teamsData: stubTeamsData,
      groupStandings: FULL_GROUP_STANDINGS,
    });
    const r = loadWorldcupBracket({ statePath });
    expect(r.ok).toBe(true);
    expect(r.snapshot.r32).toHaveLength(16);
  });

  test("rankGroup returns null when no matches played in group", () => {
    const { rankGroup } = require("../../src/main/worldcup/bracket");
    const teams = ["Mexico", "South Africa", "South Korea", "USA"];
    // 没有 final matches → played 全 0 → 应该返回 null (无数据, 不污染 third 排序)
    const r = rankGroup("A", [], teams);
    expect(r).toBeNull();
  });

  test("rankGroup returns best-effort when ≥1 match played", () => {
    const { rankGroup } = require("../../src/main/worldcup/bracket");
    const teams = ["Mexico", "South Africa", "South Korea", "USA"];
    const matches = [
      {
        stage: "Group A",
        team1: "Mexico",
        team2: "South Africa",
        score: { status: "final", ft: [2, 1] },
      },
    ];
    const r = rankGroup("A", matches, teams);
    expect(r).not.toBeNull();
    expect(r.complete).toBe(false);
    expect(r.winner).toBe("Mexico");
    // runnerUp: pts=0, gd=0 队里 alphabetical 最小 → South Korea
    // third:    pts=0, gd=0 队里 alphabetical 次小 → USA
    // (South Africa pts=0 gd=-1 排第 4)
    expect(r.runnerUp).toBe("South Korea");
    expect(r.third.name).toBe("USA");
  });

  test("extractGroupStandings returns all null when no final matches", () => {
    const { extractGroupStandings } = require("../../src/main/worldcup/bracket");
    const groupsData = [
      { letter: "A", teams: ["Mexico", "South Africa", "South Korea", "USA"] },
      { letter: "B", teams: ["Canada", "Switzerland", "Qatar", "Iran"] },
    ];
    const standings = extractGroupStandings([], groupsData);
    expect(standings.A).toBeNull();
    expect(standings.B).toBeNull();
  });

  test("end-to-end: no final matches → snapshot has empty advancing and many warnings", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const groupsData = [
      { letter: "A", teams: ["Mexico", "South Africa", "South Korea", "USA"] },
      { letter: "B", teams: ["Canada", "Switzerland", "Qatar", "Iran"] },
      { letter: "C", teams: ["Brazil", "Morocco", "Scotland", "Norway"] },
      { letter: "D", teams: ["USA", "Paraguay", "Australia", "TBD"] },
      { letter: "E", teams: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"] },
      { letter: "F", teams: ["Netherlands", "Japan", "Sweden", "Tunisia"] },
      { letter: "G", teams: ["Belgium", "Egypt", "Iran", "New Zealand"] },
      { letter: "H", teams: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"] },
      { letter: "I", teams: ["France", "Senegal", "Iraq", "Norway"] },
      { letter: "J", teams: ["Argentina", "Algeria", "Austria", "Jordan"] },
      { letter: "K", teams: ["Portugal", "DR Congo", "Colombia", "Uzbekistan"] },
      { letter: "L", teams: ["England", "Croatia", "Ghana", "Panama"] },
    ];
    // fetcher 返 0 场比赛 (小组赛未开赛)
    const stubFetcherEmpty = () => ({ ok: true, data: { name: "WC 2026", groups: groupsData, matches: [] } });
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: stubFetcherEmpty,
      scores: stubScores,
      teamsData: () => groupsData,
    });
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBeDefined();
    expect(r.snapshot.thirdPlacedAdvancing).toEqual([]); // 关键: 不应再假装有 8 个晋级
    expect(r.snapshot.completeGroupCount).toBe(0);
    // 12 个 group_X_incomplete 警告
    const groupIncomplete = r.snapshot.warnings.filter((w) => w.startsWith("group_") && w.endsWith("_incomplete"));
    expect(groupIncomplete).toHaveLength(12);
  });
});