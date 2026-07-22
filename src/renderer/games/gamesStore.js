/**
 * src/renderer/games/gamesStore.js
 *
 * 游戏优惠聚合 — renderer 状态 (signals)。
 * 单一真相：当前 (platform, mode, sort, minSavings) → 一次 getGameDeals 请求。
 *
 * v-collection（阶段1）：在现有 wishlist 基础上扩展「收集模块」——
 *   分类标签 / 自定义收藏夹 / 进度可视化 / 快捷收集 / 备注评分 / 统计 / 跨平台合并。
 * 全部纯本地（localStorage），无后端、无账号、无网络出口。
 */

import { signal, batch, effect } from "@preact/signals";
import { api } from "../api.js";
import {
  normalizeEntry,
  normalizeFolder,
  normalizeTag,
  clampRating,
  genId,
  currentPriceOf,
  savedOf,
  computeCollectionStats,
  RATING_MIN,
  RATING_MAX,
  RARITY_MIN,
  RARITY_MAX,
} from "./types.js";
import {
  findMergeCandidates as mapFindMergeCandidates,
  areCandidatesKnown,
} from "./gameIdMap.js";
import {
  DEFAULT_RARITY_TIERS,
  normalizeRarityTier,
  sortByWeight,
  tierColorOf,
} from "./rarityTiers.js";
// 统一游戏收藏（Phase 2）：数据驱动类型注册表（纯函数，零 store 依赖）
import {
  DEFAULT_COLLECTION_TYPES,
  getCollectionType,
  listCollectionTypes,
  catalogOf,
  progressOf,
  rarityDistribution,
  rarityCoverage,
  targetCoverage,
  crossedMilestones,
  clampPct,
} from "./collectionRegistry.js";
import { bumpMetric as bumpMetricPure, mergeMetrics } from "./metrics.js";
import { evaluateBadges, buildBadgeCtx, getBadgeRule } from "./badges.js";
import { evaluateAchievements, DEFAULT_ACHIEVEMENTS, countMatches } from "./achievementsEngine.js";
import { evaluateEvents, DEFAULT_EVENTS, isEventActive } from "./eventsEngine.js";

/** 平台元信息（renderer 展示用）。key 与 main 端 PLATFORM_KEYS 对齐。 */
export const PLATFORMS = [
  { key: "steam", label: "Steam", emoji: "🎮" },
  { key: "epic", label: "Epic", emoji: "🎁" },
  { key: "xbox", label: "Xbox", emoji: "🟢" },
  { key: "playstation", label: "PlayStation", emoji: "🔵" },
  { key: "switch", label: "Switch", emoji: "🔴" },
];

/** 浏览维度（筛选模式）。 */
export const MODES = [
  { key: "deals", label: "折扣力度" },
  { key: "free", label: "免费活动" },
  { key: "wishlist", label: "心愿单" },
  { key: "compare", label: "比价" },
];

/** 折扣力度阈值（仅 deals 模式用）。 */
export const SAVINGS_TIERS = [
  { key: 0, label: "全部折扣" },
  { key: 50, label: "≥ 50%" },
  { key: 75, label: "≥ 75%" },
  { key: 90, label: "≥ 90%" },
];

export const activePlatform = signal("steam");
export const activeMode = signal("deals");
export const activeSort = signal("savings");
export const minSavings = signal(0);
/** 比价模式下参与对比的平台集合（多选，至少保留 1 个）。 */
export const comparePlatforms = signal(PLATFORMS.map((p) => p.key));

/** 标题搜索关键词（本地派生，不发 IPC）。由 setSearchQuery 200ms 防抖写入。 */
export const searchQuery = signal("");

export const items = signal([]);
export const sources = signal({});
export const psDriver = signal(null);
export const loading = signal(false);
export const error = signal(null);
export const fetchedAt = signal(null);

export const EMPTY_FX = { rates: {}, date: null, fetchedAt: null, stale: true };
export const fx = signal({ ...EMPTY_FX });

function normalizeFx(raw) {
  if (!raw || typeof raw !== "object") return { ...EMPTY_FX };
  const rates =
    raw.rates && typeof raw.rates === "object" && !Array.isArray(raw.rates)
      ? { ...raw.rates }
      : {};
  return {
    rates,
    date: typeof raw.date === "string" ? raw.date : null,
    fetchedAt: typeof raw.fetchedAt === "string" ? raw.fetchedAt : null,
    stale: !!raw.stale,
  };
}

// ── 后台检查设置（scheduler 用，镜像 github-projects-store.js 范式）──
export const gamesAutoCheck = signal(true); // 自动检查免费活动开关，默认开
export const gamesAutoCheckIntervalMin = signal(360); // 间隔分钟，默认 360=6h
export const gamesNotifyOnFree = signal(true); // 桌面通知开关，默认开
// 后台发现新免费活动但用户尚未查看 → SideNav 红点
export const gamesHasNewFree = signal(false);

// 心愿单 + 降价通知
export const wishlist = signal([]);
export const gamesHasNewDrop = signal(false);
export const gamesNotifyOnDrop = signal(true);

// 史低价映射：key=game.id，value=历史最低价（number）。
// 由 enrichSteamLowest / enrichXboxLowest 渐进填充，GameCard 读 map 判定徽标。
export const lowPriceMap = signal({});
// Steam/Xbox 各自独立的竞态 token（共享会导致并发调用时互相取消）
let _steamLowToken = 0;
let _xboxLowToken = 0;

let _reqToken = 0;

/**
 * 按当前筛选条件拉取数据。并发请求用 token 防止竞态（旧响应覆盖新状态）。
 */
export async function loadGameDeals() {
  // wishlist 数据来自 localStorage（loadWishlist），不需要上游聚合；
  // IPC 白名单不含 'wishlist'，传过去会被归一成 deals 跑一次无用的全平台拉取。
  if (activeMode.value === "wishlist") return;
  const token = ++_reqToken;
  loading.value = true;
  lowPriceMap.value = {};
  error.value = null;
  try {
    const res = await api.getGameDeals({
      // 比价视图跨平台对比，单平台无意义 → 传 'all'；其余模式用当前选中平台
      platform: activeMode.value === "compare" ? "all" : activePlatform.value,
      mode: activeMode.value,
      sort: activeSort.value,
      minSavings: minSavings.value,
    });
    if (token !== _reqToken) return; // 已被更新的请求取代
    // batch：5 个 signal 写入合并成一次通知，避免 GamesPage 连续重渲染 5 次
    if (res && res.ok) {
      batch(() => {
        items.value = res.items || [];
        sources.value = res.sources || {};
        psDriver.value = res.psDriver || null;
        fetchedAt.value = res.fetchedAt || null;
        fx.value = normalizeFx(res.fx);
      });
    } else {
      batch(() => {
        error.value = (res && res.error) || "加载失败";
        items.value = [];
        sources.value = {};
        psDriver.value = null;
        fx.value = { ...EMPTY_FX };
      });
    }
  } catch (e) {
    if (token !== _reqToken) return;
    batch(() => {
      error.value = e && e.message ? e.message : "网络错误";
      items.value = [];
      sources.value = {};
      psDriver.value = null;
      fx.value = { ...EMPTY_FX };
    });
  } finally {
    if (token === _reqToken) loading.value = false;
  }
}

/**
 * 独立加载汇率快照（固定 USD → CNY）。
 * wishlist 模式短路了 loadGameDeals，不会顺带拉 fx；
 * 本函数在 GamesLayout mount 时无条件调一次，保证 wishlist 也有人民币参考价。
 * exchangeRateService 有 24h 进程缓存，重复调零成本。
 */
