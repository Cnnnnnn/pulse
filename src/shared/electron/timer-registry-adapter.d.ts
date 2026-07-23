/**
 * src/shared/electron/timer-registry-adapter.d.ts
 *
 * Adapter type surface for src/main/timer-registry.js.
 *
 * ponytail: 1:1 mirrors the existing public surface. The eight exported
 *           symbols (setManagedInterval / setManagedTimeout / clearManaged
 *           / clearAllManaged / auditTimers / getStats / listManaged /
 *           __resetForTest) are listed below. Internal helpers
 *           (collectTimerSites / siteHasCleanup / classifySite /
 *           logSiteKind) are intentionally NOT exported here — they are
 *           audit-pipeline internals; widen them only if a future caller
 *           (e.g. a manual audit tool) needs them, and add to the .js
 *           first.
 */

export type ManagedHandle = {
  id: number;
  clear(): void;
};

export type ManagedTimerMeta = {
  label?: string;
  file?: string;
  line?: number;
};

export type ManagedSiteSummary = {
  interval: number;
  timeout: number;
};

export type ManagedStats = {
  count: number;
  byType: ManagedSiteSummary;
};

export type ManagedEntrySnapshot = {
  id: number;
  type: "interval" | "timeout";
  label: string;
  file: string | null;
  line: number | null;
  startedAt: number;
};

export type AuditKind = "clean" | "orphan" | "debounce" | "dup-schedule";

export type AuditEntry = {
  file: string;
  line: number;
  code: string;
  var: string | null;
  ms: number | null;
  hasCleanup: boolean;
  kind: AuditKind;
};

export type AuditSummary = {
  total: number;
  clean: number;
  orphan: number;
  debounce: number;
  dupSchedule: number;
  entries: AuditEntry[];
  skipped: string[];
};

export type AuditLogger = {
  info(text: string): void;
  warn(text: string): void;
};

export type AuditOptions = {
  fixturesOnly?: boolean;
  logger?: AuditLogger;
};

export type TimerSiteList = Array<{
  file: string;
  line: number;
  code: string;
  var: string | null;
  ms: number | null;
  func: string;
}>;

export interface TimerRegistryAdapter {
  setManagedInterval(
    fn: () => void,
    ms: number,
    meta?: ManagedTimerMeta,
  ): ManagedHandle;
  setManagedTimeout(
    fn: () => void,
    ms: number,
    meta?: ManagedTimerMeta,
  ): ManagedHandle;
  clearManaged(handleOrId: ManagedHandle | { id: number }): boolean;
  clearAllManaged(labelPrefix?: string): number;
  auditTimers(rootDir: string, opts?: AuditOptions): AuditSummary;
  getStats(): ManagedStats;
  listManaged(): ManagedEntrySnapshot[];
  __resetForTest(): void;
}
