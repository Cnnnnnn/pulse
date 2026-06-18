/**
 * src/renderer/nav-refresh.js
 *
 * v2.24.2 全局刷新注册表 — SideNav 顶部 ↻ 按钮点击时,
 * 根据当前 activeNav 调对应的 refresh 函数.
 *
 * 设计原则:
 *   - 单文件, 无副作用, SideNav 只 import `refreshActiveNav`
 *   - 各 tab 的 refresh 函数已经是 idle-cooldown + loading signal 兼容,
 *     这里只做 dispatch, 不重复处理错误 (具体 tab 自己显示 error)
 *   - ai-usage / versions 暂不入 registry (它们是配置/状态类页面,
 *     "刷新"语义不同;后续若用户要求再加)
 *   - 单测覆盖: registry 完整性 + dispatch 分发
 */

import { refreshWechatHot } from "./wechat-hot/store.js";
import { refreshIthomeNews } from "./ithome/store.js";
import { refreshWorldcupScores } from "./worldcup/store.js";
import { fetchNavNow } from "./funds/fundStore.js";
import { refreshNow as refreshMetals } from "./metals/metalStore.js";
import { api } from "./api.js";

/**
 * @typedef {Object} NavRefreshEntry
 * @property {string} label — 用于 aria-label / tooltip
 */

/** nav key → refresh 函数 + label */
const REGISTRY = {
  "wechat-hot": { fn: () => refreshWechatHot(), label: "刷新微博热搜" },
  ithome: { fn: () => refreshIthomeNews(), label: "刷新 IT 新闻" },
  worldcup: { fn: () => refreshWorldcupScores(), label: "刷新世界杯比分" },
  funds: { fn: () => fetchNavNow(api), label: "刷新基金净值" },
  metals: { fn: () => refreshMetals(), label: "刷新贵金属" },
};

/** 注册表里存在的 nav key 集合 — 给 SideNav 判断按钮要不要显示 */
export const REFRESHABLE_NAV_KEYS = new Set(Object.keys(REGISTRY));

/**
 * @param {string} navKey
 * @returns {NavRefreshEntry | null}
 */
export function getRefreshEntry(navKey) {
  return REGISTRY[navKey] || null;
}

/**
 * @param {string} navKey
 * @returns {Promise<boolean>} true = 已派发, false = 当前 nav 不支持全局刷新
 */
export async function refreshActiveNav(navKey) {
  const entry = getRefreshEntry(navKey);
  if (!entry) return false;
  try {
    await entry.fn();
  } catch {
    // swallow — refresh 函数内部已设置错误 signal, UI 由各自 tab 渲染
  }
  return true;
}
