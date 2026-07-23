/**
 * src/main/diagnostics.ts
 *
 * 2026-06-23: Phase Q1 v2 — structured diagnostics module.
 *
 * 职责:
 *   1. 启动时间埋点 (3 个里程碑): module load (t0, 立即拿到) → bootstrap done
 *      (tray / 主窗口初始化完) → renderer ready (first webContents 'did-finish-load').
 *   2. 内存 + CPU 采样: 5s 一次 process.memoryUsage + process.cpuUsage + uptime,
 *      环式保留 60 个点 (~5 分钟滑动窗口). 用 setManagedInterval 走 timer-registry,
 *      进程退出时自动清理 (Q5 兜底).
 *   3. 启动样本持久化: 每次 markRendererReady 把 { readyMs, ts } 推到
 *      state-store.startup_samples, cap 20 滚动.
 *
 * 设计:
 *   - 模块加载时立即记录 t0 = Date.now(). index.js 顶部 require 这个模块即触发.
 *   - milestones 用全局 setter API (markBootstrapDone / markRendererReady),
 *     不依赖 IPC 回调;bootstrap 调用顺序由 index.js 显式编排.
 *   - 采样器只 run in main process; renderer 不调用 (避免 process 模块误用).
 *   - 纯 Node 内置 API, 零第三方依赖, vitest requireable (跳过 setManagedInterval 测试).
 *
 * IPC 接口见 register-core.js: diagnostics:fetch / diagnostics:fetch-samples.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type * as perfHooksType from "node:perf_hooks";

const { performance }: typeof perfHooksType = require("node:perf_hooks");

type StartupNowFn = import("../shared/electron/diagnostics-adapter").StartupNowFn;
type StartupSnapshot = import("../shared/electron/diagnostics-adapter").StartupSnapshot;
type MetricsSample = import("../shared/electron/diagnostics-adapter").MetricsSample;
type MetricsSummary = import("../shared/electron/diagnostics-adapter").MetricsSummary;

interface StateStoreShape {
  loadStartupSamples(statePath?: string): Array<{ ts: number; readyMs: number }>;
  saveStartupSamples(
    samples: Array<{ ts: number; readyMs: number }>,
    statePath?: string,
  ): unknown;
}

const { setManagedInterval } = require("./timer-registry.ts");
// diagnostics 依赖 state-store (.js, Task 3 才会迁). ponytail: 用 typeof
// import 推断 .js 模块的类型, 避免对 .js 文件写 .d.ts 双 source.
const stateStore: StateStoreShape = require("./state-store");
const { createLogger } = require("./log.ts");

const log = createLogger("diagnostics");

// 模块加载即拿 t0 (process.hrtime / performance.now 都行, 用 ms 简单)
const _t0: number = Date.now();
const _t0Perf: number = performance.now();

// milestones: { bootstrapDone: ts, rendererReady: ts }
const _milestones: { bootstrapDone: number | null; rendererReady: number | null } = {
  bootstrapDone: null,
  rendererReady: null,
};

// 当前 sample buffer: 环式 cap 60
const SAMPLE_CAP = 60;
const _samples: MetricsSample[] = [];

let _samplerHandle: { id: number; clear: () => boolean } | null = null;
let _previousCpu: { user: number; system: number } | null = null;

/**
 * @param now 注入测试用
 */
function markBootstrapDone(now: StartupNowFn = Date.now): void {
  if (_milestones.bootstrapDone) return;
  _milestones.bootstrapDone = now();
}

/**
 * @param now 注入测试用
 */
function markRendererReady(now: StartupNowFn = Date.now): void {
  if (_milestones.rendererReady) return;
  _milestones.rendererReady = now();
  // 落盘: 启动样本加一条, cap 20
  try {
    const samples = stateStore.loadStartupSamples();
    const readyMs = _milestones.rendererReady - _t0;
    samples.unshift({ ts: _milestones.rendererReady, readyMs });
    if (samples.length > 20) samples.length = 20;
    stateStore.saveStartupSamples(samples);
  } catch (err) {
    const e = err as Error;
    log.warn(`saveStartupSamples failed: ${e && e.message}`);
  }
}

