/**
 * src/shared/electron/log-adapter.d.ts
 *
 * Adapter type surface for src/main/log.js — the main-process logger used by
 * detector / bootstrap / boot path.
 *
 * ponytail: 1:1 mirrors the existing module.exports public surface. Business-
 *           side callers (`@main/...` modules) consume this interface only;
 *           the underlying logger file I/O is fully encapsulated. Internal
 *           helpers (`nowIso`, `nowIsoSpaced`, `formatLine`, `flattenMeta`,
 *           `writeLine`) are NOT re-exported here — keep them encapsulated.
 *           If callers later need a structured k=v writer for a custom
 *           stream (e.g. worker → main pipe log) the upgrade path is to add
 *           a dedicated method to the underlying module first; do not widen
 *           this adapter speculatively.
 */

export type LogLevel = "INFO" | "DEBUG" | "WARN" | "ERROR";

/**
 * Tag-prefixed logger instance. `tag` and `file` let the caller disambiguate
 * startup vs. detect at the line prefix; `_write` and `event` expose the
 * internal raw writer for worker-side forwarding.
 */
export interface Logger {
  readonly tag: string;
  readonly file: string;
  readonly dir: string;
  debug(text: string, meta?: Record<string, unknown>): void;
  info(text: string, meta?: Record<string, unknown>): void;
  warn(text: string, meta?: Record<string, unknown>): void;
  error(text: string, meta?: Record<string, unknown>): void;
  _write(level: LogLevel | string, text: string, meta?: Record<string, unknown>): void;
  event(meta: Record<string, unknown>): void;
}

export interface LogAdapter {
  createLogger(tag: string): Logger;
  resolveLogDir(): string;
  isDebug(): boolean;
  readonly mainLog: Logger;
  readonly detectLog: Logger;
}
