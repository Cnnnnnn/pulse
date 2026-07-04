/**
 * tests/main/worldcup-scores-espn.test.js
 */

import { describe, it, expect } from "vitest";
import {
  scoreEntryFromEspnEvent,
  scorersFromEspnEvent,
  mapEspnEventsToScoreEntries,
  eventMatchesFixture,
  deriveEtPenFromScorers,
} from "../../src/main/worldcup/scores-api-espn.js";
import { matchKey } from "../../src/main/worldcup/match-key.js";

const KOR_CZE_FIXTURE = {
  date: "2026-06-11",
  time: "20:00",
  timezone: "UTC-6",
  team1: "South Korea",
  team2: "Czech Republic",
  venue: "Guadalajara (Zapopan)",
};

const KOR_CZE_EVENT = {
  date: "2026-06-12T02:00Z",
  status: { type: { state: "in" }, displayClock: "61'" },
  competitions: [
    {
      competitors: [
        {
          homeAway: "home",
          score: "1",
          team: { id: "451", displayName: "South Korea" },
        },
        {
          homeAway: "away",
          score: "1",
          team: { id: "450", displayName: "Czechia" },
        },
      ],
      details: [
        {
          scoringPlay: true,
          team: { id: "450" },
          clock: { displayValue: "59'" },
          type: { text: "Goal - Header" },
          athletesInvolved: [{ displayName: "Ladislav Krejcí" }],
        },
        {
          scoringPlay: true,
          team: { id: "451" },
          clock: { displayValue: "67'" },
          type: { text: "Goal" },
          athletesInvolved: [{ displayName: "Hwang In-Beom" }],
        },
      ],
    },
  ],
};

