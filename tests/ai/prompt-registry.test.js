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

  it("fewShot 包含 '暂无数据' 字符串 (数据缺失示例特征)", () => {
    const fewShot = DEFAULT_PROMPTS.stock_detail_analyze.fewShot;
    expect(fewShot).toContain("暂无数据");
  });

  it("fewShot 包含 2 个 '输入:' 和 2 个 '输出:' 分隔标记", () => {
    const fewShot = DEFAULT_PROMPTS.stock_detail_analyze.fewShot;
    const inputMatches = fewShot.match(/输入:/g) || [];
    const outputMatches = fewShot.match(/输出:/g) || [];
    expect(inputMatches.length).toBe(2);
    expect(outputMatches.length).toBe(2);
  });
});