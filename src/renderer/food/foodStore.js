/**
 * src/renderer/food/foodStore.js
 *
 * v2.26+ 附近美食推荐 — 渲染端 signal 状态机.
 *
 * 4 signal: list / loading / error / config.
 * 跟 src/renderer/worldcup/navStore.js / src/renderer/trayConfigStore.js 同型,
 * 全 module-level signals + 显式 setter 暴露.
 *
 * searchNearby 是状态机: loading=true + error 清空 → api 调用 → 成功 setFoodList /
 * 失败 setFoodError + 清 list → finally setFoodLoading(false) (loading 永远复位).
 */
import { signal } from "@preact/signals";
import { api } from "../api.js";

export const foodList = signal([]);
export const foodLoading = signal(false);
export const foodError = signal(null);
export const foodConfig = signal({ hasAmapKey: false });

export function setFoodList(items) {
  foodList.value = Array.isArray(items) ? items : [];
}

export function setFoodLoading(b) {
  foodLoading.value = !!b;
}

export function setFoodError(e) {
  foodError.value = e || null;
}

export function setFoodConfig(c) {
  foodConfig.value = c || { hasAmapKey: false };
}

export function resetFoodState() {
  foodList.value = [];
  foodLoading.value = false;
  foodError.value = null;
}

export async function loadFoodConfig() {
  try {
    const c = await api.foodGetConfig();
    setFoodConfig(c);
    return c;
  } catch (e) {
    setFoodConfig({ hasAmapKey: false });
    return { hasAmapKey: false };
  }
}

export async function saveFoodConfig(amapKey) {
  const r = await api.foodSaveConfig({ amapKey });
  if (r && r.ok) {
    await loadFoodConfig();
  }
  return r;
}

/**
 * 触发附近美食搜索.
 * 状态机: loading=true + error 清空 → api.foodFetchNearby →
 * 成功: setFoodList(r.list || []); 失败: setFoodError(r.error) + setFoodList([]).
 * finally 块保证 foodLoading 复位 (即使 api throw).
 */
export async function searchNearby(opts) {
  setFoodLoading(true);
  setFoodError(null);
  try {
    const r = await api.foodFetchNearby(opts);
    if (!r || !r.ok) {
      setFoodError(r && r.error ? r.error : "unknown");
      setFoodList([]);
      return r;
    }
    setFoodList(r.list || []);
    return r;
  } catch (e) {
    setFoodError("network");
    setFoodList([]);
    return { ok: false, error: "network" };
  } finally {
    setFoodLoading(false);
  }
}
