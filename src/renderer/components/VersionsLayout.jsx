/**
 * src/renderer/components/VersionsLayout.jsx
 *
 * 版本检查 5 个 view 的统一容器: TopBar + CommandPalette + 当前路由对应的 page.
 * 每个 page 各自负责 PageHeader + 内容 (OverviewPage KPI/LibraryPage 列表/DiagnosticsPage
 * 错误/InsightsPage AI/SettingsPage 设置).
 */
import { currentRoute } from "../route-store.js";
import { TopBar } from "./TopBar.jsx";
import { CommandPalette } from "./CommandPalette.jsx";
import { OverviewPage } from "./OverviewPage.jsx";
import { LibraryPage } from "./LibraryPage.jsx";
import { DiagnosticsPage } from "./DiagnosticsPage.jsx";
import { InsightsPage } from "./InsightsPage.jsx";
import { SettingsPage } from "./SettingsPage.jsx";

export function VersionsLayout({ onCheck }) {
  const route = currentRoute.value;
  return (
    <div class="versions-layout">
      <TopBar />
      <CommandPalette />
      {route === "overview" && <OverviewPage />}
      {route === "library" && <LibraryPage />}
      {route === "diagnostics" && <DiagnosticsPage />}
      {route === "insights" && <InsightsPage />}
      {route === "settings" && <SettingsPage />}
    </div>
  );
}

export default VersionsLayout;