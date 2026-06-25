/**
 * tests/main/self-update-idle.test.js
 *
 * P52 §增量自更新: decideSelfUpdateTick 纯函数单测. 接线层 (electron
 * powerMonitor 调用) 不在本文件, 走 smoke + 手动验证.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { decideSelfUpdateTick } = require("../../src/main/self-update-idle.js");

const FIVE_MIN = 5 * 60 * 1000;
const BASE_BOOT = 1_700_000_000_000; // 任意固定起点

describe("decideSelfUpdateTick", () => {
  describe("boot age gate", () => {
    it("boot < 5min (4:59) → skip too_soon", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + FIVE_MIN - 1000,
        powerIdleState: "idle",
      });
      expect(r).toEqual({ action: "skip", reason: "too_soon" });
    });

    it("boot 恰好 5min → run (>= 边界)", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + FIVE_MIN,
        powerIdleState: "idle",
      });
      expect(r).toEqual({ action: "run" });
    });

    it("boot > 5min + idle → run", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + FIVE_MIN + 60_000,
        powerIdleState: "idle",
      });
      expect(r).toEqual({ action: "run" });
    });

    it("bootStartedAt 非 number → skip too_soon (防御)", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: null,
        now: BASE_BOOT + FIVE_MIN + 60_000,
        powerIdleState: "idle",
      });
      expect(r.action).toBe("skip");
      expect(r.reason).toBe("too_soon");
    });

    it("now 非 number → skip too_soon (防御)", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: NaN,
        powerIdleState: "idle",
      });
      expect(r.action).toBe("skip");
      expect(r.reason).toBe("too_soon");
    });
  });

  describe("system activity gate", () => {
    it("boot 充分 + system 'active' → skip system_active", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + FIVE_MIN + 60_000,
        powerIdleState: "active",
      });
      expect(r).toEqual({ action: "skip", reason: "system_active" });
    });

    it("boot 充分 + system 'idle' → run", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + FIVE_MIN + 60_000,
        powerIdleState: "idle",
      });
      expect(r).toEqual({ action: "run" });
    });

    it("boot 充分 + system 'locked' → run (锁屏算 idle)", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + FIVE_MIN + 60_000,
        powerIdleState: "locked",
      });
      expect(r).toEqual({ action: "run" });
    });

    it("boot 充分 + system 'unknown' → run (保守放行)", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + FIVE_MIN + 60_000,
        powerIdleState: "unknown",
      });
      expect(r).toEqual({ action: "run" });
    });

    it("boot 充分 + powerIdleState null → run (接线层 powerMonitor 失败兜底)", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + FIVE_MIN + 60_000,
        powerIdleState: null,
      });
      expect(r).toEqual({ action: "run" });
    });
  });

  describe("组合优先级", () => {
    it("boot 太早 + system idle → too_soon (boot 优先)", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + 60_000, // 1min
        powerIdleState: "idle",
      });
      expect(r.reason).toBe("too_soon");
    });

    it("boot 充分 + system active → system_active (idle 拦截)", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + FIVE_MIN + 60_000,
        powerIdleState: "active",
      });
      expect(r.reason).toBe("system_active");
    });
  });

  describe("自定义参数", () => {
    it("自定义 minBootAgeMs: boot 2min + minBootAgeMs=60s → run", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT + 2 * 60 * 1000,
        powerIdleState: "idle",
        minBootAgeMs: 60 * 1000,
      });
      expect(r).toEqual({ action: "run" });
    });

    it("minBootAgeMs=0 → 直接走 system gate (禁用 boot 拦截)", () => {
      const r = decideSelfUpdateTick({
        bootStartedAt: BASE_BOOT,
        now: BASE_BOOT,
        powerIdleState: "idle",
        minBootAgeMs: 0,
      });
      expect(r).toEqual({ action: "run" });
    });
  });
});
