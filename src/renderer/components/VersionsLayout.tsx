/**
 * src/renderer/components/VersionsLayout.jsx
 *
 * 版本检查 view 的统一容器: CommandPalette + 当前路由对应的 page.
 * 应用列表 / 诊断 / 设置由系统 NavDrawer 独立入口管理，不在页面内重复渲染横向导航。
 * 每个 page 各自负责 PageHeader + 内容 (PageHeader 内嵌 PageActionsBar).
 *
 * 2026-06-27: 合并 overview→library. 默认落地 = 应用列表 (LibraryPage),
 * 不再有 dashboard overview 视图.
 * 2026-07-08 P12: 加 subtab (library/diagnostics/settings).
 * 2026-08: 移除共享 subtab，改由系统 NavDrawer 独立管理三个页面。
 * 2026-07-10: 删除洞察 (insights) tab — 功能价值不足.
 */
import { currentRoute } from "../store/route-store.ts";
import { CommandPalette } from "./CommandPalette.tsx";
import { LibraryPage } from "./LibraryPage.tsx";
import { DiagnosticsPage } from "./DiagnosticsPage.tsx";
import { SettingsPage } from "./SettingsPage.tsx";
import { AITasksDrawer } from "./AITasksDrawer.tsx";

export function VersionsLayout({ onCheck }) {
  const route = currentRoute.value;
  return (
    <div class="versions-layout">
      <CommandPalette />
      {route === "library" && <LibraryPage />}
      {route === "diagnostics" && <DiagnosticsPage />}
      {route === "settings" && <SettingsPage />}
      <AITasksDrawer />
    </div>
  );
}

export default VersionsLayout;
