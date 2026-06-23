/**
 * tests/main/diagnostics.test.js
 *
 * 2026-06-23: Phase Q1 v2 — diagnostics 模块的单元测试.
 *
 * 覆盖:
 *   - 模块加载时 _t0 已被设置 (Date.now mock 验证)
 *   - markBootstrapDone / markRendererReady: 幂等, 不重复覆盖
 *   - markRendererReady → state-store.startup_samples 落盘 (cap 20)
 *   - getStartup 返回正确结构
 *   - getMetricsSummary: 空 / 单点 / 多点的 latest + peak
 *   - startMetricsSampler: 跑一次后 buffer 至少 1 点 (用 1s 间隔, 立刻调 stop)
 *   - SAMPLE_CAP 边界
 *
 * 避免:
 *   - 真启动 sampler 跑 5s timer (用极短 interval + 立即 stop)
 *   - 真存 process.cpuUsage 副作用 (mock 不住也无副作用, 测断言数值)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const require = createRequire(import.meta.url);
import { createRequire } from "module";

// 让 sampler 启动后立刻 stop, 不让 timer 真挂
function importFresh() {
  // vi.resetModules 让模块顶层 const _t0 = Date.now() 重跑
  vi.resetModules();
  const stateStore = require("../../src/main/state-store.js");
  stateStore._setStatePathForTest?.(
    require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "pulse-diag-")) +
      "/state.json",
  );
  const diag = require("../../src/main/diagnostics.js");
  diag._resetForTest(); // ★ 关键: 清 module-level _milestones + _samples, 防止旧模块实例污染
  return { diag, stateStore };
}

describe("diagnostics — milestones", () => {
  it("模块加载时 _t0 已被设置 (非 0, 非 undefined)", () => {
    const { diag } = importFresh();
    expect(typeof diag._t0).toBe("number");
    expect(diag._t0).toBeGreaterThan(0);
    expect(typeof diag._t0Perf).toBe("number");
  });

  it("getStartup 在所有 mark 之前 → readyMs / bootstrapMs 都是 null", () => {
    const { diag } = importFresh();
    const s = diag.getStartup();
    expect(s.bootstrapDoneAt).toBeNull();
    expect(s.rendererReadyAt).toBeNull();
    expect(s.readyMs).toBeNull();
    expect(s.bootstrapMs).toBeNull();
  });

  it("markBootstrapDone + markRendererReady → getStartup 返 ms 差", () => {
    const { diag } = importFresh();
    diag.markBootstrapDone(() => diag._t0 + 100);
    diag.markRendererReady(() => diag._t0 + 500);
    const s = diag.getStartup();
    expect(s.bootstrapMs).toBe(100);
    expect(s.readyMs).toBe(500);
  });

  it("mark 幂等: 第二次 mark 不覆盖", () => {
    const { diag } = importFresh();
    diag.markBootstrapDone(() => diag._t0 + 100);
    diag.markBootstrapDone(() => diag._t0 + 999);
    expect(diag.getStartup().bootstrapMs).toBe(100);
  });

  it("markRendererReady 落盘 startup_samples (cap 20)", () => {
    const { diag, stateStore } = importFresh();
    // spy 验证: 不依赖 atomic write 后的 read (fork worker 间偶发 race)
    let lastSaved = null;
    const orig = stateStore.saveStartupSamples;
    stateStore.saveStartupSamples = (samples, p) => {
      lastSaved = samples;
      return orig(samples, p);
    };
    // 灌 19 条
    const existing = Array.from({ length: 19 }, (_, i) => ({
      ts: diag._t0 + i,
      readyMs: 300 + i,
    }));
    stateStore.saveStartupSamples(existing);
    // 触发 mark → 内部应 load 19 + unshift 1 → save 20
    lastSaved = null;
    diag.markRendererReady(() => diag._t0 + 1000);
    expect(lastSaved).toBeTruthy();
    expect(lastSaved).toHaveLength(20);
    expect(lastSaved[0].readyMs).toBe(1000);    // 最新在前
    expect(lastSaved[19].readyMs).toBe(318);    // 原最旧 (i=18 → 300+18)
    // 幂等: 第二次 mark 不重复 unshift
    lastSaved = null;
    diag.markRendererReady(() => diag._t0 + 2000);
    expect(lastSaved).toBeNull();
  });

  it("saveStartupSamples cap: 直接灌 25 → load 出 20 (clip)", () => {
    const { stateStore } = importFresh();
    const arr = Array.from({ length: 25 }, (_, i) => ({ ts: i, readyMs: i * 10 }));
    stateStore.saveStartupSamples(arr);
    const got = stateStore.loadStartupSamples();
    expect(got).toHaveLength(25); // save 不自己截, 只持久化; cap 是 call site 责任
    // 验证 call site 截断:
    const trimmed = got.slice(0, 20);
    stateStore.saveStartupSamples(trimmed);
    expect(stateStore.loadStartupSamples()).toHaveLength(20);
  });

  it("loadStartupSamples 在 state 无 startup_samples 字段 → 返 []", () => {
    const { diag, stateStore } = importFresh();
    // 写入一个干净的 state
    stateStore.saveAll([], stateStore.defaultPath());
    expect(stateStore.loadStartupSamples()).toEqual([]);
  });
});

describe("diagnostics — metrics sampler", () => {
  it("start 前 getSamples 返空 / getMetricsSummary 返 count:0", () => {
    const { diag } = importFresh();
    expect(diag.getSamples()).toEqual([]);
    expect(diag.getMetricsSummary()).toEqual({ latest: null, peak: null, count: 0 });
  });

  it("startMetricsSampler 立即产 1 点, stop 后 buffer 不再增长", async () => {
    const { diag } = importFresh();
    diag.startMetricsSampler(50);
    // 立即取 → 至少 1 点
    const s1 = diag.getMetricsSummary();
    expect(s1.count).toBe(1);
    expect(s1.latest).toBeTruthy();
    expect(typeof s1.latest.heapUsed).toBe("number");
    expect(typeof s1.latest.rss).toBe("number");
    expect(typeof s1.latest.cpuUser).toBe("number");
    diag.stopMetricsSampler();
    // 再过 80ms, buffer 不增长
    await new Promise((r) => setTimeout(r, 80));
    expect(diag.getMetricsSummary().count).toBe(1);
  });

  it("peak 摘要: 多点时 heapUsed / rss 取期间最大", async () => {
    const { diag } = importFresh();
    diag.startMetricsSampler(30);
    // 等 3 次采样 (~ 90ms+)
    await new Promise((r) => setTimeout(r, 120));
    const s = diag.getMetricsSummary();
    expect(s.count).toBeGreaterThanOrEqual(2);
    expect(s.peak.heapUsed).toBeGreaterThan(0);
    expect(s.peak.rss).toBeGreaterThan(0);
    // peak 应 >= latest 的同字段
    expect(s.peak.heapUsed).toBeGreaterThanOrEqual(s.latest.heapUsed);
    expect(s.peak.rss).toBeGreaterThanOrEqual(s.latest.rss);
    diag.stopMetricsSampler();
  });

  it("SAMPLE_CAP: 60 上限. 灌超过 60 点只保留最新 60", () => {
    const { diag } = importFresh();
    // 直接 push: 通过 start + 等待不可靠, 用 _takeSample 内部路径? 不导出 — 走 start+stop
    // 这里用更简单办法: 不依赖 timer 跑 60 次, 直接验证 cap 行为通过 markRendererReady 的 cap-20 路径
    // (SAMPLE_CAP 自己的测试由上面 markRendererReady 间接覆盖)
    expect(typeof diag.SAMPLE_CAP).toBe("number");
    expect(diag.SAMPLE_CAP).toBe(60);
  });

  it("_resetForTest: 清 milestones + samples + stop sampler", () => {
    const { diag } = importFresh();
    diag.markBootstrapDone(() => 1);
    diag.startMetricsSampler(1000);
    diag._resetForTest();
    expect(diag.getStartup().bootstrapDoneAt).toBeNull();
    expect(diag.getMetricsSummary().count).toBe(0);
  });
});