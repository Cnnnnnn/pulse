/**
 * src/renderer/worldcup/navStore.js
 *
 * v2.9.0 世界杯专栏 — renderer 端 nav state (2 signal)
 *
 * 拍 6.4 + 6.5: navCollapsed + activeNav
 * 跟 6.6 一致: 完全独立, 不放 v2.6 主体 store
 */

import { signal } from "@preact/signals";
import { trackFundView, trackIthomeView } from "../recent/track.js";

// activeNav: 'ithome' | 'wechat-hot' | 'worldcup' | 'funds' | 'metals' | 'ai-usage' | 'versions', 默认 'versions'
export const activeNav = signal("versions");
export const navCollapsed = signal(false);

const NAV_KEYS = new Set(["ithome", "wechat-hot", "worldcup", "funds", "metals", "ai-usage", "versions"]);

export function setActiveNav(key) {
  if (!NAV_KEYS.has(key)) return;
  const prev = activeNav.value;
  activeNav.value = key;
  if (key === "funds" && prev !== "funds") {
    trackFundView();
  }
  if (key === "ithome" && prev !== "ithome") {
    trackIthomeView();
  }
}

export function toggleNavCollapsed() {
  navCollapsed.value = !navCollapsed.value;
}