export async function loadFx() {
  try {
    const res = await api.getFx(["USD"]);
    fx.value = normalizeFx(res);
  } catch (e) {
    // 失败不清空：保留上一次的 fx（若有），wishlist 不至于完全丢失参考价
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

/** 比价模式：切换某平台是否参与对比（至少保留 1 个）。 */
export function toggleComparePlatform(key) {
  const cur = comparePlatforms.value;
  if (cur.includes(key)) {
    if (cur.length > 1) comparePlatforms.value = cur.filter((k) => k !== key);
  } else {
    comparePlatforms.value = [...cur, key];
  }
}

export function setPlatformAndMode(platform, mode) {
  const nextPlatform = PLATFORMS.some(({ key }) => key === platform)
    ? platform
    : activePlatform.value;
  const nextMode = MODES.some(({ key }) => key === mode)
    ? mode
    : activeMode.value;
  if (
    activePlatform.value === nextPlatform
    && activeMode.value === nextMode
  ) return;
  activePlatform.value = nextPlatform;
  activeMode.value = nextMode;
  loadGameDeals();
}

// sort / minSavings 改为纯本地派生（GamesPage 用 sortItems/filterBySavings 计算 shown），
// 不再触发 loadGameDeals —— 避免 skeleton 闪烁 + 史低徽标清空 + IPC 往返。
export function setSort(s) {
  activeSort.value = s;
}

export function setMinSavings(v) {
  minSavings.value = v;
}

/**
 * deals 模式本地排序（与 IPC 层 applySortAndFilter 的 sortDeals 逻辑一致）。
 * 改下拉框时只更新 activeSort signal → GamesPage 派生重排，不发 IPC、不闪 skeleton。
 */
export function sortItems(items, sort) {
  const arr = items.slice();
  if (sort === "price") {
    arr.sort((a, b) => (a.salePrice ?? Infinity) - (b.salePrice ?? Infinity));
  } else if (sort === "rating") {
    arr.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  } else {
    // 'savings' 默认：折扣力度降序
    arr.sort((a, b) => b.savings - a.savings);
  }
  return arr;
}

/** deals 模式本地 minSavings 过滤。 */
export function filterBySavings(items, min) {
  if (!min || min <= 0) return items;
  return items.filter((it) => it && it.savings >= min);
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

/** GamerPower 数据来源署名（Steam 免费活动）。 */
export function hasGamerPowerAttribution() {
  return items.value.some((item) => item.provider === "gamerpower");
}

// ── 后台检查设置持久化（localStorage，照搬 github-projects-store.js）──
const SETTINGS_KEY = "pulse.games.settings.v1";
const SEEN_FREE_KEY = "pulse.games.seen.v1";
const WISHLIST_KEY = "pulse.games.wishlist.v1";
const SEEN_DROP_KEY = "pulse.games.seenDrop.v1";

// 收集模块独立 key（与 wishlist 同域，v1 版本）
const FOLDERS_KEY = "pulse.games.folders.v1";
const TAGS_KEY = "pulse.games.tags.v1";
const FILTER_KEY = "pulse.games.collectionFilter.v1";

// P1a 新增 key（与既有同域，v1 版本）
const RARITY_TIERS_KEY = "pulse.games.rarity.tiers.v1"; // A 稀有度档位
const METRICS_KEY = "pulse.games.metrics.v1"; // E 本地埋点计数

// P1b 新增 key（与既有同域，v1 版本）
const BADGES_KEY = "pulse.games.badges.earned.v1"; // B 已点亮徽章集合

// P1c 新增 key（与既有同域，v1 版本）
const ACH_DEF_KEY = "pulse.games.achievements.def.v1"; // C 用户成就定义
const ACH_PROGRESS_KEY = "pulse.games.achievements.progress.v1"; // C 成就进度（解锁态）
const EVENTS_CONFIG_KEY = "pulse.games.events.config.v1"; // D 用户活动配置
const EVENTS_PROGRESS_KEY = "pulse.games.events.progress.v1"; // D 活动进度（完成/领取态）

export function readStorage(key) {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key, val) {
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
    if (o && typeof o.notifyOnDrop === "boolean") {
      gamesNotifyOnDrop.value = o.notifyOnDrop;
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
        notifyOnDrop: gamesNotifyOnDrop.value,
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

/** 设置自动检查间隔（分钟）。下限 60 分钟（各平台活动更新节奏不同，无需更频繁）。 */
export function setGamesAutoCheckInterval(min) {
  const n = Math.max(60, Math.floor(Number(min) || 360));
  gamesAutoCheckIntervalMin.value = n;
  persistSettings();
  emitSettingsChanged();
}

/** 设置是否桌面通知新免费活动。不重启调度器（下次 checkOnce 读最新值）。 */
export function setGamesNotifyOnFree(v) {
  gamesNotifyOnFree.value = !!v;
  persistSettings();
}

/** 用户查看免费活动后清除未读红点。 */
export function clearGamesNewFree() {
  gamesHasNewFree.value = false;
}

/** 读取已通知过的免费活动 id 集合（scheduler 用于 diff 新条目）。 */
export function loadSeenFreeIds() {
  const raw = readStorage(SEEN_FREE_KEY);
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

/** 持久化已通知过的免费活动 id 集合。 */
export function saveSeenFreeIds(ids) {
  try {
    writeStorage(SEEN_FREE_KEY, JSON.stringify([...ids]));
  } catch {
    /* 忽略 */
  }
}

// ── 心愿单 + 降价通知 ──────────────────────────────────────────────

/** 生成心愿单条目主键。 */
export function getWishlistKey(game) {
  return `${game.platform}:${game.id}`;
}

/**
 * 从 localStorage 读取心愿单并填充 signal。
 * 每条过 normalizeEntry 补默认（tags/folderId/note/rating/currentPrice/...），
 * 损坏数据静默回退空数组；旧数据缺字段不报错、不丢数据。
 */
export function loadWishlist() {
  const raw = readStorage(WISHLIST_KEY);
  try {
    const arr = raw ? JSON.parse(raw) : [];
    wishlist.value = Array.isArray(arr) ? arr.map(normalizeEntry) : [];
  } catch {
    wishlist.value = [];
  }
}

/** 关注一款游戏（加入心愿单）。同 key 去重。 */
export function addToWishlist(game) {
  const key = getWishlistKey(game);
  if (isInWishlist(key)) return;
  const base = {
    key,
    platform: game.platform,
    id: game.id,
    title: game.title,
    thumb: game.thumb || null,
    // 加入价 = 当时的 salePrice
    addedPrice: Number(game.salePrice) || 0,
    currency: game.currency || "USD",
    addedAt: new Date().toISOString(),
    // 当前价 = 加入时刻 game.salePrice（阶段1 不自动刷新）
    currentPrice: Number(game.salePrice) || null,
    currentCurrency: game.currency || null,
  };
  // normalizeEntry 集中补 tags/folderId/note/rating/mergedIds/mergedMembers 默认
  const entry = normalizeEntry(base);
  wishlist.value = [...wishlist.value, entry];
  _persistWishlist();
  bumpMetric("wishlist.add");
}

/** 取消关注（移除心愿单条目）。 */
export function removeFromWishlist(key) {
  wishlist.value = wishlist.value.filter((w) => w.key !== key);
  // 若移除的是正在展开的合并主记录，清掉展开态
  if (expandedMergeKey.value === key) expandedMergeKey.value = null;
  _persistWishlist();
  bumpMetric("wishlist.remove");
}

/** 判断是否已关注。 */
export function isInWishlist(key) {
  return wishlist.value.some((w) => w.key === key);
}

// ── 收藏模块：文件夹 / 标签 / 筛选 ────────────────────────────────

/** 自定义收藏夹列表（signal）。 */
export const folders = signal([]);
/** 标签列表（signal）。 */
export const tags = signal([]);
/** 当前收藏筛选 {type:'folder'|'tag'|null, id:string|null}。 */
export const activeCollectionFilter = signal({ type: null, id: null });

// ── 统一游戏收藏（Phase 2）：类型切换 / 视图切换 ──
/** 当前收藏类型 id（注册表键，默认 "all"）。 */
export const activeCollectionType = signal("all");
/** 收藏展示视图：'grid' | 'list'。 */
export const collectionView = signal("grid");
/** 备注/评分弹窗目标 key（null = 关闭）。 */
export const noteRatingTarget = signal(null);
/** 合并确认弹窗候选 key 列表。 */
export const mergeCandidateKeys = signal([]);
/** 合并确认是否为「映射未知」手动合并（决定提示文案）。 */
export const mergeIsUnknown = signal(false);
/** 当前展开的合并主记录 key（null = 无）。 */
export const expandedMergeKey = signal(null);

// ── 统一游戏收藏（Phase 2.5）：解锁庆祝 / 里程碑 / 皮肤 / 加载态 ──
/** 解锁庆祝 toast 队列：[{uid, kind:'badge'|'ach'|'event', title, desc}]。 */
export const unlockToasts = signal([]);
/** 里程碑粒子动效信号：{pct:number, at:number} | null（null = 无动效）。 */
export const milestoneFx = signal(null);
/** 当前皮肤：'minimal' | 'neon' | 'retro'（minimal = 不覆写基础令牌）。 */
export const collectionSkin = signal("minimal");
/** 加载骨架态（类型 / 视图切换时短暂为 true）。 */
export const collectionLoading = signal(false);

// ── 统一游戏收藏（Phase 2.6）：窄屏抽屉 + 解锁历史 ──
/** 窄屏收藏侧栏抽屉开合态（仅窄屏有效，桌面端常显）。 */
export const collectionSidebarOpen = signal(false);
/** 解锁历史面板开合态。 */
export const unlockHistoryOpen = signal(false);
/** 解锁历史记录（[{id, kind, title, desc, at}]，最新在前，上限 50）。 */
export const unlockHistory = signal([]);

/** 稀有度档位（signal）。默认空，由 loadRarityTiers 填充为 4 档或用户自定义。 */
export const rarityTiers = signal([]);
/** 本地埋点计数（signal）。结构 { [event]: { count, firstSeen, lastSeen } }。 */
export const metrics = signal({});

/** 已点亮徽章集合（signal）。结构 { [badgeId]: { earnedAt } }（B 组合徽章，P1b）。 */
export const badgesEarned = signal({});

/** 用户成就定义（signal）。结构 AchievementDef[]（C 成就系统，P1c）。 */
export const achievementsDef = signal([]);
/** 成就进度（signal）。结构 { [achId]: { unlocked, unlockedAt, current } }（P1c）。 */
export const achievementsProgress = signal({});
/** 用户活动配置（signal）。结构 EventConfig[]（D 限时活动，P1c）。 */
export const eventsConfig = signal([]);
/** 活动进度（signal）。结构 { [eventId]: { claimed, completed, progress } }（P1c）。 */
export const eventsProgress = signal({});

/** 读取文件夹列表。 */
export function loadFolders() {
  const raw = readStorage(FOLDERS_KEY);
  try {
    const arr = raw ? JSON.parse(raw) : [];
    folders.value = Array.isArray(arr) ? arr.map(normalizeFolder) : [];
  } catch {
    folders.value = [];
  }
}

/** 读取标签列表。 */
export function loadTags() {
  const raw = readStorage(TAGS_KEY);
  try {
    const arr = raw ? JSON.parse(raw) : [];
    tags.value = Array.isArray(arr) ? arr.map(normalizeTag) : [];
  } catch {
    tags.value = [];
  }
}

function _persistFolders() {
  try {
    writeStorage(FOLDERS_KEY, JSON.stringify(folders.value));
  } catch {
    /* 忽略 */
  }
}

function _persistTags() {
  try {
    writeStorage(TAGS_KEY, JSON.stringify(tags.value));
  } catch {
    /* 忽略 */
  }
}

/** 读取收藏筛选（持久化）。损坏回退「全部」。 */
export function loadCollectionFilter() {
  const raw = readStorage(FILTER_KEY);
  if (!raw) {
    activeCollectionFilter.value = { type: null, id: null };
    return;
  }
  try {
    const o = JSON.parse(raw);
    if (o && (o.type === "folder" || o.type === "tag") && typeof o.id === "string") {
      activeCollectionFilter.value = { type: o.type, id: o.id };
    } else {
      activeCollectionFilter.value = { type: null, id: null };
    }
  } catch {
    activeCollectionFilter.value = { type: null, id: null };
  }
}

// ── 稀有度档位（P1a · A）──

/** 读取稀有度档位；缺失/损坏静默回退默认 4 档并落盘。 */
export function loadRarityTiers() {
  const raw = readStorage(RARITY_TIERS_KEY);
  if (!raw) {
    // 首次使用：写入默认 4 档
    rarityTiers.value = DEFAULT_RARITY_TIERS.map((t) => ({ ...t }));
    _persistRarityTiers();
    return;
  }
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("empty");
    const normalized = arr.map(normalizeRarityTier).filter(Boolean);
    if (normalized.length === 0) throw new Error("empty");
    rarityTiers.value = normalized;
  } catch {
    // 损坏数据：回退默认 4 档并覆盖落盘
    rarityTiers.value = DEFAULT_RARITY_TIERS.map((t) => ({ ...t }));
    _persistRarityTiers();
  }
}

function _persistRarityTiers() {
  try {
    writeStorage(RARITY_TIERS_KEY, JSON.stringify(rarityTiers.value));
  } catch {
    /* 忽略 */
  }
}

/** 新增自定义档位，返回新 id（已存在同名不重复，复用其 id）。 */
export function addRarityTier(name, opts = {}) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  const existing = rarityTiers.value.find((t) => t.name === clean);
  if (existing) return existing.id;
  const id = typeof opts.id === "string" && opts.id ? opts.id : genId();
  const weight = Number.isFinite(Number(opts.weight)) ? Number(opts.weight) : rarityTiers.value.length + 1;
  const color =
    typeof opts.color === "string" && opts.color ? opts.color : "var(--text-secondary)";
  const tier = normalizeRarityTier({ id, name: clean, weight, color });
  if (!tier) return null;
  rarityTiers.value = [...rarityTiers.value, tier];
  _persistRarityTiers();
  return tier.id;
}

/** 重命名档位（id 不变，条目 rarity 引用按 id 自然跟随）。 */
export function renameRarityTier(id, name) {
  const clean = String(name || "").trim();
  if (!clean || !id) return;
  rarityTiers.value = rarityTiers.value.map((t) =>
    t.id === id ? { ...t, name: clean } : t,
  );
  _persistRarityTiers();
}

/** 删除档位（被删档位 id 仍留在旧条目 rarity 上，渲染时按未知处理为中性色）。 */
export function deleteRarityTier(id) {
  if (!id) return;
  rarityTiers.value = rarityTiers.value.filter((t) => t.id !== id);
  _persistRarityTiers();
}

function _persistCollectionFilter() {
  try {
    writeStorage(FILTER_KEY, JSON.stringify(activeCollectionFilter.value));
  } catch {
    /* 忽略 */
  }
}

/**
 * 设置收藏筛选并持久化。
 * 兼容两种调用形式（组件用两参、测试用对象）：
 *   setCollectionFilter("folder", id) || setCollectionFilter({ type, id })
 * @param {string|{type:string,id:string}|null} typeOrObj
 * @param {string} [id]
 */
export function setCollectionFilter(typeOrObj, id) {
  let type = typeOrObj;
  let fid = id;
  if (typeOrObj && typeof typeOrObj === "object") {
    type = typeOrObj.type;
    fid = typeOrObj.id;
  }
  const next =
    type === "folder" || type === "tag"
      ? { type, id: typeof fid === "string" ? fid : null }
      : { type: null, id: null };
  activeCollectionFilter.value = next;
  _persistCollectionFilter();
}

// ── 统一游戏收藏（Phase 2）：类型 / 视图 切换 + 派生选择器 ──

/** 设置当前收藏类型（仅接受注册表中存在的 id，非法忽略）。 */
export function setCollectionType(id) {
  if (!getCollectionType(id)) return;
  if (activeCollectionType.value === id) return;
  activeCollectionType.value = id;
  triggerCollectionLoading();
}

/** 设置收藏展示视图（'grid' | 'list'）；非法值回退 'grid'。 */
export function setCollectionView(v) {
  const next = v === "list" ? "list" : "grid";
  if (collectionView.value === next) return;
  collectionView.value = next;
  triggerCollectionLoading();
}

// ── 加载骨架（类型 / 视图切换时短暂为真，制造微交互过渡）──
let _loadingTimer = null;
function triggerCollectionLoading() {
  collectionLoading.value = true;
  if (_loadingTimer) clearTimeout(_loadingTimer);
  _loadingTimer = setTimeout(() => {
    collectionLoading.value = false;
  }, 280);
}

/** 设置皮肤（仅接受已知值，非法回退 minimal）。 */
export function setCollectionSkin(s) {
  const allowed = ["minimal", "neon", "retro"];
  collectionSkin.value = allowed.includes(s) ? s : "minimal";
}

/** 推入一条解锁 toast（上限保留最近 4 条）。 */
export function pushUnlockToast(kind, title, desc) {
  const uid = `${kind}-${title}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  unlockToasts.value = [...unlockToasts.value, { uid, kind, title, desc }].slice(-4);
}

/** 关闭指定 toast。 */
export function dismissUnlockToast(uid) {
  unlockToasts.value = unlockToasts.value.filter((t) => t.uid !== uid);
}

/** 清除里程碑动效信号。 */
export function clearMilestoneFx() {
  milestoneFx.value = null;
}

// ── 窄屏侧栏抽屉 ──

/** 设置抽屉开合态。 */
export function setCollectionSidebarOpen(v) {
  collectionSidebarOpen.value = !!v;
}
/** 切换抽屉开合态。 */
export function toggleCollectionSidebar() {
  collectionSidebarOpen.value = !collectionSidebarOpen.value;
}

// ── 解锁历史 ──

/** 打开 / 关闭解锁历史面板。 */
export function setUnlockHistoryOpen(v) {
  unlockHistoryOpen.value = !!v;
}
/** 切换解锁历史面板开合态。 */
export function toggleUnlockHistory() {
  unlockHistoryOpen.value = !unlockHistoryOpen.value;
}
/** 清空解锁历史。 */
export function clearUnlockHistory() {
  unlockHistory.value = [];
  _persistUnlockHistory();
}

/** 追加一条解锁历史（最新在前，上限 50）。 */
export function pushUnlockHistory(kind, title, desc) {
  const item = {
    id: `h-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title,
    desc,
    at: Date.now(),
  };
  unlockHistory.value = [item, ...unlockHistory.value].slice(0, 50);
  _persistUnlockHistory();
}

/**
 * 计算当前收藏视图完成度 pct（与 deriveCollectionView 口径一致），供里程碑检测。
 * 订阅：activeCollectionType / wishlist / activeCollectionFilter / folders。
 */
export function currentCompletionPct() {
  const type = getCollectionType(activeCollectionType.value) || getCollectionType("all");
  const all = wishlist.value;
  const f = activeCollectionFilter.value;
  if (f && f.type === "folder") {
    const folder = folders.value.find((x) => x.id === f.id);
    return targetCoverage(
      all.filter((e) => e && e.folderId === f.id).length,
      folder ? folder.target : null,
    ).pct;
  }
  return progressOf(type.id, all, {}).pct;
}

/**
 * 派生当前收藏视图数据（纯函数，组件据此渲染）。
 * 串联：registry.catalog（类型视图过滤）→ activeCollectionFilter（文件夹/标签）→ 搜索。
 * 完成度口径：
 *   - 文件夹筛选 → targetCoverage(条目数, folder.target)；
 *   - 其余 → registry 类型自带 progress（默认稀有度分级覆盖）。
 * @returns {{typeId:string, type:object, entries:object[], progress:object, distribution:object[]}}
 */
export function deriveCollectionView() {
  const type = getCollectionType(activeCollectionType.value) || getCollectionType("all");
  const all = wishlist.value;

  // 1) 类型视图过滤
  let entries = catalogOf(type.id, all, {});

  // 2) 文件夹 / 标签过滤
  const f = activeCollectionFilter.value;
  let folderTarget = null;
  if (f && f.type === "folder") {
    entries = entries.filter((e) => e && e.folderId === f.id);
    const folder = folders.value.find((x) => x.id === f.id);
    folderTarget = folder ? folder.target : null;
  } else if (f && f.type === "tag") {
    entries = entries.filter((e) => e && Array.isArray(e.tags) && e.tags.includes(f.id));
  }

  // 3) 标题搜索（本地过滤）
  const q = (searchQuery.value || "").trim().toLowerCase();
  if (q) entries = entries.filter((e) => matchesSearch(e, q));

  // 4) 按稀有度降序（unranked 恒末尾），与既有 wishlist 网格排序一致
  const weightOf = {};
  for (const t of rarityTiers.value) weightOf[t.id] = t.weight;
  entries = [...entries].sort((a, b) => {
    const wa = a.rarity != null && weightOf[a.rarity] != null ? weightOf[a.rarity] : -1;
    const wb = b.rarity != null && weightOf[b.rarity] != null ? weightOf[b.rarity] : -1;
    return wb - wa;
  });

  // 完成度
  let progress;
  if (f && f.type === "folder") {
    progress = targetCoverage(entries.length, folderTarget);
  } else {
    progress = progressOf(type.id, all, {});
  }

  const distribution = rarityDistribution(all, rarityTiers.value);
  return { typeId: type.id, type, entries, progress, distribution };
}

// ── 标签 action ──

/** 新增标签（按名）。已存在则复用，返回其 id。 */
export function addTag(name) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  const existing = tags.value.find((t) => t.name === clean);
  if (existing) return existing.id;
  const tag = normalizeTag({
    id: genId(),
    name: clean,
    createdAt: new Date().toISOString(),
  });
  tags.value = [...tags.value, tag];
  _persistTags();
  return tag.id;
}

/** 重命名标签：元数据 + 所有条目 tags 同步批量改（旧标签消失）。 */
export function renameTag(oldName, newName) {
  const cleanOld = String(oldName || "").trim();
  const cleanNew = String(newName || "").trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;
  const tag = tags.value.find((t) => t.name === cleanOld);
  if (!tag) return;
  // 元数据重命名
  tags.value = tags.value.map((t) =>
    t.name === cleanOld ? { ...t, name: cleanNew } : t,
  );
  // 条目同步
  let changed = false;
  const next = wishlist.value.map((e) => {
    if (e.tags.includes(cleanOld)) {
      changed = true;
      const tags2 = e.tags.map((x) => (x === cleanOld ? cleanNew : x));
      return normalizeEntry({ ...e, tags: tags2 });
    }
    return e;
  });
  batch(() => {
    _persistTags();
    if (changed) {
      wishlist.value = next;
      _persistWishlist();
    }
  });
}

/**
 * 删除标签。
 * @param {string} name
 * @param {{removeEntries?:boolean}} [opts] removeEntries=true 时一并移除含该标签的条目。
 */
export function deleteTag(name, opts = {}) {
  const clean = String(name || "").trim();
  if (!clean) return;
  const removeEntries = !!opts.removeEntries;
  tags.value = tags.value.filter((t) => t.name !== clean);
  let next = wishlist.value;
  if (removeEntries) {
    next = next.filter((e) => !e.tags.includes(clean));
  } else {
    next = next.map((e) => {
      if (e.tags.includes(clean)) {
        return normalizeEntry({ ...e, tags: e.tags.filter((x) => x !== clean) });
      }
      return e;
    });
  }
  batch(() => {
    _persistTags();
    if (next !== wishlist.value) {
      wishlist.value = next;
      _persistWishlist();
    }
  });
}

// ── 文件夹 action ──

/** 新建文件夹，返回 id。 */
export function createFolder(name) {
  const clean = String(name || "").trim() || "新收藏夹";
  const folder = normalizeFolder({
    id: genId(),
    name: clean,
    target: null,
    createdAt: new Date().toISOString(),
    order: folders.value.length,
  });
  folders.value = [...folders.value, folder];
  _persistFolders();
  bumpMetric("folder.create");
  return folder.id;
}

/** 重命名文件夹（folderId 不变，条目无需改动）。 */
export function renameFolder(id, name) {
  const clean = String(name || "").trim();
  if (!clean) return;
  folders.value = folders.value.map((f) =>
    f.id === id ? { ...f, name: clean } : f,
  );
  _persistFolders();
}

/**
 * 设置文件夹目标数量 N。n<=0 或 null → 取消目标。
 * @param {string} id
 * @param {number|null} n
 */
export function setFolderTarget(id, n) {
  const target = n == null || Number(n) <= 0 ? null : Math.max(1, Math.floor(Number(n)));
  folders.value = folders.value.map((f) =>
    f.id === id ? { ...f, target } : f,
  );
  _persistFolders();
}

/**
 * 删除文件夹。
 * @param {string} id
 * @param {{mode?:'keep'|'remove'}} [opts]
 *   'keep'（默认）= 保留条目，仅清除其 folderId；
 *   'remove' = 一并移除属于该文件夹的条目。
 */
export function deleteFolder(id, opts = {}) {
  const mode = opts.mode === "remove" ? "remove" : "keep";
  folders.value = folders.value.filter((f) => f.id !== id);
  let next = wishlist.value;
  if (mode === "remove") {
    next = next.filter((e) => e.folderId !== id);
  } else {
    next = next.map((e) => {
      if (e.folderId === id) return normalizeEntry({ ...e, folderId: null });
      return e;
    });
  }
  batch(() => {
    _persistFolders();
    if (next !== wishlist.value) {
      wishlist.value = next;
      _persistWishlist();
    }
  });
}

// ── 条目级 action（标签 / 文件夹 / 备注 / 评分）──

/** 更新指定条目（内部 helper，写回并持久化）。 */
function updateEntry(key, mutator) {
  let changed = false;
  const next = wishlist.value.map((e) => {
    if (e.key !== key) return e;
    changed = true;
    // 经 normalizeEntry 兜底，保证写入对象字段完整
    return normalizeEntry(mutator({ ...e }));
  });
  if (changed) {
    wishlist.value = next;
    _persistWishlist();
  }
  return changed;
}

/** 设置条目标签（按名数组，去重 + 去空）。缺失的标签元数据自动补全，保证侧栏统计与筛选可用。 */
export function setEntryTags(key, names) {
  const list = Array.isArray(names)
    ? [...new Set(names.map((x) => String(x).trim()).filter(Boolean))]
    : [];
  // 自动补全缺失标签元数据（按名去重，复用已有）
  for (const name of list) {
    if (!tags.value.find((t) => t.name === name)) {
      addTag(name);
    }
  }
  updateEntry(key, (e) => ({ ...e, tags: list }));
  bumpMetric("tag.set");
}

/** 设置条目所属文件夹（folderId 或 null）。 */
export function setEntryFolder(key, folderId) {
  const fid = typeof folderId === "string" ? folderId : null;
  updateEntry(key, (e) => ({ ...e, folderId: fid }));
}

/** 设置条目备注（本地，不上报）。 */
export function setNote(key, note) {
  updateEntry(key, (e) => ({ ...e, note: String(note == null ? "" : note) }));
  bumpMetric("note.set");
}

/** 设置条目评分（1–5，0=未评；自动裁剪）。 */
export function setRating(key, rating) {
  updateEntry(key, (e) => ({ ...e, rating: clampRating(rating) }));
  bumpMetric("rating.set");
}

// ── 稀有度（P1a · A）──

/**
 * 设置条目稀有度（覆盖式单选）。
 * @param {string} key 条目主键
 * @param {string|null} tierId 档位 id；null = 清除为 unranked
 */
export function setEntryRarity(key, tierId) {
  const id = typeof tierId === "string" && tierId ? tierId : null;
  updateEntry(key, (e) => ({ ...e, rarity: id }));
  bumpMetric("rarity.set");
}

/**
 * 批量设 common（Q1「批量设为 common」入口）。
 * @param {string[]} keys
 */
export function batchSetCommonRarity(keys) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!list.length) return;
  const next = wishlist.value.map((e) =>
    list.includes(e.key) ? normalizeEntry({ ...e, rarity: "common" }) : e,
  );
  wishlist.value = next;
  _persistWishlist();
  bumpMetric("rarity.set");
}

