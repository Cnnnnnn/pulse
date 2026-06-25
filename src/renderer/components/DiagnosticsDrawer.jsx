/**
 * src/renderer/components/DiagnosticsDrawer.jsx
 *
 * Phase Q6: 480px right-side drawer showing error entries from main.
 * Fetches on open, supports copy-all / open folder / clear-old actions.
 */
import { useEffect, useState } from 'preact/hooks';
import {
  diagnosticsDrawerOpen,
  errorEntries,
  errorStats,
  errorLoading,
  diagnosticsStartup,
  diagnosticsMetrics,
  diagnosticsTopFailures,
  diagnosticsSamples,
  diagnosticsDiagnosticsLoading,
  diagnosticsExporting,
  diagnosticsLastExport,
} from '../diagnostics/diagnostics-store.js';
import { api } from '../api.js';
import { ConfigImportModal } from './ConfigImportModal.jsx';
import { DrawerShell } from './DrawerShell.jsx';
import { DrawerEmpty } from './EmptyState.jsx';

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtBytes(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function DiagnosticsDrawer() {
  const open = diagnosticsDrawerOpen.value;
  const entries = errorEntries.value;
  const stats = errorStats.value;
  const loading = errorLoading.value;
  const startup = diagnosticsStartup.value;
  const metrics = diagnosticsMetrics.value;
  const topFailures = diagnosticsTopFailures.value;
  const samples = diagnosticsSamples.value;
  const diagLoading = diagnosticsDiagnosticsLoading.value;
  const exporting = diagnosticsExporting.value;
  const lastExport = diagnosticsLastExport.value;

  const [importOpen, setImportOpen] = useState(false);
  const [configExportState, setConfigExportState] = useState(null);
  const [configExporting, setConfigExporting] = useState(false);

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

  // Phase Q1 v2: 拉 startup + metrics + top-5 + ring buffer
  useEffect(() => {
    if (!open) return;
    diagnosticsDiagnosticsLoading.value = true;
    Promise.all([
      api.diagnosticsFetch ? api.diagnosticsFetch({ topN: 5 }) : null,
      api.diagnosticsFetchSamples ? api.diagnosticsFetchSamples() : null,
    ]).then(([dResp, sResp]) => {
      if (dResp && dResp.ok) {
        diagnosticsStartup.value = dResp.startup || null;
        diagnosticsMetrics.value = dResp.metrics || { latest: null, peak: null, count: 0 };
        diagnosticsTopFailures.value = dResp.topFailures || [];
      }
      if (sResp && sResp.ok) {
        diagnosticsSamples.value = sResp.samples || [];
      }
    }).finally(() => {
      diagnosticsDiagnosticsLoading.value = false;
    });
  }, [open]);

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
  async function exportZip() {
    if (exporting) return;
    diagnosticsExporting.value = true;
    try {
      const r = await (api.errorExportZip ? api.errorExportZip({}) : null);
      if (r && r.ok) {
        diagnosticsLastExport.value = {
          path: r.path,
          sizeBytes: r.sizeBytes,
          fileCount: r.fileCount,
          ts: Date.now(),
        };
      } else {
        diagnosticsLastExport.value = {
          error: (r && (r.reason || r.error)) || 'export_failed',
          ts: Date.now(),
        };
      }
    } catch (err) {
      diagnosticsLastExport.value = { error: (err && err.message) || 'export_failed', ts: Date.now() };
    } finally {
      diagnosticsExporting.value = false;
    }
  }

  // P61: 配置导入导出
  async function exportConfig() {
    if (configExporting) return;
    setConfigExporting(true);
    setConfigExportState(null);
    try {
      const r = await (api.configExport ? api.configExport() : null);
      if (r && r.ok) {
        setConfigExportState({ path: r.path, ts: Date.now() });
      } else {
        setConfigExportState({ error: (r && (r.reason || r.error)) || 'export_failed', ts: Date.now() });
      }
    } catch (err) {
      setConfigExportState({ error: (err && err.message) || 'export_failed', ts: Date.now() });
    } finally {
      setConfigExporting(false);
    }
  }

  // samples 是时间序列, 文本迷你趋势图 (bar 用 heapUsed relative)
  const samplesMax = samples.reduce((m, s) => Math.max(m, s && s.heapUsed || 0), 0);

  const diagSections = (
    <>
      <div class="diagnostics-drawer__stats">
        共 <b>{stats.total}</b> 条 · error: {stats.byLevel.error || 0} · warn: {stats.byLevel.warn || 0} · unhandled: {stats.byLevel.unhandled || 0}
      </div>

      <section class="diag-section">
        <h3 class="diag-section__title">启动时间</h3>
        {diagLoading && !startup && <div class="diag-section__loading">加载中…</div>}
        {startup && (
          <div class="diag-row">
            <span class="diag-row__label">bootstrap</span>
            <span class="diag-row__value">{startup.bootstrapMs == null ? '-' : `${startup.bootstrapMs} ms`}</span>
            <span class="diag-row__label" style="margin-left: 16px;">renderer ready</span>
            <span class="diag-row__value">{startup.readyMs == null ? '-' : `${startup.readyMs} ms`}</span>
          </div>
        )}
      </section>

      <section class="diag-section">
        <h3 class="diag-section__title">性能 (近 {metrics.count || 0} 个采样)</h3>
        {metrics.latest && (
          <div class="diag-row">
            <span class="diag-row__label">heap</span>
            <span class="diag-row__value">{fmtBytes(metrics.latest.heapUsed)}</span>
            <span class="diag-row__label" style="margin-left: 12px;">rss</span>
            <span class="diag-row__value">{fmtBytes(metrics.latest.rss)}</span>
            <span class="diag-row__label" style="margin-left: 12px;">cpu user</span>
            <span class="diag-row__value">{metrics.latest.cpuUser} µs</span>
          </div>
        )}
        {metrics.peak && (
          <div class="diag-row diag-row--sub">
            <span class="diag-row__label">peak heap / rss</span>
            <span class="diag-row__value">{fmtBytes(metrics.peak.heapUsed)} / {fmtBytes(metrics.peak.rss)}</span>
          </div>
        )}
        {samples.length > 1 && (
          <div class="diag-trend" title="heap trend (近 60 帧)">
            {samples.map((s, i) => (
              <span
                key={i}
                class="diag-trend__bar"
                style={{ height: `${samplesMax > 0 ? Math.max(2, Math.round((s.heapUsed / samplesMax) * 24)) : 2}px` }}
              />
            ))}
          </div>
        )}
      </section>

      <section class="diag-section">
        <h3 class="diag-section__title">Top 5 失败</h3>
        {topFailures.length === 0 && <div class="diag-section__empty">暂无</div>}
        {topFailures.map((t, i) => (
          <div key={i} class="diag-failure">
            <span class="diag-failure__count">{t.count}×</span>
            <span class="diag-failure__source">[{t.source}]</span>
            <span class="diag-failure__message">{t.message}</span>
          </div>
        ))}
      </section>

      <section class="diag-section diag-section--export">
        <button class="btn btn-sm" onClick={exportZip} disabled={exporting}>
          {exporting ? '导出中…' : '导出诊断包 (.tar.gz → 桌面)'}
        </button>
        {lastExport && !lastExport.error && (
          <div class="diag-export__ok">
            已导出 → <code>{lastExport.path}</code> ({fmtBytes(lastExport.sizeBytes)}, {lastExport.fileCount} 个文件)
          </div>
        )}
        {lastExport && lastExport.error && (
          <div class="diag-export__err">导出失败: {lastExport.error}</div>
        )}
      </section>

      <section class="diag-section diag-section--config-portability">
        <div class="diag-section-title">配置备份</div>
        <div class="diag-config-portability-actions">
          <button class="btn btn-sm" onClick={exportConfig} disabled={configExporting}>
            {configExporting ? '导出中…' : '导出配置 (.json → 桌面)'}
          </button>
          <button class="btn btn-sm" onClick={() => setImportOpen(true)}>
            导入配置
          </button>
        </div>
        {configExportState && !configExportState.error && (
          <div class="diag-export__ok">
            已导出 → <code>{configExportState.path}</code>
          </div>
        )}
        {configExportState && configExportState.error && (
          <div class="diag-export__err">导出失败: {configExportState.error}</div>
        )}
        {importOpen && <ConfigImportModal onClose={() => setImportOpen(false)} />}
      </section>
    </>
  );

  return (
    <DrawerShell
      open={open}
      onClose={close}
      title="错误诊断"
      overlayClass="diagnostics-overlay"
      drawerClass="diagnostics-drawer"
      ariaLabel="错误诊断"
      headerActions={(
        <>
          <button type="button" class="btn btn-sm" onClick={refresh}>刷新</button>
          <button type="button" class="btn btn-sm" onClick={copyAll}>复制全部</button>
          <button type="button" class="btn btn-sm" onClick={openFolder}>打开文件夹</button>
        </>
      )}
      beforeBody={diagSections}
      bodyClass="diagnostics-drawer__body"
      footer={(
        <footer class="diagnostics-drawer__footer">
          <button type="button" class="btn btn-sm" onClick={clearOld}>清理 &gt; 30 天</button>
        </footer>
      )}
    >
      {loading && <div class="diagnostics-drawer__loading">加载中...</div>}
      {!loading && entries.length === 0 && (
        <DrawerEmpty message="暂无错误" className="diagnostics-drawer__empty" />
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
    </DrawerShell>
  );
}