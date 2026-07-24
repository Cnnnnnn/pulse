/**
 * tests/main/worldcup-bracket-live-scores.test.js
 *
 * Unit tests for mergeLiveScoresIntoSnapshot (src/main/worldcup/bracket.js).
 *
 * 验证 v2.51 实时比分注入逻辑:
 *   - matchKey 直查匹配 (date|time|team1|team2)
 *   - pairKey + 日期模糊匹配 (队名顺序无关)
 *   - placeholder 队名跳过 (队伍未确定)
 *   - 无匹配 entry 跳过 (不破坏现有显示)
 *   - 实时比分覆盖静态 (含 scorers 透传)
 *   - live 状态正确标记
 */

import { describe, test, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const { mergeLiveScoresIntoSnapshot } = requireMain("worldcup/bracket");

// 最小可用 snapshot: 一个 r16 match (matchNum=97) + final (matchNum=101)
function makeSnapshot() {
  return {
    version: 1,
    computedAt: Date.now(),
    r32: [],
    r16: [
      {
        matchNum: 97,
        slot1: { team: { name: "Mexico" }, source: "1A" },
        slot2: { team: { name: "Brazil" }, source: "1C" },
        score: null,
        status: "projected",
        kickoff: null,
      },
    ],
    qf: [],
    sf: [],
    final: {
      matchNum: 101,
      slot1: { team: { name: "W97" }, source: "W97" },
      slot2: { team: { name: "W98" }, source: "W98" },
      score: null,
      status: "projected",
      kickoff: null,
    },
    third: null,
  };
}

// 已确定队名的淘汰赛 fixture (cup_finals.txt 解析产物)
function makeFinalsMatches() {
  return [
    {
      matchNum: 97,
      team1: "Mexico",
      team2: "Brazil",
      date: "2026-06-28",
      time: "16:00",
      timezone: "UTC-4",
      score: null, // 静态 txt 还没比分
    },
    {
      matchNum: 101,
      team1: "W97", // placeholder — 决赛队伍未确定
      team2: "W98",
      date: "2026-07-13",
      time: "15:00",
      timezone: "UTC-4",
      score: null,
    },
  ];
}

describe("mergeLiveScoresIntoSnapshot", () => {
  test("matchKey 直查: 实时比分注入到对应 match", () => {
    const snap = makeSnapshot();
    const finals = makeFinalsMatches();
    const scores = {
      "2026-06-28|16:00|Mexico|Brazil": {
        ft: [2, 1],
        status: "final",
        source: "espn",
        updatedAt: 123,
      },
    };
    mergeLiveScoresIntoSnapshot(snap, finals, scores);
    expect(snap.r16[0].score.ft).toEqual([2, 1]);
    expect(snap.r16[0].status).toBe("final");
    expect(snap.r16[0].score.source).toBe("espn");
  });

  test("pairKey 模糊匹配: ESPN 队名顺序相反也能匹配, ft 自动重排对齐 slot1/slot2", () => {
    const snap = makeSnapshot();
    const finals = makeFinalsMatches();
    // scores 里队名顺序跟 finals 相反 (Brazil|Mexico vs Mexico|Brazil), 且 time 不同
    // finals: Mexico(slot1) vs Brazil(slot2), entry: Brazil=1, Mexico=3
    // 模糊匹配命中后需交换 ft → Mexico=3, Brazil=1 (对齐 slot1/slot2)
    const scores = {
      "2026-06-28|18:00|Brazil|Mexico": {
        ft: [1, 3],
        status: "live",
        source: "espn",
      },
    };
    mergeLiveScoresIntoSnapshot(snap, finals, scores);
    // ft 重排后: slot1(Mexico)=3, slot2(Brazil)=1
    expect(snap.r16[0].score.ft).toEqual([3, 1]);
    expect(snap.r16[0].status).toBe("live");
  });

  test("placeholder 队名跳过: 决赛队伍未确定不注入", () => {
    const snap = makeSnapshot();
    const finals = makeFinalsMatches();
    const scores = {
      "2026-07-13|15:00|W97|W98": { ft: [1, 0], status: "final" },
    };
    mergeLiveScoresIntoSnapshot(snap, finals, scores);
    // final 的 fixture 队名是 placeholder, 不注入
    expect(snap.final.score).toBeNull();
  });

  test("无匹配 entry 时跳过: 不破坏现有显示", () => {
    const snap = makeSnapshot();
    snap.r16[0].score = { ft: [0, 0], status: "projected" };
    const finals = makeFinalsMatches();
    const scores = {
      "2026-06-30|12:00|USA|Canada": { ft: [1, 1], status: "final" },
    };
    mergeLiveScoresIntoSnapshot(snap, finals, scores);
    // 没匹配上, 保持原样
    expect(snap.r16[0].score.ft).toEqual([0, 0]);
  });

  test("实时覆盖静态: cup_finals.txt 有旧比分时被实时覆盖", () => {
    const snap = makeSnapshot();
    snap.r16[0].score = { ft: [1, 1], status: "final", source: "openfootball" };
    snap.r16[0].status = "final";
    const finals = makeFinalsMatches();
    const scores = {
      "2026-06-28|16:00|Mexico|Brazil": {
        ft: [3, 2],
        status: "final",
        source: "espn",
        updatedAt: 999,
      },
    };
    mergeLiveScoresIntoSnapshot(snap, finals, scores);
    expect(snap.r16[0].score.ft).toEqual([3, 2]);
    expect(snap.r16[0].score.source).toBe("espn");
  });

  test("scorers 透传: 进球者随比分注入 (进球榜聚合用)", () => {
    const snap = makeSnapshot();
    const finals = makeFinalsMatches();
    const scorers = [
      { minute: 23, player: "Neymar", teamSide: "team2", type: "goal" },
      { minute: 67, player: "Hernandez", teamSide: "team1", type: "goal" },
    ];
    const scores = {
      "2026-06-28|16:00|Mexico|Brazil": {
        ft: [1, 1],
        status: "final",
        source: "espn",
        scorers,
      },
    };
    mergeLiveScoresIntoSnapshot(snap, finals, scores);
    expect(snap.r16[0].score.scorers).toEqual(scorers);
  });

  test("模糊匹配 + scorers teamSide 翻转: 队名顺序相反时 scorers 跟着翻转", () => {
    const snap = makeSnapshot();
    const finals = makeFinalsMatches();
    // entry 队名顺序相反, scorers.teamSide 基于 entry 的视角 (Brazil=team1)
    const scores = {
      "2026-06-28|18:00|Brazil|Mexico": {
        ft: [2, 0],
        status: "final",
        source: "espn",
        scorers: [
          { minute: 10, player: "Neymar", teamSide: "team1", type: "goal" },
          { minute: 30, player: "Vinicius", teamSide: "team1", type: "goal" },
        ],
      },
    };
    mergeLiveScoresIntoSnapshot(snap, finals, scores);
    // ft 重排: Mexico(slot1)=0, Brazil(slot2)=2
    expect(snap.r16[0].score.ft).toEqual([0, 2]);
    // scorers.teamSide 翻转: Brazil 从 team1 → team2 (对齐 slot2)
    expect(snap.r16[0].score.scorers[0].teamSide).toBe("team2");
    expect(snap.r16[0].score.scorers[1].teamSide).toBe("team2");
  });

  test("live 状态正确标记", () => {
    const snap = makeSnapshot();
    const finals = makeFinalsMatches();
    const scores = {
      "2026-06-28|16:00|Mexico|Brazil": {
        ft: [0, 0],
        status: "live",
        source: "espn",
        clock: "23'",
      },
    };
    mergeLiveScoresIntoSnapshot(snap, finals, scores);
    expect(snap.r16[0].status).toBe("live");
  });

  test("entry 无 ft 时跳过 (比赛未开始)", () => {
    const snap = makeSnapshot();
    const finals = makeFinalsMatches();
    const scores = {
      "2026-06-28|16:00|Mexico|Brazil": { status: "pre", source: "espn" },
    };
    mergeLiveScoresIntoSnapshot(snap, finals, scores);
    expect(snap.r16[0].score).toBeNull();
  });

  test("空输入防御: null/空数组不抛错", () => {
    expect(() => mergeLiveScoresIntoSnapshot(null, [], {})).not.toThrow();
    expect(() => mergeLiveScoresIntoSnapshot(makeSnapshot(), null, {})).not.toThrow();
    expect(() => mergeLiveScoresIntoSnapshot(makeSnapshot(), [], null)).not.toThrow();
  });
});
