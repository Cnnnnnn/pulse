/**
 * src/renderer/games/gamesStore.js
 *
 * 游戏优惠聚合 — renderer 状态 (signals)。
 * 单一真相：当前 (platform, mode, sort, minSavings) → 一次 getGameDeals 请求。
 */

import { signal } from "@preact/signals";
import { api } from "../api.js";

/** 平台元信息（renderer 展示用）。key 与 main 端 PLATFORM_KEYS 对齐。 */
export const PLATFORMS = [
  { key: "all", label: "全部", emoji: "🎮" },
  { key: "steam", label: "Steam", emoji: "🎮" },
  { key: "epic", label: "Epic", emoji: "🎁" },
  { key: "xbox", label: "Xbox", emoji: "🟢" },
  { key: "playstation", label: "PlayStation", emoji: "🔵" },
  { key: "switch", label: "Switch", emoji: "🔴" },
];

/** 浏览维度（筛选模式）。 */
export const MODES = [
  { key: "deals", label: "折扣力度" },
  { key: "free", label: "喜 +1 免费领" },
  { key: "top", label: "热门 Top10" },
];

/** 折扣力度阈值（仅 deals 模式用）。 */
export const SAVINGS_TIERS = [
  { key: 0, label: "全部折扣" },
  { key: 50, label: "≥ 50%" },
  { key: 75, label: "≥ 75%" },
  { key: 90, label: "≥ 90%" },
];

export const activePlatform = signal("all");
export const activeMode = signal("deals");
export const activeSort = signal("savings");
export const minSavings = signal(0);

export const items = signal([]);
export const sources = signal({});
export const psDriver = signal(null);
export const loading = signal(false);
export const error = signal(null);
export const fetchedAt = signal(null);

// ── 后台检查设置（scheduler 用，镜像 github-projects-store.js 范式）──
export const gamesAutoCheck = signal(true); // 自动检查 Epic 喜+1 开关，默认开
export const gamesAutoCheckIntervalMin = signal(360); // 间隔分钟，默认 360=6h
export const gamesNotifyOnFree = signal(true); // 桌面通知开关，默认开
// 后台发现新喜+1 但用户尚未查看 → SideNav 红点
export const gamesHasNewFree = signal(false);

let _reqToken = 0;

/**
 * 按当前筛选条件拉取数据。并发请求用 token 防止竞态（旧响应覆盖新状态）。
 */
export async function loadGameDeals() {
  const token = ++_reqToken;
  loading.value = true;
  error.value = null;
  try {
    const res = await api.getGameDeals({
      platform: activePlatform.value,
      mode: activeMode.value,
      sort: activeSort.value,
      minSavings: minSavings.value,
    });
    if (token !== _reqToken) return; // 已被更新的请求取代
    if (res && res.ok) {
      items.value = res.items || [];
      sources.value = res.sources || {};
      psDriver.value = res.psDriver || null;
      fetchedAt.value = res.fetchedAt || null;
    } else {
      error.value = (res && res.error) || "加载失败";
      items.value = [];
      sources.value = {};
      psDriver.value = null;
    }
  } catch (e) {
    if (token !== _reqToken) return;
    error.value = e && e.message ? e.message : "网络错误";
    items.value = [];
    sources.value = {};
    psDriver.value = null;
  } finally {
    if (token === _reqToken) loading.value = false;
  }
}

export function setPlatform(p) {
  if (activePlatform.value === p) return;
  activePlatform.value = p;
  loadGameDeals();
}

export function setMode(m) {
  if (activeMode.value === m) return;
  activeMode.value = m;
  loadGameDeals();
}

export function setSort(s) {
  if (activeSort.value === s) return;
  activeSort.value = s;
  loadGameDeals();
}

export function setMinSavings(v) {
  if (minSavings.value === v) return;
  minSavings.value = v;
  loadGameDeals();
}

/** 数据源是否含 'sample'（用于页头提示）。 */
export function hasSampleSource() {
  const s = sources.value || {};
  return Object.values(s).includes("sample");
}

