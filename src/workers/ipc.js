/**
 * src/workers/ipc.js
 *
 * Worker → main 进程 IPC helpers. postMessage 包装, parent 死时 swallow.
 */

const { parentPort, workerData } = require("worker_threads");

const ARCH =
  (workerData && workerData.arch) ||
  (process.arch === "arm64" ? "arm64" : "x64");

function makePostMessageLogger() {
  function send(level, text, meta) {
    try {
      parentPort.postMessage({ type: "log", level, text, meta: meta || null });
    } catch {
      /* parent dead — ignore */
    }
  }
  return {
    debug: (t, m) => send("DEBUG", t, m),
    info: (t, m) => send("INFO", t, m),
    warn: (t, m) => send("WARN", t, m),
    error: (t, m) => send("ERROR", t, m),
  };
}

function sendProgress(payload) {
  try {
    parentPort.postMessage({ type: "progress", payload });
  } catch {
    /* noop */
  }
}

function sendResult(payload) {
  try {
    parentPort.postMessage({ type: "result", payload });
  } catch {
    /* noop */
  }
}

function sendError(message) {
  try {
    parentPort.postMessage({ type: "error", message });
  } catch {
    /* noop */
  }
}

function postLog(level, text, meta) {
  try {
    parentPort.postMessage({ type: "log", level, text, meta: meta || null });
  } catch {
    /* noop */
  }
}

module.exports = {
  ARCH,
  makePostMessageLogger,
  sendProgress,
  sendResult,
  sendError,
  postLog,
};
