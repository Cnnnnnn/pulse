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

import { signal, batch } from "@preact/signals";
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
} from "./types.js";
import {
  findMergeCandidates as mapFindMergeCandidates,
  areCandidatesKnown,
} from "./gameIdMap.js";

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
}

/** 取消关注（移除心愿单条目）。 */
export function removeFromWishlist(key) {
  wishlist.value = wishlist.value.filter((w) => w.key !== key);
  // 若移除的是正在展开的合并主记录，清掉展开态
  if (expandedMergeKey.value === key) expandedMergeKey.value = null;
  _persistWishlist();
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
/** 备注/评分弹窗目标 key（null = 关闭）。 */
export const noteRatingTarget = signal(null);
/** 合并确认弹窗候选 key 列表。 */
export const mergeCandidateKeys = signal([]);
/** 合并确认是否为「映射未知」手动合并（决定提示文案）。 */
export const mergeIsUnknown = signal(false);
/** 当前展开的合并主记录 key（null = 无）。 */
export const expandedMergeKey = signal(null);

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
}

/** 设置条目所属文件夹（folderId 或 null）。 */
export function setEntryFolder(key, folderId) {
  const fid = typeof folderId === "string" ? folderId : null;
  updateEntry(key, (e) => ({ ...e, folderId: fid }));
}

/** 设置条目备注（本地，不上报）。 */
export function setNote(key, note) {
  updateEntry(key, (e) => ({ ...e, note: String(note == null ? "" : note) }));
}

/** 设置条目评分（1–5，0=未评；自动裁剪）。 */
export function setRating(key, rating) {
  updateEntry(key, (e) => ({ ...e, rating: clampRating(rating) }));
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
  computeCollectionStats,
  normalizeEntry,
  normalizeFolder,
  normalizeTag,
  areCandidatesKnown,
};
