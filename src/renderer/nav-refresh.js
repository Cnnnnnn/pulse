/**
 * src/renderer/nav-refresh.js
 *
 * v2.24.2 全局刷新注册表 — SideNav 顶部 IconRefresh 按钮点击时,
 * 根据当前 activeNav 调对应的 refresh 函数.
 *
 * 设计原则:
 *   - 单文件, 无副作用, SideNav 只 import `refreshActiveNav`
 *   - 各 tab 的 refresh 函数已经是 idle-cooldown + loading signal 兼容,
 *     这里只做 dispatch, 不重复处理错误 (具体 tab 自己显示 error)
 *   - ai-usage / versions 暂不入 registry (它们是配置/状态类页面,
 *     "刷新"语义不同;后续若用户要求再加)
 *   - 单测覆盖: registry 完整性 + dispatch 分发
 *
 * 2026-07-10 P-N+: 'news' 单 nav 合并 IT 新闻 + 微博热搜, 刷新按当前
 *   sub-tab 派发 (data-subtab 属性读 DOM, 不引信号 — registry 是纯模块).
 */

import { refreshWechatHot } from "./wechat-hot/store.js";
import { refreshIthomeNews } from "./ithome/store.js";
import { refreshWorldcupScores } from "./worldcup/store.js";
import { fetchNavNow } from "./funds/fundStore.js";
import { refreshNow as refreshMetals } from "./metals/metalStore.js";
import { investPrimary } from "./worldcup/navStore.js";
import { api } from "./api.js";

/**
 * @typedef {Object} NavRefreshEntry
 * @property {string} label — 用于 aria-label / tooltip
 */

/** ponytail: 'news' 的 refresh 看当前 sub-tab (DOM data-subtab), 派给对应 store. */
function refreshNews() {
  // ponytail: 不在 store 内 import preact, 用 DOM 读 sub-tab 状态.
  // 默认 ithome — 绝大多数时候用户先看 IT 新闻, 切走时再切回来.
  let subtab = "ithome";
  if (typeof document !== "undefined") {
    const el = document.querySelector(".news-layout");
    if (el && el.getAttribute("data-subtab") === "wechat-hot") {
      subtab = "wechat-hot";
    }
  }
  if (subtab === "wechat-hot") return refreshWechatHot();
  return refreshIthomeNews();
}

/**
 * 投资 nav 刷新: 按 investPrimary signal 派发到当前主级子模块.
 * ponytail: 'news' refresh 用 DOM 读 sub-tab; 'invest' refresh 用 signal 读 investPrimary.
 *   选股无显式 refresh (stockStore 内部 60s tick 静默刷新), 返回 resolved 不报错.
 */
function refreshInvest() {
  const primary = investPrimary.value;
  if (primary === "funds") return fetchNavNow(api);
  if (primary === "metals") return refreshMetals();
  return Promise.resolve(true);
}

/** nav key → refresh 函数 + label */
const REGISTRY = {
  news: { fn: () => refreshNews(), label: "刷新当前新闻子 tab" },
  worldcup: { fn: () => refreshWorldcupScores(), label: "刷新世界杯比分" },
  invest: { fn: () => refreshInvest(), label: "刷新当前投资子模块" },
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
