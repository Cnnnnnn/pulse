/**
 * src/renderer/route-store.js
 *
 * 版本检查 5 个 view 的路由 signal. 不引入真 hash 路由 (太重),
 * signal 已能驱动组件重渲染, 5 个 view 切换足够.
 */
import { signal } from "@preact/signals";

export const ROUTES = ["overview", "library", "diagnostics", "insights", "settings"];

export const currentRoute = signal("overview");

export function navigateTo(route) {
  if (ROUTES.includes(route)) currentRoute.value = route;
}
