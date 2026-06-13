/**
 * tests/main/worldcup-parser.test.js
 *
 * v2.9.0 世界杯专栏 — parser 单测
 */

import { describe, it, expect } from "vitest";
import {
  parseWorldcupTxt,
  groupMatchesByDate,
} from "../../src/main/worldcup/parser.js";

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