/**
 * PlayStation 实时数据署名：
 *   - psDriver === 'psprices'   → PSPrices B2B（许可强制署名）
 *   - psDriver === 'psgamespider' → PSGameSpider 开源项目（MIT，礼貌署名）
 *   - psDriver === 'official' / null → 官方商店 SSR，无需署名
 */
export function hasPspricesAttribution() {
  return psDriver.value === "psprices";
}

/** PSGameSpider 数据来源署名（MIT 许可，非强制但透明起见展示）。 */
export function hasPsgamespiderAttribution() {
  return psDriver.value === "psgamespider";
}

// ── 后台检查设置持久化（localStorage，照搬 github-projects-store.js）──
const SETTINGS_KEY = "pulse.games.settings.v1";
const SEEN_FREE_KEY = "pulse.games.seen.v1";

function readStorage(key) {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, val) {
  try {
    globalThis.localStorage.setItem(key, val);
  } catch {
    /* 配额超限或 localStorage 不可用，忽略 */
  }
}

/** 读取持久化的模块设置（自动检查 / 间隔 / 通知）。损坏数据忽略，回退默认。 */
export function loadGamesSettings() {
  const raw = readStorage(SETTINGS_KEY);
  if (!raw) return;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.autoCheck === "boolean") {
      gamesAutoCheck.value = o.autoCheck;
    }
    if (o && typeof o.autoCheckIntervalMin === "number" && o.autoCheckIntervalMin > 0) {
      gamesAutoCheckIntervalMin.value = o.autoCheckIntervalMin;
    }
    if (o && typeof o.notifyOnFree === "boolean") {
      gamesNotifyOnFree.value = o.notifyOnFree;
    }
  } catch {
    /* 损坏数据忽略 */
  }
}

function persistSettings() {
  try {
    writeStorage(
      SETTINGS_KEY,
      JSON.stringify({
        autoCheck: gamesAutoCheck.value,
        autoCheckIntervalMin: gamesAutoCheckIntervalMin.value,
        notifyOnFree: gamesNotifyOnFree.value,
      }),
    );
  } catch {
    /* 忽略 */
  }
}

/** 设置自动检查开关。变更后通知调度器重启。 */
export function setGamesAutoCheck(v) {
  gamesAutoCheck.value = !!v;
  persistSettings();
  emitSettingsChanged();
}

/** 设置自动检查间隔（分钟）。下限 60 分钟（Epic 喜+1 周级更新，无需更频繁）。 */
export function setGamesAutoCheckInterval(min) {
  const n = Math.max(60, Math.floor(Number(min) || 360));
  gamesAutoCheckIntervalMin.value = n;
  persistSettings();
  emitSettingsChanged();
}

/** 设置是否桌面通知新喜+1。不重启调度器（下次 checkOnce 读最新值）。 */
export function setGamesNotifyOnFree(v) {
  gamesNotifyOnFree.value = !!v;
  persistSettings();
}

/** 用户查看喜+1 后清除未读红点。 */
export function clearGamesNewFree() {
  gamesHasNewFree.value = false;
}

/** 读取已通知过的喜+1 id 集合（scheduler 用于 diff 新条目）。 */
export function loadSeenFreeIds() {
  const raw = readStorage(SEEN_FREE_KEY);
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

/** 持久化已通知过的喜+1 id 集合。 */
export function saveSeenFreeIds(ids) {
  try {
    writeStorage(SEEN_FREE_KEY, JSON.stringify([...ids]));
  } catch {
    /* 忽略 */
  }
}

/**
 * 广播设置变更事件（解耦：store 不直接依赖调度器）。
 * GamesLayout 监听此事件并 restart 调度器。
 */
function emitSettingsChanged() {
  try {
    if (typeof globalThis.dispatchEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("games-settings-changed"));
    }
  } catch {
    /* 非浏览器环境忽略 */
  }
}
