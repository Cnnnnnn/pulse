/**
 * src/detectors/circuit-breaker-storage.js
 *
 * Persist circuit breaker state to state.json via the existing
 * patchState() pattern (see state-store.js).
 *
 * Storage shape:
 *   state.json.circuitBreakers = { "<detType>:<identifier>": <BreakerSnapshot> }
 *
 * Snapshot is the breaker object minus the `_now` function (not serializable).
 */

const stateStore = require('../main/state-store.js');

async function loadBreakers() {
  const state = stateStore.load() || {};
  return (state && state.circuitBreakers && typeof state.circuitBreakers === 'object')
    ? state.circuitBreakers
    : {};
}

async function saveBreakers(breakers) {
  return stateStore.patchState((next) => {
    next.circuitBreakers = breakers;
    return next;
  });
}

async function upsertBreaker(key, snapshot) {
  const current = await loadBreakers();
  const next = { ...current, [key]: snapshot };
  return saveBreakers(next);
}

async function getBreaker(key) {
  const all = await loadBreakers();
  return all[key];
}

async function removeBreaker(key) {
  const all = await loadBreakers();
  if (!(key in all)) return;
  delete all[key];
  return saveBreakers(all);
}

function snapshot(breaker) {
  // strip non-serializable fields
  const { _now, ...rest } = breaker;
  return rest;
}

function hydrate(snapshot, now) {
  return {
    ...snapshot,
    _now: now || (() => Date.now()),
  };
}

module.exports = {
  loadBreakers,
  saveBreakers,
  upsertBreaker,
  getBreaker,
  removeBreaker,
  snapshot,
  hydrate,
};
