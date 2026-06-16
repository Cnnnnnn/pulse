/**
 * tests/ai-usage/format-glm.test.js
 *
 * GLM 展示专用格式化纯函数测试.
 */

import { describe, test, expect } from "vitest";
const {
  formatTokens,
  formatDuration,
  LEVEL_LABELS,
  levelLabel,
} = require("../../src/ai-usage/format-glm");

describe("formatTokens — token 数 → 中文紧凑单位", () => {
  test("亿级: 672305536 → '6.72 亿'", () => {
    expect(formatTokens(672305536)).toBe("6.72 亿");
  });

  test("亿级向下截断 2 位 (不四舍五入): 127694464 → '1.27 亿'", () => {
    expect(formatTokens(127694464)).toBe("1.27 亿");
  });

  test("正好 1 亿 → '1 亿'", () => {
    expect(formatTokens(100000000)).toBe("1 亿");
  });

  test("万级: 56789 → '5.6 万'", () => {
    expect(formatTokens(56789)).toBe("5.6 万");
  });

  test("万级 1 位小数向下截断: 99999 → '9.9 万' (不进到 10 万)", () => {
    expect(formatTokens(99999)).toBe("9.9 万");
  });

  test("正好 1 万 → '1 万'", () => {
    expect(formatTokens(10000)).toBe("1 万");
  });

  test("< 1 万: 原样字符串", () => {
    expect(formatTokens(800)).toBe("800");
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(9999)).toBe("9999");
  });

  test("null / undefined / 非有限数 / 负数 → null", () => {
    expect(formatTokens(null)).toBeNull();
    expect(formatTokens(undefined)).toBeNull();
    expect(formatTokens(NaN)).toBeNull();
    expect(formatTokens(Infinity)).toBeNull();
    expect(formatTokens(-100)).toBeNull();
    expect(formatTokens("800")).toBeNull();
  });
});

describe("formatDuration — 秒 → 中文时长", () => {
  test("小时级 + 分钟: 4000s → '1 小时 6 分' (向下取整)", () => {
    expect(formatDuration(4000)).toBe("1 小时 6 分");
  });

  test("小时级 整点 (分钟=0 省略): 3600s → '1 小时'", () => {
    expect(formatDuration(3600)).toBe("1 小时");
  });

  test("纯分钟级: 2172s → '36 分'", () => {
    expect(formatDuration(2172)).toBe("36 分");
  });

  test("秒级向下取整到分: 90s → '1 分'", () => {
    expect(formatDuration(90)).toBe("1 分");
  });

  test("秒级 < 60: 45s → '45 秒'", () => {
    expect(formatDuration(45)).toBe("45 秒");
  });

  test("0 → '0 秒'", () => {
    expect(formatDuration(0)).toBe("0 秒");
  });

  test("null / undefined / 非数 / 负数 → null", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
    expect(formatDuration(-1)).toBeNull();
    expect(formatDuration("60")).toBeNull();
  });
});

describe("LEVEL_LABELS + levelLabel", () => {
  test("LEVEL_LABELS 三档映射", () => {
    expect(LEVEL_LABELS.lite).toBe("轻量版");
    expect(LEVEL_LABELS.pro).toBe("专业版");
    expect(LEVEL_LABELS.max).toBe("旗舰版");
  });

  test("levelLabel: 已知档 → 中文", () => {
    expect(levelLabel("pro")).toBe("专业版");
    expect(levelLabel("lite")).toBe("轻量版");
    expect(levelLabel("max")).toBe("旗舰版");
  });

  test("levelLabel: 未知档 → 原值 fallback", () => {
    expect(levelLabel("enterprise")).toBe("enterprise");
  });

  test("levelLabel: null/空串/非字符串 → null", () => {
    expect(levelLabel(null)).toBeNull();
    expect(levelLabel("")).toBeNull();
    expect(levelLabel(undefined)).toBeNull();
    expect(levelLabel(123)).toBeNull();
  });
});