/**
 * 取启动里程碑 (ms).
 */
function getStartup(): StartupSnapshot {
  const readyMs = _milestones.rendererReady ? _milestones.rendererReady - _t0 : null;
  const bootstrapMs = _milestones.bootstrapDone ? _milestones.bootstrapDone - _t0 : null;
  return {
    moduleLoadAt: _t0,
    bootstrapDoneAt: _milestones.bootstrapDone,
    rendererReadyAt: _milestones.rendererReady,
    readyMs,
    bootstrapMs,
  };
}

function _takeSample(now: StartupNowFn = Date.now): MetricsSample {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const sample: MetricsSample = {
    ts: now(),
    heapUsed: mem.heapUsed,
    rss: mem.rss,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers || 0,
    cpuUser: cpu.user,
    cpuSystem: cpu.system,
    uptimeMs: Math.round(process.uptime() * 1000),
  };
  // 计算与上次的差值 (us), 仅当 cpu 存在 (process.cpuUsage 有 user+system)
  if (_previousCpu) {
    sample.cpuUserDeltaUs = cpu.user - _previousCpu.user;
    sample.cpuSystemDeltaUs = cpu.system - _previousCpu.system;
  }
  _previousCpu = cpu;
  return sample;
}

function _pushSample(s: MetricsSample): void {
  _samples.push(s);
  if (_samples.length > SAMPLE_CAP) _samples.shift();
}

/**
 * 启动 5s 采样器. 重复调幂等.
 * @param intervalMs
 */
function startMetricsSampler(intervalMs: number = 5000): void {
  if (_samplerHandle) return;
  _pushSample(_takeSample()); // 立即一个点, 不空头
  _samplerHandle = setManagedInterval(() => {
    try { _pushSample(_takeSample()); } catch (err) {
      const e = err as Error;
      log.warn(`takeSample failed: ${e && e.message}`);
    }
  }, intervalMs, { label: "diagnostics-metrics-sampler" });
}

/**
 * 停采样器 (测试 / 退出时).
 */
function stopMetricsSampler(): void {
  if (_samplerHandle) {
    try { _samplerHandle.clear(); } catch { /* noop */ }
    _samplerHandle = null;
  }
}

/**
 * 取最新采样快照. 不复制内部数组 (renderer 自己只读不写).
 */
function getSamples(): MetricsSample[] {
  return _samples.slice();
}

/**
 * 取最新一帧快照 + 一个 "峰值" 摘要 (供 drawer 顶部数字展示).
 *   latest: 最新一帧 或 null
 *   peak:   { heapUsed, rss } 期间最大值
 *   count:  当前缓冲长度
 */
function getMetricsSummary(): MetricsSummary {
  if (_samples.length === 0) {
    return { latest: null, peak: null, count: 0 };
  }
  const latest = _samples[_samples.length - 1];
  let peakHeap = 0, peakRss = 0;
  for (const s of _samples) {
    if (s.heapUsed > peakHeap) peakHeap = s.heapUsed;
    if (s.rss > peakRss) peakRss = s.rss;
  }
  return {
    latest,
    peak: { heapUsed: peakHeap, rss: peakRss },
    count: _samples.length,
  };
}

/** Test-only: 重置所有模块状态. */
function _resetForTest(): void {
  _milestones.bootstrapDone = null;
  _milestones.rendererReady = null;
  _samples.length = 0;
  _previousCpu = null;
  stopMetricsSampler();
}

module.exports = {
  // milestones
  markBootstrapDone,
  markRendererReady,
  getStartup,
  // metrics sampler
  startMetricsSampler,
  stopMetricsSampler,
  getSamples,
  getMetricsSummary,
  SAMPLE_CAP,
  _resetForTest,
  _t0,         // 测试可断言 t0 已被读
  _t0Perf,
};