/**
 * tests/utils/version-utils.test.js
 */

import { describe, it, expect } from "vitest";
const {
  cleanVersion,
  stripBuildNumber,
} = require("../../src/utils/version-utils.js");

describe("cleanVersion", () => {
  it("null / undefined / 空串 → null", () => {
    expect(cleanVersion(null)).toBeNull();
    expect(cleanVersion(undefined)).toBeNull();
    expect(cleanVersion("")).toBeNull();
    expect(cleanVersion("   ")).toBeNull();
  });

  it("去 v/V 前缀", () => {
    expect(cleanVersion("v1.2.3")).toBe("1.2.3");
    expect(cleanVersion("V2.0")).toBe("2.0");
  });

  it("去逗号 build hash (brew 风格)", () => {
    expect(cleanVersion("3.6.31,81fcf293")).toBe("3.6.31");
    expect(cleanVersion("1.0,abc")).toBe("1.0");
  });

  it("去前后引号包裹 (iTunes 风格)", () => {
    expect(cleanVersion('"1.0"')).toBe("1.0");
    expect(cleanVersion("'2.5'")).toBe("2.5");
  });

  it("trim 空白", () => {
    expect(cleanVersion("  v1.2.3  ")).toBe("1.2.3");
    expect(cleanVersion("  3.0  ")).toBe("3.0");
  });

  it("数字输入也兼容 (转 string)", () => {
    expect(cleanVersion(123)).toBe("123");
  });

  it("组合: 引号 + 逗号 + v 前缀", () => {
    expect(cleanVersion('"v1.2.3,abc"')).toBe("1.2.3");
  });

  it("纯引号 → null", () => {
    expect(cleanVersion('""')).toBeNull();
    expect(cleanVersion("''")).toBeNull();
  });
});

describe("stripBuildNumber", () => {
  it("< 4 段不动", () => {
    expect(stripBuildNumber("1.0")).toBe("1.0");
    expect(stripBuildNumber("1.2.3")).toBe("1.2.3");
  });

  it("4 段且末段 ≥ 1000 → 剥末段", () => {
    expect(stripBuildNumber("5.0.2.29916712")).toBe("5.0.2");
    expect(stripBuildNumber("2.5.3.4392")).toBe("2.5.3");
  });

  it("4 段且末段 < 1000 → 不动 (像真实 semver)", () => {
    expect(stripBuildNumber("1.0.0.5")).toBe("1.0.0.5");
  });

  it("非 string 原样返回", () => {
    expect(stripBuildNumber(null)).toBeNull();
    expect(stripBuildNumber(123)).toBe(123);
  });
});
