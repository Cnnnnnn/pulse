/**
 * tests/workers/result-builder.test.js
 *
 * result-builder.js — extractErrorMessage is the channel through which
 * AppInfo.jsx surfaces reasons in the subtitle. The base case is "last
 * trace entry's error string". Phase C1 (per-detector circuit breaker)
 * adds a new branch: when a detector was skipped because its breaker is
 * open, the trace contains { skipped: 'circuit_open', breakerState: 'open' }
 * instead of an `error` field. The UI should still get a human-readable
 * message so the user understands why the app shows no update.
 */
import { describe, it, expect } from 'vitest';
import { extractErrorMessage } from '../../src/workers/result-builder.js';

describe('extractErrorMessage', () => {
  it('returns versionUnknown message when versionUnknown is true', () => {
    const msg = extractErrorMessage([], null, true);
    expect(msg).toBe('已安装版本无法读取');
  });

  it('returns null when trace is empty and not versionUnknown', () => {
    expect(extractErrorMessage([], null, false)).toBeNull();
  });

  it('returns the last error from trace', () => {
    const trace = [
      { det: 'a', error: 'first error' },
      { det: 'b', error: 'second error' },
    ];
    expect(extractErrorMessage(trace, null, false)).toBe('second error');
  });

  // Phase C1: circuit_open
  it('returns a circuit-open message when trace has a skipped entry with skipped: "circuit_open"', () => {
    const trace = [
      { det: 'api_json', ms: 0, skipped: 'circuit_open', breakerState: 'open' },
    ];
    const msg = extractErrorMessage(trace, null, false);
    expect(msg).toBeTruthy();
    // Should mention "电路" / "熔断" / "5 分钟" so user understands
    expect(msg).toMatch(/电路|熔断|circuit|5\s*分钟|300\s*秒/);
  });

  it('prefers error over circuit_open (real error wins over skip)', () => {
    const trace = [
      { det: 'api_json', ms: 0, skipped: 'circuit_open', breakerState: 'open' },
      { det: 'api_json', error: 'connection refused' },
    ];
    // Iteration is from end, so 'connection refused' is found first
    expect(extractErrorMessage(trace, null, false)).toBe('connection refused');
  });
});
