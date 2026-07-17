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
 *   2 个固定 nav (news/funds) 始终可见, 兜底保险.
 *
 * 2026-07-10 P-N+: IT 新闻 + 微博热搜 合并成 'news' 单 nav, 页面内 sub-tab 切.
 */

import { effect, signal } from "@preact/signals";
import { trackFundView } from "../recent/track.js";
import { trayMenuPrefs } from "../trayConfigStore.js";
import { clearFundNavBadge } from "../funds/fundStore.js";
import { clearAiUsageNavBadge } from "../store/ai-usage-store.js";
import { clearWechatHotUnreadBadge } from "../wechat-hot/store.js";
import { clearIthomeUnreadBadge } from "../ithome/store.js";
import { api } from "../api.js";

// activeNav: 'home' | 'news' | 'worldcup' | 'invest' | 'ai-usage' | 'versions'
// 默认 'home' — 无历史 → 显示 HomeGrid. bootstrap 拿到上次落点后会在 render 前覆盖.
// stock-detail (Phase 32) 已合并到选股 tab 顶栏入口, 不再独立 nav.
// P-N: 无历史 → 显示 HomeGrid. bootstrap 拿到上次落点后会在 render 前覆盖.
// P-N+: 'news' 单 nav 合并 IT 新闻 + 微博热搜, 页面内 sub-tab 切.
// 投资 nav 合并: 'funds' / 'metals' / 'stocks' 合并为 'invest', investPrimary signal 驱动主级子 tab.
// 旧 key 'ithome' / 'wechat-hot' / 'funds' / 'metals' / 'stocks' 仍接受 (兼容落盘数据),
// 切到 'news' / 'invest'.
export const activeNav = signal("home");
export const navCollapsed = signal(false);

// 投资 nav 主级子 tab: 'funds' | 'metals' | 'stocks'.
// ponytail: 用 signal 而非 useState —— Layout/Header/Content 三处都要订阅, signal 单一真相.
export const investPrimary = signal("funds");
export const INVEST_MODULES = ["funds", "metals", "stocks"];

const NAV_KEYS = new Set([
  "home",            // P-N: Home 首屏 (grid)
  "news",
  "worldcup",
  "invest",          // 投资 nav 合并 (funds + metals + stocks)
  "ai-usage",
  "versions",
  "github",          // GitHub 优秀项目收录 (v2.80)
  "games",           // 游戏优惠聚合 (v2.81)
]);

// ponytail: 兼容旧落盘 — 旧数据可能含 'ithome' / 'wechat-hot' / 'funds' / 'metals' / 'stocks',
// 收到 setActiveNav 时归一到 'news' 或 'invest'.
const LEGACY_NAV_ALIAS = {
  ithome: "news",
  "wechat-hot": "news",
  funds: "invest",
  metals: "invest",
  stocks: "invest",
};

// Phase I3: 数组版 (供 sidenav-prefs 持久化 order 用)
// 7 个顶级 panel (合并 IT 新闻 + 微博热搜 → 'news' 后从 8 减到 7, 再合并 funds/metals/stocks → 'invest' 后减到 6).
export const NAV_KEYS_LIST = [
  "news",
  "worldcup",
  "invest",
  "ai-usage",
  "versions",
  "github",
  "games",
];

// P-N: HomeGrid 落点白名单 — "home" 是显示态, 不落盘.
// 跟 NAV_KEYS 的区别: NAV_KEYS 是 activeNav 全部合法值, 这里只挑出可持久化的顶级 nav.
export const PERSISTABLE_NAV_KEYS = new Set([
  "news", "worldcup", "invest", "ai-usage", "versions", "github", "games",
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
// 投资 nav 合并: metals 段不再控制 nav 可见性 —— 投资固定可见.
const NAV_TO_PREFS_SEGMENT = {
  versions: "updates",
  "ai-usage": "ai_usage",
  worldcup: "worldcup",
};

function isNavVisible(key, prefs) {
  const segKey = NAV_TO_PREFS_SEGMENT[key];
  if (!segKey) return true;
  if (!prefs || !prefs.segments) return true;
  return prefs.segments[segKey] !== false;
}

/**
 * 当前 activeNav 被关掉时, 切到第一个可见 panel.
 * 注意: 只考虑 PERSISTABLE_NAV_KEYS (顶级 panel), 跳过 "home" —
 * HomeGrid 是显示态而不是 panel, tray prefs 不应该把用户弹到 HomeGrid.
 * 不可见列表 (activeNav 不可见 + 没有其他可见 nav) 时不动 (极端兜底, 不会发生因为有固定 tab).
 */
function firstVisibleNav(prefs) {
  for (const k of PERSISTABLE_NAV_KEYS) {
    if (isNavVisible(k, prefs)) return k;
  }
  return activeNav.value;
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
  // ponytail: 兼容旧 key — 旧落盘 / 命令行可能仍传 'ithome' 或 'wechat-hot' / 'funds' / 'metals' / 'stocks',
  // 在白名单校验之前归一到 'news' 或 'invest', 让旧调用点不报错 (boot lastActiveNav 路径尤其常见).
  const aliased = LEGACY_NAV_ALIAS[key] || key;
  if (!NAV_KEYS.has(aliased)) return;
  const target = aliased;
  const prev = activeNav.value;
  activeNav.value = target;
  // ponytail: 投资 nav 合并后, 切到 'invest' 等价于原切 'funds' 的语义
  // (recent 模块依赖 trackFundView 记录最近查看基金时间).
  if (target === "invest" && prev !== "invest") {
    trackFundView();
    clearFundNavBadge();
  }
  if (target === "ai-usage" && prev !== "ai-usage") {
    clearAiUsageNavBadge();
  }
  // P-N+: 切到 news tab 时清 IT 新闻 + 微博热搜 两个子 tab 的未读角标
  // (跟之前单独切 ithome / wechat-hot 等价).
  if (target === "news" && prev !== "news") {
    clearIthomeUnreadBadge();
    clearWechatHotUnreadBadge();
  }
  // P-N HomeGrid 落点: 仅持久化顶级 nav, "home" 不写盘.
  // ponytail: 同步路径做过白名单过滤, home 是显示态, 不写盘.
  // 写盘失败仅 console.warn, 不阻断 UI.
  if (target !== "home" && PERSISTABLE_NAV_KEYS.has(target)) {
    if (typeof api?.saveLastActiveNav === "function") {
      api.saveLastActiveNav(target).catch(() => { /* noop */ });
    }
  }
}

// ponytail: 投资 nav 主级子 tab 切换 — 仅接受 INVEST_MODULES 内的值, 未知 key 忽略.
export function setInvestPrimary(mod) {
  if (INVEST_MODULES.includes(mod)) investPrimary.value = mod;
}

// ponytail: 跳到投资 nav 并设主级子 tab. 默认 'funds' (从 LEGACY_NAV_ALIAS 落到 invest 的入口,
// 用户没指定子模块时按习惯先看基金).
export function goInvest(module) {
  setInvestPrimary(module || "funds");
  setActiveNav("invest");
}

export function toggleNavCollapsed() {
  navCollapsed.value = !navCollapsed.value;
}
