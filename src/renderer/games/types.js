/**
 * src/renderer/games/types.js
 *
 * 游戏收集模块 — 纯函数与 Schema 默认值（单一真源）。
 *
 * ⚠️ 共享知识约定 #2：所有「收藏条目 / 文件夹 / 标签 / 合并成员」的
 * 字段默认值**只在这里集中补全**，组件与 store 严禁散落默认值。
 *
 * 本文件不依赖任何外部模块（不引入 api / store），保证纯函数可单测、
 * 且绝不产生网络出口。
 */

/* ── 收藏条目 WishlistEntry ─────────────────────────────────────────── */

/**
 * WishlistEntry 完整字段默认值。任何「缺字段」的 raw 对象过 normalizeEntry
 * 后都会补齐这些默认值，做到向后兼容旧 wishlist.v1（不报错、不丢数据）。
 */
export const ENTRY_DEFAULTS = {
  tags: /** @type {string[]} */ ([]),
  folderId: /** @type {string|null} */ (null),
  note: "",
  rating: 0,
  currentPrice: /** @type {number|null} */ (null),
  currentCurrency: /** @type {string|null} */ (null),
  mergedIds: /** @type {string[]} */ ([]),
  mergedMembers: /** @type {import("./types.js").MergedMember[]|null} */ (null),
};

/**
 * 将任意 raw 对象规整为完整 WishlistEntry。
 * - 数值做 clamp / NaN 兜底；
 * - 数组字段过滤非法元素；
 * - 缺字段补 ENTRY_DEFAULTS。
 * @param {any} raw
 * @returns {import("./types.js").WishlistEntry}
 */
export function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      key: "",
      platform: "unknown",
      id: "",
      title: "",
      thumb: null,
      addedPrice: 0,
      currency: "USD",
      addedAt: "",
      ...ENTRY_DEFAULTS,
    };
  }

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t) => typeof t === "string")
    : [];

  const mergedIds = Array.isArray(raw.mergedIds)
    ? raw.mergedIds.filter((x) => typeof x === "string")
    : [];

  // 评分统一走 clampRating（整数星：四舍五入 + 区间裁剪），避免散落 clamp 逻辑。
  const rating = clampRating(raw.rating);

  const addedPrice = Number(raw.addedPrice);
  const currentPriceRaw = raw.currentPrice == null ? null : Number(raw.currentPrice);
  const currentPrice =
    currentPriceRaw == null || !Number.isFinite(currentPriceRaw)
      ? null
      : currentPriceRaw;

  const folderId =
    raw.folderId === null || raw.folderId === undefined
      ? null
      : typeof raw.folderId === "string"
        ? raw.folderId
        : null;

  return {
    key: typeof raw.key === "string" ? raw.key : "",
    platform: typeof raw.platform === "string" ? raw.platform : "unknown",
    id: raw.id != null ? String(raw.id) : "",
    title: typeof raw.title === "string" ? raw.title : "",
    thumb: typeof raw.thumb === "string" ? raw.thumb : null,
    addedPrice: Number.isFinite(addedPrice) ? addedPrice : 0,
    currency: typeof raw.currency === "string" && raw.currency ? raw.currency : "USD",
    addedAt: typeof raw.addedAt === "string" ? raw.addedAt : "",
    tags,
    folderId,
    note: typeof raw.note === "string" ? raw.note : "",
    rating,
    currentPrice,
    currentCurrency:
      typeof raw.currentCurrency === "string" ? raw.currentCurrency : null,
    mergedIds,
    mergedMembers: Array.isArray(raw.mergedMembers) ? raw.mergedMembers : null,
  };
}

/* ── 合并成员 MergedMember ──────────────────────────────────────────── */

/**
 * 由一条 WishlistEntry 生成合并快照成员。
 * @param {import("./types.js").WishlistEntry} entry
 * @param {boolean} isPrimary
 * @returns {import("./types.js").MergedMember}
 */
export function createMergedMember(entry, isPrimary) {
  return {
    key: entry.key,
    platform: entry.platform,
    id: entry.id,
    title: entry.title,
    thumb: entry.thumb,
    addedPrice: entry.addedPrice,
    currency: entry.currency,
    currentPrice: entry.currentPrice != null ? entry.currentPrice : entry.addedPrice,
    currentCurrency: entry.currentCurrency || entry.currency,
    isPrimary: !!isPrimary,
  };
}

/* ── 文件夹 Folder ──────────────────────────────────────────────────── */

/**
 * @param {any} raw
 * @returns {import("./types.js").Folder}
 */
