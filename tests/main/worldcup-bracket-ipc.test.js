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
  A: {
    winner: "Mexico",
    runnerUp: "South Africa",
    third: { name: "South Korea", pts: 3, gd: 0, gf: 2 },
  },
  B: {
    winner: "Canada",
    runnerUp: "Switzerland",
    third: { name: "Qatar", pts: 3, gd: 0, gf: 2 },
  },
  C: {
    winner: "Brazil",
    runnerUp: "Morocco",
    third: { name: "Scotland", pts: 3, gd: 0, gf: 2 },
  },
  D: {
    winner: "USA",
    runnerUp: "Paraguay",
    third: { name: "Australia", pts: 3, gd: 0, gf: 2 },
  },
  E: {
    winner: "Germany",
    runnerUp: "Curaçao",
    third: { name: "Ivory Coast", pts: 3, gd: 0, gf: 2 },
  },
  F: {
    winner: "Netherlands",
    runnerUp: "Japan",
    third: { name: "Sweden", pts: 3, gd: 0, gf: 2 },
  },
  G: {
    winner: "Belgium",
    runnerUp: "Egypt",
    third: { name: "Iran", pts: 3, gd: 0, gf: 2 },
  },
  H: {
    winner: "Spain",
    runnerUp: "Cape Verde",
    third: { name: "Saudi Arabia", pts: 3, gd: 0, gf: 2 },
  },
  I: {
    winner: "France",
    runnerUp: "Senegal",
    third: { name: "Iraq", pts: 3, gd: 0, gf: 2 },
  },
  J: {
    winner: "Argentina",
    runnerUp: "Algeria",
    third: { name: "Austria", pts: 3, gd: 0, gf: 2 },
  },
  K: {
    winner: "Portugal",
    runnerUp: "DR Congo",
    third: { name: "Colombia", pts: 3, gd: 0, gf: 2 },
  },
  L: {
    winner: "England",
    runnerUp: "Croatia",
    third: { name: "Ghana", pts: 3, gd: 0, gf: 2 },
  },
};

function stubFetcher() {
  return {
    ok: true,
    data: { name: "World Cup 2026", groups: [], matches: [] },
  };
}
function stubScores() {
  return {};
}
function stubTeamsData() {
  return [];
}

