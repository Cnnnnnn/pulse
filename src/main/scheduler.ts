/**
 * src/main/scheduler.ts
 *
 * 命名任务调度服务 — 在 timer-registry 之上加一层「按名字启停」的
 * 业务调度 API。timer-registry 只管 handle 登记与 quit 时 clearAll；
 * 本模块负责：
 *   - register / start / stop / restart / stopAll（按 name）
 *   - interval + 可选 initialDelayMs + 可选 jitterMs（错峰，避免多个
 *     scheduler 同一时刻打上游）
 *   - 幂等 start（已跑则 no-op）；stop 后可再 start
 *
 * 无 Electron 依赖，vitest 可直接 require dist-test 产物。
 */

import type { ManagedHandle, ManagedTimerMeta } from "../shared/electron/timer-registry-adapter";

const {
  setManagedInterval,
  setManagedTimeout,
  clearManaged,
} = require("./timer-registry.ts");

export type JobFn = (ctx: { name: string; runCount: number }) => void | Promise<void>;

export type JobSpec = {
  /** 唯一名字，用于 start/stop；重复 register 同名会覆盖并 stop 旧任务 */
  name: string;
  /** 周期 ms，必须 > 0 */
  intervalMs: number;
  /** 首次启动延迟 ms；默认 0（立即） */
  initialDelayMs?: number;
  /** 抖动上限 ms：实际 interval / initialDelay 会在 [0, jitterMs) 随机加时 */
  jitterMs?: number;
  fn: JobFn;
  /** timer-registry label 前缀，默认 `sched:<name>` */
  label?: string;
};

type JobState = {
  spec: JobSpec;
  running: boolean;
  runCount: number;
  intervalHandle: ManagedHandle | null;
  initialHandle: ManagedHandle | null;
};

const _jobs = new Map<string, JobState>();

function applyJitter(ms: number, jitterMs: number | undefined): number {
  if (!jitterMs || jitterMs <= 0) return ms;
  return ms + Math.floor(Math.random() * jitterMs);
}

function labelFor(spec: JobSpec): string {
  return spec.label || `sched:${spec.name}`;
}

function safeRun(state: JobState): void {
  state.runCount += 1;
  try {
    const r = state.spec.fn({ name: state.spec.name, runCount: state.runCount });
    if (r && typeof (r as Promise<void>).catch === "function") {
      (r as Promise<void>).catch(() => {
        /* 任务自身异常不拖垮调度循环 */
      });
    }
  } catch {
    /* 同上 */
  }
}

/**
 * 注册并启动任务。同名已存在 → 先 stop 再覆盖。
 */
export function startJob(spec: JobSpec): boolean {
  if (!spec || typeof spec.name !== "string" || !spec.name) return false;
  if (!(spec.intervalMs > 0)) return false;
  if (typeof spec.fn !== "function") return false;

  stopJob(spec.name);

  const state: JobState = {
    spec,
    running: false,
    runCount: 0,
    intervalHandle: null,
    initialHandle: null,
  };
  _jobs.set(spec.name, state);

  const meta: ManagedTimerMeta = { label: labelFor(spec) };
  const intervalMs = applyJitter(spec.intervalMs, spec.jitterMs);

  const armInterval = () => {
    if (!state.running) return;
    state.intervalHandle = setManagedInterval(() => {
      if (!state.running) return;
      safeRun(state);
    }, intervalMs, meta);
  };

  const initialDelay = applyJitter(spec.initialDelayMs || 0, spec.jitterMs);
  state.running = true;

  if (initialDelay <= 0) {
    safeRun(state);
    armInterval();
  } else {
    state.initialHandle = setManagedTimeout(() => {
      state.initialHandle = null;
      if (!state.running) return;
      safeRun(state);
      armInterval();
    }, initialDelay, meta);
  }
  return true;
}

/** alias：register 只登记不启动 — 本实现 start 即 register，保留别名语义 */
export const registerJob = startJob;

export function stopJob(name: string): boolean {
  const state = _jobs.get(name);
  if (!state) return false;
  state.running = false;
  if (state.intervalHandle) {
    clearManaged(state.intervalHandle);
    state.intervalHandle = null;
  }
  if (state.initialHandle) {
    clearManaged(state.initialHandle);
    state.initialHandle = null;
  }
  _jobs.delete(name);
  return true;
}

export function restartJob(spec: JobSpec): boolean {
  stopJob(spec.name);
  return startJob(spec);
}

export function isJobRunning(name: string): boolean {
  const s = _jobs.get(name);
  return !!(s && s.running);
}

export function listJobs(): Array<{ name: string; running: boolean; runCount: number; intervalMs: number }> {
  return [..._jobs.values()].map((s) => ({
    name: s.spec.name,
    running: s.running,
    runCount: s.runCount,
    intervalMs: s.spec.intervalMs,
  }));
}

export function stopAllJobs(): number {
  const names = [..._jobs.keys()];
  for (const n of names) stopJob(n);
  return names.length;
}

/** @internal — tests */
export function __resetForTest(): void {
  stopAllJobs();
}

module.exports = {
  startJob,
  registerJob,
  stopJob,
  restartJob,
  isJobRunning,
  listJobs,
  stopAllJobs,
  __resetForTest,
};
