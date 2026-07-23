/**
 * src/main/bootstrap/error-init.ts
 *
 * Phase Q6: wire process-level error listeners into the aggregator.
 *
 * Exports:
 *   initErrorCapture({ logsDir, retentionDays, sendToRenderer })
 *
 * Returns the aggregator instance so other modules (IPC handlers) can use it.
 *
 * After each append, an optional sendToRenderer(channel, payload) callback is
 * invoked with channel "error:appended" + the new entry so live UIs (the
 * DiagnosticsDrawer) can refresh without a manual reopen.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type * as pathType from "node:path";

const path: typeof pathType = require('path');
const { createAggregator } = require('../error-aggregator');

let _instance = null;

function initErrorCapture(opts: {
  logsDir?: string;
  retentionDays?: number;
  sendToRenderer?: ((channel: string, payload: unknown) => void) | null;
} = {}) {
  if (_instance) return _instance;
  const logsDir = opts.logsDir || path.join(process.env.HOME || '', 'Library', 'Application Support', 'pulse', 'logs');
  const retentionDays = typeof opts.retentionDays === 'number' ? opts.retentionDays : 30;
  const sendToRenderer = typeof opts.sendToRenderer === 'function' ? opts.sendToRenderer : null;
  const agg = createAggregator({ logsDir, retentionDays });

  function notify(entry) {
    if (sendToRenderer) {
      try {
        sendToRenderer('error:appended', { id: entry.id, ts: entry.ts, level: entry.level, source: entry.source });
      } catch { /* swallow */ }
    }
  }

  process.on('uncaughtException', (err) => {
    try {
      agg.append({
        source: 'main',
        level: 'unhandled',
        message: err && err.message || String(err),
        stack: err && err.stack || '',
        context: { kind: 'uncaughtException' },
      }).then(notify).catch(() => {});
    } catch { /* swallow */ }
  });

  process.on('unhandledRejection', (reason) => {
    try {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      agg.append({
        source: 'main',
        level: 'unhandled',
        message: err.message,
        stack: err.stack || '',
        context: { kind: 'unhandledRejection' },
      }).then(notify).catch(() => {});
    } catch { /* swallow */ }
  });

  agg.cleanup().catch(() => {});

  _instance = { aggregator: agg, sendToRenderer };
  return _instance;
}

function getInstance() {
  return _instance;
}

function __resetForTest() {
  _instance = null;
}

module.exports = { initErrorCapture, getInstance, __resetForTest };
