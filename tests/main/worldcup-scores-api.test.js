/**
 * tests/main/worldcup-scores-api.test.js
 */

import { describe, it, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  fixtureLookupKey,
  gameLookupKey,
  canonicalTeamName,
} = requireMain("worldcup/team-aliases");
const {
  mapGamesToScoreEntries,
  scoreEntryFromGame,
} = requireMain("worldcup/scores-api-worldcup26");
const { matchKey } = requireMain("worldcup/match-key");
describe("team-aliases", () => {
  it("South Korea / Korea Republic 归一", () => {
    expect(canonicalTeamName("South Korea")).toBe(
      canonicalTeamName("Korea Republic"),
    );
  });

  it("United States / USA 归一", () => {
    expect(canonicalTeamName("United States")).toBe(canonicalTeamName("USA"));
  });

  it("fixture 与 API game lookup key 对齐", () => {
    const fixture = {
      date: "2026-06-11",
      time: "13:00",
      team1: "Mexico",
      team2: "South Africa",
    };
    const game = {
      home_team_name_en: "Mexico",
      away_team_name_en: "South Africa",
      local_date: "06/11/2026 13:00",
    };
    expect(fixtureLookupKey(fixture)).toBe(gameLookupKey(game));
  });
});

describe("scores-api-worldcup26", () => {
  const fixture = {
    date: "2026-06-11",
    time: "13:00",
    timezone: "UTC-6",
    team1: "Mexico",
    team2: "South Africa",
    venue: "Mexico City",
  };

  it("完赛比分 2-0", () => {
    const game = {
      home_team_name_en: "Mexico",
      away_team_name_en: "South Africa",
      local_date: "06/11/2026 13:00",
      home_score: "2",
      away_score: "0",
      finished: "TRUE",
      time_elapsed: "finished",
    };
    const mapped = mapGamesToScoreEntries([game], [fixture], matchKey);
    const key = matchKey(fixture);
    expect(mapped[key].ft).toEqual([2, 0]);
    expect(mapped[key].status).toBe("final");
    expect(mapped[key].source).toBe("worldcup26");
  });

  it("未开赛且未到开球时间 → 不产出比分", () => {
    // 用相对未来的日期, 否则硬编码日期一过测试就假阳性 (今天已过开球时间)
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const yyyy = future.getUTCFullYear();
    const mm = String(future.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(future.getUTCDate()).padStart(2, "0");
    const localDate = `${mm}/${dd}/${yyyy} 15:00`;
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const game = {
      home_team_name_en: "Canada",
      away_team_name_en: "Bosnia and Herzegovina",
      local_date: localDate,
      home_score: "0",
      away_score: "0",
      finished: "FALSE",
      time_elapsed: "notstarted",
    };
    const fixture = {
      date: isoDate,
      time: "15:00",
      timezone: "UTC-4",
      team1: "Canada",
      team2: "Bosnia & Herzegovina",
    };
    expect(scoreEntryFromGame(game, fixture)).toBeNull();
  });

  it("API 标 notstarted 但本地已开球 → 标 live", () => {
    const game = {
      home_team_name_en: "South Korea",
      away_team_name_en: "Czech Republic",
      local_date: "06/11/2026 20:00",
      home_score: "0",
      away_score: "0",
      finished: "FALSE",
      time_elapsed: "notstarted",
    };
    const fixture = {
      date: "2026-06-11",
      time: "20:00",
      timezone: "UTC-6",
      team1: "South Korea",
      team2: "Czech Republic",
    };
    const entry = scoreEntryFromGame(game, fixture);
    expect(entry.status).toBe("live");
    expect(entry.ft).toEqual([0, 0]);
  });

  it("Bosnia 名称变体可匹配", () => {
    const f = {
      date: "2026-06-12",
      time: "15:00",
      team1: "Canada",
      team2: "Bosnia & Herzegovina",
    };
    const game = {
      home_team_name_en: "Canada",
      away_team_name_en: "Bosnia and Herzegovina",
      local_date: "06/12/2026 15:00",
      home_score: "1",
      away_score: "1",
      finished: "TRUE",
      time_elapsed: "finished",
    };
    const mapped = mapGamesToScoreEntries([game], [f], matchKey);
    expect(mapped[matchKey(f)].ft).toEqual([1, 1]);
  });
});