// ── 快捷收集（P0-3）──

/**
 * 一键收藏 / 取消（复用 add/remove，同 key 去重）。
 * @param {{platform:string,id:string,salePrice?:number,currency?:string,title?:string,thumb?:string}} game
 * @returns {boolean} true=已收藏，false=已取消
 */
export function toggleFavorite(game) {
  const key = getWishlistKey(game);
  if (isInWishlist(key)) {
    removeFromWishlist(key);
    return false;
  }
  addToWishlist(game);
  return true;
}

// ── 跨平台去重合并（P0-6）──

/**
 * 返回与 key 同组、且「当前心愿单中确实存在、且自身未处于合并态」的候选 key 列表。
 * 这是「可合并」徽标的判定依据（仅已存在 + 未合并的才提示）。
 * @param {string} key
 * @returns {string[]}
 */
export function findMergeCandidates(key) {
  const candidates = mapFindMergeCandidates(key);
  if (!candidates.length) return [];
  const byKey = new Map(wishlist.value.map((e) => [e.key, e]));
  const self = byKey.get(key);
  if (!self || (self.mergedMembers && self.mergedMembers.length)) return [];
  return candidates.filter((k) => {
    const e = byKey.get(k);
    return e && !(e.mergedMembers && e.mergedMembers.length);
  });
}

