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

const intlCache = new Map();

function intlFormat(locale, options, value) {
  const key = `${locale}:${JSON.stringify(options)}`;
  let fmt = intlCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options);
    intlCache.set(key, fmt);
  }
  return fmt.format(value);
}

function normalizeCurrency(cur) {
  if (typeof cur !== "string" || !cur.trim()) return "";
  return cur.trim().toUpperCase();
}

export function fmtPrice(v, cur) {
  if (v == null) return "—";
  const num = Number(v);
  if (!Number.isFinite(num)) return "—";

  const code = normalizeCurrency(cur);
  if (!code) return num.toFixed(2);

  try {
    if (code === "CNY") {
      return `¥${num.toFixed(2)}`;
    }
    if (code === "JPY") {
      return `JPY ${intlFormat("en-US", { maximumFractionDigits: 0 }, num)}`;
    }
    if (code === "USD" || code === "EUR" || code === "GBP") {
      return intlFormat("en-US", {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }, num);
    }
    if (/^[A-Z]{3}$/.test(code)) {
      return `${code} ${num.toFixed(2)}`;
    }
    if (/^[A-Z]{1,3}$/.test(code)) {
      return `${code} ${num.toFixed(2)}`;
    }
    return num.toFixed(2);
  } catch {
    return code ? `${code} ${num.toFixed(2)}` : num.toFixed(2);
  }
}

export function fmtCnyReference(value, currency, fx) {
  if (value == null) return "";
  const code = normalizeCurrency(currency);
  if (!code || code === "CNY") return "";

  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return "";

  const rate = fx && fx.rates && fx.rates[code];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return "";
  }

  const cny = num * rate;
  if (!Number.isFinite(cny)) return "";
  return `约 ¥${cny.toFixed(2)}`;
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const PROMOTION_LABELS = {
  giveaway: "免费入库",
  key: "Key 赠送",
  "free-weekend": "免费周末",
  "free-play-days": "限时试玩",
};

export function promotionTypeLabel(type) {
  return PROMOTION_LABELS[type] || "免费活动";
}
