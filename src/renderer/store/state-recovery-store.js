/**
 * src/renderer/store/state-recovery-store.js
 *
 * Phase Q8: signal exposed for the StateRecoveredBanner. Set by the bootstrap
 * IPC subscription in src/renderer/index.jsx when main pushes `state:recovered`.
 */
export { stateRecoveredSignal } from "../components/StateRecoveredBanner.jsx";