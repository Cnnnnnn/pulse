/**
 * src/renderer/worldcup/navStore.js
 *
 * v2.9.0 世界杯专栏 — renderer 端 nav state (2 signal)
 *
 * 拍 6.4 + 6.5: navCollapsed + activeNav
 * 跟 6.6 一致: 完全独立, 不放 v2.6 主体 store
 *
 * Phase v1: 加 effect — activeNav 被 prefs 关掉时自动切到第一个可见 nav
 *   (4 个动态 nav: versions/ai-usage/worldcup/metals 跟 tray menu prefs 联动).
 *   3 个固定 nav (ithome/wechat-hot/funds) 始终可见,兜底保险.
 */

import { effect, signal } from "@preact/signals";
import { trackFundView, trackIthomeView } from "../recent/track.js";
import { trayMenuPrefs } from "../trayConfigStore.js";
import { clearFundNavBadge } from "../funds/fundStore.js";
import { clearAiUsageNavBadge } from "../store/ai-usage-store.js";
import { clearWechatHotUnreadBadge } from "../wechat-hot/store.js";
import { api } from "../api.js";

// activeNav: 'home' | 'ithome' | 'wechat-hot' | 'worldcup' | 'funds' | 'metals' | 'stocks' | 'ai-usage' | 'versions'
// 默认 'home' — 无历史 → 显示 HomeGrid. bootstrap 拿到上次落点后会在 render 前覆盖.
// stock-detail (Phase 32) 已合并到选股 tab 顶栏入口, 不再独立 nav.
// P-N: 无历史 → 显示 HomeGrid. bootstrap 拿到上次落点后会在 render 前覆盖.
export const activeNav = signal("home");
export const navCollapsed = signal(false);

const NAV_KEYS = new Set([
  "home",            // P-N: Home 首屏 (grid)
  "ithome",
  "wechat-hot",
  "worldcup",
  "funds",
  "metals",
  "stocks",
  "ai-usage",
  "versions",
]);

// Phase I3: 数组版 (供 sidenav-prefs 持久化 order 用)
export const NAV_KEYS_LIST = [
  "ithome",
  "wechat-hot",
  "worldcup",
  "funds",
  "metals",
  "stocks",
  "ai-usage",
  "versions",
];

// P-N: HomeGrid 落点白名单 — "home" 是显示态, 不落盘.
// 跟 NAV_KEYS 的区别: NAV_KEYS 是 activeNav 全部合法值, 这里只挑出可持久化的 8 顶级 nav.
export const PERSISTABLE_NAV_KEYS = new Set([
  "ithome", "wechat-hot", "worldcup", "funds",
  "metals", "stocks", "ai-usage", "versions",
]);

/**
 * Phase I3: 计算"实际可见"nav 列表
 * - prefs.order 优先, 按顺序排
 * - 排除 prefs.hidden
 * - 排除未知 key (防御)
 * - 不在 prefs.order 里的已知 key 追加到末尾
 * @param {{order?: string[], hidden?: string[]} | null} prefs
 * @returns {string[]}
 */
export function effectiveVisibleItems(prefs) {
  const order =
    prefs && Array.isArray(prefs.order) && prefs.order.length > 0
      ? prefs.order.filter((k) => NAV_KEYS.has(k))
      : NAV_KEYS_LIST.slice();
  const hidden = new Set(
    prefs && Array.isArray(prefs.hidden) ? prefs.hidden : [],
  );
  const out = [];
  for (const k of order) {
    if (!hidden.has(k)) out.push(k);
  }
  // 兜底: prefs.order 漏掉的已知 key 追加到末尾
  for (const k of NAV_KEYS_LIST) {
    if (!out.includes(k) && !hidden.has(k)) out.push(k);
  }
  return out;
}

// 跟 src/renderer/components/SideNav.jsx 的 NAV_TO_PREFS_SEGMENT 保持一致.
// nav key → prefs segment key. 不在 map 里的 nav 始终可见.
const NAV_TO_PREFS_SEGMENT = {
  versions: "updates",
  "ai-usage": "ai_usage",
  worldcup: "worldcup",
  metals: "metals",
};

function isNavVisible(key, prefs) {
  const segKey = NAV_TO_PREFS_SEGMENT[key];
  if (!segKey) return true;
  if (!prefs || !prefs.segments) return true;
  return prefs.segments[segKey] !== false;
}

/**
 * 当前 activeNav 被关掉时, 切到第一个可见 panel.
 * 注意: 只考虑 PERSISTABLE_NAV_KEYS (8 顶级 panel), 跳过 "home" —
 * HomeGrid 是显示态而不是 panel, tray prefs 不应该把用户弹到 HomeGrid.
 * 不可见列表 (activeNav 不可见 + 没有其他可见 nav) 时不动 (极端兜底, 不会发生因为有 3 个固定 tab).
 */
function firstVisibleNav(prefs) {
  for (const k of PERSISTABLE_NAV_KEYS) {
    if (isNavVisible(k, prefs)) return k;
  }
  return activeNav.value; // 兜底: 全部不可见时停留
}

let _navWatchInstalled = false;
export function installNavWatch() {
  if (_navWatchInstalled) return;
  _navWatchInstalled = true;
  effect(() => {
    const prefs = trayMenuPrefs.value;
    const cur = activeNav.value;
    if (isNavVisible(cur, prefs)) return;
    const next = firstVisibleNav(prefs);
    if (next !== cur) {
      activeNav.value = next;
    }
  });
}

export function setActiveNav(key) {
  if (!NAV_KEYS.has(key)) return;
  const prev = activeNav.value;
  activeNav.value = key;
  if (key === "funds" && prev !== "funds") {
    trackFundView();
    clearFundNavBadge();
  }
  if (key === "ai-usage" && prev !== "ai-usage") {
    clearAiUsageNavBadge();
  }
  if (key === "ithome" && prev !== "ithome") {
    trackIthomeView();
  }
  // I6 v2: wechat-hot 切到该 tab 时清未读角标 (对标 funds/ai-usage)
  if (key === "wechat-hot" && prev !== "wechat-hot") {
    clearWechatHotUnreadBadge();
  }
  // P-N HomeGrid 落点: 仅持久化 8 顶级 nav, "home" 不写盘.
  // ponytail: 同步路径做过白名单过滤, home 是显示态, 不写盘.
  // 写盘失败仅 console.warn, 不阻断 UI.
  if (key !== "home" && PERSISTABLE_NAV_KEYS.has(key)) {
    if (typeof api?.saveLastActiveNav === "function") {
      api.saveLastActiveNav(key).catch(() => { /* noop */ });
    }
  }
}

export function toggleNavCollapsed() {
  navCollapsed.value = !navCollapsed.value;
}
