/**
 * Cross-module data freshness contract.
 *
 * The state deliberately keeps the last usable value while a refresh is in
 * flight or has failed. Consumers can therefore distinguish an empty first
 * load from a stale-but-readable result without inventing another boolean.
 */

export type DataPhase = "idle" | "loading" | "ready" | "stale" | "error";
export type DataSource = "live" | "cache" | "sample" | "unknown";

export interface DataState<T> {
  phase: DataPhase;
  data: T;
  error: string | null;
  source: DataSource;
  fetchedAt: number;
  lastAttemptAt: number;
}

export interface ResolveDataOptions {
  source?: DataSource;
  fetchedAt?: number;
}

export function createDataState<T>(data: T): DataState<T> {
  return {
    phase: "idle",
    data,
    error: null,
    source: "unknown",
    fetchedAt: 0,
    lastAttemptAt: 0,
  };
}

export function beginDataRequest<T>(state: DataState<T>, now = Date.now()): DataState<T> {
  return {
    ...state,
    phase: "loading",
    error: null,
    lastAttemptAt: now,
  };
}

export function resolveData<T>(
  state: DataState<T>,
  data: T,
  options: ResolveDataOptions = {},
  now = Date.now(),
): DataState<T> {
  return {
    ...state,
    phase: "ready",
    data,
    error: null,
    source: options.source || "live",
    fetchedAt: options.fetchedAt || now,
    lastAttemptAt: now,
  };
}

export function rejectData<T>(
  state: DataState<T>,
  error: unknown,
  now = Date.now(),
): DataState<T> {
  const message = error instanceof Error ? error.message : String(error || "请求失败");
  return {
    ...state,
    // 有成功值时保留内容，并把失败标成 stale；首屏没有可用值才进入 error。
    phase: state.fetchedAt > 0 ? "stale" : "error",
    error: message,
    lastAttemptAt: now,
  };
}

export function hasUsableData<T>(state: DataState<T>): boolean {
  return (
    state.phase === "ready" ||
    state.phase === "stale" ||
    (state.phase === "loading" && state.fetchedAt > 0)
  );
}

export function isRefreshingWithData<T>(state: DataState<T>): boolean {
  return state.phase === "loading" && state.fetchedAt > 0;
}
