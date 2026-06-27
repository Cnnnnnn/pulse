/**
 * src/renderer/components/TopBar.jsx
 *
 * 全局 32px 顶部栏. 跨所有 versions view.
 * ponytail: 不做"全部状态"展示, 只放"全局动作" (搜索/AI/通知/overflow).
 */
import { useState } from "preact/hooks";
import { openPalette } from "../command-palette-store.js";
import { upgradableCount } from "../selectors.js";
import { api } from "../api.js";
import { navigateTo } from "../route-store.js";
import { showToast } from "../store/toast-store.js";
import { useRunCheck } from "../hooks/useRunCheck.js";
import {
  IconCommand, IconSparkles, IconBell, IconMoreHorizontal,
  IconRefresh, IconStar, IconSettings, IconCalendar, IconNote,
} from "./icons.jsx";

export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const badge = upgradableCount.value;
  const { isLoading: isChecking, run: runCheck } = useRunCheck();

  async function exportResults(format) {
    if (!api.detectResultsExport) return;
    await api.detectResultsExport({ format });
    setMenuOpen(false);
  }

  function go(route) {
    setMenuOpen(false);
    navigateTo(route);
  }

  // v2.50 (T6): 3 个新 IPC 暂未实现, 按 YAGNI 走 toast 占位.
  function tbd(feature) {
    setMenuOpen(false);
    showToast(`${feature} 暂未实现, 计划在 v2.51 补上`, "info", 2500);
  }

  return (
    <header class="topbar" role="banner">
      <div class="topbar-left">
        <button
          type="button"
          class="topbar-logo"
          onClick={() => navigateTo("library")}
          aria-label="返回应用库"
          title="应用库"
          data-testid="topbar-logo"
        >
          Pulse
        </button>
      </div>
      <div class="topbar-center">
        <button
          type="button"
          class="topbar-search"
          onClick={openPalette}
          aria-label="搜索 (Cmd+K)"
        >
          <IconCommand size={14} />
          <span>搜索 app 或输入操作...</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
      <div class="topbar-right">
        <button
          type="button"
          class="topbar-icon-btn"
          onClick={runCheck}
          disabled={isChecking}
          aria-busy={isChecking}
          aria-label="检查更新"
          title="检查更新"
          data-testid="topbar-run-check"
        >
          <IconRefresh size={16} />
        </button>
        <button
          type="button"
          class="topbar-icon-btn topbar-ai"
          aria-label="AI 任务"
          title="AI 任务"
          data-testid="topbar-ai-tasks"
          onClick={() => go("insights")}
        >
          <IconSparkles size={16} />
        </button>
        <button
          type="button"
          class="topbar-icon-btn topbar-bell"
          aria-label={`通知${badge > 0 ? ` (${badge} 个可升级)` : ""}`}
          title="通知"
          data-testid="topbar-notification"
          onClick={() => go("diagnostics")}
        >
          <IconBell size={16} />
          {badge > 0 && <span class="topbar-badge" aria-hidden="true">{badge}</span>}
        </button>
        <div class="topbar-overflow">
          <button
            type="button"
            class="topbar-icon-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="更多"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-testid="topbar-overflow-toggle"
          >
            <IconMoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <ul class="topbar-menu" role="menu">
              <li><button role="menuitem" data-testid="topbar-menu-watchlist" onClick={() => go("library")}><IconStar size={14} />关注列表</button></li>
              <li><button role="menuitem" data-testid="topbar-menu-diagnostics" onClick={() => go("diagnostics")}><IconSettings size={14} />错误诊断</button></li>
              <li><button role="menuitem" data-testid="topbar-menu-reminders" onClick={() => go("settings")}><IconCalendar size={14} />Reminders</button></li>
              <li><button role="menuitem" data-testid="topbar-menu-recent" onClick={() => go("settings")}><IconCalendar size={14} />Recent Activity</button></li>
              <li class="topbar-menu-divider" />
              <li><button role="menuitem" data-testid="topbar-menu-export-json" onClick={() => exportResults("json")}>导出 JSON</button></li>
              <li><button role="menuitem" data-testid="topbar-menu-export-csv" onClick={() => exportResults("csv")}>导出 CSV</button></li>
              <li class="topbar-menu-divider" />
              <li><button role="menuitem" data-testid="topbar-menu-release-notes" onClick={() => tbd("Release Notes 导出")}><IconNote size={14} />Release Notes</button></li>
            </ul>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopBar;