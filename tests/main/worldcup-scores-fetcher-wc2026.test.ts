/**
 * tests/main/worldcup-scores-fetcher-wc2026.test.js
 *
 * Unit tests for src/main/worldcup/scores-fetcher-wc2026.js.
 *
 * 验证:
 *   - parseScheduleHtml: 中文行格式, BJ 时间 → UTC, 点球括号, 队名映射
 *   - _tailName (内部): 污染串提真名 (a.e.t. / pen.)
 *   - indexWc2026ByMatchNum: pair key + 邻近日期 + ft 校验
 *   - mergeWc2026EtPen (bracket.js): 把 wc-2026 pen 注入到 snapshot.score
 */

import { describe, test, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const {
  parseScheduleHtml,
  indexWc2026ByMatchNum,
} = requireMain("worldcup/scores-fetcher-wc2026");
const {
  mergeWc2026EtPen,
  mergeHardcodedR32EtPen,
  HARDCODED_R32_ET_PEN,
} = requireMain("worldcup/bracket");

// 最小 bracket snapshot, 4 个 R32 比赛覆盖主要场景:
// M73 干净队名 90 分决出, M74 污染串 90 分 + 点球, M75 污染串 90 分 + 点球,
// M82 污染串 ft 不匹配 (实际 90 分决出, 污染串带加时)
function makeSnapshot() {
  return {
    version: 1,
    computedAt: Date.now(),
    r32: [
      {
        matchNum: 73,
        slot1: { team: { name: "South Africa" }, source: "2A" },
        slot2: { team: { name: "Canada" }, source: "2B" },
        score: { ft: [0, 1], ht: [0, 0], status: "final" },
        status: "final",
        kickoff: { date: "2026-06-28", time: "19:00", timezone: "UTC+0" },
      },
      {
        matchNum: 74,
        slot1: { team: { name: "Germany" }, source: "1E" },
        slot2: {
          team: { name: "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay" },
          source: "3D",
        },
        score: { ft: [1, 1], status: "final" },
        status: "final",
        kickoff: {
          date: "2026-06-29",
          time: "20:30",
          timezone: "UTC-4",
          venue: "Boston",
        },
      },
      {
        matchNum: 75,
        slot1: { team: { name: "Netherlands" }, source: "1F" },
        slot2: {
          team: { name: "a.e.t. (1-1, 0-0), 2-3 pen. Morocco" },
          source: "3C",
        },
        score: { ft: [1, 1], status: "final" },
        status: "final",
        kickoff: { date: "2026-06-30", time: "01:00", timezone: "UTC-4" },
      },
      {
        matchNum: 82,
        slot1: { team: { name: "Belgium" }, source: "1G" },
        slot2: { team: { name: "a.e.t. (2-2, 0-1) Senegal" }, source: "3H" },
        score: { ft: [3, 2], status: "final" },
        status: "final",
        kickoff: { date: "2026-07-01", time: "20:00", timezone: "UTC-4" },
      },
    ],
    r16: [],
    qf: [],
    sf: [],
  };
}

describe("parseScheduleHtml", () => {
  test("标准 R32 行: 时间转 UTC + 队名映射 + 点球括号解析", () => {
    const html = `
06月29日 03:00 · 北京时间 南非 0 加拿大 1 洛杉矶 32强
06月30日 04:30 · 北京时间 德国 1 (3) 巴拉圭 1 (4) 波士顿 32强
06月30日 09:00 · 北京时间 荷兰 1 (2) 摩洛哥 1 (3) 蒙特雷 32强
`;
    const r = parseScheduleHtml(html);
    expect(r).toHaveLength(3);
    // M73: 03:00 BJ → 19:00 UTC 前一天
    expect(r[0].ft).toEqual([0, 1]);
    expect(r[0].pen).toBeNull();
    expect(r[0].team1).toBe("South Africa");
    expect(r[0].venue).toBe("Los Angeles (Inglewood)");
    expect(r[0].date).toBe("2026-06-28");
    expect(r[0].time).toBe("19:00");
    // M74: 04:30 BJ → 20:30 UTC 同一天 (04-8≥0)
    expect(r[1].ft).toEqual([1, 1]);
    expect(r[1].pen).toEqual([3, 4]);
    expect(r[1].team1).toBe("Germany");
    expect(r[1].team2).toBe("Paraguay");
    // M75: 09:00 BJ → 01:00 UTC 同一天 (9-8=1)
    expect(r[2].ft).toEqual([1, 1]);
    expect(r[2].pen).toEqual([2, 3]);
  });

  test("时间跨日: 01:00 BJ → 17:00 UTC 前一天", () => {
    const r = parseScheduleHtml(
      "07月01日 01:00 · 北京时间 科特迪瓦 1 挪威 2 达拉斯 32强",
    );
    expect(r).toHaveLength(1);
    expect(r[0].date).toBe("2026-06-30");
    expect(r[0].time).toBe("17:00");
    expect(r[0].team1).toBe("Côte d'Ivoire");
  });

  test("非 R32 段被解析 (1/4决赛 / 半决赛 / 决赛)", () => {
    const r = parseScheduleHtml(`
07月10日 04:00 · 北京时间 法国 0 英格兰 1 纽约/新泽西 1/4决赛
07月15日 03:00 · 北京时间 巴西 0 葡萄牙 1 迈阿密 半决赛
07月19日 03:00 · 北京时间 阿根廷 0 法国 1 纽约/新泽西 决赛
`);
    expect(r).toHaveLength(3);
    expect(r[0].stage).toBe("qf");
    expect(r[1].stage).toBe("sf");
    expect(r[2].stage).toBe("final");
  });

  test("空 HTML / 无效行返 []", () => {
    expect(parseScheduleHtml("")).toEqual([]);
    expect(parseScheduleHtml("garbage line")).toEqual([]);
  });
});

describe("indexWc2026ByMatchNum", () => {
  test("匹配干净队名: M73 → {ft, pen: null}", () => {
    const w = parseScheduleHtml(
      "06月29日 03:00 · 北京时间 南非 0 加拿大 1 洛杉矶 32强",
    );
    const idx = indexWc2026ByMatchNum(w, makeSnapshot());
    expect(idx.get(73)).toEqual({ ft: [0, 1], pen: null });
  });

  test("匹配污染串: M74 提 Paraguay → pen=[3,4]", () => {
    const w = parseScheduleHtml(
      "06月30日 04:30 · 北京时间 德国 1 (3) 巴拉圭 1 (4) 波士顿 32强",
    );
    const idx = indexWc2026ByMatchNum(w, makeSnapshot());
    expect(idx.get(74)).toEqual({ ft: [1, 1], pen: [3, 4] });
  });

  test("匹配污染串: M75 提 Morocco → pen=[2,3]", () => {
    const w = parseScheduleHtml(
      "06月30日 09:00 · 北京时间 荷兰 1 (2) 摩洛哥 1 (3) 蒙特雷 32强",
    );
    const idx = indexWc2026ByMatchNum(w, makeSnapshot());
    expect(idx.get(75)).toEqual({ ft: [1, 1], pen: [2, 3] });
  });

  test("M82 ft 实际 [3,2], wc-2026 解析也是 [3,2] → match (90 分决出, pen=null)", () => {
    const w = parseScheduleHtml(
      "07月02日 04:00 · 北京时间 比利时 3 塞内加尔 2 西雅图 32强",
    );
    const idx = indexWc2026ByMatchNum(w, makeSnapshot());
    expect(idx.get(82)).toEqual({ ft: [3, 2], pen: null });
  });

  test("没有 wc-2026 entry 时 Map 为空", () => {
    const idx = indexWc2026ByMatchNum([], makeSnapshot());
    expect(idx.size).toBe(0);
  });

  test("snapshot 为 null 时返空 Map (防崩)", () => {
    const idx = indexWc2026ByMatchNum(
      parseScheduleHtml("06月30日 04:30 · 北京时间 德国 1 巴拉圭 1 32强"),
      null,
    );
    expect(idx.size).toBe(0);
  });
});

describe("mergeWc2026EtPen (bracket.js)", () => {
  test("注入 pen 字段: M74 pen=[3,4], M75 pen=[2,3]", async () => {
    const snap = makeSnapshot();
    const fetchSchedule = async () => ({
      ok: true,
      matches: parseScheduleHtml(`
06月30日 04:30 · 北京时间 德国 1 (3) 巴拉圭 1 (4) 波士顿 32强
06月30日 09:00 · 北京时间 荷兰 1 (2) 摩洛哥 1 (3) 蒙特雷 32强
`),
    });
    const r = await mergeWc2026EtPen(snap, { fetchSchedule });
    expect(r.updated).toBe(2);
    const m74 = snap.r32.find((m) => m.matchNum === 74);
    expect(m74.score.pen).toEqual([3, 4]);
    expect(m74.score.ft).toEqual([1, 1]); // ft 不动
    expect(m74.score.source).toBe("wc2026");
  });

  test("无点球比赛: M82 / M73 不会被注入 pen", async () => {
    const snap = makeSnapshot();
    const fetchSchedule = async () => ({
      ok: true,
      matches: parseScheduleHtml(`
07月02日 04:00 · 北京时间 比利时 3 塞内加尔 2 西雅图 32强
06月29日 03:00 · 北京时间 南非 0 加拿大 1 洛杉矶 32强
`),
    });
    const r = await mergeWc2026EtPen(snap, { fetchSchedule });
    expect(r.updated).toBe(0);
    const m82 = snap.r32.find((m) => m.matchNum === 82);
    expect(m82.score.pen).toBeUndefined();
    expect(m82.score.ft).toEqual([3, 2]); // 保留已有
  });

  test("fetchSchedule 失败: 静默返回 updated=0, 不抛", async () => {
    const snap = makeSnapshot();
    const fetchSchedule = async () => ({ ok: false, matches: [] });
    const r = await mergeWc2026EtPen(snap, { fetchSchedule });
    expect(r.updated).toBe(0);
    // 原有 score 没被破坏
    expect(snap.r32[0].score.ft).toEqual([0, 1]);
  });

  test("wc-2026 ft 跟 bracket ft 不一致: 该 match 不注入 (信任 bracket 已有 ft)", async () => {
    const snap = makeSnapshot();
    // wc-2026 报 德国 0 巴拉圭 1, 但 bracket ft=[1,1] → ft 不一致
    const fetchSchedule = async () => ({
      ok: true,
      matches: parseScheduleHtml(
        "06月30日 04:30 · 北京时间 德国 0 巴拉圭 1 波士顿 32强",
      ),
    });
    const r = await mergeWc2026EtPen(snap, { fetchSchedule });
    // ft 校验失败, 候选被排除, updated=0 (不强制盖)
    expect(r.updated).toBe(0);
  });

  test("snapshot 为 null: 立即返 updated=0", async () => {
    const r = await mergeWc2026EtPen(null, {
      fetchSchedule: async () => ({ ok: true, matches: [] }),
    });
    expect(r.updated).toBe(0);
  });

  test("二次调用幂等: 第二次 updated=0 (没变化)", async () => {
    const snap = makeSnapshot();
    const fetchSchedule = async () => ({
      ok: true,
      matches: parseScheduleHtml(
        "06月30日 04:30 · 北京时间 德国 1 (3) 巴拉圭 1 (4) 波士顿 32强",
      ),
    });
    await mergeWc2026EtPen(snap, { fetchSchedule });
    const r2 = await mergeWc2026EtPen(snap, { fetchSchedule });
    expect(r2.updated).toBe(0);
  });
});

describe("mergeHardcodedR32EtPen (bracket.js fallback)", () => {
  test("M74 注入 pen=[3,4] + et=[0,0] (90分 1-1, 加时 0-0, 点球决胜)", () => {
    const snap = makeSnapshot();
    const r = mergeHardcodedR32EtPen(snap);
    // M74 + M75 + M82 + M88 都在 table. makeSnapshot 里只有 4 个 R32 (73/74/75/82),
    // 没有 M88 → updated = 3 (74 + 75 + 82)
    expect(r.updated).toBe(3);
    const m74 = snap.r32.find((m) => m.matchNum === 74);
    expect(m74.score.pen).toEqual([3, 4]);
    expect(m74.score.et).toEqual([0, 0]);
    expect(m74.score.source).toBe("hardcoded-r32");
  });

  test("M82 注入 et=[1,0] (90分 2-2, 加时 1-0 比利时胜, 无点球)", () => {
    const snap = makeSnapshot();
    const r = mergeHardcodedR32EtPen(snap);
    const m82 = snap.r32.find((m) => m.matchNum === 82);
    expect(m82.score.et).toEqual([1, 0]);
    expect(m82.score.pen).toBeUndefined();
    expect(m82.score.source).toBe("hardcoded-r32");
  });

  test("不覆盖已有 pen (信任更权威源)", () => {
    const snap = makeSnapshot();
    const m74 = snap.r32.find((m) => m.matchNum === 74);
    m74.score.pen = [4, 3]; // 假设 wc-2026 或 ESL 已写入
    m74.score.et = [0, 0]; // et 也填了 → hardcoded 整个 match 不注入
    m74.score.source = "wc2026";
    const r = mergeHardcodedR32EtPen(snap);
    // M74 pen/et 都已存在 → 不动; M75 + M82 注入 → updated=2
    expect(r.updated).toBe(2);
    expect(m74.score.pen).toEqual([4, 3]); // 保留原值
    expect(m74.score.source).toBe("wc2026");
  });

  test("custom table 注入 (测试可注入)", () => {
    const snap = makeSnapshot();
    const r = mergeHardcodedR32EtPen(snap, {
      table: { 73: { pen: [5, 4] } },
    });
    expect(r.updated).toBe(1);
    const m73 = snap.r32.find((m) => m.matchNum === 73);
    expect(m73.score.pen).toEqual([5, 4]);
  });

  test("snapshot 为 null: 返 updated=0", () => {
    const r = mergeHardcodedR32EtPen(null);
    expect(r.updated).toBe(0);
  });

  test("HARDCODED_R32_ET_PEN 以 ESPN scorers 为准 (不信任 openfootball TXT 的 a.e.t. 段)", () => {
    // ponytail: cup_finals.txt 的 a.e.t. (X-Y, A-B) 段对不上 ESPN scorers, 全部按
    // scorers 实际进球者推算 et = [slot1 加时进球, slot2 加时进球].
    //   M74 德国 vs 巴拉圭: scorers 120' 全是 Penalty - Scored (shootout), 加时 0-0
    //   M82 比利时 vs 塞内加尔: Tielemans 120+5'(p) 比利时进球, 加时 1-0
    //   M88 澳大利亚 vs 埃及: 无加时进球 (只有 Hany OG + Ashour 90分), 加时 0-0
    expect(HARDCODED_R32_ET_PEN[74]).toEqual({ et: [0, 0], pen: [3, 4] });
    expect(HARDCODED_R32_ET_PEN[75]).toEqual({ et: [0, 0], pen: [2, 3] });
    expect(HARDCODED_R32_ET_PEN[82]).toEqual({ et: [1, 0] });
    expect(HARDCODED_R32_ET_PEN[88]).toEqual({ et: [0, 0], pen: [2, 4] });
  });
});
