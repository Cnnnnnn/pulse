/**
 * src/workers/ipc.ts
 *
 * Worker → main 进程 IPC helpers. postMessage 包装, parent 死时 swallow.
 */

import { parentPort, workerData } from "worker_threads";

export const ARCH =
  (workerData && workerData.arch) ||
  (process.arch === "arm64" ? "arm64" : "x64");

export const PLATFORM =
  (workerData && workerData.platform) || process.platform;

export function makePostMessageLogger() {
  function send(level: any, text: any, meta: any) {
    try {
      parentPort.postMessage({ type: "log", level, text, meta: meta || null });
    } catch {
      /* parent dead — ignore */
    }
  }
  return {
    debug: (t: any, m: any) => send("DEBUG", t, m),
    info: (t: any, m: any) => send("INFO", t, m),
    warn: (t: any, m: any) => send("WARN", t, m),
    error: (t: any, m: any) => send("ERROR", t, m),
  };
}

export function sendProgress(payload: any) {
  try {
    parentPort.postMessage({ type: "progress", payload });
  } catch {
    /* noop */
  }
}

export function sendResult(payload: any) {
  try {
    parentPort.postMessage({ type: "result", payload });
  } catch {
    /* noop */
  }
}

export function sendError(message: any) {
  try {
    parentPort.postMessage({ type: "error", message });
  } catch {
    /* noop */
  }
}

export function postLog(level: any, text: any, meta: any) {
  try {
    parentPort.postMessage({ type: "log", level, text, meta: meta || null });
  } catch {
    /* noop */
  }
}

