/**
 * tests/main/worldcup-scores-espn.test.js
 */

import { describe, it, expect } from "vitest";
import {
  scoreEntryFromEspnEvent,
  scorersFromEspnEvent,
  mapEspnEventsToScoreEntries,
  eventMatchesFixture,
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
});