/**
 * 合并多条记录为一条主记录。
 * 主记录沿用 primaryKey（默认列表第一个），其余从 wishlist 移除、快照进 mergedMembers。
 * @param {string[]} keys 待合并的条目 key（≥2）
 * @param {string} [primaryKey] 主记录 key（默认 keys[0]）
 * @returns {string|null} 主记录 key；参数非法返回 null
 */
export function mergeEntries(keys, primaryKey) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (list.length < 2) return null;
  const byKey = new Map(wishlist.value.map((e) => [e.key, e]));
  const entries = list.map((k) => byKey.get(k)).filter(Boolean);
  if (entries.length < 2) return null;
  const primary = (primaryKey && byKey.get(primaryKey)) || entries[0];
  const primaryKeyResolved = primary.key;

  // 全量快照：每个成员都存当前价，便于并排展示与统计展开
  const members = entries.map((e) => ({
    key: e.key,
    platform: e.platform,
    id: e.id,
    title: e.title,
    thumb: e.thumb,
    addedPrice: e.addedPrice,
    currency: e.currency,
    isPrimary: e.key === primaryKeyResolved,
    currentPrice: e.currentPrice,
    currentCurrency: e.currentCurrency,
  }));

  const mergedIds = entries.map((e) => e.key);
  const others = wishlist.value.filter((e) => !mergedIds.includes(e.key));

  const primaryEntry = normalizeEntry({
    ...primary,
    mergedIds,
    mergedMembers: members,
  });

  batch(() => {
    wishlist.value = [primaryEntry, ...others];
    expandedMergeKey.value = primaryKeyResolved;
    _persistWishlist();
  });
  bumpMetric("merge");
  return primaryKeyResolved;
}

