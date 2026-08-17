/**
 * src/renderer/diagnostics/diagnostics-store.ts
 *
 * Phase Q6: signals for the diagnostics drawer.
 */
import { signal } from "@preact/signals";
import {
  beginDataRequest,
  createDataState,
  rejectData,
  resolveData,
  type DataState,
} from "../../shared/data-state.ts";
import type {
  DiagnosticsFetchResponse,
  DiagnosticsSamplesResponse,
  ErrorEntriesResponse,
  ErrorEntry,
  ErrorStats,
} from "../../shared/ipc-contracts.ts";

export const diagnosticsDrawerOpen = signal(false);
export function openDiagnosticsDrawer(open: any = 0) {
  diagnosticsDrawerOpen.value = Boolean(open);
}
export function toggleDiagnosticsDrawer() {
  diagnosticsDrawerOpen.value = !diagnosticsDrawerOpen.value;
}
export const errorEntries = signal([]);
export const errorStats = signal({ total: 0, byLevel: {}, skipped: 0 });
export const errorLoading = signal(false);
export const errorDataState = signal<DataState<{
  entries: ErrorEntry[];
  stats: ErrorStats;
}>>(
  createDataState({
    entries: [],
    stats: { total: 0, byLevel: {}, skipped: 0 },
  }),
);

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
export const diagnosticsDataState = signal<DataState<{
  startup: unknown;
  metrics: unknown;
  topFailures: unknown[];
  samples: unknown[];
}>>(
  createDataState({
    startup: null,
    metrics: { latest: null, peak: null, count: 0 },
    topFailures: [],
    samples: [],
  }),
);

export function beginErrorEntriesRequest(): void {
  errorLoading.value = true;
  errorDataState.value = beginDataRequest(errorDataState.value);
}

export function resolveErrorEntries(response: ErrorEntriesResponse): void {
  const entries = response.entries || [];
  const stats = response.stats || { total: 0, byLevel: {}, skipped: 0 };
  errorEntries.value = entries;
  errorStats.value = stats;
  errorDataState.value = resolveData(
    errorDataState.value,
    { entries, stats },
    { source: "live" },
  );
  errorLoading.value = false;
}

export function rejectErrorEntries(error: unknown): void {
  errorDataState.value = rejectData(errorDataState.value, error);
  errorLoading.value = false;
}

export function beginDiagnosticsRequest(): void {
  diagnosticsDiagnosticsLoading.value = true;
  diagnosticsDataState.value = beginDataRequest(diagnosticsDataState.value);
}

export function resolveDiagnosticsResponses(
  diagnosticsResponse: DiagnosticsFetchResponse | null | undefined,
  samplesResponse: DiagnosticsSamplesResponse | null | undefined,
): void {
  let updated = false;
  const data = diagnosticsDataState.value.data;
  let next = {
    startup: data.startup,
    metrics: data.metrics,
    topFailures: data.topFailures,
    samples: data.samples,
  };
  if (diagnosticsResponse && diagnosticsResponse.ok) {
    diagnosticsStartup.value = diagnosticsResponse.startup || null;
    diagnosticsMetrics.value =
      diagnosticsResponse.metrics || { latest: null, peak: null, count: 0 };
    diagnosticsTopFailures.value = diagnosticsResponse.topFailures || [];
    next = {
      ...next,
      startup: diagnosticsStartup.value,
      metrics: diagnosticsMetrics.value,
      topFailures: diagnosticsTopFailures.value,
    };
    updated = true;
  }
  if (samplesResponse && samplesResponse.ok) {
    diagnosticsSamples.value = samplesResponse.samples || [];
    next = { ...next, samples: diagnosticsSamples.value };
    updated = true;
  }
  if (updated) {
    diagnosticsDataState.value = resolveData(
      diagnosticsDataState.value,
      next,
      { source: "live" },
    );
  } else {
    diagnosticsDataState.value = rejectData(
      diagnosticsDataState.value,
      (diagnosticsResponse && (diagnosticsResponse.error || diagnosticsResponse.reason)) ||
        (samplesResponse && (samplesResponse.error || samplesResponse.reason)) ||
        "diagnostics_unavailable",
    );
  }
  diagnosticsDiagnosticsLoading.value = false;
}

export function rejectDiagnostics(error: unknown): void {
  diagnosticsDataState.value = rejectData(diagnosticsDataState.value, error);
  diagnosticsDiagnosticsLoading.value = false;
}
