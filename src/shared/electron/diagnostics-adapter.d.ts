/**
 * src/shared/electron/diagnostics-adapter.d.ts
 *
 * Adapter type surface for src/main/diagnostics.js — startup milestones +
 * metrics sampler.
 *
 * ponytail: 1:1 mirrors the existing public surface. Test-only symbols
 *           (`_resetForTest`, `_t0`, `_t0Perf`) are present because the .js
 *           exports them, but consume-side code should treat them as
 *           underscored-private. The metrics sampler uses a circular
 *           60-sample buffer; the upgrade path for longer retention is to
 *           widen SAMPLE_CAP in the .js first.
 */

export type StartupNowFn = () => number;

export type StartupSnapshot = {
  moduleLoadAt: number;
  bootstrapDoneAt: number | null;
  rendererReadyAt: number | null;
  readyMs: number | null;
  bootstrapMs: number | null;
};

export type MetricsSample = {
  ts: number;
  heapUsed: number;
  rss: number;
  external: number;
  arrayBuffers: number;
  cpuUser: number;
  cpuSystem: number;
  uptimeMs: number;
  cpuUserDeltaUs?: number;
  cpuSystemDeltaUs?: number;
};

export type MetricsPeak = {
  heapUsed: number;
  rss: number;
};

export type MetricsSummary = {
  latest: MetricsSample | null;
  peak: MetricsPeak | null;
  count: number;
};

export interface DiagnosticsAdapter {
  // milestones
  markBootstrapDone(now?: StartupNowFn): void;
  markRendererReady(now?: StartupNowFn): void;
  getStartup(): StartupSnapshot;
  // metrics sampler
  startMetricsSampler(intervalMs?: number): void;
  stopMetricsSampler(): void;
  getSamples(): MetricsSample[];
  getMetricsSummary(): MetricsSummary;
  readonly SAMPLE_CAP: number;
  _resetForTest(): void;
  readonly _t0: number;
  readonly _t0Perf: number;
}