/**
 * 拆分还原：由 mergedMembers 重建非主记录，主记录清 merged*。
 * @param {string} key 合并主记录 key
 * @returns {boolean} 是否成功拆分
 */
export function splitEntry(key) {
  const entry = wishlist.value.find((e) => e.key === key);
  if (!entry || !(entry.mergedMembers && entry.mergedMembers.length)) return false;
  const rebuilt = entry.mergedMembers
    .filter((m) => !m.isPrimary)
    .map((m) =>
      normalizeEntry({
        key: m.key,
        platform: m.platform,
        id: m.id,
        title: m.title,
        thumb: m.thumb,
        addedPrice: m.addedPrice,
        currency: m.currency,
        addedAt: new Date().toISOString(),
        currentPrice: m.currentPrice,
        currentCurrency: m.currentCurrency,
      }),
    );
  const primaryEntry = normalizeEntry({
    ...entry,
    mergedIds: [],
    mergedMembers: null,
  });
  const others = wishlist.value.filter((e) => e.key !== key);
  batch(() => {
    wishlist.value = [primaryEntry, ...rebuilt, ...others];
    expandedMergeKey.value = null;
    _persistWishlist();
  });
  bumpMetric("split");
  return true;
}

// ── 统计（P0-5）──

/**
 * 收藏统计：总数 / 按当前价总值 / 累计节省（合并条目按 mergedMembers 展开）。
 * 纯本地派生；所有数值读取走 currentPriceOf/savedOf。
 * @returns {{total:number, totalValue:number, totalSaved:number}}
 */
