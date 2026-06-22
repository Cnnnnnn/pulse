/**
 * src/renderer/food/FoodList.jsx
 *
 * 列表 + 排序切换. 排序仅前端重排, 不发请求.
 */

import { FoodCard } from "./FoodCard.jsx";

export function FoodList({ items, sortBy, onSortChange }) {
  return (
    <div class="food-list">
      {items.length > 0 && (
        <div class="food-list-toolbar">
          <button
            class={`food-sort-btn${sortBy === "distance" ? " food-sort-btn-active" : ""}`}
            onClick={() => onSortChange && onSortChange("distance")}
          >
            距离
          </button>
          <button
            class={`food-sort-btn${sortBy === "rating" ? " food-sort-btn-active" : ""}`}
            onClick={() => onSortChange && onSortChange("rating")}
          >
            评分
          </button>
        </div>
      )}
      <div class="food-list-cards">
        {items.map((item) => (
          <FoodCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

export default FoodList;
