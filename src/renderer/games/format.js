/**
 * src/renderer/games/format.js
 *
 * 游戏优惠展示用纯函数（价格 / 日期 / 平台中文名）。
 */

import { PLATFORMS } from "./gamesStore.js";

export const PLATFORM_LABEL = Object.fromEntries(
  PLATFORMS.map((p) => [p.key, p.label]),
);

export const PLATFORM_EMOJI = Object.fromEntries(
  PLATFORMS.map((p) => [p.key, p.emoji]),
);

export function fmtPrice(v, cur) {
  if (v == null) return "—";
  const sym = cur === "USD" ? "$" : cur === "CNY" ? "¥" : "";
  return `${sym}${Number(v).toFixed(2)}`;
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
