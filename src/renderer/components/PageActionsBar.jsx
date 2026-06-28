/**
 * src/renderer/components/PageActionsBar.jsx
 *
 * 把原 TopBar 的全局动作 (搜索 / AI 任务 / 通知 / overflow 菜单) 合并到
 * PageHeader 右侧, 跟 LibraryPage 的「检查更新」按钮同行.
 *
 * 原 TopBar 已删除 (2026-06-27 整合进 PageHeader).
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { upgradableCount } from "../selectors.js";
import { api } from "../api.js";
import { showToast } from "../store/toast-store.js";
import { toggleDigestDrawer } from "../store/ai-store.js";
import { toggleWatchlistModal } from "../watchlist/watchlist-store.js";
import { toggleRemindersOpen } from "../reminders/remindersStore.js";
import { toggleRecentOpen } from "../recent/recentStore.js";
import { openReleaseNotes } from "../release-notes-store.js";
import { navigateTo } from "../route-store.js";
import {
  IconBot, IconMoreHorizontal,
  IconStar, IconSettings, IconCalendar, IconNote,
} from "./icons.jsx";

export function PageActionsBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const overflowRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  const badge = upgradableCount.value;

  // 用 fixed + portal 渲染 overflow menu, 跳出 .page-header 和 .app-shell-view
  // 的 stacking context, 避免菜单被父容器裁切或被左侧导航遮挡.
  useEffect(() => {
    if (!menuOpen || !overflowRef.current) return undefined;
    const el = overflowRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDocClick(e) {
      if (overflowRef.current && !overflowRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function exportResults(format) {
    if (!api.detectResultsExport) {
      showToast("导出 IPC 暂不可用, 请升级到 v2.51+", "info", 2500);
      setMenuOpen(false);
      return;
    }
    try {
      const r = await api.detectResultsExport({ format });
      if (r && r.ok) {
        showToast(`已导出 ${format.toUpperCase()} → ${r.path}`, "success", 3500);
      } else {
        showToast(`导出失败: ${(r && (r.reason || r.error)) || "未知错误"}`, "error", 3000);
      }
    } catch (err) {
      showToast(`导出异常: ${(err && err.message) || "未知错误"}`, "error", 3000);
    } finally {
      setMenuOpen(false);
    }
  }

  // drawer 打开后顺手关掉 overflow 菜单 (顶层只有 overflow 在监听 doc click).
  function openDrawer(action) {
    setMenuOpen(false);
    action();
  }

  // Phase 32: 错误诊断改为路由跳转 (旧 DiagnosticsDrawer 已删除, 复用 DiagnosticsPage)
  function openDiagnosticsPage() {
    setMenuOpen(false);
    navigateTo("diagnostics");
  }

  // Release Notes: 拉当前版本 payload 后打开 wizard (manual 入口, 不写 mark-seen)
  async function openReleaseNotesNow() {
    const getCurrent = api.releaseNotes && api.releaseNotes.getCurrent;
    if (typeof getCurrent !== "function") {
      showToast("Release Notes 暂不可用, 请检查 IPC 注册", "info", 2500);
      setMenuOpen(false);
      return;
    }
    try {
      const payload = await getCurrent();
      if (!payload) {
        showToast("当前版本暂无 Release Notes", "info", 2500);
        setMenuOpen(false);
        return;
      }
      setMenuOpen(false);
      openReleaseNotes("manual", payload);
    } catch (err) {
      showToast(`Release Notes 加载失败: ${err && err.message}`, "error", 2500);
      setMenuOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        class="page-action-icon-btn page-action-ai"
        aria-label="AI 任务"
        title="AI 任务"
        data-testid="page-action-ai-tasks"
        onClick={() => toggleDigestDrawer()}
      >
        <IconBot size={16} />
      </button>
      <div class="page-action-overflow" ref={overflowRef}>
        <button
          type="button"
          class="page-action-icon-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="更多"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-testid="page-action-overflow-toggle"
        >
          <IconMoreHorizontal size={16} />
        </button>
      </div>
      {menuOpen && menuPos && typeof document !== "undefined" && createPortal(
        // React 合成事件的 stopPropagation 只挡 React 事件树, 不挡 document 上的原生监听.
        // doc 上的 mousedown listener 会先关菜单 → portal 卸载 → click onClick 永不触发.
        // 必须用 nativeEvent.stopImmediatePropagation() 真正拦截原生事件冒泡到 document.
        <ul
          class="page-action-menu page-action-menu-portal"
          role="menu"
          style={{ top: `${menuPos.top}px`, right: `${menuPos.right}px` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === "function") {
              e.nativeEvent.stopImmediatePropagation();
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === "function") {
              e.nativeEvent.stopImmediatePropagation();
            }
          }}
        >
          <li><button role="menuitem" data-testid="page-action-menu-watchlist" onClick={() => openDrawer(toggleWatchlistModal)}><IconStar size={14} />关注列表</button></li>
          <li><button role="menuitem" data-testid="page-action-menu-diagnostics" onClick={openDiagnosticsPage}><IconSettings size={14} />错误诊断</button></li>
          <li><button role="menuitem" data-testid="page-action-menu-reminders" onClick={() => openDrawer(toggleRemindersOpen)}><IconCalendar size={14} />Reminders</button></li>
          <li><button role="menuitem" data-testid="page-action-menu-recent" onClick={() => openDrawer(toggleRecentOpen)}><IconCalendar size={14} />Recent Activity</button></li>
          <li class="page-action-menu-divider" />
          <li><button role="menuitem" data-testid="page-action-menu-export-json" onClick={() => exportResults("json")}>导出 JSON</button></li>
          <li><button role="menuitem" data-testid="page-action-menu-export-csv" onClick={() => exportResults("csv")}>导出 CSV</button></li>
          <li class="page-action-menu-divider" />
          <li><button role="menuitem" data-testid="page-action-menu-release-notes" onClick={() => openReleaseNotesNow()}><IconNote size={14} />Release Notes</button></li>
        </ul>,
        document.body,
      )}
    </>
  );
}

export default PageActionsBar;