/**
 * src/renderer/games/StatsOverview.jsx
 *
 * 收藏统计概览（P0-5）：总数 / 按当前价总值 / 累计节省。
 * 纯本地派生、实时随增减重算（读 collectionStats，不直读 addedPrice）。
 * 数值一律 tabular-nums，多币种时退化为无符号纯数字。
 */
import { collectionStats, wishlist } from "./gamesStore.js";
import { fmtPrice } from "./format.js";

/** 从收藏条目推导代表币种：全部同币种用该币种，否则返回 null（纯数字展示）。 */
function representativeCurrency() {
  const entries = wishlist.value || [];
  if (entries.length === 0) return null;
  const set = new Set(
    entries
      .map((e) => (e.currentCurrency || e.currency || "").toUpperCase())
      .filter(Boolean),
  );
  return set.size === 1 ? [...set][0] : null;
}

export function StatsOverview() {
  const stats = collectionStats();
  const cur = representativeCurrency();

  const totalValue = fmtPrice(stats.totalValue || 0, cur);
  const totalSaved = fmtPrice(stats.totalSaved || 0, cur);

  return (
    <section class="stats-overview" aria-label="收藏统计概览">
      <div class="stat-card">
        <span class="stat-card__label">收藏总数</span>
        <span class="stat-card__value">{stats.total}</span>
        <span class="stat-card__unit">款</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">按当前价总值</span>
        <span class="stat-card__value">{totalValue}</span>
      </div>
      <div class="stat-card stat-card--save">
        <span class="stat-card__label">累计节省</span>
        <span class="stat-card__value">{totalSaved}</span>
      </div>
    </section>
  );
}

export default StatsOverview;
