/**
 * tests/ai-usage/normalize-usage-summary.test.js
 *
 * normalize-usage-summary: raw /usage_summary → usageStats.
 */

import { describe, test, expect } from "vitest";
const { normalizeUsageSummary, _parseTokenStr, _parsePctStr } = require("../../src/ai-usage/normalize-usage-summary");

const SAMPLE_RAW = {
  total_days: 90,
  total_token_consumed: "7.45B",
  usage_ranking_percent: 1,
  most_active_day: {
    date: "2026-06-07",
    token_count: "452.78M",
    image_count: "0",
    video_count: "0",
    music_count: "0",
    voice_character_count: "0",
  },
  active_days: 90,
  current_consecutive_days: 90,
  daily_token_usage: [0, 312212, 45213555, 176075421],
  date_model_usage: [
    {
      date: "2026-04-12",
      models: [
        { model: "MiniMax-M2.7", total_token: 528780, cache_hit_percent: "57.11%" },
      ],
      total_input_token: 311033,
      total_token: 312212,
      cache_hit_percent: "57.11%",
    },
    {
      date: "2026-04-13",
      models: [
        { model: "MiniMax-M2.5", total_token: 47780131, cache_hit_percent: "85.23%" },
        { model: "MiniMax-M2.7", total_token: 35642306, cache_hit_percent: "75.38%" },
      ],
      total_input_token: 45049128,
      total_token: 45213555,
      cache_hit_percent: "81.00%",
    },
    {
      date: "2026-07-10",
      models: [
        { model: "MiniMax-M3-512k", total_token: 879600096, cache_hit_percent: "96.33%" },
        { model: "MiniMax-M2.7", total_token: 6787710, cache_hit_percent: "67.13%" },
      ],
      total_input_token: 451359911,
      total_token: 452780518,
      cache_hit_percent: "96.07%",
    },
  ],
  last_update_time: "07-11 00:00",
  base_resp: { status_code: 0, status_msg: "success" },
};

describe("_parseTokenStr", () => {
  test("B/M/K 单位解析", () => {
    expect(_parseTokenStr("7.45B")).toBe(7_450_000_000);
    expect(_parseTokenStr("452.78M")).toBe(452_780_000);
    expect(_parseTokenStr("1.2K")).toBe(1_200);
    expect(_parseTokenStr("1234")).toBe(1234);
  });
  test("空 / 非法 / null 都返 null", () => {
    expect(_parseTokenStr(null)).toBe(null);
    expect(_parseTokenStr(undefined)).toBe(null);
    expect(_parseTokenStr("")).toBe(null);
    expect(_parseTokenStr("abc")).toBe(null);
  });
  test("number 直通", () => {
    expect(_parseTokenStr(123)).toBe(123);
    expect(_parseTokenStr(0)).toBe(0);
  });
});

describe("_parsePctStr", () => {
  test('"57.11%" → 57.11', () => {
    expect(_parsePctStr("57.11%")).toBe(57.11);
  });
  test("number 直通 + clamp", () => {
    expect(_parsePctStr(50)).toBe(50);
    expect(_parsePctStr(150)).toBe(100);
    expect(_parsePctStr(-10)).toBe(0);
  });
});

describe("normalizeUsageSummary", () => {
  test("顶层字段正确解析", () => {
    const r = normalizeUsageSummary(SAMPLE_RAW, { fetchedAt: 1234, endpoint: "x" });
    expect(r.ok).toBe(true);
    expect(r.usageStats.totalDays).toBe(90);
    expect(r.usageStats.totalTokenConsumed).toBe(7_450_000_000);
    expect(r.usageStats.usageRankingPercent).toBe(1);
    expect(r.usageStats.activeDays).toBe(90);
    expect(r.usageStats.currentConsecutiveDays).toBe(90);
    expect(r.usageStats.lastUpdateTime).toBe("07-11 00:00");
    expect(r.usageStats.endpoint).toBe("x");
    expect(r.usageStats.fetchedAt).toBe(1234);
  });

  test("mostActiveDay 字段", () => {
    const r = normalizeUsageSummary(SAMPLE_RAW);
    const mad = r.usageStats.mostActiveDay;
    expect(mad.date).toBe("2026-06-07");
    expect(mad.tokenCount).toBe(452_780_000);
    expect(mad.imageCount).toBe(0);
    expect(mad.videoCount).toBe(0);
    expect(mad.voiceCharacterCount).toBe(0);
  });

  test("dailyTokenUsage 长度 + 元素类型", () => {
    const r = normalizeUsageSummary(SAMPLE_RAW);
    expect(r.usageStats.dailyTokenUsage).toHaveLength(4);
    expect(r.usageStats.dailyTokenUsage[0]).toBe(0);
    expect(r.usageStats.dailyTokenUsage[3]).toBe(176_075_421);
  });

  test("dateModelUsage 正确展开 + cache_hit_percent 解析", () => {
    const r = normalizeUsageSummary(SAMPLE_RAW);
    expect(r.usageStats.dateModelUsage).toHaveLength(3);
    const last = r.usageStats.dateModelUsage[2];
    expect(last.date).toBe("2026-07-10");
    expect(last.models).toHaveLength(2);
    expect(last.models[0].cacheHitPercent).toBe(96.33);
    expect(last.totals.cacheHitPercent).toBe(96.07);
  });

  test("modelBreakdown 按累计 token 降序, sharePercent 之和 = 100", () => {
    const r = normalizeUsageSummary(SAMPLE_RAW);
    const mb = r.usageStats.modelBreakdown;
    expect(mb.length).toBeGreaterThan(0);
    // 第一个应该是 M3-512k (最大)
    expect(mb[0].model).toBe("MiniMax-M3-512k");
    expect(mb[0].totalToken).toBe(879_600_096);
    // sharePercent 加起来应该 ≈ 100 (允许 ±0.1 舍入)
    const sum = mb.reduce((s, m) => s + m.sharePercent, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.1);
  });

  test("recent7/30 平均", () => {
    const r = normalizeUsageSummary(SAMPLE_RAW);
    // dailyTokenUsage 末尾 7/30 个 (只有 4 个, 取全部)
    expect(r.usageStats.recent7Avg).toBe(Math.round((0 + 312212 + 45213555 + 176075421) / 4));
    expect(r.usageStats.recent30Avg).toBe(r.usageStats.recent7Avg);
  });

  test("空 / 非法响应返 ok=false", () => {
    expect(normalizeUsageSummary(null).ok).toBe(false);
    expect(normalizeUsageSummary({}).ok).toBe(true); // 空对象也算 ok (没数据但响应合法)
    expect(normalizeUsageSummary({ base_resp: { status_code: 1016 } }).ok).toBe(false);
  });

  test("daily_token_usage 缺 → recent avg 为 null, modelBreakdown 为 []", () => {
    const r = normalizeUsageSummary({ ...SAMPLE_RAW, daily_token_usage: undefined, date_model_usage: undefined });
    expect(r.usageStats.dailyTokenUsage).toEqual([]);
    expect(r.usageStats.dateModelUsage).toEqual([]);
    expect(r.usageStats.modelBreakdown).toEqual([]);
    expect(r.usageStats.recent7Avg).toBe(null);
    expect(r.usageStats.recent30Avg).toBe(null);
  });
});