/**
 * src/renderer/nav/navStore.ts
 *
 * App 级导航信号 (activeNav / navCollapsed / investPrimary).
 *
 * Phase 9 (外壳+导航+视觉重设): 从 src/renderer/worldcup/navStore.ts 迁入本目录.
 *   - 旧位置误导: 这是 app 级状态, 不是 worldcup 专属.
 *   - nav key 集合 / 分组 / legacy alias 改为从 src/shared/nav-keys.ts 单一真源派生,
 *     不再在本文件维护并行表.
 *
 * v2.9.0 世界杯专栏起源, 后续合并:
 *   - P-N+ (2026-07-10): IT 新闻 + 微博热搜 → 'news' 单 nav, 页内 sub-tab.
 *   - 2026-07-13: funds/metals/stocks → 'invest' 单 nav, investPrimary signal 驱动子 tab.
 *   - Phase 9: worldcup 从顶层独立项 → 资讯组成员 (key 不变, 只改 section 归属).
 */

import { effect, signal } from "@preact/signals";
import { trackFundView } from "../recent/track.ts";
import { trayMenuPrefs } from "../store/trayConfigStore.ts";
import { clearFundNavBadge } from "../funds/fundStore.ts";
import { clearAiUsageNavBadge } from "../store/ai-usage-store.ts";
import { clearWechatHotUnreadBadge } from "../wechat-hot/store.ts";
import { clearIthomeUnreadBadge } from "../ithome/store.ts";
import { api } from "../api.ts";
import {
  ALL_NAV_KEYS,
  LEGACY_NAV_ALIAS,
  NAV_KEYS_LIST,
  NAV_TO_PREFS_SEGMENT,
  PERSISTABLE_NAV_KEYS,
} from "../../shared/nav-keys.ts";

// activeNav: 'home' | 顶级 panel key.
// 默认 'home' — 无历史 → 显示 OverviewPage. bootstrap 拿到上次落点后会在 render 前覆盖.
export const activeNav = signal<"home" | string>("home");
export const navCollapsed = signal(false);

// 投资 nav 主级子 tab: 'funds' | 'metals' | 'stocks'.
// signal 单一真相 — Layout/Header/Content 三处都订阅.
export const investPrimary = signal("funds");
export const INVEST_MODULES = ["funds", "metals", "stocks"];

// ─── 从 shared 派生并 re-export (保持下游 import 名不变) ───
// NAV_KEYS (含 home) — activeNav 白名单
export const NAV_KEYS = ALL_NAV_KEYS;
export { NAV_KEYS_LIST, PERSISTABLE_NAV_KEYS, LEGACY_NAV_ALIAS, NAV_TO_PREFS_SEGMENT };

/**
 * 计算"实际可见"nav 列表 (扁平顺序, 行为与 Phase 9 前完全一致).
 * - prefs.order 命中的优先, 按 order 相对位置
 * - 排除 prefs.hidden
 * - 不在 prefs.order 里的已知 key 按 registry 顺序追加到末尾
 *
 * 注: 分组渲染 (资讯/持仓/系统 section) 在 SideNav 视图层处理,
 *     本函数只负责"可见 + 顺序"语义, 保持跨组用户排序不丢失.
 * @param {{order?: string[], hidden?: string[]} | null} prefs
 * @returns {string[]}
 */
export function effectiveVisibleItems(prefs: any): string[] {
  const order =
    prefs && Array.isArray(prefs.order) && prefs.order.length > 0
      ? (prefs.order as string[]).filter((k) => NAV_KEYS.has(k))
      : NAV_KEYS_LIST.slice();
  const hidden = new Set(prefs && Array.isArray(prefs.hidden) ? prefs.hidden : []);
  const out: string[] = [];
  for (const k of order) {
    if (!hidden.has(k)) out.push(k);
  }
  // 兜底: prefs.order 漏掉的已知 key 按 registry 顺序追加
  for (const k of NAV_KEYS_LIST) {
    if (!out.includes(k) && !hidden.has(k)) out.push(k);
  }
  return out;
}

function isNavVisible(key: any, prefs: any) {
  const segKey = NAV_TO_PREFS_SEGMENT[key];
  if (!segKey) return true;
  if (!prefs || !prefs.segments) return true;
  return prefs.segments[segKey] !== false;
}

/**
 * 当前 activeNav 被关掉时, 切到第一个可见 panel.
 * 只考虑 PERSISTABLE_NAV_KEYS (顶级 panel), 跳过 'home'.
 */
function firstVisibleNav(prefs: any): string {
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

export function setActiveNav(key: any) {
  // 兼容旧 key — 旧落盘 / 命令行可能仍传 'ithome' / 'wechat-hot' / 'funds' / 'metals' / 'stocks',
  // 白名单校验之前归一到 'news' 或 'invest'.
  const aliased = LEGACY_NAV_ALIAS[key] || key;
  if (!NAV_KEYS.has(aliased)) return;
  const target = aliased;
  const prev = activeNav.value;
  activeNav.value = target;
  if (target === "invest" && prev !== "invest") {
    trackFundView();
    clearFundNavBadge();
  }
  if (target === "ai-usage" && prev !== "ai-usage") {
    clearAiUsageNavBadge();
  }
  if (target === "news" && prev !== "news") {
    clearIthomeUnreadBadge();
    clearWechatHotUnreadBadge();
  }
  // 仅持久化顶级 nav, 'home' 不写盘. 写盘失败仅 noop.
  if (target !== "home" && PERSISTABLE_NAV_KEYS.has(target)) {
    if (typeof api?.saveLastActiveNav === "function") {
      api.saveLastActiveNav(target).catch(() => { /* noop */ });
    }
  }
}

export function setInvestPrimary(mod: any) {
  if (INVEST_MODULES.includes(mod)) investPrimary.value = mod;
}

export function goInvest(module: any) {
  setInvestPrimary(module || "funds");
  setActiveNav("invest");
}

export function toggleNavCollapsed() {
  navCollapsed.value = !navCollapsed.value;
}
