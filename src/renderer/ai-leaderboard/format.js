/**
 * src/renderer/ai-leaderboard/format.js
 *
 * 数字格式化辅助（tabular-nums 友好）。
 * v3.0: 适配双视角结构，primaryValue 使用 CATEGORY_BOARD 映射。
 */

import { VENDOR_META, CATEGORY_BOARD } from "./types.js";

/** ELO 分数：取整。 */
export function fmtScore(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return String(Math.round(Number(v)));
}

/** AA 客观指数（0-100+）：1 位小数。 */
export function fmtIndex(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(1);
}

/** 每百万 token 价格（USD）：`$x.xx /1M`。 */
export function fmtPricePer1M(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `$${Number(v).toFixed(2)} /1M`;
}

/** 生成速度（tokens/s）。 */
export function fmtSpeed(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v))} tok/s`;
}

/** 厂商展示名。 */
export function fmtVendor(vendor) {
  if (!vendor) return "—";
  return (VENDOR_META[vendor] && VENDOR_META[vendor].label) || vendor;
}

/** 更新时间（HH:mm）。 */
export function fmtClock(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

/** 更新日期（YYYY-MM-DD）。 */
export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** 性价比 = 智能指数 / 输出价格（越高越划算）。 */
export function fmtValueRatio(aa) {
  if (!aa) return "—";
  const idx = aa.intelligenceIndex;
  const price = aa.priceOutputPer1M;
  if (idx == null || price == null || price <= 0) return "—";
  return (idx / price).toFixed(1);
}

/** LiveBench 0..100 分数 → "xx.x".  (0..1 比例 → "xx.x%"). */
export function fmtLivebench(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  // byCategory/overall 已是 0..100 (百分制). 兼容旧 0..1 输入 (除以 100 后显示 %).
  return n <= 1 ? `${(n * 100).toFixed(1)}%` : n.toFixed(1);
}

/** LB 性价比指标 (cost_per_successful_task) — <$1 显 3 位小数, >=$1 显 2 位. */
export function fmtLbCost(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  return n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

/** 票数紧凑格式化：8500 → "8.5k"，62355 → "62.4k"。 */
export function fmtVotes(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return String(n);
}

/**
 * 许可分类：open（开源权重）/ proprietary（闭源）/ unknown。
 * 仅基于 license 字符串关键词粗判，用于"仅开源权重"筛选与徽章着色。
 */
export function licenseKind(license) {
  if (!license) return "unknown";
  const s = String(license).toLowerCase();
  if (/(^|[^a-z])proprietary|closed[- ]?source/.test(s)) return "proprietary";
  if (/mit|apache|bsd|llama|community|open|gpl|mpl|free|creative|qwen|deepseek|mistral|openrail|mrl/.test(s)) {
    return "open";
  }
  return "unknown";
}

/** 许可短标签。 */
export function licenseShort(kind) {
  return kind === "open" ? "开源" : kind === "proprietary" ? "闭源" : "—";
}

/**
 * 取模型在指定维度下的排序/展示原始值。
 * @param {object} model AiModel
 * @param {string} dimension elo|intelligence|coding|agentic|speed|price|lb_*
 * @param {string} category llm|multimodal|code（决定 Arena board）
 * @returns {number|null}
 */
export function primaryValue(model, dimension, category) {
  if (dimension === "elo") {
    const board = CATEGORY_BOARD[category] || "text";
    const slice = model && model.arena && model.arena[board];
    return slice && typeof slice.score === "number" ? slice.score : null;
  }
  // lb_* 维度走 livebench 切片, sortKey 支持 dot path (e.g. "byCategory.Coding")
  if (typeof dimension === "string" && dimension.startsWith("lb_")) {
    const lb = model && model.livebench;
    if (!lb) return null;
    const meta = (require("./types.js")).DIMENSION_META &&
      (require("./types.js")).DIMENSION_META[dimension];
    const key = meta && meta.sortKey;
    if (!key) return null;
    const v = key.includes(".")
      ? key.split(".").reduce((o, p) => (o ? o[p] : null), lb)
      : lb[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  const aa = model && model.aa;
  if (!aa) return null;
  switch (dimension) {
    case "intelligence":
      return aa.intelligenceIndex ?? null;
    case "coding":
      return aa.codingIndex ?? null;
    case "agentic":
      return aa.agenticIndex ?? null;
    case "speed":
      return aa.outputTokensPerSec ?? null;
    case "price":
      return aa.priceOutputPer1M ?? null;
    default:
      return null;
  }
}

/**
 * 按维度种类格式化主维度值。
 * @param {number|null} value
 * @param {string} dimension
 * @returns {string}
 */
export function formatPrimary(value, dimension) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  if (dimension === "elo") return fmtScore(value);
  if (dimension === "price") return fmtPricePer1M(value);
  if (dimension === "speed") return fmtSpeed(value);
  if (typeof dimension === "string" && dimension.startsWith("lb_")) return fmtLivebench(value);
  return fmtIndex(value);
}
