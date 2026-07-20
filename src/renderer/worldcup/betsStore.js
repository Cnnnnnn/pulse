/**
 * src/renderer/worldcup/betsStore.js
 *
 * v2.10.0 世界杯体彩 — renderer signals + actions
 *
 * 沿用 worldcup/store.js 的 signal 风格 (preact/signals).
 * API 走 window.api (跟 worldcup/store.js 一致, 不走 src/renderer/api.js).
 */

import { signal } from "@preact/signals";
import { getApi, requireApiMethod, wrapIpc } from "../store/store-utils.js";

export const worldcupBets = signal({}); // { [date]: { date, stake, pnl, note, updatedAt } }
export const betsLoaded = signal(false);

export async function loadWorldcupBets() {
  const loadBets = requireApiMethod("worldcupLoadBets");
  if (!loadBets) return false;
  return wrapIpc(
    async () => {
      const r = await loadBets();
      if (r && r.ok) {
        worldcupBets.value = r.worldcupBets || {};
        betsLoaded.value = true;
        return true;
      }
      return false;
    },
    { label: "[betsStore] loadWorldcupBets failed", fallback: false },
  );
}

export async function upsertWorldcupBet({ date, stake, pnl, note = "" }) {
  const upsert = requireApiMethod("worldcupUpsertBet");
  if (!upsert) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await upsert({ date, stake, pnl, note });
    if (r && r.ok) {
      worldcupBets.value = {
        ...worldcupBets.value,
        [date]: r.entry,
      };
      return { ok: true };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

export async function removeWorldcupBet(date) {
  const remove = requireApiMethod("worldcupRemoveBet");
  if (!remove) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await remove(date);
    if (r && r.ok) {
      const next = { ...worldcupBets.value };
      delete next[date];
      worldcupBets.value = next;
      return { ok: true };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "threw" };
  }
}

/**
 * 纯函数: 从 betsMap + allDates 求聚合
 * @param {Object} betsMap
 * @param {string[]} allDates - YYYY-MM-DD[]
 * @returns {{ totalStake: number, totalPnl: number, filled: number, unfilled: number, roi: number|null }}
 */
export function computeBetsStats(betsMap, allDates) {
  const dates = Array.isArray(allDates) ? allDates : [];
  let totalStake = 0;
  let totalPnl = 0;
  let filled = 0;
  for (const d of dates) {
    const e = betsMap && betsMap[d];
    if (e && typeof e.stake === "number" && typeof e.pnl === "number") {
      totalStake += e.stake;
      totalPnl += e.pnl;
      filled += 1;
    }
  }
  const unfilled = dates.length - filled;
  const roi = totalStake > 0 ? totalPnl / totalStake : null;
  return { totalStake, totalPnl, filled, unfilled, roi };
}