export function normalizeFolder(raw) {
  if (!raw || typeof raw !== "object") {
    return { id: "", name: "", target: null, createdAt: "", order: 0 };
  }
  const target = Number(raw.target);
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    name: typeof raw.name === "string" ? raw.name : "",
    target: Number.isFinite(target) && target > 0 ? Math.floor(target) : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
  };
}

/* ── 标签 Tag ───────────────────────────────────────────────────────── */

/**
 * @param {any} raw
 * @returns {import("./types.js").Tag}
 */
export function normalizeTag(raw) {
  if (!raw || typeof raw !== "object") {
    return { id: "", name: "", createdAt: "" };
  }
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    name: typeof raw.name === "string" ? raw.name : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
  };
}

/* ── 收藏筛选 CollectionFilter ──────────────────────────────────────── */

export const EMPTY_COLLECTION_FILTER = { type: null, id: null };

/**
 * @param {any} raw
 * @returns {import("./types.js").CollectionFilter}
 */
export function normalizeCollectionFilter(raw) {
  if (!raw || typeof raw !== "object") return { ...EMPTY_COLLECTION_FILTER };
  const type =
    raw.type === "folder" || raw.type === "tag" ? raw.type : null;
  const id = type && typeof raw.id === "string" ? raw.id : null;
  // type 与 id 必须同时有效，否则视为「不过滤」
  if (!type || !id) return { ...EMPTY_COLLECTION_FILTER };
  return { type, id };
}

/* ── 评分区间 ──────────────────────────────────────────────────────── */

/** 评分下限（0 = 未评）。 */
export const RATING_MIN = 0;
/** 评分上限（5 = 满分）。 */
export const RATING_MAX = 5;

/**
 * 将评分裁剪到 [RATING_MIN, RATING_MAX]（非法值归零）。
 * @param {any} r
 * @returns {number}
 */
export function clampRating(r) {
  let n = Number(r);
  // 评分按整数星处理：非法值归零，合法值四舍五入后再裁剪到 [RATING_MIN, RATING_MAX]
  if (!Number.isFinite(n)) n = RATING_MIN;
  else n = Math.round(n);
  if (n < RATING_MIN) n = RATING_MIN;
  if (n > RATING_MAX) n = RATING_MAX;
  return n;
}

/* ── 价格选择器（组件统一自此读取，绝不散落直读 addedPrice）─────── */

/**
 * 读取「价格承载对象」（收藏条目或合并成员）的当前价。
 * 当前价缺失时回退加入价，保证统计 / 展示不出现 NaN。
 * @param {{currentPrice?:number|null, addedPrice?:number}} x
 * @returns {number}
 */
export function currentPriceOf(x) {
  if (!x || typeof x !== "object") return 0;
  const cur = x.currentPrice;
  if (cur != null) {
    const n = Number(cur);
    if (Number.isFinite(n)) return n;
  }
  const added = Number(x.addedPrice);
  return Number.isFinite(added) ? added : 0;
}

/**
 * 累计节省 = max(0, 加入价 − 当前价)。
 * @param {{addedPrice?:number, currentPrice?:number|null}} x
 * @returns {number}
 */
export function savedOf(x) {
  if (!x || typeof x !== "object") return 0;
  const added = Number(x.addedPrice);
  if (!Number.isFinite(added)) return 0;
  return Math.max(0, added - currentPriceOf(x));
}

/* ── 统计（P0-5）──────────────────────────────────────────────────── */

/**
 * 收藏统计：总数 / 按当前价总值 / 累计节省（合并条目按 mergedMembers 展开）。
 * @param {import("./types.js").WishlistEntry[]} entries
 * @returns {{total:number, totalValue:number, totalSaved:number}}
 */
export function computeCollectionStats(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let total = 0;
  let totalValue = 0;
  let totalSaved = 0;
  for (const e of list) {
    const members =
      e && e.mergedMembers && Array.isArray(e.mergedMembers) && e.mergedMembers.length
        ? e.mergedMembers
        : [e];
    for (const m of members) {
      total += 1;
      totalValue += currentPriceOf(m);
      totalSaved += savedOf(m);
    }
  }
  return { total, totalValue, totalSaved };
}

/* ── ID 生成 ──────────────────────────────────────────────────────── */

/**
 * 生成唯一 id（优先 crypto.randomUUID，降级到时间 + 随机）。
 * @returns {string}
 */
export function genId() {
  try {
    if (
      typeof globalThis.crypto !== "undefined" &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    /* 忽略，走降级分支 */
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
