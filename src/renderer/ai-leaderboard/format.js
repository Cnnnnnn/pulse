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

/** 性价比 = 智能指数 / 输出价格（越高越划算）。 */
export function fmtValueRatio(aa) {
  if (!aa) return "—";
  const idx = aa.intelligenceIndex;
  const price = aa.priceOutputPer1M;
  if (idx == null || price == null || price <= 0) return "—";
  return (idx / price).toFixed(1);
}

/**
 * 取模型在指定维度下的排序/展示原始值。
 * @param {object} model AiModel
 * @param {string} dimension elo|intelligence|coding|agentic|speed|price
 * @param {string} category llm|multimodal|code（决定 Arena board）
 * @returns {number|null}
 */
export function primaryValue(model, dimension, category) {
  if (dimension === "elo") {
    const board = CATEGORY_BOARD[category] || "text";
    const slice = model && model.arena && model.arena[board];
    return slice && typeof slice.score === "number" ? slice.score : null;
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
  return fmtIndex(value);
}
