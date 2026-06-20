/**
 * src/main/bootstrap/error-init.js
 *
 * Phase Q6: wire process-level error listeners into the aggregator.
 *
 * Exports:
 *   initErrorCapture({ logsDir, retentionDays, sendToRenderer })
 *
 * Returns the aggregator instance so other modules (IPC handlers) can use it.
 */

const path = require('path');
const { createAggregator } = require('../error-aggregator');

let _instance = null;

function initErrorCapture(opts = {}) {
  if (_instance) return _instance;
  const logsDir = opts.logsDir || path.join(process.env.HOME || '', 'Library', 'Application Support', 'pulse', 'logs');
  const retentionDays = typeof opts.retentionDays === 'number' ? opts.retentionDays : 30;
  const agg = createAggregator({ logsDir, retentionDays });

  process.on('uncaughtException', (err) => {
    try {
      agg.append({
        source: 'main',
        level: 'unhandled',
        message: err && err.message || String(err),
        stack: err && err.stack || '',
        context: { kind: 'uncaughtException' },
      }).catch(() => {});
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
      }).catch(() => {});
    } catch { /* swallow */ }
  });

  agg.cleanup().catch(() => {});

  _instance = { aggregator: agg };
  return _instance;
}

function getInstance() {
  return _instance;
}

function __resetForTest() {
  _instance = null;
}

module.exports = { initErrorCapture, getInstance, __resetForTest };