export function collectionStats() {
  return computeCollectionStats(wishlist.value);
}

/**
 * 刷新心愿单当前价（阶段1 钩子，暂不自动触发，不接入任何网络）。
 * 预留给后续手动「刷新价格」按钮或后台价格同步使用。
 */
export function refreshWishlistPrices() {
  /* no-op：阶段1 不自动拉价，统计基于已存 currentPrice/addedPrice */
}

// ── UI 动作（弹窗 / 展开）──

/** 打开备注/评分弹窗。 */
export function openNoteRating(key) {
  noteRatingTarget.value = key;
}

/** 关闭备注/评分弹窗。 */
export function closeNoteRating() {
  noteRatingTarget.value = null;
}

/** 打开合并确认弹窗（已知映射命中）。 */
export function openMerge(keys, unknown = false) {
  mergeCandidateKeys.value = Array.isArray(keys) ? [...keys] : [];
  mergeIsUnknown.value = !!unknown;
}

/** 打开合并确认弹窗（手动合并，提示「映射未知请自确认」）。 */
export function openMergeManual(baseKey) {
  openMerge([baseKey], true);
}

/** 关闭合并确认弹窗。 */
export function closeMerge() {
  mergeCandidateKeys.value = [];
  mergeIsUnknown.value = false;
}

/** 切换合并主记录的展开/收起。 */
export function toggleExpandMerge(key) {
  expandedMergeKey.value = expandedMergeKey.value === key ? null : key;
}

// ── 标题搜索（本地派生，不发 IPC）──────────────────────────────────

/**
 * 标题搜索匹配（不区分大小写）。
 * 命中维度：游戏标题 + 平台 label（便于「steam / 蒸汽」等别名检索）。
 */
export function matchesSearch(game, q) {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return true;
  const platLabel =
    (PLATFORMS.find((p) => p.key === game.platform) || {}).label ||
    game.platform ||
    "";
  const hay = [game.title, platLabel].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(needle);
}

let _searchTimer = null;
/** 200ms 防抖写入 searchQuery，避免逐字重渲整网格。 */
export function setSearchQuery(v) {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    searchQuery.value = v || "";
  }, 200);
}
/** 立即清空搜索（清除按钮 / Esc）。 */
export function clearSearchQuery() {
  if (_searchTimer) clearTimeout(_searchTimer);
  searchQuery.value = "";
}

/**
 * 计算「我关注的游戏是否降价」信息。
 * 规则与 games-check-scheduler 一致：当前 salePrice < 关注时 addedPrice。
 * 命中返回 { dropped, delta, pct, currency }，否则 null。
 * GameCard 仅 deals/free 模式渲染（wishlist 模式 card.salePrice 已被覆写为 addedPrice → 自然返回 null）。
 */
export function getDropInfo(game) {
  const entry = wishlist.value.find((w) => w.key === getWishlistKey(game));
  if (!entry) return null;
  const added = Number(entry.addedPrice) || 0;
  const cur = Number(game.salePrice) || 0;
  if (added <= 0 || cur >= added) return null;
  const delta = added - cur;
  const pct = delta / added;
  return { dropped: true, delta, pct, currency: entry.currency || game.currency || "USD" };
}

// ── 本地埋点（P1a · E）──

/** 读取埋点计数；缺失回退空对象。损坏数据静默回退空。 */
export function loadMetrics() {
  const raw = readStorage(METRICS_KEY);
  if (!raw) {
    metrics.value = {};
    return;
  }
  try {
    const o = JSON.parse(raw);
    metrics.value =
      o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    metrics.value = {};
  }
}

/**
 * 自增某事件计数（作为 action 副作用调用）。
 * 全程 try/catch + peek() 读取，任何异常不影响主 action 语义与返回值。
 * @param {string} name
 */
export function bumpMetric(name) {
  try {
    const next = bumpMetricPure(metrics.peek(), name);
    metrics.value = next;
    // 持久化由 initCollectionEngines 的 debounced effect 处理（500ms 静默后写盘），
    // 避免连续微操作（连续打标签/评分）时每次都同步写 localStorage。
  } catch {
    /* 任何异常吞掉，绝不破坏主流程 */
  }
}

// ── 组合徽章（P1b · B）──

/** 读取已点亮徽章集合；缺失回退空对象，损坏数据静默回退空。 */
export function loadBadges() {
  const raw = readStorage(BADGES_KEY);
  if (!raw) {
    badgesEarned.value = {};
    return;
  }
  try {
    const o = JSON.parse(raw);
    badgesEarned.value =
      o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    badgesEarned.value = {};
  }
}

// ── 成就系统（P1c · C）──

/** 读取用户成就定义；缺失回退空数组，损坏数据静默回退空。 */
export function loadAchDef() {
  const raw = readStorage(ACH_DEF_KEY);
  if (!raw) {
    achievementsDef.value = [];
    return;
  }
  try {
    const arr = JSON.parse(raw);
    achievementsDef.value = Array.isArray(arr) ? arr : [];
  } catch {
    achievementsDef.value = [];
  }
}

/** 读取成就进度；缺失回退空对象，损坏数据静默回退空。 */
export function loadAchProgress() {
  const raw = readStorage(ACH_PROGRESS_KEY);
  if (!raw) {
    achievementsProgress.value = {};
    return;
  }
  try {
    const o = JSON.parse(raw);
    achievementsProgress.value =
      o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    achievementsProgress.value = {};
  }
}

/** 规范化用户成就定义（补全字段 / 校验维度；非法返回 null）。 */
function normalizeAchDef(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : genId();
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
  if (!name) return null;
  const dimension = ["tag", "folder", "platform", "rarity", "merged"].includes(raw.dimension)
    ? raw.dimension
    : null;
  if (!dimension) return null;
  const target = dimension === "merged" ? null : (raw.target == null ? null : raw.target);
  const threshold = Math.max(1, Math.floor(Number(raw.threshold) || 1));
  return { id, name, dimension, target, threshold };
}

function _persistAchDef() {
  try {
    writeStorage(ACH_DEF_KEY, JSON.stringify(achievementsDef.value));
  } catch {
    /* 忽略 */
  }
}
function _persistAchProgress() {
  try {
    writeStorage(ACH_PROGRESS_KEY, JSON.stringify(achievementsProgress.value));
  } catch {
    /* 忽略 */
  }
}

/** 新增用户成就，返回新 id。进度重算由 initCollectionEngines 的 effect 自动处理。 */
export function addAchievement(def) {
  const clean = normalizeAchDef(def);
  if (!clean) return null;
  achievementsDef.value = [...achievementsDef.value, clean];
  _persistAchDef();
  return clean.id;
}

/** 更新用户成就（id 不变）。进度重算由 effect 自动处理。 */
export function updateAchievement(id, patch) {
  if (!id) return;
  let found = false;
  achievementsDef.value = achievementsDef.value.map((d) => {
    if (d.id !== id) return d;
    found = true;
    return normalizeAchDef({ ...d, ...patch, id });
  });
  if (!found) return;
  _persistAchDef();
}

/** 删除用户成就。进度重算由 effect 自动处理。 */
export function deleteAchievement(id) {
  if (!id) return;
  achievementsDef.value = achievementsDef.value.filter((d) => d.id !== id);
  _persistAchDef();
}

// ── 限时活动（P1c · D）──

