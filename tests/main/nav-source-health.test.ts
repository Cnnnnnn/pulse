/**
 * tests/main/nav-source-health.test.js
 */

import { describe, it, expect } from "vitest";
const {
  NavSourceHealth,
  SOURCES,
} = require("../../src/funds/nav-source-health.js");

describe("NavSourceHealth", () => {
  it("初始: 全部源样本不足, 非 unhealthy", () => {
    const h = new NavSourceHealth();
    for (const s of SOURCES) expect(h.isUnhealthy(s)).toBe(false);
  });

  it("连续失败 >= 阈值 → unhealthy", () => {
    const h = new NavSourceHealth({ consecutiveFailThreshold: 3 });
    h.record("tiantian", false, "000001");
    h.record("tiantian", false, "000001");
    expect(h.isUnhealthy("tiantian")).toBe(false);
    h.record("tiantian", false, "000001");
    expect(h.isUnhealthy("tiantian")).toBe(true);
  });

  it("一次成功 → 连续失败清零 (但成功率可能仍低, 视窗口而定)", () => {
    const h = new NavSourceHealth({
      consecutiveFailThreshold: 2,
      // 放宽成功率, 这里只测连续失败清零逻辑
      minSuccessRate: 0.0,
    });
    h.record("tiantian", false);
    h.record("tiantian", false);
    expect(h.isUnhealthy("tiantian")).toBe(true);
    h.record("tiantian", true);
    expect(h.isUnhealthy("tiantian")).toBe(false);
  });

  it("滑动窗口成功率 < 阈值 → unhealthy", () => {
    const h = new NavSourceHealth({
      windowSize: 10,
      minSuccessRate: 0.5,
    });
    // 6 失败 4 成功 → 40% < 50%
    for (let i = 0; i < 4; i++) h.record("sina", true);
    for (let i = 0; i < 6; i++) h.record("sina", false);
    expect(h.isUnhealthy("sina")).toBe(true);
  });

  it("样本 < 3 不判 unhealthy (避免冷启动误判)", () => {
    const h = new NavSourceHealth({ minSuccessRate: 0.99 });
    h.record("tiantian", false);
    h.record("tiantian", false);
    expect(h.isUnhealthy("tiantian")).toBe(false);
  });

  it("snapshot 返回统计", () => {
    const h = new NavSourceHealth();
    h.record("tiantian", true);
    h.record("tiantian", false);
    const snap = h.snapshot();
    expect(snap.tiantian.samples).toBe(2);
    expect(snap.tiantian.successRate).toBe(0.5);
    expect(snap.tiantian.consecutiveFails).toBe(1);
    expect(snap.tiantian.unhealthy).toBe(false); // 样本不足
  });

  it("pickPreferred: 主源健康 → 主源", () => {
    const h = new NavSourceHealth();
    expect(h.pickPreferred("tiantian")).toBe("tiantian");
    expect(h.pickPreferred("sina")).toBe("sina");
  });

  it("pickPreferred: 主源 unhealthy → 切备用", () => {
    const h = new NavSourceHealth({ consecutiveFailThreshold: 2 });
    h.record("tiantian", false);
    h.record("tiantian", false);
    h.record("tiantian", false);
    expect(h.pickPreferred("tiantian")).toBe("sina");
  });

  it("pickPreferred: 两源都挂 → 仍返主源 (兜底, 不瞎返 undefined)", () => {
    const h = new NavSourceHealth({ consecutiveFailThreshold: 1 });
    h.record("tiantian", false);
    h.record("sina", false);
    expect(h.pickPreferred("tiantian")).toBe("tiantian");
  });

  it("未知源 → 不记录不抛", () => {
    const h = new NavSourceHealth();
    expect(() => h.record("unknown", true)).not.toThrow();
    expect(h.isUnhealthy("unknown")).toBe(false);
    expect(h.pickPreferred("unknown")).toBe("tiantian");
  });

  it("窗口超容 → 自动裁剪老样本", () => {
    const h = new NavSourceHealth({ windowSize: 3 });
    for (let i = 0; i < 10; i++) h.record("tiantian", true);
    expect(h.snapshot().tiantian.samples).toBe(3);
  });
});
