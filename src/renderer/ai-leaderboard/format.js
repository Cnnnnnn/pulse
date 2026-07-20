/**
 * src/renderer/ai-leaderboard/format.js
 *
 * 数字格式化辅助（tabular-nums 友好：分数 / 指数 / 价格 / 速度 / 百分比）。
 * 价格仅识别 USD（团队拍板），统一 `$` 展示。
 */

import { VENDOR_META, CATEGORY_META, DIMENSION_META } from "./types.js";

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

/** 百分比（0-100 量级，如 MMLU-Pro / GPQA / HLE）。 */
export function fmtPercent(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v) * 100)}%`;
}

/** 价格（USD）：两位小数，前置 `$`。 */
export function fmtPrice(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `$${Number(v).toFixed(2)}`;
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

/** 厂商展示名（VENDOR_META label 兜底原始值）。 */
export function fmtVendor(vendor) {
  if (!vendor) return "—";
  return (VENDOR_META[vendor] && VENDOR_META[vendor].label) || vendor;
}

/** 排名序号。 */
export function fmtRank(rank) {
  if (rank == null || !Number.isFinite(Number(rank))) return "—";
  return String(rank);
}

/** 更新时间（HH:mm）。 */
export function fmtClock(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

/**
 * 取模型在指定维度下的排序/展示原始值（与 store.sortValue 同口径，单一真源）。
 * v2.83: 维度表按 AA Free tier 实际字段重做 (math/reasoning/price_perf 删除,
 * 新增 agentic/speed/price). price 走 priceOutputPer1M 真实值 (不再用 II/价 公式).
 * @param {object} model AiModel
 * @param {string} dimension elo|intelligence|coding|agentic|speed|price
 * @param {string} category llm|multimodal|code|image|video
 * @returns {number|null}
 */
export function primaryValue(model, dimension, category) {
  if (dimension === "elo") {
    const board = (CATEGORY_META[category] || {}).board || "text";
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
 * 按维度种类格式化主维度值（与 LeaderboardTable 主分列对齐）。
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