describe("worldcup bracket IPC handler", () => {
  let statePath;
  beforeEach(() => {
    statePath = tmpStatePath();
  });
  afterEach(() => {
    try {
      fs.rmSync(path.dirname(statePath), { recursive: true, force: true });
    } catch {}
  });

  test("computeWorldcupBracket returns ok+snapshot and writes state", async () => {
    const {
      computeWorldcupBracket,
    } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: stubFetcher,
      scores: stubScores,
      teamsData: stubTeamsData,
      groupStandings: FULL_GROUP_STANDINGS,
      knockoutEspn: false,
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
    const {
      computeWorldcupBracket,
    } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => {
        throw new Error("network down");
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reason || r.error).toBeDefined();
    const stateStore = require("../../src/main/state-store");
    expect(stateStore.loadWorldcupBracket(statePath)).toBeNull();
  });

  test("computeWorldcupBracket returns ok:false when fetcher returns ok:false", async () => {
    const {
      computeWorldcupBracket,
    } = require("../../src/main/worldcup/bracket");
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
    const {
      computeWorldcupBracket,
      loadWorldcupBracket,
    } = require("../../src/main/worldcup/bracket");
    await computeWorldcupBracket({
      statePath,
      fetcher: stubFetcher,
      scores: stubScores,
      teamsData: stubTeamsData,
      groupStandings: FULL_GROUP_STANDINGS,
      knockoutEspn: false,
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
    const {
      extractGroupStandings,
    } = require("../../src/main/worldcup/bracket");
    const groupsData = [
      { letter: "A", teams: ["Mexico", "South Africa", "South Korea", "USA"] },
      { letter: "B", teams: ["Canada", "Switzerland", "Qatar", "Iran"] },
    ];
    const standings = extractGroupStandings([], groupsData);
    expect(standings.A).toBeNull();
    expect(standings.B).toBeNull();
  });

  test("end-to-end: no final matches → snapshot has empty advancing and many warnings", async () => {
    const {
      computeWorldcupBracket,
    } = require("../../src/main/worldcup/bracket");
    const groupsData = [
      { letter: "A", teams: ["Mexico", "South Africa", "South Korea", "USA"] },
      { letter: "B", teams: ["Canada", "Switzerland", "Qatar", "Iran"] },
      { letter: "C", teams: ["Brazil", "Morocco", "Scotland", "Norway"] },
      { letter: "D", teams: ["USA", "Paraguay", "Australia", "TBD"] },
      { letter: "E", teams: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"] },
      { letter: "F", teams: ["Netherlands", "Japan", "Sweden", "Tunisia"] },
      { letter: "G", teams: ["Belgium", "Egypt", "Iran", "New Zealand"] },
      {
        letter: "H",
        teams: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
      },
      { letter: "I", teams: ["France", "Senegal", "Iraq", "Norway"] },
      { letter: "J", teams: ["Argentina", "Algeria", "Austria", "Jordan"] },
      {
        letter: "K",
        teams: ["Portugal", "DR Congo", "Colombia", "Uzbekistan"],
      },
      { letter: "L", teams: ["England", "Croatia", "Ghana", "Panama"] },
    ];
    // fetcher 返 0 场比赛 (小组赛未开赛)
    const stubFetcherEmpty = () => ({
      ok: true,
      data: { name: "WC 2026", groups: groupsData, matches: [] },
    });
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: stubFetcherEmpty,
      scores: stubScores,
      teamsData: () => groupsData,
      knockoutEspn: false,
    });
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBeDefined();
    expect(r.snapshot.thirdPlacedAdvancing).toEqual([]); // 关键: 不应再假装有 8 个晋级
    expect(r.snapshot.completeGroupCount).toBe(0);
    // 12 个 group_X_incomplete 警告
    const groupIncomplete = r.snapshot.warnings.filter(
      (w) => w.startsWith("group_") && w.endsWith("_incomplete"),
    );
    expect(groupIncomplete).toHaveLength(12);
  });
});

// ─── v1.3: cup_finals.txt merge 测试 ──────────────────────────────────────

describe("v1.3 isPlaceholderTeamName", () => {
  const { isPlaceholderTeamName } = require("../../src/main/worldcup/bracket");
  test.each([
    ["W74", true],
    ["L101", true],
    ["L101-loser", true],
    ["1A", true],
    ["2B", true],
    ["3A/B/C/D/F", true],
    ["3C/D/F/G/H", true],
    ["South Africa", false],
    ["Germany", false],
    ["Mexico", false],
  ])("isPlaceholderTeamName(%j) = %j", (name, expected) => {
    expect(isPlaceholderTeamName(name)).toBe(expected);
  });
});

// ponytail: 历史 bug — 某些 slot.team.name 被污染成
// "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay" 这种. 下次 refresh 应当用 TXT 真名覆盖.
describe("v2.66 isPollutedTeamName", () => {
  const { isPollutedTeamName } = require("../../src/main/worldcup/bracket");
  test.each([
    ["a.e.t. (1-1, 0-1), 3-4 pen. Paraguay", true],
    ["a.e.t. (2-2, 0-1) Senegal", true],
    ["pen. 3-4 Brazil", true],
    ["Germany", false],
    ["South Africa", false],
    [null, false],
    [undefined, false],
  ])("isPollutedTeamName(%j) = %j", (name, expected) => {
    expect(isPollutedTeamName(name)).toBe(expected);
  });
});

describe("v2.66 attachFinals overwrites polluted team name with TXT real name", () => {
  const {
    mergeFinalsIntoSnapshot,
  } = require("../../src/main/worldcup/bracket");
  test("M74 slot2 polluted 'a.e.t. (...) Paraguay' gets restored to 'Paraguay'", () => {
    const snapshot = {
      r32: [
        {
          matchNum: 74,
          slot1: {
            team: { name: "Germany" },
            source: "group:E:winner",
            sourceTxt: true,
          },
          slot2: {
            team: { name: "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay" },
            source: "group:D:third",
          },
          status: "final",
        },
      ],
    };
    const finalsMatches = [
      {
        matchNum: 74,
        team1: "Germany",
        team2: "Paraguay",
        date: "2026-06-29",
        time: "16:30",
        timezone: "UTC-4",
        venue: "Boston (Foxborough)",
        score: { ft: [1, 1], status: "final" },
      },
    ];
    mergeFinalsIntoSnapshot(snapshot, finalsMatches);
    expect(snapshot.r32[0].slot2.team.name).toBe("Paraguay");
    expect(snapshot.r32[0].slot2.sourceTxt).toBe(true);
  });

  test("non-polluted existing team name is NOT overwritten (preserve user-corrected names)", () => {
    // ponytail: 已经 sourceTxt=true 的真名不应该被每次 refresh 反复覆盖,
    // 否则 attachFinals 反复写 sourceTxt=true 自身也没差, 但要避免污染到
    // 已被人工修过的 case.
    const snapshot = {
      r32: [
        {
          matchNum: 74,
          slot1: {
            team: { name: "Germany" },
            source: "group:E:winner",
            sourceTxt: true,
          },
          slot2: {
            team: { name: "Custom Edit Paraguay" },
            source: "group:D:third",
            sourceTxt: true,
          },
          status: "final",
        },
      ],
    };
    const finalsMatches = [
      {
        matchNum: 74,
        team1: "Germany",
        team2: "Paraguay",
        date: "2026-06-29",
        score: { ft: [1, 1], status: "final" },
      },
    ];
    mergeFinalsIntoSnapshot(snapshot, finalsMatches);
    // sourceTxt 已经是 true → 不覆盖 → 保留 "Custom Edit Paraguay"
    expect(snapshot.r32[0].slot2.team.name).toBe("Custom Edit Paraguay");
  });
});

describe("v1.3 mergeFinalsIntoSnapshot", () => {
  const {
    mergeFinalsIntoSnapshot,
  } = require("../../src/main/worldcup/bracket");

  function buildSnapshot() {
    return {
      version: 2,
      r32: [
        {
          matchNum: 73,
          slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
          slot2: { team: { name: "Switzerland" }, source: "group:B:runnerUp" },
          status: "pending",
        },
        {
          matchNum: 74,
          slot1: { team: { name: "Germany" }, source: "group:E:winner" },
          slot2: { team: { name: "Mexico" }, source: "group:?:third" },
          status: "pending",
        },
      ],
      r16: [
        {
          matchNum: 90,
          slot1: { team: null, source: "r32:73" },
          slot2: { team: null, source: "r32:75" },
          status: "projected",
        },
      ],
      qf: [],
      sf: [],
      final: {
        matchNum: 104,
        slot1: { team: null, source: "sf:101" },
        slot2: { team: null, source: "sf:102" },
        status: "projected",
      },
      third: {
        matchNum: 103,
        slot1: { team: null, source: "sf:101-loser" },
        slot2: { team: null, source: "sf:102-loser" },
        status: "projected",
      },
      warnings: [],
    };
  }

  test("attaches kickoff + date/time/venue from finals TXT", () => {
    const snap = buildSnapshot();
    const finalsMatches = [
      {
        matchNum: 73,
        date: "2026-06-28",
        time: "12:00",
        timezone: "UTC-7",
        venue: "Los Angeles (Inglewood)",
        team1: "South Africa",
        team2: "Canada",
        score: null,
      },
    ];
    mergeFinalsIntoSnapshot(snap, finalsMatches);
    expect(snap.r32[0].kickoff).toEqual({
      date: "2026-06-28",
      time: "12:00",
      timezone: "UTC-7",
      venue: "Los Angeles (Inglewood)",
    });
  });

  test("overwrites slot.team.name when TXT has real team", () => {
    const snap = buildSnapshot();
    // M74 原 slot2 是 Mexico (来自 best-third 池), TXT 给了 Morocco (确认 2C = Morocco)
    const finalsMatches = [
      {
        matchNum: 74,
        date: "2026-06-29",
        time: "16:30",
        timezone: "UTC-4",
        venue: "Boston (Foxborough)",
        team1: "Germany",
        team2: "Morocco",
        score: null,
      },
    ];
    mergeFinalsIntoSnapshot(snap, finalsMatches);
    expect(snap.r32[1].slot2.team.name).toBe("Morocco");
    expect(snap.r32[1].slot2.sourceTxt).toBe(true);
  });

  test("keeps slot.team.name when TXT team is placeholder (e.g. W74)", () => {
    const snap = buildSnapshot();
    const finalsMatches = [
      {
        matchNum: 90,
        date: "2026-07-05",
        time: "12:00",
        timezone: "UTC-5",
        venue: "Houston",
        team1: "W73",
        team2: "W75",
        score: null,
      },
    ];
    mergeFinalsIntoSnapshot(snap, finalsMatches);
    expect(snap.r16[0].slot1.team).toBeNull();
    expect(snap.r16[0].slot2.team).toBeNull();
    expect(snap.r16[0].kickoff.venue).toBe("Houston");
  });

  test("marks status=final when TXT has played score", () => {
    const snap = buildSnapshot();
    const finalsMatches = [
      {
        matchNum: 73,
        date: "2026-06-28",
        time: "12:00",
        timezone: "UTC-7",
        venue: "Los Angeles (Inglewood)",
        team1: "South Africa",
        team2: "Canada",
        score: { ft: [2, 1], status: "final" },
      },
    ];
    mergeFinalsIntoSnapshot(snap, finalsMatches);
    expect(snap.r32[0].status).toBe("final");
    expect(snap.r32[0].score).toEqual({ ft: [2, 1], status: "final" });
  });

  test("does not crash on missing matchNum in snapshot", () => {
    const snap = {
      r32: [{ matchNum: 999, slot1: { team: null }, slot2: { team: null } }],
    };
    const finalsMatches = [
      { matchNum: 73, date: "2026-06-28", team1: "A", team2: "B" },
    ];
    expect(() => mergeFinalsIntoSnapshot(snap, finalsMatches)).not.toThrow();
  });

  test("ignores finals matches with no matchNum", () => {
    const snap = buildSnapshot();
    const finalsMatches = [{ team1: "X", team2: "Y" }];
    expect(() => mergeFinalsIntoSnapshot(snap, finalsMatches)).not.toThrow();
  });
});

describe("v1.3 computeWorldcupBracket end-to-end with finals", () => {
  const FULL_GROUP_STANDINGS = {
    A: {
      winner: "Mexico",
      runnerUp: "South Africa",
      third: { name: "South Korea", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    B: {
      winner: "Canada",
      runnerUp: "Switzerland",
      third: { name: "Qatar", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    C: {
      winner: "Brazil",
      runnerUp: "Morocco",
      third: { name: "Scotland", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    D: {
      winner: "USA",
      runnerUp: "Paraguay",
      third: { name: "Australia", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    E: {
      winner: "Germany",
      runnerUp: "Curaçao",
      third: { name: "Ivory Coast", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    F: {
      winner: "Netherlands",
      runnerUp: "Japan",
      third: { name: "Sweden", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    G: {
      winner: "Belgium",
      runnerUp: "Egypt",
      third: { name: "Iran", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    H: {
      winner: "Spain",
      runnerUp: "Cape Verde",
      third: { name: "Saudi Arabia", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    I: {
      winner: "France",
      runnerUp: "Senegal",
      third: { name: "Iraq", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    J: {
      winner: "Argentina",
      runnerUp: "Algeria",
      third: { name: "Austria", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    K: {
      winner: "Portugal",
      runnerUp: "DR Congo",
      third: { name: "Colombia", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
    L: {
      winner: "England",
      runnerUp: "Croatia",
      third: { name: "Ghana", pts: 3, gd: 0, gf: 2 },
      complete: true,
    },
  };

  function tmpStatePath2() {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-finals-"));
    return path.join(dir, "state.json");
  }

  let statePath;
  beforeEach(() => {
    statePath = tmpStatePath2();
  });
  afterEach(() => {
    const fs = require("fs");
    try {
      fs.rmSync(require("path").dirname(statePath), {
        recursive: true,
        force: true,
      });
    } catch {}
  });

  test("merges kickoff + venue from injected finalsMatches", async () => {
    const {
      computeWorldcupBracket,
    } = require("../../src/main/worldcup/bracket");
    const finalsMatches = [
      {
        matchNum: 73,
        date: "2026-06-28",
        time: "12:00",
        timezone: "UTC-7",
        venue: "Los Angeles (Inglewood)",
        team1: "South Africa",
        team2: "Canada",
      },
      {
        matchNum: 74,
        date: "2026-06-29",
        time: "16:30",
        timezone: "UTC-4",
        venue: "Boston (Foxborough)",
        team1: "Germany",
        team2: "Morocco",
      },
    ];
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => ({
        ok: true,
        data: { name: "WC", groups: [], matches: [] },
      }),
      finalsMatches,
      scores: () => ({}),
      groupStandings: FULL_GROUP_STANDINGS,
      knockoutEspn: false,
    });
    expect(r.ok).toBe(true);
    const m73 = r.snapshot.r32.find((m) => m.matchNum === 73);
    expect(m73.kickoff.venue).toBe("Los Angeles (Inglewood)");
    expect(m73.slot2.team.name).toBe("Canada"); // 覆盖了 slot.spec 给的 Switzerland
    const m74 = r.snapshot.r32.find((m) => m.matchNum === 74);
    expect(m74.kickoff.time).toBe("16:30");
    expect(m74.slot2.team.name).toBe("Morocco");
  });

  test("does not block bracket compute when finals fetcher fails", async () => {
    const {
      computeWorldcupBracket,
    } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => ({
        ok: true,
        data: { name: "WC", groups: [], matches: [] },
      }),
      finalsFetcher: () => ({ ok: false, reason: "network_down" }),
      scores: () => ({}),
      groupStandings: FULL_GROUP_STANDINGS,
      knockoutEspn: false,
    });
    expect(r.ok).toBe(true);
    expect(r.snapshot.warnings).toContain("finals_fetch_network_down");
  });

  test("no finals fetch when finalsMatches injected (bypass)", async () => {
    const {
      computeWorldcupBracket,
    } = require("../../src/main/worldcup/bracket");
    let finalsFetcherCalled = false;
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => ({
        ok: true,
        data: { name: "WC", groups: [], matches: [] },
      }),
      finalsMatches: [],
      finalsFetcher: () => {
        finalsFetcherCalled = true;
        return { ok: true, txt: "" };
      },
      scores: () => ({}),
      groupStandings: FULL_GROUP_STANDINGS,
      knockoutEspn: false,
    });
    expect(r.ok).toBe(true);
    expect(finalsFetcherCalled).toBe(false);
  });

  // 真实 cup_finals.txt 内容 (2026-06-28 快照) - 验证 parser + merge 在真实数据上无回归
  test("real cup_finals.txt (2026-06-28 snapshot) parses + merges correctly", async () => {
    const { parseWorldcupTxt } = require("../../src/main/worldcup/parser");
    const {
      computeWorldcupBracket,
    } = require("../../src/main/worldcup/bracket");
    const REAL_FINALS_TXT = `= World Cup 2026 # in Canada, USA, and Mexico

▪ Round of 32
Sun Jun 28
  (73) 12:00 UTC-7 South Africa v Canada @ Los Angeles (Inglewood) ## 2A / 2B
Mon Jun 29
  (74) 16:30 UTC-4 Germany v 3A/B/C/D/F @ Boston (Foxborough) ## 1E
  (75) 19:00 UTC-6 Netherlands v Morocco @ Monterrey (Guadalupe) ## 1F / 2C
  (76) 12:00 UTC-5 Brazil v Japan @ Houston ## 1C / 2F
Tue Jun 30
  (77) 17:00 UTC-4 1I v 3C/D/F/G/H @ New York/New Jersey (East Rutherford)
  (78) 12:00 UTC-5 Ivory Coast v 2I @ Dallas (Arlington) ## 2E
  (79) 19:00 UTC-6 Mexico v 3C/E/F/H/I @ Mexico City ## 1A

▪ Round of 16
Sat Jul 4
  (89) 17:00 UTC-4 W74 v W77 @ Philadelphia

▪ Final
Sun Jul 19
  (104) 15:00 UTC-4 W101 v W102 @ New York/New Jersey (East Rutherford)
`;
    const finalsData = parseWorldcupTxt(REAL_FINALS_TXT);
    expect(finalsData.matches.length).toBeGreaterThan(0);
    // 所有 match 应有 matchNum
    expect(
      finalsData.matches.every((m) => typeof m.matchNum === "number"),
    ).toBe(true);

    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => ({
        ok: true,
        data: { name: "WC", groups: [], matches: [] },
      }),
      finalsMatches: finalsData.matches,
      scores: () => ({}),
      groupStandings: FULL_GROUP_STANDINGS,
      // ponytail: 测试不要走真 wc-2026.com HTTP (云外 IP 不可达, 会卡 8s+ timeout)
      wc2026: false,
      // 也不要硬编码 pen 注入 (测试期望 fixture 是干净的)
      hardcodedPen: false,
      // 也别真拉 ESPN (会卡 12s+)
      knockoutEspn: false,
    });
    expect(r.ok).toBe(true);
    const m73 = r.snapshot.r32.find((m) => m.matchNum === 73);
    expect(m73.kickoff).toEqual({
      date: "2026-06-28",
      time: "12:00",
      timezone: "UTC-7",
      venue: "Los Angeles (Inglewood)",
    });
    expect(m73.slot1.team.name).toBe("South Africa");
    expect(m73.slot2.team.name).toBe("Canada"); // TXT 真名覆盖了 slot.spec 的 runnerUp=B
    const m74 = r.snapshot.r32.find((m) => m.matchNum === 74);
    expect(m74.slot1.team.name).toBe("Germany"); // 1E=Germany 已被 TXT 确认
    // slot2 是 best-third, TXT 留 placeholder "3A/B/C/D/F" → 保留 slot.spec 给的真实名
    expect(m74.slot2.team.name).not.toBe("3A/B/C/D/F");
    const m75 = r.snapshot.r32.find((m) => m.matchNum === 75);
    expect(m75.slot1.team.name).toBe("Netherlands"); // 1F 已确认
    expect(m75.slot2.team.name).toBe("Morocco"); // 2C 已确认
  });
});
