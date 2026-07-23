/**
 * src/main/bootstrap/state-init.js
 *
 * Phase Q8: wire state recovery at startup.
 *
 * - Call loadOrRecover() once when state-store paths are resolved (after
 *   app.whenReady), so any corrupt file is backed up and the recovery event
 *   is in memory before any other module reads state.
 * - Expose a function the bootstrap code calls to take the event after the
 *   window is ready. Consume-once semantics prevent re-push.
 */

const stateStore = require("../state-store");

let _initialized = false;

/**
 * Phase Q8: call once at app.whenReady, after initStateStorePaths().
 * Runs loadOrRecover eagerly so the side-effect (backup + event record)
 * happens at startup, even if the renderer never connects.
 */
function initStateRecovery() {
  if (_initialized) return;
  _initialized = true;
  try {
    stateStore.loadOrRecover();
  } catch (err) {
    // Best-effort: recovery init failure must not block app startup.
    // state-store.loadOrRecover only rethrows non-corruption errors;
    // log them but let the app continue with whatever state is available.
    const { mainLog } = require("../log.ts");
    mainLog.warn(`[state-init] loadOrRecover threw: ${err && err.message}`);
  }
}

/**
 * Phase Q8: consume-once accessor for the recovery event.
 * Returns the event (and clears it) or null. Caller is responsible for
 * pushing it to the renderer via sendToRenderer.
 */
function takeRecoveryEvent() {
  return stateStore.getLastRecoveryEvent();
}

module.exports = { initStateRecovery, takeRecoveryEvent };
