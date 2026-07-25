/**
 * src/detectors/circuit-breaker-storage.ts
 *
 * Persist circuit breaker state to state.json via the existing
 * patchState() pattern (see state-store.js).
 *
 * Storage shape:
 *   state.json.circuitBreakers = { "<detType>:<identifier>": <BreakerSnapshot> }
 *
 * Snapshot is the breaker object minus the `_now` function (not serializable).
 */

// ponytail: state-store 还在 Phase 7 7a-6 (main/) ESM-ify, 这里 CJS-only.
// 保留 require() 让 ESM 模块图继续把 state-store 当 any — 解 type 兼容性.
const stateStore = require("../main/state-store.js");

async function loadBreakers() {
  const state = stateStore.load() || {};
  return (state && state.circuitBreakers && typeof state.circuitBreakers === 'object')
    ? state.circuitBreakers
    : {};
}

async function saveBreakers(breakers: any) {
  return stateStore.patchState((next: any) => {
    next.circuitBreakers = breakers;
    return next;
  });
}

async function upsertBreaker(key: any, snapshot: any) {
  const current = await loadBreakers();
  const next = { ...current, [key]: snapshot };
  return saveBreakers(next);
}

async function getBreaker(key: any) {
  const all = await loadBreakers();
  return all[key];
}

async function removeBreaker(key: any) {
  const all = await loadBreakers();
  if (!(key in all)) return;
  delete all[key];
  return saveBreakers(all);
}

export function snapshot(breaker: any) {
  // strip non-serializable fields
  const { _now, ...rest } = breaker;
  return rest;
}

export function hydrate(snapshot: any, now: any) {
  return {
    ...snapshot,
    _now: now || (() => Date.now()),
  };
}



export { loadBreakers, saveBreakers, upsertBreaker, getBreaker, removeBreaker };