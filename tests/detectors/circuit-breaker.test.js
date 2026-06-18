import { describe, it, expect } from 'vitest';
import {
  createBreaker,
  recordSuccess,
  recordFailure,
  shouldAllow,
  transitionAfterProbe,
  STATE,
} from '../../src/detectors/circuit-breaker.js';

const FIXED_NOW = 1_700_000_000_000;

describe('circuit-breaker state machine', () => {
  it('starts in closed state and allows requests', () => {
    const b = createBreaker({ key: 'x', now: () => FIXED_NOW });
    expect(b.state).toBe(STATE.CLOSED);
    expect(shouldAllow(b, FIXED_NOW)).toBe(true);
  });

  it('opens after threshold consecutive failures', () => {
    let b = createBreaker({ key: 'x', now: () => FIXED_NOW });
    for (let i = 0; i < 3; i++) {
      b = recordFailure(b, FIXED_NOW + i, { failureThreshold: 3 });
    }
    expect(b.state).toBe(STATE.OPEN);
    expect(b.openUntil).toBe(FIXED_NOW + 2 + 5 * 60 * 1000);
    expect(shouldAllow(b, FIXED_NOW + 1000)).toBe(false);
  });

  it('half-opens after cooldown elapses', () => {
    let b = createBreaker({ key: 'x', now: () => FIXED_NOW });
    for (let i = 0; i < 3; i++) {
      b = recordFailure(b, FIXED_NOW + i, { failureThreshold: 3 });
    }
    expect(b.state).toBe(STATE.OPEN);
    const justAfter = b.openUntil + 1;
    // shouldAllow is pure; transition is explicit via transitionAfterProbe
    expect(shouldAllow(b, justAfter)).toBe(true);
    b = transitionAfterProbe(b, justAfter);
    expect(b.state).toBe(STATE.HALF_OPEN);
  });

  it('half-open success closes the breaker', () => {
    let b = createBreaker({ key: 'x', now: () => FIXED_NOW });
    for (let i = 0; i < 3; i++) {
      b = recordFailure(b, FIXED_NOW + i, { failureThreshold: 3 });
    }
    const probeTime = b.openUntil + 1;
    b = transitionAfterProbe(b, probeTime);
    expect(b.state).toBe(STATE.HALF_OPEN);
    const closed = recordSuccess(b, probeTime);
    expect(closed.state).toBe(STATE.CLOSED);
    expect(closed.consecutiveFailures).toBe(0);
  });

  it('half-open failure re-opens with new cooldown', () => {
    let b = createBreaker({ key: 'x', now: () => FIXED_NOW });
    for (let i = 0; i < 3; i++) {
      b = recordFailure(b, FIXED_NOW + i, { failureThreshold: 3 });
    }
    const probeTime = b.openUntil + 1;
    b = transitionAfterProbe(b, probeTime);
    expect(b.state).toBe(STATE.HALF_OPEN);
    const reopened = recordFailure(b, probeTime + 1, { failureThreshold: 3 });
    expect(reopened.state).toBe(STATE.OPEN);
    expect(reopened.openUntil).toBeGreaterThan(b.openUntil);
  });

  it('success in closed state resets the counter', () => {
    let b = createBreaker({ key: 'x', now: () => FIXED_NOW });
    b = recordFailure(b, FIXED_NOW, { failureThreshold: 3 });
    b = recordFailure(b, FIXED_NOW + 1, { failureThreshold: 3 });
    b = recordSuccess(b, FIXED_NOW + 2);
    expect(b.consecutiveFailures).toBe(0);
    expect(b.state).toBe(STATE.CLOSED);
  });

  it('uses per-breaker configuration', () => {
    let b = createBreaker({ key: 'x', now: () => FIXED_NOW });
    b = recordFailure(b, FIXED_NOW, { failureThreshold: 5, cooldownMs: 1000 });
    b = recordFailure(b, FIXED_NOW + 1, { failureThreshold: 5, cooldownMs: 1000 });
    expect(b.state).toBe(STATE.CLOSED);
    b = recordFailure(b, FIXED_NOW + 2, { failureThreshold: 5, cooldownMs: 1000 });
    b = recordFailure(b, FIXED_NOW + 3, { failureThreshold: 5, cooldownMs: 1000 });
    b = recordFailure(b, FIXED_NOW + 4, { failureThreshold: 5, cooldownMs: 1000 });
    expect(b.state).toBe(STATE.OPEN);
    expect(b.openUntil).toBe(FIXED_NOW + 4 + 1000);
  });

  it('throws when key is missing', () => {
    expect(() => createBreaker()).toThrow(/key is required/);
    expect(() => createBreaker({ key: '' })).toThrow(/key is required/);
  });
});