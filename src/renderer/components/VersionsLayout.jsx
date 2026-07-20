/**
 * src/renderer/components/VersionsLayout.jsx
 *
 * 版本检查 view 的统一容器: CommandPalette + 3-tab subtab + 当前路由对应的 page.
 * 每个 page 各自负责 PageHeader + 内容 (PageHeader 内嵌 PageActionsBar).
 *
 * 2026-06-27: 合并 overview→library. 默认落地 = 应用列表 (LibraryPage),
 * 不再有 dashboard overview 视图.
 * 2026-07-08 P12: 加 subtab (library/diagnostics/settings).
 * 2026-07-10: 删除洞察 (insights) tab — 功能价值不足.
 */
import { currentRoute, navigateTo } from "../store/route-store.js";
import { CommandPalette } from "./CommandPalette.jsx";
import { SubtabList } from "./SubtabList.jsx";
import { LibraryPage } from "./LibraryPage.jsx";
import { DiagnosticsPage } from "./DiagnosticsPage.jsx";
import { SettingsPage } from "./SettingsPage.jsx";
import { AITasksDrawer } from "./AITasksDrawer.jsx";

const VERSION_TABS = [
  { key: "library",     label: "应用列表" },
  { key: "diagnostics", label: "诊断" },
  { key: "settings",    label: "设置" },
];

export function VersionsLayout({ onCheck }) {
  const route = currentRoute.value;
  return (
    <div class="versions-layout">
      <CommandPalette />
      <SubtabList
        prefix="versions"
        tabs={VERSION_TABS}
        activeKey={route}
        onChange={(key) => navigateTo(key)}
        ariaLabel="版本检查视图切换"
      />
      {route === "library" && <LibraryPage />}
      {route === "diagnostics" && <DiagnosticsPage />}
      {route === "settings" && <SettingsPage />}
      <AITasksDrawer />
    </div>
  );
}

export default VersionsLayout;
