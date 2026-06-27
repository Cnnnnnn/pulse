/**
 * src/renderer/route-store.js
 *
 * 版本检查 view 的路由 signal. 不引入真 hash 路由 (太重),
 * signal 已能驱动组件重渲染.
 *
 * 2026-06-27: 合并 overview→library. 默认落地改为应用列表 (LibraryPage),
 * 废弃 dashboard overview. navigateTo 对旧 "overview" 做容错重定向,
 * 避免旧持久化状态/深链断裂.
 */
import { signal } from "@preact/signals";

export const ROUTES = ["library", "diagnostics", "insights", "settings"];

export const currentRoute = signal("library");

export function navigateTo(route) {
  // 容错: 旧 overview 路由重定向到 library (应用列表)
  if (route === "overview") route = "library";
  if (ROUTES.includes(route)) currentRoute.value = route;
}
