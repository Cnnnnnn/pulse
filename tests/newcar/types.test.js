/**
 * tests/newcar/types.test.js
 *
 * 类型 / 枚举常量 / STATUS 令牌 / stableIndex / formatPriceRange 验收.
 */

import { describe, it, expect } from "vitest";
import {
  CAR_TYPES,
  ENERGY_TYPES,
  RELEASE_STATUSES,
  STATUS_TOKEN,
  STATUS_TOKEN_BG,
  THUMB_PALETTE,
  stableIndex,
  formatPriceRange,
} from "../../src/newcar/types.js";

describe("枚举常量", () => {
  it("CAR_TYPES 含 6 类", () => {
    expect(CAR_TYPES).toEqual(["轿车", "SUV", "MPV", "跑车", "皮卡", "其他"]);
  });
  it("ENERGY_TYPES 含 4 类", () => {
    expect(ENERGY_TYPES).toEqual(["燃油", "混动", "纯电", "增程"]);
  });
  it("RELEASE_STATUSES 含 4 态", () => {
    expect(RELEASE_STATUSES).toEqual(["预售", "上市", "首发", "改款"]);
  });
  it("STATUS_TOKEN 覆盖全部状态且引用现有令牌", () => {
    for (const s of RELEASE_STATUSES) {
      expect(typeof STATUS_TOKEN[s]).toBe("string");
      expect(STATUS_TOKEN[s]).toMatch(/^var\(--/);
    }
  });
  it("STATUS_TOKEN_BG 覆盖全部状态且用 color-mix 半透明", () => {
    for (const s of RELEASE_STATUSES) {
      expect(typeof STATUS_TOKEN_BG[s]).toBe("string");
      expect(STATUS_TOKEN_BG[s]).toContain("color-mix");
    }
  });
  it("THUMB_PALETTE 非空且均为令牌", () => {
    expect(THUMB_PALETTE.length).toBeGreaterThan(0);
    for (const c of THUMB_PALETTE) expect(c).toMatch(/^var\(--/);
  });
});

describe("stableIndex", () => {
  it("同输入同输出 (稳定派生)", () => {
    expect(stableIndex("比亚迪", 5)).toBe(stableIndex("比亚迪", 5));
  });
  it("输出恒落在 [0, n)", () => {
    for (const s of ["a", "比亚迪", "XyZ", "1234567890"]) {
      const i = stableIndex(s, 5);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(5);
    }
  });
  it("空串或 n<=0 安全返回 0 (不抛)", () => {
    expect(stableIndex("", 5)).toBe(0);
    expect(stableIndex("a", 0)).toBe(0);
    expect(stableIndex("a", -3)).toBe(0);
  });
});

describe("formatPriceRange", () => {
  // 区间连接符可能为 en-dash, 用正则容忍具体字形.
  it("双 null → 价格待公布", () => {
    expect(formatPriceRange(null, null)).toBe("价格待公布");
  });
  it("区间 → min–max 万", () => {
    expect(formatPriceRange(10, 20)).toMatch(/^10.*20 万$/);
  });
  it("等值 → 约 min 万", () => {
    expect(formatPriceRange(15, 15)).toBe("约 15 万");
  });
  it("仅 min → 从 min 万起", () => {
    expect(formatPriceRange(10, null)).toBe("从 10 万起");
  });
  it("仅 max → 最高 max 万", () => {
    expect(formatPriceRange(null, 20)).toBe("最高 20 万");
  });
});
