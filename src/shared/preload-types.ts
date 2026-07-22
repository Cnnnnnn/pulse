/**
 * Shared base types reused across every contextBridge surface in `preload.ts`.
 *
 * This file holds *only* cross-bridge primitives (callback + unsubscribe +
 * platform info). It deliberately does not mirror the full payload shape of
 * every IPC handler — callers describe the data they need at the call site,
 * not here.
 */

/** Listener callback invoked by `ipcRenderer.on(...)` bridges. */
export type Callback<T = unknown> = (data: T) => void;

/** Cleanup function returned by listener bridges; safe to ignore. */
export type Unsubscribe = () => void;

/** A minimal subset of `process.platform` exposed to the renderer. */
export interface PlatformInfo {
  platform: NodeJS.Platform;
}
