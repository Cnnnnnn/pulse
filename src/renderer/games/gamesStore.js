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
