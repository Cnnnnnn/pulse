/**
 * src/renderer/food/FoodLayout.jsx
 *
 * v2.26+ 附近美食 — 顶层 layout. 串联 FoodHeader + FoodList/FoodEmpty + foodStore.
 *
 * ponytail: 排序切换 (distance ↔ rating) 走前端 sortedList 派生, 不重发请求.
 * sortBy 状态保留在组件内, 切换后下次 onSearch 会带新 sortBy 给主进程.
 */

import { useEffect, useState } from "preact/hooks";
import { FoodHeader } from "./FoodHeader.jsx";
import { FoodList } from "./FoodList.jsx";
import { FoodEmpty } from "./FoodEmpty.jsx";
import {
  foodList,
  foodLoading,
  foodError,
  foodConfig,
  loadFoodConfig,
  searchNearby,
} from "./foodStore.js";

const GEO_SUPPORTED = typeof navigator !== "undefined" && !!navigator.geolocation;
const NO_RESULT_ERRORS = new Set(["invalid_location", "no_match", "geocode_failed"]);

export function FoodLayout() {
  const list = foodList.value;
  const loading = foodLoading.value;
  const error = foodError.value;
  const config = foodConfig.value;
  const [sortBy, setSortBy] = useState("distance");
  const [lastSearch, setLastSearch] = useState(null);

  useEffect(() => { loadFoodConfig(); }, []);

  const sortedList = sortBy === "rating"
    ? [...list].sort((a, b) => {
        const ra = a.rating == null ? -1 : a.rating;
        const rb = b.rating == null ? -1 : b.rating;
        if (ra !== rb) return rb - ra;
        return (a.distance || 0) - (b.distance || 0);
      })
    : list;

  async function onSearch(opts) {
    if (!config.hasAmapKey) return;
    if (!opts.location) return;
    setLastSearch(opts);
    await searchNearby({ ...opts, sortBy });
  }

  function onSortChange(newSort) {
    setSortBy(newSort);
    // 纯前端重排 — sortedList 派生会自动跟上, 不触发 fetch
  }

  function onLocationError(reason) {
    const message =
      reason === "denied" ? "已拒绝定位,请手动输入" :
      reason === "unavailable" ? "定位失败,请手动输入" :
      reason === "timeout" ? "定位超时,请手动输入" :
      "定位不可用,请手动输入";
    window.dispatchEvent(new CustomEvent("app:toast", {
      detail: { type: "warn", message },
    }));
  }

  return (
    <div class="food-layout">
      <FoodHeader onSearch={onSearch} onLocationError={onLocationError} hasGeo={GEO_SUPPORTED} />
      <div class="food-body">
        {loading && <div class="food-skeleton">加载中…</div>}
        {!loading && error === "no_key" && <FoodEmpty reason="no_key" />}
        {!loading && error === "invalid_location" && <FoodEmpty reason="no_location" />}
        {!loading && error === "no_match" && <FoodEmpty reason="no_result" />}
        {!loading && error === "geocode_failed" && <FoodEmpty reason="no_result" />}
        {!loading && error && error !== "no_key" && !NO_RESULT_ERRORS.has(error) && (
          <FoodEmpty reason="error" />
        )}
        {!loading && !error && sortedList.length === 0 && <FoodEmpty reason="no_location" />}
        {!loading && !error && sortedList.length > 0 && (
          <FoodList items={sortedList} sortBy={sortBy} onSortChange={onSortChange} />
        )}
      </div>
    </div>
  );
}

export default FoodLayout;
