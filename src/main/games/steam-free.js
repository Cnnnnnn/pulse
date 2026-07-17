const { fetchJson, toGameDeal } = require("./normalize");

const GAMERPOWER_URL =
  "https://www.gamerpower.com/api/giveaways?platform=steam&type=game";

function classifySteamPromotion(item) {
  const text = [
    item && item.title,
    item && item.description,
    item && item.instructions,
  ].filter(Boolean).join(" ").toLowerCase();
  // ponytail: 上游没有结构化活动类型；文案启发式的升级路径是直接映射未来字段。
  if (/\bkey\b|activate a product|reveal the key/.test(text)) return "key";
  if (/free weekend|play for free|free access/.test(text)) return "free-weekend";
  return "giveaway";
}

function parseEndDate(value) {
  if (!value || value === "N/A") return null;
  const ms = Date.parse(String(value).replace(" ", "T") + "Z");
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeId(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "string") return value.trim() || null;
  return null;
}

function requirementsFor(type, item) {
  if (type === "key") {
    const instructions =
      typeof item.instructions === "string" ? item.instructions.trim() : "";
    return instructions || "需按活动页说明领取，Key 数量可能有限";
  }
  if (type === "free-weekend") return "限时免费游玩，不会永久入库";
  return "活动期间可免费入库";
}

async function fetchSteamFree() {
  const data = await fetchJson(GAMERPOWER_URL, { timeoutMs: 9000 });
  if (!Array.isArray(data)) return [];
  return data.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (normalizeId(item.id) == null) return false;
    if (typeof item.title !== "string" || !item.title.trim()) return false;
    const claimUrl = item.open_giveaway_url || item.open_giveaway;
    return typeof claimUrl === "string" && Boolean(claimUrl.trim());
  }).map((item) => {
    const promotionType = classifySteamPromotion(item);
    return toGameDeal({
      id: `steam-free-${normalizeId(item.id)}`,
      platform: "steam",
      title: item.title,
      thumb: item.thumbnail || item.image || null,
      salePrice: 0,
      normalPrice: Number(String(item.worth || "").replace(/[^0-9.]/g, "")) || null,
      savings: 100,
      currency: "USD",
      dealUrl: (item.open_giveaway_url || item.open_giveaway).trim(),
      isFree: true,
      freeUntil: parseEndDate(item.end_date),
      store: "Steam",
      source: "live",
      popular: Number(item.users) || 0,
      promotionType,
      requirements: requirementsFor(promotionType, item),
      provider: "gamerpower",
    });
  });
}

module.exports = { classifySteamPromotion, fetchSteamFree };
