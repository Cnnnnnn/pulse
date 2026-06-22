/**
 * src/renderer/components/DiagnosticsDrawer.jsx
 *
 * Phase Q6: 480px right-side drawer showing error entries from main.
 * Fetches on open, supports copy-all / open folder / clear-old actions.
 */
import { useEffect } from 'preact/hooks';
import {
  diagnosticsDrawerOpen,
  errorEntries,
  errorStats,
  errorLoading,
} from '../diagnostics/diagnostics-store.js';
import { api } from '../api.js';

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function DiagnosticsDrawer() {
  const open = diagnosticsDrawerOpen.value;
  const entries = errorEntries.value;
  const stats = errorStats.value;
  const loading = errorLoading.value;

  useEffect(() => {
    if (!open) return;
    errorLoading.value = true;
    const p = api.errorFetchEntries && api.errorFetchEntries({});
    Promise.resolve(p).then((resp) => {
      if (resp && resp.ok) {
        errorEntries.value = resp.entries || [];
        errorStats.value = resp.stats || { total: 0, byLevel: {}, skipped: 0 };
      }
    }).finally(() => {
      errorLoading.value = false;
    });
  }, [open]);

  if (!open) return null;

  function close() { diagnosticsDrawerOpen.value = false; }
  async function refresh() {
    errorLoading.value = true;
    try {
      const r = await (api.errorFetchEntries ? api.errorFetchEntries({}) : Promise.resolve(null));
      if (r && r.ok) {
        errorEntries.value = r.entries || [];
        errorStats.value = r.stats || { total: 0, byLevel: {}, skipped: 0 };
      }
    } finally {
      errorLoading.value = false;
    }
  }
  async function copyAll() {
    try {
      const r = await (api.errorCopyAll ? api.errorCopyAll() : Promise.resolve(null));
      if (r && r.text && navigator && navigator.clipboard) {
        await navigator.clipboard.writeText(r.text);
      }
    } catch { /* swallow */ }
  }
  function openFolder() {
    if (api.errorOpenFolder) api.errorOpenFolder();
  }
  async function clearOld() {
    if (api.errorClearOld) await api.errorClearOld({});
    await refresh();
  }

  return (
    <>
      <div
        class={`diagnostics-overlay ${open ? 'visible' : ''}`}
        onClick={close}
        aria-hidden="true"
      />
      <aside class="diagnostics-drawer" role="complementary">
        <header class="diagnostics-drawer__header">
          <span class="diagnostics-drawer__title">错误诊断</span>
          <button class="btn btn-sm" onClick={refresh}>刷新</button>
          <button class="btn btn-sm" onClick={copyAll}>复制全部</button>
          <button class="btn btn-sm" onClick={openFolder}>打开文件夹</button>
          <button class="diagnostics-drawer__close" onClick={close} aria-label="关闭">×</button>
        </header>
        <div class="diagnostics-drawer__stats">
          共 <b>{stats.total}</b> 条 · error: {stats.byLevel.error || 0} · warn: {stats.byLevel.warn || 0} · unhandled: {stats.byLevel.unhandled || 0}
        </div>
        <div class="diagnostics-drawer__body">
          {loading && <div class="diagnostics-drawer__loading">加载中...</div>}
          {!loading && entries.length === 0 && (
            <div class="diagnostics-drawer__empty">暂无错误</div>
          )}
          {!loading && entries.map((e) => (
            <div key={e.id} class={`error-entry error-entry--${e.source || 'main'} error-entry--${e.level || 'error'}`}>
              <div class="error-entry__meta">
                <span class="error-entry__time">{fmtTs(e.ts)}</span>
                <span class="error-entry__source">[{e.source}]</span>
                <span class="error-entry__level">{e.level}</span>
              </div>
              <div class="error-entry__message">{e.message}</div>
            </div>
          ))}
        </div>
        <footer class="diagnostics-drawer__footer">
          <button class="btn btn-sm" onClick={clearOld}>清理 &gt; 30 天</button>
        </footer>
      </aside>
    </>
  );
}