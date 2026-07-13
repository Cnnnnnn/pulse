/**
 * src/newcar/types.js
 *
 * 「新车发布」模块类型 / 枚举定义 (JSDoc 伪 TS) + 枚举值数组 + 状态→令牌色映射.
 * 纯数据, 无 Preact 依赖, 可被数据层与 UI 层共用.
 */

/** @typedef {'轿车'|'SUV'|'MPV'|'跑车'|'皮卡'|'其他'} CarType */
/** @typedef {'燃油'|'混动'|'纯电'|'增程'} EnergyType */
/** @typedef {'预售'|'上市'|'首发'|'改款'} ReleaseStatus */

/**
 * @typedef {Object} ReleaseRecord
 * @property {string} id                稳定唯一 id, 如 "2026-byd-han-ev-001"
 * @property {string} name              车型名, 如 "比亚迪 汉 EV 2026"
 * @property {string} brand             品牌, 如 "比亚迪"
 * @property {string} releaseDate       YYYY-MM-DD (所在日, 以本地时间为准)
 * @property {CarType} type
 * @property {EnergyType} energyType
 * @property {number|null} priceMin     万元; 未知为 null
 * @property {number|null} priceMax     万元; 未知为 null
 * @property {string|null} thumbnailUrl MVP 多为 null (占位)
 * @property {string|null} sourceUrl    来源链接
 * @property {ReleaseStatus} status     预售/上市/首发/改款
 */

/** @typedef {Object} DatasetMeta
 * @property {number} year
 * @property {string} version
 * @property {string} updatedAt
 * @property {string} source
 */

/** @typedef {Object} CalendarDataset
 * @property {DatasetMeta} meta
 * @property {ReleaseRecord[]} releases
 */

/** @typedef {Object} CarDetails  P1 fetchCarDetails 返回
 * @property {string} id
 * @property {Record<string, string>} specs
 * @property {string[]} gallery
 * @property {{min:number, max:number}} [priceRange]
 * @property {number} fetchedAt  epoch ms
 */

/** @typedef {Object} FilterState
 * @property {string[]} [brands]       品牌白名单, 空=全部
 * @property {EnergyType[]} [energyTypes]
 * @property {number|null} [priceMin]  万元
 * @property {number|null} [priceMax]
 * @property {ReleaseStatus[]} [status]
 * @property {string|null} [date]      某天 YYYY-MM-DD, 用于"某天有哪些发布"
 */

/** @typedef {Object} Kpis
 * @property {number} thisMonth   本月发布数
 * @property {number} thisWeek    本周发布数
 * @property {number} ytd         今年累计 (至今天)
 * @property {number} upcoming    即将发布 (releaseDate > 今天)
 */

/** 枚举值全集 (供筛选栏 / 校验使用). */
export const CAR_TYPES = ['轿车', 'SUV', 'MPV', '跑车', '皮卡', '其他'];
export const ENERGY_TYPES = ['燃油', '混动', '纯电', '增程'];
export const RELEASE_STATUSES = ['预售', '上市', '首发', '改款'];

/**
 * 状态 → 前景色令牌 (对齐 ui-design-system: 预售→accent-primary / 上市→green / 首发→blue / 改款→orange).
 * 仅引用现有 --accent-* 令牌, 不新增颜色令牌.
 * @type {Record<ReleaseStatus, string>}
 */
export const STATUS_TOKEN = {
  '预售': 'var(--accent-primary)',
  '上市': 'var(--accent-green)',
  '首发': 'var(--accent-blue)',
  '改款': 'var(--accent-orange)',
};

/**
 * 状态 → 浅底令牌 (color-mix 同色半透明, 对齐现有 badge 风格).
 * @type {Record<ReleaseStatus, string>}
 */
export const STATUS_TOKEN_BG = {
  '预售': 'color-mix(in oklch, var(--accent-primary) 14%, transparent)',
  '上市': 'color-mix(in oklch, var(--accent-green) 14%, transparent)',
  '首发': 'color-mix(in oklch, var(--accent-blue) 14%, transparent)',
  '改款': 'color-mix(in oklch, var(--accent-orange) 14%, transparent)',
};

/** 缩略图占位渐变调色板 (仅现有 --accent-* 令牌). */
export const THUMB_PALETTE = [
  'var(--accent-primary)',
  'var(--accent-green)',
  'var(--accent-blue)',
  'var(--accent-orange)',
  'var(--accent-red)',
];

/**
 * 根据字符串稳定派生 0..n-1 索引 (用于缩略图配色 / 分组, 同输入同输出).
 * @param {string} s
 * @param {number} n
 * @returns {number}
 */
export function stableIndex(s, n) {
  if (!s || n <= 0) return 0;
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h % n;
}

/**
 * 价格区间格式化 (万元). 未知显示"价格待公布".
 * @param {number|null} min
 * @param {number|null} max
 * @returns {string}
 */
export function formatPriceRange(min, max) {
  if (min == null && max == null) return '价格待公布';
  if (min != null && max != null) {
    if (min === max) return `约 ${min} 万`;
    return `${min}–${max} 万`;
  }
  if (min != null) return `从 ${min} 万起`;
  return `最高 ${max} 万`;
}