/** 读取活动配置 + 进度；缺失回退空，损坏数据静默回退空。 */
export function loadEvents() {
  const rawCfg = readStorage(EVENTS_CONFIG_KEY);
  if (rawCfg) {
    try {
      const arr = JSON.parse(rawCfg);
      eventsConfig.value = Array.isArray(arr) ? arr : [];
    } catch {
      eventsConfig.value = [];
    }
  } else {
    eventsConfig.value = [];
  }

  const rawProg = readStorage(EVENTS_PROGRESS_KEY);
  if (rawProg) {
    try {
      const o = JSON.parse(rawProg);
      eventsProgress.value =
        o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch {
      eventsProgress.value = {};
    }
  } else {
    eventsProgress.value = {};
  }
}

/** 规范化用户活动配置（补全字段 / 校验时间窗 + 维度；非法返回 null）。 */
function normalizeEventDef(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : genId();
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null;
  if (!title) return null;
  if (typeof raw.startAt !== "string" || isNaN(new Date(raw.startAt).getTime())) return null;
  if (typeof raw.endAt !== "string" || isNaN(new Date(raw.endAt).getTime())) return null;
  const dimension = ["tag", "folder", "platform", "rarity", "merged"].includes(raw.dimension)
    ? raw.dimension
    : null;
  if (!dimension) return null;
  const target = dimension === "merged" ? null : (raw.target == null ? null : raw.target);
  const threshold = Math.max(1, Math.floor(Number(raw.threshold) || 1));
  return { id, title, startAt: raw.startAt, endAt: raw.endAt, dimension, target, threshold };
}

function _persistEventsConfig() {
  try {
    writeStorage(EVENTS_CONFIG_KEY, JSON.stringify(eventsConfig.value));
  } catch {
    /* 忽略 */
  }
}
function _persistEventsProgress() {
  try {
    writeStorage(EVENTS_PROGRESS_KEY, JSON.stringify(eventsProgress.value));
  } catch {
    /* 忽略 */
  }
}

/** 新增用户活动，返回新 id。进度重算由 initCollectionEngines 的 effect 自动处理。 */
export function addEvent(cfg) {
  const clean = normalizeEventDef(cfg);
  if (!clean) return null;
  eventsConfig.value = [...eventsConfig.value, clean];
  _persistEventsConfig();
  return clean.id;
}

/** 更新用户活动（id 不变）。进度重算由 effect 自动处理。 */
export function updateEvent(id, patch) {
  if (!id) return;
  let found = false;
  eventsConfig.value = eventsConfig.value.map((c) => {
    if (c.id !== id) return c;
    found = true;
    return normalizeEventDef({ ...c, ...patch, id });
  });
  if (!found) return;
  _persistEventsConfig();
}

/** 删除用户活动。进度重算由 effect 自动处理。 */
export function deleteEvent(id) {
  if (!id) return;
  eventsConfig.value = eventsConfig.value.filter((c) => c.id !== id);
  _persistEventsConfig();
}

/**
 * 领取活动奖励：仅在已完成（completed）时生效，置 claimed=true 并落盘。
 * @param {string} id
 * @returns {boolean} 是否成功领取
 */
export function claimEvent(id) {
  if (!id) return false;
  const prog = eventsProgress.value[id];
  if (!prog || !prog.completed) return false;
  const next = { ...eventsProgress.value, [id]: { ...prog, claimed: true } };
  eventsProgress.value = next;
  _persistEventsProgress();
  return true;
}

// ── 解锁庆祝检测（Phase 2.5）──

/**
 * 计算当前「已点亮集合」key 集合（'badge:'+id / 'ach:'+id / 'event:'+id）。
 * 纯函数，供解锁庆祝 diff 使用。
 * @param {Array<object>} entries 收藏条目
 * @returns {Set<string>}
 */
export function computeUnlocked(entries) {
  const set = new Set();
  for (const b of evaluateBadges(entries, buildBadgeCtx(entries))) set.add("badge:" + b.id);
  const ach = evaluateAchievements(
    entries,
    [...DEFAULT_ACHIEVEMENTS, ...achievementsDef.value],
    achievementsProgress.peek(),
  );
  for (const [id, p] of Object.entries(ach)) if (p.unlocked) set.add("ach:" + id);
  const ev = evaluateEvents(
    entries,
    [...DEFAULT_EVENTS, ...eventsConfig.value],
    eventsProgress.peek(),
  );
  for (const [id, p] of Object.entries(ev)) if (p.completed) set.add("event:" + id);
  return set;
}

/**
 * 基于「上一次已点亮集合」diff，返回本次新解锁项（供解锁庆祝推 toast）。
 * @param {Set<string>|string[]} prev 上一次已点亮 key 集合
 * @param {Array<object>} entries 当前收藏条目
 * @returns {{newOnes:Array<{kind:string,id:string,title:string,desc:string}>, set:Set<string>}}
 */
export function detectNewUnlocks(prev, entries) {
  const prevSet = prev instanceof Set ? prev : new Set(Array.isArray(prev) ? prev : []);
  const set = computeUnlocked(entries);
  const newOnes = [];
  for (const key of set) {
    if (prevSet.has(key)) continue;
    const [kind, id] = key.split(":", 2);
    if (kind === "badge") {
      const r = getBadgeRule(id);
      newOnes.push({ kind, id, title: (r && r.name) || "徽章", desc: (r && r.desc) || "" });
    } else if (kind === "ach") {
      const d = [...DEFAULT_ACHIEVEMENTS, ...achievementsDef.value].find((x) => x.id === id);
      newOnes.push({ kind, id, title: (d && d.name) || "成就", desc: "达成目标" });
    } else {
      const d = [...DEFAULT_EVENTS, ...eventsConfig.value].find((x) => x.id === id);
      newOnes.push({ kind, id, title: (d && d.title) || "活动", desc: "达成目标" });
    }
  }
  return { newOnes, set };
}

/**
 * 启动收藏引擎：订阅 wishlist signal，自动重算各派生集合并落盘。
 * 当前批次（P1b）注册「徽章」引擎；P1c 将在此追加成就 / 活动引擎 effect。
 *
 * 约定（见架构 §4.2 / §7 共享知识）：
 *  - 仅订阅 wishlist.value（作为 effect 依赖），读取自身 signal 用 .peek() 避免自订阅死循环；
 *  - 返回 stop() 句柄，供 GamesLayout 的 useEffect cleanup 调用，避免 effect 泄漏 / 重复订阅。
 *
 * @returns {() => void} 停止所有已注册引擎 effect 的句柄
 */
export function initCollectionEngines() {
  const stops = [];

  // 徽章引擎：订阅 wishlist，重算已点亮徽章并落盘（徽章无历史进度，仅当前命中集）
  stops.push(
    effect(() => {
      const entries = wishlist.value;
      // evaluateBadges 返回 [{id, earnedAt}]；信号/存储统一为 {[id]: {earnedAt}}
      const earnedArr = evaluateBadges(entries, buildBadgeCtx(entries));
      const earned = {};
      for (const b of earnedArr) earned[b.id] = { earnedAt: b.earnedAt };
      badgesEarned.value = earned;
      try {
        writeStorage(BADGES_KEY, JSON.stringify(earned));
      } catch {
        /* 落盘失败不抛，信号已更新 */
      }
    }),
  );

  // 成就引擎（P1c · C）：订阅 wishlist，合并 DEFAULT + 用户成就重算解锁态并落盘。
  // 读取自身进度用 .peek() 避免自订阅死循环；读取 achievementsDef.value 以纳入用户成就。
  stops.push(
    effect(() => {
      const entries = wishlist.value;
      const next = evaluateAchievements(
        entries,
        [...DEFAULT_ACHIEVEMENTS, ...achievementsDef.value],
        achievementsProgress.peek(),
      );
      achievementsProgress.value = next;
      try {
        writeStorage(ACH_PROGRESS_KEY, JSON.stringify(next));
      } catch {
        /* 落盘失败不抛，信号已更新 */
      }
    }),
  );

  // 限时活动引擎（P1c · D）：订阅 wishlist，合并 DEFAULT + 用户活动重算进度并落盘。
  // 窗口外锁存历史（claimed/completed/progress 保留）；窗口内重算进度与完成态。
  stops.push(
    effect(() => {
      const entries = wishlist.value;
      const next = evaluateEvents(
        entries,
        [...DEFAULT_EVENTS, ...eventsConfig.value],
        eventsProgress.peek(),
      );
      eventsProgress.value = next;
      try {
        writeStorage(EVENTS_PROGRESS_KEY, JSON.stringify(next));
      } catch {
        /* 落盘失败不抛，信号已更新 */
      }
    }),
  );

  // 本地埋点持久化（debounce 500ms）：bumpMetric 只更新 signal，
  // 连续微操作静默 500ms 后统一写一次 localStorage。
  let _metricsTimer = null;
  stops.push(
    effect(() => {
      const m = metrics.value;
      if (_metricsTimer) clearTimeout(_metricsTimer);
      _metricsTimer = setTimeout(() => {
        try {
          writeStorage(METRICS_KEY, JSON.stringify(m));
        } catch {
          /* 落盘失败不抛 */
        }
      }, 500);
    }),
  );

  // 解锁庆祝检测（Phase 2.5）：订阅 wishlist，diff 已点亮集合，新解锁则推 toast。
  // 首次运行仅建立基线（不弹 toast）；读取自身进度用 .peek() 避免自订阅死循环。
  let _prevUnlocked = null;
  let _unlockFirst = true;
  stops.push(
    effect(() => {
      const entries = wishlist.value;
      const { newOnes, set } = detectNewUnlocks(_prevUnlocked, entries);
      if (!_unlockFirst) {
        for (const u of newOnes) {
          pushUnlockToast(u.kind, u.title, u.desc);
          pushUnlockHistory(u.kind, u.title, u.desc);
        }
      }
      _unlockFirst = false;
      _prevUnlocked = set;
    }),
  );

  // 里程碑粒子检测（Phase 2.5）：订阅收藏完成度，越过阈值触发粒子动效。
  let _prevPct = 0;
  let _msFirst = true;
  stops.push(
    effect(() => {
      const pct = currentCompletionPct();
      if (_msFirst) {
        _msFirst = false;
        _prevPct = pct;
        return;
      }
      const type = getCollectionType(activeCollectionType.value) || getCollectionType("all");
      const crossed = crossedMilestones(_prevPct, pct, type.milestone);
      if (crossed.length) {
        milestoneFx.value = { pct: crossed[crossed.length - 1], at: Date.now() };
      }
      _prevPct = pct;
    }),
  );

  return () => {
    for (const stop of stops) {
      try {
        stop();
      } catch {
        /* 忽略 */
      }
    }
  };
}

// ── 解锁历史持久化（Phase 2.6）──
const UNLOCK_HISTORY_KEY = "pulse.games.unlockHistory.v1";

/** 读取解锁历史（最新在前，上限 50）。损坏数据静默回退空。 */
export function loadUnlockHistory() {
  const raw = readStorage(UNLOCK_HISTORY_KEY);
  if (!raw) {
    unlockHistory.value = [];
    return;
  }
  try {
    const arr = JSON.parse(raw);
    unlockHistory.value = Array.isArray(arr) ? arr.slice(0, 50) : [];
  } catch {
    unlockHistory.value = [];
  }
}

function _persistUnlockHistory() {
  try {
    writeStorage(UNLOCK_HISTORY_KEY, JSON.stringify(unlockHistory.value));
  } catch {
    /* 忽略 */
  }
}

function _persistWishlist() {
  try {
    writeStorage(WISHLIST_KEY, JSON.stringify(wishlist.value));
  } catch {
    /* 忽略 */
  }
}

/** 读取已通知降价集合（scheduler 用于 diff）。 */
export function loadSeenDropKeys() {
  const raw = readStorage(SEEN_DROP_KEY);
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

/** 持久化已通知降价集合。 */
export function saveSeenDropKeys(set) {
  try {
    writeStorage(SEEN_DROP_KEY, JSON.stringify([...set]));
  } catch {
    /* 忽略 */
  }
}

/** 用户查看心愿单后清除降价红点。 */
export function clearGamesNewDrop() {
  gamesHasNewDrop.value = false;
}

/** 设置降价通知开关。 */
export function setGamesNotifyOnDrop(v) {
  gamesNotifyOnDrop.value = !!v;
  persistSettings();
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

// ── 史低增强（lowPriceMap 渐进填充）─────────────────────────────────

/** 从 game.id 提取 steamAppID（"steam-367520" → "367520"）。非 steam 返回 null。 */
export function extractSteamAppId(id) {
  if (typeof id !== "string") return null;
  const m = id.match(/^steam-(.+)$/);
  return m && m[1] ? m[1] : null;
}

/**
 * 后台异步查 Steam 游戏的史低价（cheapshark /games，每批 5 并发）。
 * 结果渐进写入 lowPriceMap，GameCard 读 map 判定徽标。
 */
export async function enrichSteamLowest() {
  const token = ++_steamLowToken;
  const steamGames = (items.value || []).filter(
    (it) => it && it.platform === "steam" && extractSteamAppId(it.id),
  );
  const pending = steamGames.filter((it) => lowPriceMap.value[it.id] == null);
  if (pending.length === 0) return;

  const BATCH = 5;
  for (let i = 0; i < pending.length; i += BATCH) {
    if (token !== _steamLowToken) return; // 已被新任务取代
    const batch = pending.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (g) => {
        const appId = extractSteamAppId(g.id);
        const res = await api.getSteamLowest({ steamAppId: appId });
        if (res && res.lowestPrice != null) return [g.id, res.lowestPrice];
        return null;
      }),
    );
    const batchMap = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        batchMap[r.value[0]] = r.value[1];
      }
    }
    if (token === _steamLowToken && Object.keys(batchMap).length > 0) {
      lowPriceMap.value = { ...lowPriceMap.value, ...batchMap };
    }
    if (i + BATCH < pending.length) {
      await new Promise((r) => setTimeout(r, 0)); // 让出主线程
    }
  }
}

