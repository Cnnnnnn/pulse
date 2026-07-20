/**
 * src/renderer/route-store.js
 *
 * 版本检查 view 的路由 signal. 不引入真 hash 路由 (太重),
 * signal 已能驱动组件重渲染.
 *
 * 2026-06-27: 合并 overview→library. 默认落地改为应用列表 (LibraryPage),
 * 废弃 dashboard overview. navigateTo 对旧 "overview" 做容错重定向,
 * 避免旧持久化状态/深链断裂.
 *
 * 2026-07-09 P15: 加 routeTab signal — 跨组件跳到 SettingsPage 时指定默认 tab
 *   ('general' | 'ai'). SettingsPage 渲染时读一次, 渲染完重置 'general'.
 *   例如 AITasksDrawer 点 "修改 AI 设置" → closeDrawer + navigateTo('settings', 'ai')
 *   → SettingsPage 直接显示 AI 配置 tab, 不必再点 1 次.
 */
import { signal } from "@preact/signals";

export const ROUTES = ["library", "diagnostics", "settings"];

export const currentRoute = signal("library");
export const routeTab = signal("general"); // 'general' | 'ai'

export function navigateTo(route, tab) {
  // 容错: 已废弃的旧路由重定向到 library (应用列表)
  if (route === "overview" || route === "insights") route = "library";
  if (!ROUTES.includes(route)) return;
  currentRoute.value = route;
  if (route === "settings" && (tab === "ai" || tab === "general")) {
    routeTab.value = tab;
  }
}
