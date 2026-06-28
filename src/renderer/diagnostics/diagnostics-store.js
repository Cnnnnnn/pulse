/**
 * src/renderer/diagnostics/diagnostics-store.js
 *
 * Phase Q6: signals for the diagnostics drawer.
 */
import { signal } from "@preact/signals";

export const diagnosticsDrawerOpen = signal(false);
export function openDiagnosticsDrawer(open = true) {
  diagnosticsDrawerOpen.value = Boolean(open);
}
export function toggleDiagnosticsDrawer() {
  diagnosticsDrawerOpen.value = !diagnosticsDrawerOpen.value;
}
export const errorEntries = signal([]);
export const errorStats = signal({ total: 0, byLevel: {}, skipped: 0 });
export const errorLoading = signal(false);

// Phase Q1 v2: 启动 + 性能 metrics + top-5 failures
export const diagnosticsStartup = signal(null); // { bootstrapMs, readyMs } 或 null
export const diagnosticsMetrics = signal({
  latest: null,
  peak: null,
  count: 0,
});
export const diagnosticsTopFailures = signal([]);
export const diagnosticsSamples = signal([]); // ring buffer (60 帧)
export const diagnosticsDiagnosticsLoading = signal(false);
export const diagnosticsExporting = signal(false);
export const diagnosticsLastExport = signal(null); // { path, sizeBytes, fileCount, ts } | null
