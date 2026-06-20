/**
 * src/renderer/error-reporting.js
 *
 * Phase Q6: install global error listeners that report to main.
 * Idempotent: call once at bootstrap.
 */
import { api } from './api.js';

let installed = false;

export function installErrorReporting() {
  if (installed) return;
  installed = true;

  function report(level, message, stack, extra) {
    try {
      if (typeof api.errorReport !== 'function') return;
      api.errorReport({
        level,
        message: message || 'unknown',
        stack: stack || '',
        context: { kind: 'window-error', ...(extra || {}) },
      });
    } catch { /* swallow */ }
  }

  window.addEventListener('error', (e) => {
    report(
      'error',
      (e.error && e.error.message) || e.message,
      (e.error && e.error.stack) || '',
      { filename: e.filename, lineno: e.lineno, colno: e.colno },
    );
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    if (reason instanceof Error) {
      report('unhandled', reason.message, reason.stack, { kind: 'unhandledrejection' });
    } else {
      report('unhandled', String(reason), '', { kind: 'unhandledrejection' });
    }
  });
}
