/**
 * tests/main/worldcup-parser.test.js
 *
 * v2.9.0 世界杯专栏 — parser 单测
 */

import { describe, it, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  parseWorldcupTxt,
  groupMatchesByDate,
} = requireMain("worldcup/parser");
const SAMPLE = `
= World Cup 2026      # in Canada, USA, and Mexico

Group A | Mexico   South Africa   South Korea   Czech Republic
Group B | Canada   Bosnia & Herzegovina  Qatar    Switzerland

▪ Group A
Thu June 11
  13:00 UTC-6  Mexico       v South Africa        @ Mexico City
  20:00 UTC-6  South Korea  v Czech Republic      @ Guadalajara (Zapopan)

Fri June 12
  13:00 UTC-6  Canada       v Bosnia & Herzegovina  @ Toronto
  19:00 UTC-6  Qatar        v Switzerland          @ Dallas (Arlington)

▪ Final
Sun Jul 19
  15:00 UTC-4  W101 v W102    @ New York/New Jersey (East Rutherford)
`;

describe("parseWorldcupTxt", () => {
  it("空 / 非字符串 → throw", () => {
    expect(() => parseWorldcupTxt("")).toThrow();
    expect(() => parseWorldcupTxt(null)).toThrow();
    expect(() => parseWorldcupTxt(123)).toThrow();
  });

  it("解析 sample → name + 2 groups + 5 matches", () => {
    const r = parseWorldcupTxt(SAMPLE);
    expect(r.name).toBe("World Cup 2026");
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0]).toEqual({
      letter: "A",
      teams: ["Mexico", "South Africa", "South Korea", "Czech Republic"],
    });
    expect(r.groups[1].letter).toBe("B");
    expect(r.matches).toHaveLength(5);
  });

  it("match 字段完整 (date / time / tz / team1 / team2 / venue)", () => {
    const r = parseWorldcupTxt(SAMPLE);
    const m = r.matches[0];
    expect(m.stage).toBe("Group A");
    expect(m.date).toBe("2026-06-11");
    expect(m.time).toBe("13:00");
    expect(m.timezone).toBe("UTC-6");
    expect(m.team1).toBe("Mexico");
    expect(m.team2).toBe("South Africa");
    expect(m.venue).toBe("Mexico City");
  });

  it("Final stage 也解析", () => {
    const r = parseWorldcupTxt(SAMPLE);
    const final = r.matches.find((m) => m.stage === "Final");
    expect(final).toBeDefined();
    expect(final.team1).toBe("W101");
    expect(final.team2).toBe("W102");
    expect(final.date).toBe("2026-07-19");
  });

  it("matches 按 date 升序", () => {
    const r = parseWorldcupTxt(SAMPLE);
    const dates = r.matches.map((m) => m.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("无 group 段: groups=[]", () => {
    const r = parseWorldcupTxt(`
= World Cup 2030
▪ Group A
Fri June 13
  13:00 UTC-5  A1 v A2  @ Venue
`);
    expect(r.groups).toEqual([]);
    expect(r.matches).toHaveLength(1);
  });

  it("队名或场地缺失 skip 该行 (不抛)", () => {
    const r = parseWorldcupTxt(`
= World Cup 2026
▪ Group A
Thu June 11
  13:00 UTC-6       v South Africa   @ Mexico City
  14:00 UTC-6  Mexico v            @ Toronto
`);
    // 2 行 skip (team1 / team2 空)
    expect(r.matches).toHaveLength(0);
  });

  it("解析已赛比分行 (无 v 分隔)", () => {
    const r = parseWorldcupTxt(`
= World Cup 2026
▪ Group A
Thu June 11
  13:00 UTC-6     Mexico  2-0 (1-0)  South Africa        @ Mexico City
Thu June 18
  12:00 UTC-4     Czech Republic    v South Africa   @ Atlanta
`);
    expect(r.matches).toHaveLength(2);
    const played = r.matches.find((m) => m.team1 === "Mexico");
    expect(played.score).toEqual({
      ft: [2, 0],
      ht: [1, 0],
      status: "final",
    });
    expect(
      r.matches.find((m) => m.team1 === "Czech Republic").score,
    ).toBeNull();
  });

  it("忽略 Matchday 行, 只认 Group/Knockout stage", () => {
    const r = parseWorldcupTxt(`
= World Cup 2026
▪ Matchday 1 | Thu Jun 11
▪ Group A
Thu June 11
  13:00 UTC-6  Mexico  1-0  South Africa  @ Mexico City
`);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].stage).toBe("Group A");
  });

  it("解析 cup_finals.txt '(N) ' 前缀 + '## note' 注释 (R32 行)", () => {
    const r = parseWorldcupTxt(`
= World Cup 2026

▪ Round of 32
Sun Jun 28
  (73) 12:00 UTC-7  South Africa v Canada   @ Los Angeles (Inglewood)   ## 2A / 2B
Mon Jun 29
  (74) 16:30 UTC-4  Germany v 3A/B/C/D/F  @ Boston (Foxborough)        ## 1E
`);
    expect(r.matches).toHaveLength(2);
    const m73 = r.matches[0];
    expect(m73.matchNum).toBe(73);
    expect(m73.stage).toBe("Round of 32");
    expect(m73.team1).toBe("South Africa");
    expect(m73.team2).toBe("Canada");
    expect(m73.venue).toBe("Los Angeles (Inglewood)");
    expect(m73.date).toBe("2026-06-28");
    expect(m73.time).toBe("12:00");
    expect(m73.timezone).toBe("UTC-7");
    const m74 = r.matches[1];
    expect(m74.matchNum).toBe(74);
    expect(m74.team1).toBe("Germany");
    expect(m74.team2).toBe("3A/B/C/D/F"); // placeholder, 不 strip
    expect(m74.date).toBe("2026-06-29");
  });

  it("无 (N) 前缀时 matchNum=null (group-stage 行)", () => {
    const r = parseWorldcupTxt(`
= World Cup 2026
▪ Group A
Thu June 11
  13:00 UTC-6  Mexico v South Africa  @ Mexico City
`);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].matchNum).toBeNull();
  });

  it("R16 行 placeholder (W74, L101) 也正确解析", () => {
    const r = parseWorldcupTxt(`
= World Cup 2026
▪ Round of 16
Sat Jul 4
  (89) 17:00 UTC-4  W74 v W77  @ Philadelphia
  (103) 17:00 UTC-4  L101 v L102  @ Miami
`);
    expect(r.matches).toHaveLength(2);
    expect(r.matches[0].matchNum).toBe(89);
    expect(r.matches[0].team1).toBe("W74");
    expect(r.matches[0].team2).toBe("W77");
    expect(r.matches[1].matchNum).toBe(103);
    expect(r.matches[1].stage).toBe("Round of 16");
    expect(r.matches[1].team1).toBe("L101");
  });
});

describe("groupMatchesByDate", () => {
  it("空数组 → 空数组", () => {
    expect(groupMatchesByDate([])).toEqual([]);
  });

  it("按 date group, 顺序稳定", () => {
    const r = parseWorldcupTxt(SAMPLE);
    const groups = groupMatchesByDate(r.matches);
    expect(groups).toHaveLength(3); // 6/11, 6/12, 7/19 (sample 实际 3 个不同日期)
    expect(groups[0].date).toBe("2026-06-11");
    expect(groups[0].matches).toHaveLength(2);
    expect(groups[1].date).toBe("2026-06-12");
    expect(groups[1].matches).toHaveLength(2);
    expect(groups[2].date).toBe("2026-07-19");
    expect(groups[2].matches).toHaveLength(1);
  });

  it("无 date 的 match 跳过", () => {
    const groups = groupMatchesByDate([
      { date: "2026-06-11", time: "13:00", team1: "A", team2: "B", venue: "V" },
      { time: "14:00", team1: "C", team2: "D", venue: "V" }, // 无 date
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].matches).toHaveLength(1);
  });
});
