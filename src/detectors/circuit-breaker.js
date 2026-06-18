/**
 * src/detectors/circuit-breaker.js
 *
 * Pure circuit-breaker state machine for detector calls.
 *
 * State diagram:
 *
 *   closed --(threshold consecutive failures)--> open
 *   open   --(now >= openUntil)--> half_open  (probing)
 *   half_open --(success)--> closed
 *   half_open --(failure)--> open (new cooldown)
 *
 * All functions are pure: same input -> same output, no side effects.
 * Persistence is handled by `circuit-breaker-storage.js`.
 */

const STATE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
});

const DEFAULTS = Object.freeze({
  failureThreshold: 3,
  cooldownMs: 5 * 60 * 1000, // 5 minutes
});

function mergeConfig(config) {
  return { ...DEFAULTS, ...(config || {}) };
}

function createBreaker({ key, now = Date.now, config } = {}) {
  if (!key) throw new Error('circuit-breaker: key is required');
  return {
    key,
    state: STATE.CLOSED,
    consecutiveFailures: 0,
    openUntil: 0,
    lastFailureAt: 0,
    lastSuccessAt: 0,
    config: mergeConfig(config),
    _now: now,
  };
}

function shouldAllow(breaker, now) {
  if (breaker.state === STATE.CLOSED) return true;
  if (breaker.state === STATE.OPEN) {
    if (now >= breaker.openUntil) {
      return true;
    }
    return false;
  }
  if (breaker.state === STATE.HALF_OPEN) return true;
  return false;
}

function transitionAfterProbe(breaker, now) {
  if (breaker.state === STATE.OPEN && now >= breaker.openUntil) {
    return { ...breaker, state: STATE.HALF_OPEN };
  }
  return breaker;
}

function recordSuccess(breaker, now) {
  return {
    ...breaker,
    state: STATE.CLOSED,
    consecutiveFailures: 0,
    openUntil: 0,
    lastSuccessAt: now,
  };
}

function recordFailure(breaker, now, configOverride) {
  const cfg = configOverride
    ? mergeConfig(configOverride)
    : breaker.config;
  const failures = breaker.consecutiveFailures + 1;
  if (failures >= cfg.failureThreshold || breaker.state === STATE.HALF_OPEN) {
    return {
      ...breaker,
      state: STATE.OPEN,
      consecutiveFailures: failures,
      openUntil: now + cfg.cooldownMs,
      lastFailureAt: now,
      config: cfg,
    };
  }
  return {
    ...breaker,
    consecutiveFailures: failures,
    lastFailureAt: now,
    config: cfg,
  };
}

module.exports = {
  STATE,
  DEFAULTS,
  createBreaker,
  shouldAllow,
  transitionAfterProbe,
  recordSuccess,
  recordFailure,
};