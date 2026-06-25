/**
 * src/renderer/components/VersionHistoryDrawer.jsx
 *
 * 2026-06-14: App rollback · drawer showing prior versions for one app.
 */
import { useEffect } from "preact/hooks";
import {
  versionHistoryOpen,
  versionHistoryApp,
  versionHistoryEntries,
  versionHistoryTotalSize,
  versionHistoryLoading,
  versionHistoryInFlight,
  closeVersionHistory,
  fetchVersionHistory,
  doRollback,
  deleteBackup,
  isInFlight,
} from "../store-version-history.js";
import { log as rendererLog } from "../log.js";
import { DrawerShell } from "./DrawerShell.jsx";
import { DrawerEmpty } from "./EmptyState.jsx";

function fmtSize(bytes) {
  if (typeof bytes !== "number" || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function VersionHistoryDrawer() {
  const open = versionHistoryOpen.value;
  const appName = versionHistoryApp.value;
  const entries = versionHistoryEntries.value;
  const totalSize = versionHistoryTotalSize.value;
  const loading = versionHistoryLoading.value;
  const inflight = versionHistoryInFlight.value;

  useEffect(() => {
    if (!open || !appName) return;
    fetchVersionHistory(appName);
    const api = typeof window !== "undefined" ? window.api : null;
    if (!api || typeof api.onVersionHistoryUpdated !== "function") return;
    const off = api.onVersionHistoryUpdated((payload) => {
      if (payload && payload.appName === appName) {
        fetchVersionHistory(appName);
      }
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [open, appName]);

  async function onRollback(version) {
    if (!appName) return;
    if (isInFlight(appName, version)) return;
    const r = await doRollback(appName, version);
    if (r && r.ok) {
      closeVersionHistory();
    } else {
      rendererLog.warn("rollback failed", r);
    }
  }

  async function onDelete(version) {
    if (!appName) return;
    if (isInFlight(appName, version)) return;
    const r = await deleteBackup(appName, version);
    if (!r || !r.ok) {
      rendererLog.warn("delete backup failed", r);
    }
  }

  return (
    <DrawerShell
      open={open}
      onClose={closeVersionHistory}
      title={`回滚历史 · ${appName || ""}`}
      overlayClass="version-history-overlay"
      drawerClass="version-history-drawer"
      ariaLabel="回滚历史"
      beforeBody={(
        <div class="version-history-drawer__stats">
          备份占盘 <b>{fmtSize(totalSize)}</b> · 可回滚 {entries.length} 个
        </div>
      )}
      footer={(
        <footer class="version-history-drawer__footer">
          <span class="version-history-drawer__hint">
            回滚会自动关闭 {appName} 并替换 .app, 失败可再次尝试。
          </span>
        </footer>
      )}
    >
      {loading && <div class="version-history-drawer__loading">加载中...</div>}
      {!loading && entries.length === 0 && (
        <DrawerEmpty
          message="暂无备份。下次升级时自动保存最近 2 版。"
          className="version-history-drawer__empty"
        />
      )}
      {!loading &&
        entries.map((e) => {
          const key = `${appName}::${e.to}`;
          const busy = inflight.has(key);
          return (
            <div key={e.to} class="version-history-entry">
              <div class="version-history-entry__main">
                <div class="version-history-entry__ver">
                  v{e.to}
                  {e.from && e.from !== e.to ? (
                    <span class="version-history-entry__from"> (← {e.from})</span>
                  ) : null}
                </div>
                <div class="version-history-entry__meta">
                  {fmtTs(e.at)} · {fmtSize(e.sizeBytes)}
                </div>
              </div>
              <div class="version-history-entry__actions">
                <button
                  class="btn btn-sm btn-primary"
                  onClick={() => onRollback(e.to)}
                  disabled={busy}
                  title="关闭应用, 用此版本替换当前安装"
                >
                  {busy ? "处理中..." : "回滚到这版"}
                </button>
                <button
                  class="btn btn-sm btn-danger"
                  onClick={() => onDelete(e.to)}
                  disabled={busy}
                  title="删除备份文件 + 移除此条记录"
                >
                  {busy ? "处理中..." : "删除"}
                </button>
              </div>
            </div>
          );
        })}
    </DrawerShell>
  );
}
