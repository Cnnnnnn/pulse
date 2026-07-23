// tests/main/pool-size.test.js
//
// 覆盖 src/main/pool-size.ts 的 size 计算.
// 目标: cap=4, min=2, cpus-1 在 cap/min 之间.
// 关键 case: 8 核机 (8-1=7) → cap 4, 2 核机 (2-1=1) → min 2.

import { describe, it, expect } from "vitest";
import { computePoolSize, DEFAULT_POOL_CAP, MIN_POOL_SIZE } from "../../src/main/pool-size.ts";

describe("computePoolSize", () => {
  it("defaults: caps at 4 on 8-core machine", () => {
    expect(computePoolSize({ cpus: 8 })).toBe(4);
  });

  it("defaults: uses cpus-1 on 4-core machine (cpus-1=3, below cap)", () => {
    expect(computePoolSize({ cpus: 4 })).toBe(3);
  });

  it("defaults: clamps to min=2 on 2-core machine (cpus-1=1)", () => {
    expect(computePoolSize({ cpus: 2 })).toBe(2);
  });

  it("defaults: clamps to min=2 on 1-core machine (cpus-1=0)", () => {
    expect(computePoolSize({ cpus: 1 })).toBe(2);
  });

  it("defaults: caps 16-core at 4", () => {
    expect(computePoolSize({ cpus: 16 })).toBe(4);
  });

  it("custom cap overrides default", () => {
    expect(computePoolSize({ cpus: 8, cap: 6 })).toBe(6);
    expect(computePoolSize({ cpus: 16, cap: 8 })).toBe(8);
  });

  it("custom min overrides default", () => {
    expect(computePoolSize({ cpus: 4, min: 4 })).toBe(4);
    expect(computePoolSize({ cpus: 8, min: 1 })).toBe(4);
  });

  it("cap=0 falls through to 0 (Math.min is the outer bound)", () => {
    // 故意暴露: cap=0 会让 cpus-1 被吃掉成 0
    // 这是一个 footgun, 提醒 caller cap 必须 >= min
    expect(computePoolSize({ cpus: 8, cap: 0 })).toBe(0);
  });

  it("exports sane defaults", () => {
    expect(DEFAULT_POOL_CAP).toBe(4);
    expect(MIN_POOL_SIZE).toBe(2);
  });
});
