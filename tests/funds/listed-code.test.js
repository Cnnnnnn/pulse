/**
 * tests/funds/listed-code.test.js
 *
 * 2026-07-13 投资 nav 合并 (N5): 沪深 ETF/LOF 代码前缀白名单.
 *   沪市 ETF: 51/56/58 开头
 *   深市 ETF/LOF: 15/16/18 开头
 *   场外开放式: 0/1 开头但不在上述区间
 */
import { describe, it, expect } from "vitest";
import { isListedFundCode } from "../../src/renderer/funds/fundStore.js";

describe("isListedFundCode", () => {
  it("ETF/LOF 代码判 true", () => {
    expect(isListedFundCode("518880")).toBe(true); // 华安黄金ETF (沪)
    expect(isListedFundCode("161226")).toBe(true); // 国投白银LOF (深)
    expect(isListedFundCode("161125")).toBe(true); // LOF
    expect(isListedFundCode("512480")).toBe(true); // ETF
    expect(isListedFundCode("563880")).toBe(true); // 56 开头沪 ETF
    expect(isListedFundCode("588080")).toBe(true); // 58 开头沪 ETF (科创板 50)
  });

  it("场外开放式基金判 false", () => {
    expect(isListedFundCode("000001")).toBe(false); // 华夏成长 (场外)
    expect(isListedFundCode("001102")).toBe(false);
    expect(isListedFundCode("110011")).toBe(false);
    expect(isListedFundCode("005827")).toBe(false);
  });

  it("非法输入安全 false", () => {
    expect(isListedFundCode("")).toBe(false);
    expect(isListedFundCode(null)).toBe(false);
    expect(isListedFundCode(undefined)).toBe(false);
    expect(isListedFundCode("123")).toBe(false); // 太短
    expect(isListedFundCode("1234567")).toBe(false); // 太长
    expect(isListedFundCode(518880)).toBe(false); // 非 string
    expect(isListedFundCode({})).toBe(false);
  });

  it("前缀边界: 50/52/19/17 不在白名单 → false", () => {
    // 50 开头是国债 / 51 才是 ETF; 19 是创业板 ETF 但不在白名单 (新增时更新)
    // 当前白名单只覆盖 51/56/58 + 15/16/18, 不覆盖 50/52/19 等
    expect(isListedFundCode("500001")).toBe(false);
    expect(isListedFundCode("520001")).toBe(false);
    expect(isListedFundCode("190001")).toBe(false);
    expect(isListedFundCode("170001")).toBe(false);
  });
});
