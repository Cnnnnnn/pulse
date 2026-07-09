/**
 * src/renderer/components/VersionsLayout.jsx
 *
 * 版本检查 view 的统一容器: CommandPalette + 4-tab subtab (P12) + 当前路由对应的 page.
 * 每个 page 各自负责 PageHeader + 内容 (PageHeader 内嵌 PageActionsBar).
 *
 * 2026-06-27: 合并 overview→library. 默认落地 = 应用列表 (LibraryPage),
 * 不再有 dashboard overview 视图.
 * 2026-07-08 P12: 加 4-tab subtab (library/diagnostics/insights/settings) —
 *   之前 diagnostics/insights 没可视化入口, 只能 Cmd+K 搜, 用户找不到.
 */
import { currentRoute, navigateTo } from "../route-store.js";
import { CommandPalette } from "./CommandPalette.jsx";
import { SubtabList } from "./SubtabList.jsx";
import { LibraryPage } from "./LibraryPage.jsx";
import { DiagnosticsPage } from "./DiagnosticsPage.jsx";
import { InsightsPage } from "./InsightsPage.jsx";
import { SettingsPage } from "./SettingsPage.jsx";
import { AITasksDrawer } from "./AITasksDrawer.jsx";

const VERSION_TABS = [
  { key: "library",     label: "应用列表" },
  { key: "diagnostics", label: "诊断" },
  { key: "insights",    label: "洞察" },
  { key: "settings",    label: "设置" },
];

export function VersionsLayout({ onCheck }) {
  const route = currentRoute.value;
  return (
    <div class="versions-layout">
      <CommandPalette />
      {/* P12: 4-tab subtab, 给 diagnostics/insights/settings 提供可视化入口 */}
      <SubtabList
        prefix="versions"
        tabs={VERSION_TABS}
        activeKey={route}
        onChange={(key) => navigateTo(key)}
        ariaLabel="版本检查视图切换"
      />
      {route === "library" && <LibraryPage />}
      {route === "diagnostics" && <DiagnosticsPage />}
      {route === "insights" && <InsightsPage />}
      {route === "settings" && <SettingsPage />}
      <AITasksDrawer />
    </div>
  );
}

export default VersionsLayout;
