/**
 * src/renderer/components/VersionHistoryDrawer.jsx
 *
 * 2026-06-14: App rollback · drawer showing prior versions for one app.
 *
 * 每个 entry: 旧版本号 + 时间 + size + 两条 action:
 *   - "回滚到这版" → api.rollbackApp
 *   - "删除备份"   → api.deleteBackup
 *
 * 跟 DiagnosticsDrawer 同样: 480px right-side slide-in, 关闭按钮 + overlay.
 *
 * 订阅:
 *   - 打开时 fetchVersionHistory 拉一次
 *   - 监听 version-history-updated 事件 (main 在 rollback/delete 后 broadcast),
 *     自动 refetch. 监听器只在 drawer 打开时挂.
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
    // 订阅 main 的 broadcast — rollback / delete 后自动 refetch
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

  if (!open) return null;

  async function onRollback(version) {
    if (!appName) return;
    if (isInFlight(appName, version)) return;
    const r = await doRollback(appName, version);
    if (r && r.ok) {
      // 成功后 main 也会 broadcast, drawer 会被 refetch; 这里也乐观关掉
      closeVersionHistory();
    } else {
      rendererLog.warn("rollback failed", r);
      // 失败时保持 drawer 打开, 让用户看到 entries
    }
  }

  async function onDelete(version) {
    if (!appName) return;
    if (isInFlight(appName, version)) return;
    const r = await deleteBackup(appName, version);
    if (!r || !r.ok) {
      rendererLog.warn("delete backup failed", r);
    }
    // deleteBackup 自己会更新 entries
  }

  return (
    <>
      <div
        class="version-history-overlay visible"
        onClick={closeVersionHistory}
        aria-hidden="true"
      />
      <aside class="version-history-drawer" role="complementary" aria-label="回滚历史">
        <header class="version-history-drawer__header">
          <span class="version-history-drawer__title">
            回滚历史 · {appName || ""}
          </span>
          <button
            class="version-history-drawer__close"
            onClick={closeVersionHistory}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        <div class="version-history-drawer__stats">
          备份占盘 <b>{fmtSize(totalSize)}</b> · 可回滚 {entries.length} 个
        </div>
        <div class="version-history-drawer__body">
          {loading && <div class="version-history-drawer__loading">加载中...</div>}
          {!loading && entries.length === 0 && (
            <div class="version-history-drawer__empty">
              暂无备份。下次升级时自动保存最近 2 版。
            </div>
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
        </div>
        <footer class="version-history-drawer__footer">
          <span class="version-history-drawer__hint">
            回滚会自动关闭 {appName} 并替换 .app, 失败可再次尝试。
          </span>
        </footer>
      </aside>
    </>
  );
}