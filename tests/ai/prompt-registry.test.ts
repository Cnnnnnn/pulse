/**
 * tests/ai/prompt-registry.test.js
 *
 * Task 1 of stock_detail_analyze few-shot work: lock the contract that
 * DEFAULT_PROMPTS.stock_detail_analyze.fewShot must be a non-empty string
 * containing the two hand-crafted examples (正常股 + 数据缺失).
 */

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DEFAULT_PROMPTS } = require("../../src/ai/prompt-registry.js");

describe("stock_detail_analyze prompt", () => {
  it("fewShot 字段非空字符串", () => {
    const fewShot = DEFAULT_PROMPTS.stock_detail_analyze.fewShot;
    expect(typeof fewShot).toBe("string");
    expect(fewShot.trim().length).toBeGreaterThan(0);
  });

  it("fewShot 包含两个示例的关键 angle 关键字", () => {
    const fewShot = DEFAULT_PROMPTS.stock_detail_analyze.fewShot;
    // 示例 1: 正常股覆盖 price_trend / valuation / profitability / volume_turnover
    expect(fewShot).toContain("价格趋势");
    expect(fewShot).toContain("估值水位");
    expect(fewShot).toContain("盈利能力");
    // 示例 2: 数据缺失覆盖 capital_flow / news_buzz
    expect(fewShot).toContain("资金流向");
    expect(fewShot).toContain("新闻舆情");
  });

  // ponytail: 2026-07-07 — 原 it 锁字面"暂无数据"在新 few-shot 里换成"数据缺失".
  // 字面锁是脆契约, 改成语义锁: 数据缺失示例的 perAngle output 必含 (暂无数据 | 数据缺失 | 数据缺口) 三选一.
  it("fewShot 数据缺失示例的 perAngle output 含明确的'缺失'字符串", () => {
    const fewShot = DEFAULT_PROMPTS.stock_detail_analyze.fewShot;
    expect(fewShot).toMatch(/暂无数据|数据缺失|数据缺口/);
  });

  it("fewShot 包含 4 个 '输入:' 和 4 个 '输出:' 分隔标记 (Task 5 加 1 个 6-angle 示例 + 1 个新 5-angle 示例)", () => {
    // ponytail: 2026-07-07 加 1 个新 few-shot (含业绩预期/股东结构/股本事件/行业景气/融资融券
    // 5 个新 angle), 教 LLM 怎么用未来维度 + 散户杠杆信号. 锁死 4 = 防 few-shot 漂移.
    const fewShot = DEFAULT_PROMPTS.stock_detail_analyze.fewShot;
    const inputMatches = fewShot.match(/输入:/g) || [];
    const outputMatches = fewShot.match(/输出:/g) || [];
    expect(inputMatches.length).toBe(4);
    expect(outputMatches.length).toBe(4);
  });
});
