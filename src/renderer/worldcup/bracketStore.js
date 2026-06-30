/**
 * src/renderer/worldcup/bracketStore.js
 *
 * v1 淘汰赛对阵 - renderer signal store
 *
 * Signals:
 *   worldcupBracket       - BracketSnapshot | null (cached from main)
 *   bracketComputing      - boolean (true while IPC in-flight)
 *   bracketError          - string | null (last error reason)
 *   bracketLastComputedAt - number | null (Date.now() of last successful compute)
 *
 * Functions:
 *   loadBracket()              - pull cached snapshot (no IPC compute)
 *   computeBracket({force?})   - IPC call to main, write snapshot
 *   clearBracketError()        - reset error signal
 */

import { signal } from "@preact/signals";

export const worldcupBracket = signal(null);
export const bracketComputing = signal(false);
export const bracketError = signal(null);
export const bracketLastComputedAt = signal(null);

// 30s 节流: 进入 bracket tab 时会自动 compute, 但短时间内多次进 tab
// (例如 切到赛程→切回 bracket) 不应触发重复 IPC.
const AUTO_COMPUTE_THROTTLE_MS = 30_000;
let lastAutoComputeAt = 0;

/**
 * Pull cached bracket snapshot from state.json (via main process).
 * @returns {Promise<boolean>} true if a snapshot was loaded
 */
export async function loadBracket() {
  try {
    if (
      typeof window === "undefined" ||
      !window.api ||
      typeof window.api.worldcupLoadBracket !== "function"
    ) {
      return false;
    }
    const r = await window.api.worldcupLoadBracket();
    if (!r || !r.ok) return false;
    worldcupBracket.value = r.snapshot || null;
    if (r.snapshot && typeof r.snapshot.computedAt === "number") {
      bracketLastComputedAt.value = r.snapshot.computedAt;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Trigger main-process to recompute bracket; write result to signal.
 * Without `force`, throttle to AUTO_COMPUTE_THROTTLE_MS so quick re-mounts
 * (e.g. tab switches) don't hammer the IPC.
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<boolean>} true on success, false if throttled or failed
 */
export async function computeBracket(opts = {}) {
  if (bracketComputing.value) return false;
  const force = opts.force === true;
  const now = Date.now();
  if (!force && now - lastAutoComputeAt < AUTO_COMPUTE_THROTTLE_MS) {
    return false;
  }
  bracketComputing.value = true;
  bracketError.value = null;
  try {
    if (
      typeof window === "undefined" ||
      !window.api ||
      typeof window.api.worldcupComputeBracket !== "function"
    ) {
      bracketError.value = "IPC 不可用";
      return false;
    }
    const r = await window.api.worldcupComputeBracket(opts);
    if (!r || !r.ok) {
      bracketError.value = (r && r.reason) || "计算失败";
      return false;
    }
    worldcupBracket.value = r.snapshot || null;
    bracketLastComputedAt.value = r.snapshot && typeof r.snapshot.computedAt === "number"
      ? r.snapshot.computedAt
      : Date.now();
    lastAutoComputeAt = bracketLastComputedAt.value;
    return true;
  } catch (err) {
    bracketError.value = (err && err.message) || "计算异常";
    return false;
  } finally {
    bracketComputing.value = false;
  }
}

/** Reset the error signal (used by refresh button). */
export function clearBracketError() {
  bracketError.value = null;
}

/**
 * v2.51: 比分变化后尝试自动重算 bracket (让对阵图实时反映晋级 + 实时比分).
 * 复用 computeBracket 的 30s 节流 — 60s 比分 sweep + 30s 节流 = 不会重复算.
 *
 * 仅当当前 tab 是 bracket 或用户曾看过 bracket (worldcupBracket 有值) 时才重算,
 * 避免用户在赛程 tab 时白跑 IPC. force=false 让节流生效.
 */
export async function tryAutoRecompute() {
  // 只在有 cached snapshot (用户进过 bracket tab) 时重算, 否则跳过
  if (!worldcupBracket.value) return false;
  return computeBracket({ force: false });
}
