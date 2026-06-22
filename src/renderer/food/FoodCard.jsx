/**
 * src/renderer/food/FoodCard.jsx
 *
 * 单店铺卡片. 缺评分时整行隐藏 (跟 spec §2.2 一致).
 */

function formatDistance(m) {
  if (m == null) return "";
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

export function FoodCard({ item }) {
  if (!item) return null;
  const hasRating = item.rating != null;
  return (
    <div class="food-card">
      <div class="food-card-row1">
        <span class="food-card-name">{item.name}</span>
        <span class="food-card-distance">{formatDistance(item.distance)}</span>
      </div>
      <div class="food-card-row2">
        {item.type && <span class="food-card-type">{item.type}</span>}
        {item.avgPrice != null && <span class="food-card-price">人均 ¥{item.avgPrice}</span>}
      </div>
      {hasRating && (
        <div class="food-card-row3">
          <span class="food-card-rating">⭐ {item.rating.toFixed(1)}</span>
          <span class="food-card-reviews">({item.reviewCount} 评论)</span>
        </div>
      )}
      {item.address && <div class="food-card-address">{item.address}</div>}
    </div>
  );
}

export default FoodCard;
