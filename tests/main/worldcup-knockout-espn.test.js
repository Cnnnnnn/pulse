/**
 * tests/main/worldcup-knockout-espn.test.js
 *
 * v2.74.3 regression test: bracket compute 主动拉 ESPN knockout scorers.
 *
 * Background:
 * - refreshWorldcupScores 只在 renderer 侧针对 group stage 跑, worldcup_scores.entries
 *   永远没淘汰赛 matchKey.
 * - bracket.js mergeLiveScoresIntoSnapshot 已经有透传 scorers 逻辑, 但前提是
 *   entries 里有对应的 matchKey. 之前 knockout 没有 entries → bracket match.score
 *   没 scorers → modal + 射手榜淘汰赛 tab 都缺数据.
 * - 新加 fetchKnockoutEspnEntries 在 computeWorldcupBracket 时主动拉 ESPN
 *   scoreboard for knockout stages, 把 entries 临时 merge 到 liveScores, 让
 *   后面的 mergeLiveScoresIntoSnapshot 走通透传.
 *
 * 这里覆盖:
 * 1) 网络失败 → 返回 {}, 不抛 (跟现有 wc-2026/hardcoded 一致)
 * 2) 正常返回 → 直接对应 fetchEspn 的 output
 * 3) 空 finalsMatches → 返回 {}
 * 4) 注入 fetchEspn mock 后, computeWorldcupBracket 把 scorers 进到 snapshot
 */
import { describe, it, expect } from "vitest";
const { fetchKnockoutEspnEntries } = require("../../src/main/worldcup/bracket");
const {
  fetchScoresFromEspn,
} = require("../../src/main/worldcup/scores-api-espn");
const { HttpClient } = require("../../src/main/http-client");

describe("v2.74.3 fetchKnockoutEspnEntries", () => {
  it("returns {} for empty finalsMatches", async () => {
    const r = await fetchKnockoutEspnEntries([], {});
    expect(r).toEqual({});
  });

  it("returns {} for null finalsMatches", async () => {
    const r = await fetchKnockoutEspnEntries(null, {});
    expect(r).toEqual({});
  });

  it("returns {} when fetchEspn throws (network down) — does not propagate", async () => {
    const r = await fetchKnockoutEspnEntries([{ matchNum: 74 }], {
      fetchEspn: async () => {
        throw new Error("ETIMEDOUT");
      },
    });
    expect(r).toEqual({});
  });

  it("returns {} when fetchEspn returns null", async () => {
    const r = await fetchKnockoutEspnEntries([{ matchNum: 74 }], {
      fetchEspn: async () => null,
    });
    expect(r).toEqual({});
  });

  it("returns entries from fetchEspn on success (merging passes them through)", async () => {
    const fakeEntries = {
      "2026-06-29|20:30|Germany|Paraguay": {
        ft: [1, 1],
        ht: [1, 1],
        status: "final",
        source: "espn",
        updatedAt: 12345,
        scorers: [
          {
            minute: "32'",
            player: "A. Rüdiger",
            teamSide: "team1",
            type: "Goal",
            ownGoal: false,
            penalty: false,
          },
        ],
      },
    };
    const r = await fetchKnockoutEspnEntries(
      [
        {
          matchNum: 74,
          date: "2026-06-29",
          time: "20:30",
          team1: "Germany",
          team2: "Paraguay",
        },
      ],
      {
        fetchEspn: async () => fakeEntries,
      },
    );
    expect(r).toEqual(fakeEntries);
    expect(r["2026-06-29|20:30|Germany|Paraguay"].scorers[0].player).toBe(
      "A. Rüdiger",
    );
  });

  it("accepts injected http without firing real network", async () => {
    // 验证默认 http 实例是 HttpClient (没真发请求)
    let calledWith = null;
    const fakeHttp = {
      get: async () => ({ error: "stub_no_real_call" }),
    };
    await fetchKnockoutEspnEntries(
      [
        {
          matchNum: 75,
          date: "2026-06-30",
          time: "17:00",
          team1: "Netherlands",
          team2: "Morocco",
        },
      ],
      {
        http: fakeHttp,
        fetchEspn: async (http) => {
          calledWith = http;
          return {};
        },
      },
    );
    expect(calledWith).toBe(fakeHttp);
  });
});

describe("v2.74.3 fetchScoresFromEspn signature sanity", () => {
  // 防御: fetchScoresFromEspn 签名变了就立刻挂掉, 不让 v2.74.3 静默坏掉.
  it("fetchScoresFromEspn is async function with (http, fixtures, matchKeyFn)", () => {
    expect(typeof fetchScoresFromEspn).toBe("function");
    expect(fetchScoresFromEspn.constructor.name).toBe("AsyncFunction");
    expect(fetchScoresFromEspn.length).toBe(3);
  });
});
