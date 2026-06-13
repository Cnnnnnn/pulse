/**
 * src/renderer/store/category-mute-store.js
 *
 * Active category tab + Mutes + Last-opened (per-app 状态).
 * 走 IPC 跟 state.json 同步.
 */

import { signal } from "@preact/signals";
import { taggedLog } from "../log.js";

const log = taggedLog("[store]");

export const activeCategory = signal("all");
export const mutedApps = signal(new Map());
export const lastOpenedApps = signal(new Map());

export function isMuted(name, now) {
  if (!name) return false;
  const m = mutedApps.value.get(name);
  if (!m) return false;
  const t = typeof now === "number" ? now : Date.now();
  if (!m.until) return true;
  return t < m.until;
}

export function getLocalTier(lastMs, now) {
  if (lastMs == null || typeof lastMs !== "number") return "unknown";
  const t = typeof now === "number" ? now : Date.now();
  if (t < lastMs) return "unknown";
  const ageDays = (t - lastMs) / 86400_000;
  if (ageDays <= 7) return "hot";
  if (ageDays <= 30) return "warm";
  return "cold";
}

export async function setMute(name, durationSec) {
  if (!name || typeof name !== "string")
    return { ok: false, reason: "invalid_name" };
  if (
    typeof durationSec !== "number" ||
    !Number.isFinite(durationSec) ||
    durationSec < 0
  ) {
    return { ok: false, reason: "invalid_duration" };
  }
  const { api } = await import("../api.js");
  const r = await api.setMute(name, durationSec);
  if (r && r.ok && r.mutes) {
    const next = new Map();
    for (const [k, v] of Object.entries(r.mutes)) next.set(k, v);
    mutedApps.value = next;
    return { ok: true };
  }
  return { ok: false, reason: (r && r.reason) || "threw" };
}

export async function clearMute(name) {
  if (!name || typeof name !== "string")
    return { ok: false, reason: "invalid_name" };
  const { api } = await import("../api.js");
  const r = await api.clearMute(name);
  if (r && r.ok && r.mutes) {
    const next = new Map();
    for (const [k, v] of Object.entries(r.mutes)) next.set(k, v);
    mutedApps.value = next;
    return { ok: true };
  }
  return { ok: false, reason: (r && r.reason) || "threw" };
}

export async function loadMutes() {
  const { api } = await import("../api.js");
  try {
    const r = await api.getMutes();
    const mutes = (r && r.mutes) || {};
    const next = new Map();
    for (const [k, v] of Object.entries(mutes)) next.set(k, v);
    mutedApps.value = next;
    return mutes;
  } catch {
    mutedApps.value = new Map();
    return {};
  }
}

export async function loadLastOpened() {
  const { api } = await import("../api.js");
  try {
    const r = await api.getLastOpened();
    const lo = (r && r.lastOpened) || {};
    const next = new Map();
    for (const [k, v] of Object.entries(lo)) next.set(k, v);
    lastOpenedApps.value = next;
    return lo;
  } catch {
    lastOpenedApps.value = new Map();
    return {};
  }
}

export async function refreshLastOpened() {
  const { api } = await import("../api.js");
  try {
    return await api.refreshLastOpened();
  } catch {
    return { ok: false, count: 0 };
  }
}

export function setActiveCategory(id) {
  if (typeof id !== "string" || id.length === 0) {
    log.warn("setActiveCategory: id must be non-empty string, got", id);
    return;
  }
  activeCategory.value = id;
  import("../api.js").then(({ api }) => {
    if (api && typeof api.saveActiveCategory === "function") {
      const p = api.saveActiveCategory(id);
      if (p && typeof p.then === "function") {
        p.then(
          () => {},
          (err) => {
            log.warn("saveActiveCategory failed:", err && err.message);
          },
        );
      }
    }
  });
}

export async function loadActiveCategory() {
  const { api } = await import("../api.js");
  try {
    const r = await api.getActiveCategory();
    const saved = (r && r.activeCategory) || "all";
    if (typeof saved === "string" && saved.length > 0) {
      activeCategory.value = saved;
    }
    return activeCategory.value;
  } catch {
    return "all";
  }
}
