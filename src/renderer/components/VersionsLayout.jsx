/**
 * src/renderer/components/VersionsLayout.jsx
 *
 * 版本检查 view 的统一容器: TopBar + CommandPalette + 当前路由对应的 page.
 * 每个 page 各自负责 PageHeader + 内容.
 *
 * 2026-06-27: 合并 overview→library. 默认落地 = 应用列表 (LibraryPage),
 * 不再有 dashboard overview 视图.
 */
import { currentRoute } from "../route-store.js";
import { TopBar } from "./TopBar.jsx";
import { CommandPalette } from "./CommandPalette.jsx";
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
      {route === "library" && <LibraryPage />}
      {route === "diagnostics" && <DiagnosticsPage />}
      {route === "insights" && <InsightsPage />}
      {route === "settings" && <SettingsPage />}
    </div>
  );
}

export default VersionsLayout;