/**
 * 后台异步查 Xbox 游戏的史低价（ITAD /prices 批量）。
 */
export async function enrichXboxLowest() {
  const token = ++_xboxLowToken;
  const xboxGames = (items.value || []).filter((it) => it && it.platform === "xbox");
  const pending = xboxGames.filter((it) => lowPriceMap.value[it.id] == null);
  if (pending.length === 0) return;

  const slugs = pending
    .map((g) => (g.id && g.id.startsWith("xbox-") ? g.id.slice(5) : null))
    .filter(Boolean);
  if (slugs.length === 0) return;

  try {
    const res = await api.getItadLowest({ slugs });
    if (token !== _xboxLowToken) return;
    const batchMap = {};
    if (res && res.lowestMap) {
      for (const g of pending) {
        const slug = g.id.startsWith("xbox-") ? g.id.slice(5) : null;
        if (slug && res.lowestMap[slug] != null) {
          batchMap[g.id] = res.lowestMap[slug];
        }
      }
    }
    if (Object.keys(batchMap).length > 0) {
      lowPriceMap.value = { ...lowPriceMap.value, ...batchMap };
    }
  } catch {
    /* ITAD 失败静默，不显示徽标 */
  }
}

// 重新导出纯函数，供组件统一从 gamesStore 引入（避免散落 imports）
export {
  currentPriceOf,
  savedOf,
  clampRating,
  RATING_MIN,
  RATING_MAX,
  RARITY_MIN,
  RARITY_MAX,
  computeCollectionStats,
  normalizeEntry,
  normalizeFolder,
  normalizeTag,
  areCandidatesKnown,
  // P1a（A 稀有度）纯函数与常量
  DEFAULT_RARITY_TIERS,
  normalizeRarityTier,
  sortByWeight,
  tierColorOf,
  // P1a（E 埋点）纯函数
  mergeMetrics,
  // P1b（B 组合徽章）纯函数
  evaluateBadges,
  buildBadgeCtx,
  // P1c（C 成就 / D 活动）纯函数与常量
  evaluateAchievements,
  DEFAULT_ACHIEVEMENTS,
  countMatches,
  evaluateEvents,
  DEFAULT_EVENTS,
  isEventActive,
  // Phase 2 统一游戏收藏：类型注册表纯函数
  DEFAULT_COLLECTION_TYPES,
  getCollectionType,
  listCollectionTypes,
  catalogOf,
  progressOf,
  rarityDistribution,
  rarityCoverage,
  targetCoverage,
  crossedMilestones,
  clampPct,
};