describe("scores-api-espn", () => {
  it("进行中比赛解析为 live + 比分", () => {
    const entry = scoreEntryFromEspnEvent(KOR_CZE_EVENT);
    expect(entry.status).toBe("live");
    expect(entry.ft).toEqual([1, 1]);
    expect(entry.clock).toBe("61'");
  });

  it("韩国 vs 捷克 可匹配赛程 + 进球者", () => {
    expect(eventMatchesFixture(KOR_CZE_EVENT, KOR_CZE_FIXTURE)).toBe(true);
    const scorers = scorersFromEspnEvent(KOR_CZE_EVENT, KOR_CZE_FIXTURE);
    expect(scorers).toHaveLength(2);
    expect(scorers[0].player).toBe("Ladislav Krejcí");
    expect(scorers[0].teamSide).toBe("team2");
    expect(scorers[1].player).toBe("Hwang In-Beom");
    expect(scorers[1].teamSide).toBe("team1");

    const mapped = mapEspnEventsToScoreEntries(
      [KOR_CZE_EVENT],
      [KOR_CZE_FIXTURE],
      matchKey,
    );
    const key = matchKey(KOR_CZE_FIXTURE);
    expect(mapped[key].ft).toEqual([1, 1]);
    expect(mapped[key].status).toBe("live");
    expect(mapped[key].scorers).toHaveLength(2);
  });

  it("未开赛 pre 不产出比分", () => {
    const pre = {
      ...KOR_CZE_EVENT,
      status: { type: { state: "pre" } },
    };
    expect(scoreEntryFromEspnEvent(pre)).toBeNull();
  });

  describe("deriveEtPenFromScorers", () => {
    it("无加时/点球 (90 分决出) → et/pen 都是 null", () => {
      const r = deriveEtPenFromScorers([
        {
          minute: "13'",
          player: "A",
          teamSide: "team2",
          ownGoal: false,
          penalty: false,
        },
        {
          minute: "55'",
          player: "B",
          teamSide: "team1",
          ownGoal: false,
          penalty: false,
        },
        {
          minute: "75'",
          player: "C",
          teamSide: "team1",
          ownGoal: false,
          penalty: false,
        },
      ]);
      expect(r).toEqual({ et: null, pen: null });
    });

    it("点球大战进门但加时 0-0 (M88 风格: 90 分 1-1, ET 0-0, shootout 2-4)", () => {
      const r = deriveEtPenFromScorers([
        {
          minute: "13'",
          player: "Ashour",
          teamSide: "team2",
          ownGoal: false,
          penalty: false,
        },
        {
          minute: "55'",
          player: "Hany",
          teamSide: "team1",
          ownGoal: true,
          penalty: false,
        },
        // shootout 进球 (纯 "120'" 不带 +X)
        {
          minute: "120'",
          player: "Mabil",
          teamSide: "team1",
          ownGoal: false,
          penalty: true,
        },
        {
          minute: "120'",
          player: "Saber",
          teamSide: "team2",
          ownGoal: false,
          penalty: true,
        },
        {
          minute: "120'",
          player: "Salah",
          teamSide: "team2",
          ownGoal: false,
          penalty: true,
        },
        {
          minute: "120'",
          player: "Irvine",
          teamSide: "team1",
          ownGoal: false,
          penalty: true,
        },
        {
          minute: "120'",
          player: "R. Rabia",
          teamSide: "team2",
          ownGoal: false,
          penalty: true,
        },
        {
          minute: "120'",
          player: "Abdelmaguid",
          teamSide: "team2",
          ownGoal: false,
          penalty: true,
        },
      ]);
      expect(r.et).toBeNull();
      expect(r.pen).toEqual([2, 4]);
    });

    it("加时末刻进球 (M82 风格: ET 1-0, 无 shootout)", () => {
      const r = deriveEtPenFromScorers([
        {
          minute: "25'",
          player: "Diarra",
          teamSide: "team2",
          ownGoal: false,
          penalty: false,
        },
        {
          minute: "51'",
          player: "Sarr",
          teamSide: "team2",
          ownGoal: false,
          penalty: false,
        },
        {
          minute: "86'",
          player: "Lukaku",
          teamSide: "team1",
          ownGoal: false,
          penalty: false,
        },
        {
          minute: "89'",
          player: "Tielemans",
          teamSide: "team1",
          ownGoal: false,
          penalty: false,
        },
        {
          minute: "120'+5'",
          player: "Tielemans",
          teamSide: "team1",
          ownGoal: false,
          penalty: true,
        },
      ]);
      expect(r.et).toEqual([1, 0]);
      expect(r.pen).toBeNull();
    });

    it("OG 在 ET 段不计 et (跟射手榜一样, OG 永远是巧合方进球)", () => {
      // 即使 OG 偶尔在 91'-120' 段, 不应为加分 (跟射手榜 isShootoutGoal 同源),
      // 这里 satisfy 本函数 for OG 过滤本本身就 skip: 不计入 et。
      const r = deriveEtPenFromScorers([
        {
          minute: "120'+2'",
          player: "X",
          teamSide: "team1",
          ownGoal: true,
          penalty: false,
        },
      ]);
      expect(r).toEqual({ et: null, pen: null });
    });

    it("己输入是空的数组 → 返回 null 对", () => {
      expect(deriveEtPenFromScorers([])).toEqual({ et: null, pen: null });
      expect(deriveEtPenFromScorers(null)).toEqual({ et: null, pen: null });
    });

    it("ผ่าน orient 后 teamSide 随 scorers 一起丢弃原样供推算", () => {
      // 验证不依赖补时 '+1'、'+5' 等点都识别: 多种加时段 minute 都算 et
      const r = deriveEtPenFromScorers([
        {
          minute: "91'",
          player: "X",
          teamSide: "team1",
          ownGoal: false,
          penalty: false,
        },
        {
          minute: "105'+1'",
          player: "X",
          teamSide: "team2",
          ownGoal: false,
          penalty: false,
        },
        {
          minute: "119'",
          player: "X",
          teamSide: "team1",
          ownGoal: false,
          penalty: false,
        },
      ]);
      expect(r.et).toEqual([2, 1]);
      expect(r.pen).toBeNull();
    });
  });

  it("orientEspnScore 自动为 shootout 比赛填充 pen 字段", () => {
    // 复现 M88 实际 ESPN event
    const fixture = {
      date: "2026-07-03",
      time: "18:00",
      timezone: "UTC-4",
      team1: "Australia",
      team2: "Egypt",
      venue: "Dallas (Arlington)",
    };
    const event = {
      date: "2026-07-03T22:00Z",
      status: { type: { state: "post" } },
      competitions: [
        {
          competitors: [
            {
              homeAway: "home",
              score: "1",
              team: { id: "AUS", displayName: "Australia" },
            },
            {
              homeAway: "away",
              score: "1",
              team: { id: "EGY", displayName: "Egypt" },
            },
          ],
          details: [
            // 13' 埃及先进球
            {
              scoringPlay: true,
              team: { id: "EGY" },
              clock: { displayValue: "13'" },
              type: { text: "Goal - Header" },
              athletesInvolved: [{ displayName: "Emam Ashour" }],
            },
            // 55' 澳洲 (OG Hany)
            {
              scoringPlay: true,
              team: { id: "AUS" },
              clock: { displayValue: "55'" },
              type: { text: "Own Goal" },
              ownGoal: true,
              athletesInvolved: [{ displayName: "Mohamed Hany" }],
            },
            // shootout (6 个 Penalty - Scored, minute 都是 "120'")
            ...Array.from({ length: 6 }, (_, i) => ({
              scoringPlay: true,
              team: { id: i % 2 === 0 ? "AUS" : "EGY" },
              clock: { displayValue: "120'" },
              type: { text: "Penalty - Scored" },
              penaltyKick: true,
              athletesInvolved: [{ displayName: `P${i}` }],
            })),
          ],
        },
      ],
    };
    const mapped = mapEspnEventsToScoreEntries([event], [fixture], matchKey);
    const key = matchKey(fixture);
    expect(mapped[key].ft).toEqual([1, 1]);
    expect(mapped[key].pen).toBeDefined();
    expect(mapped[key].pen[0] + mapped[key].pen[1]).toBe(6);
    expect(mapped[key].et == null).toBe(true);
  });
});
