/**
 * src/renderer/components/DiagnosticsPage.jsx
 *
 * 错误诊断整页 (路由 /versions/diagnostics).
 *
 * Phase 32 UI 重设计:
 *   1. 顶部 4 个 KPI 卡片 (总数 / error / warn / unhandled), 失败率高时变红
 *   2. 启动 + 性能 (单卡片, 含 trend bar)
 *   3. Top 5 失败 (单卡片)
 *   4. 错误记录 (单卡片, 搜索框 + level/source 筛选 chips + 时间倒序)
 *   5. 操作区 (单卡片, 紧凑 3 排: 诊断包 / 配置备份 / 清理 + 打开文件夹)
 *   6. 自更新独立卡片 (有新版时显示)
 *
 * 数据流 (跟之前一样): 复用 diagnostics-store signals, mount 时拉一次, refresh 按钮再拉.
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import {
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
} from "../diagnostics/diagnostics-store.js";
import { api } from "../api.js";
import { PageHeader } from "./PageHeader.jsx";
import { ConfigImportModal } from "./ConfigImportModal.jsx";
import { PanelEmpty } from "./EmptyState.jsx";
import { KPICard } from "./KPICard.jsx";
import { StatusBadge } from "./Badge.jsx";
import { IconCheck } from "./icons.jsx";
import { navigateTo } from "../route-store.js";

function fmtTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtBytes(n) {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const LEVEL_FILTERS = [
  { key: "all", label: "全部" },
  { key: "error", label: "error" },
  { key: "warn", label: "warn" },
  { key: "unhandled", label: "unhandled" },
];

export function DiagnosticsPage() {
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

  // 自更新状态 (有新版时每 2s 拉一次 progress)
  const [updateState, setUpdateState] = useState(null);
  useEffect(() => {
    if (!api.selfUpdateGetState) return undefined;
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await api.selfUpdateGetState();
        if (!cancelled && r && r.ok) setUpdateState(r.state);
      } catch {
        /* noop */
      }
    };
    pull();
    const interval = setInterval(pull, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // 拉 error entries
  useEffect(() => {
    errorLoading.value = true;
    const p = api.errorFetchEntries && api.errorFetchEntries({});
    Promise.resolve(p)
      .then((resp) => {
        if (resp && resp.ok) {
          errorEntries.value = resp.entries || [];
          errorStats.value = resp.stats || { total: 0, byLevel: {}, skipped: 0 };
        }
      })
      .finally(() => {
        errorLoading.value = false;
      });
  }, []);

  // 拉 startup / metrics / samples
  useEffect(() => {
    diagnosticsDiagnosticsLoading.value = true;
    Promise.all([
      api.diagnosticsFetch ? api.diagnosticsFetch({ topN: 5 }) : null,
      api.diagnosticsFetchSamples ? api.diagnosticsFetchSamples() : null,
    ])
      .then(([dResp, sResp]) => {
        if (dResp && dResp.ok) {
          diagnosticsStartup.value = dResp.startup || null;
          diagnosticsMetrics.value = dResp.metrics || { latest: null, peak: null, count: 0 };
          diagnosticsTopFailures.value = dResp.topFailures || [];
        }
        if (sResp && sResp.ok) {
          diagnosticsSamples.value = sResp.samples || [];
        }
      })
      .finally(() => {
        diagnosticsDiagnosticsLoading.value = false;
      });
  }, []);

  const onSelfUpdateCheck = async () => {
    if (!api.selfUpdateCheck) return;
    const r = await api.selfUpdateCheck();
    if (r && r.ok && api.selfUpdateGetState) {
      const s = await api.selfUpdateGetState();
      if (s && s.ok) setUpdateState(s.state);
    }
  };
  const onSelfUpdateInstall = async () => {
    if (!api.selfUpdateInstall) return;
    const r = await api.selfUpdateInstall();
    if (r && !r.ok) {
      // eslint-disable-next-line no-alert
      window.alert(`退出并安装失败: ${r.error || r.reason || "未知错误"}`);
    }
  };

  // 错误记录筛选
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const filteredEntries = useMemo(() => {
    const sorted = entries.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return sorted.filter((e) => {
      if (levelFilter !== "all" && e.level !== levelFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        (e.message || "").toLowerCase().includes(q)
        || (e.source || "").toLowerCase().includes(q)
      );
    });
  }, [entries, query, levelFilter]);

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
    } catch {
      /* swallow */
    }
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
          error: (r && (r.reason || r.error)) || "export_failed",
          ts: Date.now(),
        };
      }
    } catch (err) {
      diagnosticsLastExport.value = {
        error: (err && err.message) || "export_failed",
        ts: Date.now(),
      };
    } finally {
      diagnosticsExporting.value = false;
    }
  }

  const [importOpen, setImportOpen] = useState(false);
  const [configExportState, setConfigExportState] = useState(null);
  const [configExporting, setConfigExporting] = useState(false);

  async function exportConfig() {
    if (configExporting) return;
    setConfigExporting(true);
    setConfigExportState(null);
    try {
      const r = await (api.configExport ? api.configExport() : null);
      if (r && r.ok) {
        setConfigExportState({ path: r.path, ts: Date.now() });
      } else {
        setConfigExportState({ error: (r && (r.reason || r.error)) || "export_failed", ts: Date.now() });
      }
    } catch (err) {
      setConfigExportState({ error: (err && err.message) || "export_failed", ts: Date.now() });
    } finally {
      setConfigExporting(false);
    }
  }

  // samples 时间序列迷你趋势图 (heapUsed relative)
  const samplesMax = samples.reduce((m, s) => Math.max(m, (s && s.heapUsed) || 0), 0);

  const errorCount = stats.byLevel.error || 0;
  const warnCount = stats.byLevel.warn || 0;
  const unhandledCount = stats.byLevel.unhandled || 0;

  return (
    <div class="diagnostics-page">
      <PageHeader title="错误诊断" subtitle="检测失败 + 网络异常 + 重试历史">
        <button type="button" class="btn btn-sm" onClick={refresh}>刷新</button>
        <button type="button" class="btn btn-sm" onClick={copyAll}>复制全部</button>
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => navigateTo("library")}>
          ← 返回应用库
        </button>
      </PageHeader>

      <div class="diagnostics-content">
        {updateState && updateState.available && (
          <section class="diag-card diag-card--update">
            <div class="diag-card__title-row">
              <span class="diag-card__title">Pulse 自更新</span>
              <span class={`diag-update-pill diag-update-pill--${updateState.status}`}>
                {updateState.status === "checking" && "检测中"}
                {updateState.status === "downloading" && `下载 ${updateState.downloadPercent}%`}
                {updateState.status === "downloaded" && "已下载"}
                {updateState.status === "error" && "出错"}
                {updateState.status === "available" && "可升级"}
              </span>
            </div>
            <div class="diag-card__body">
              <b>Pulse 有新版 v{updateState.version}</b>
              {updateState.status === "error" && ` · 错误: ${updateState.error}`}
            </div>
            <div class="diag-card__actions">
              {updateState.status === "downloaded" && (
                <button type="button" class="btn btn-primary btn-sm" onClick={onSelfUpdateInstall}>
                  退出并安装
                </button>
              )}
              <button type="button" class="btn btn-ghost btn-sm" onClick={onSelfUpdateCheck}>
                重新检测
              </button>
            </div>
          </section>
        )}

        {/* ── 双栏: 左侧错误记录 (主) + 右侧 KPI/性能/Top5 (侧) ── */}
        <div class="diag-body">
          {/* 左侧: 错误记录 (核心, 可滚动) */}
          <div class="diag-main">
            <section class={`diag-card diag-card--entries${!loading && entries.length === 0 ? " diag-card--empty" : ""}`}>
              {(!loading && entries.length === 0) ? (
                <PanelEmpty
                  icon={<IconCheck size={28} />}
                  variant="success"
                  title="一切正常"
                  hint="当前没有记录到任何错误"
                  className="diagnostics-page__empty"
                />
              ) : (
                <>
                  <div class="diag-card__title-row">
                    <span class="diag-card__title">错误记录</span>
                    <span class="diag-card__meta">
                      显示 {filteredEntries.length} / {entries.length} 条
                    </span>
                  </div>
                  <div class="diag-entries-toolbar">
                    <input
                      type="search"
                      class="diag-entries-search"
                      placeholder="搜索 message / source…"
                      value={query}
                      onInput={(e) => setQuery(e.currentTarget.value)}
                      data-testid="diag-entries-search"
                    />
                    <div class="diag-entries-filters" role="tablist" aria-label="按 level 筛选">
                      {LEVEL_FILTERS.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          role="tab"
                          aria-selected={levelFilter === f.key}
                          class={`diag-filter-chip${levelFilter === f.key ? " active" : ""}`}
                          onClick={() => setLevelFilter(f.key)}
                          data-testid={`diag-filter-${f.key}`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {loading && <div class="diag-card__empty">加载中…</div>}
                  {!loading && entries.length > 0 && filteredEntries.length === 0 && (
                    <div class="diag-card__empty">没有匹配当前筛选的错误</div>
                  )}
                  {!loading && filteredEntries.length > 0 && (
                    <ul class="diag-entries">
                      {filteredEntries.map((e) => (
                        <li
                          key={e.id}
                          class={`error-entry error-entry--${e.source || "main"} error-entry--${e.level || "error"}`}
                        >
                          <div class="error-entry__meta">
                            <span class="error-entry__time">{fmtTs(e.ts)}</span>
                            <span class="error-entry__source">[{e.source}]</span>
                            <StatusBadge status={e.level === "warn" ? "warning" : "error"}>
                              {e.level}
                            </StatusBadge>
                          </div>
                          <div class="error-entry__message">{e.message}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          </div>

          {/* 右侧: KPI + 性能 + Top5 (侧边栏) */}
          <aside class="diag-sidebar">
            <div class="diag-kpi-row" data-testid="diag-kpi-row">
              <KPICard label="总数" value={stats.total} variant="neutral" testId="diag-kpi-总数" />
              <KPICard label="error" value={errorCount} variant={errorCount > 0 ? "danger" : "success"} testId="diag-kpi-error" />
              <KPICard label="warn" value={warnCount} variant={warnCount > 0 ? "warning" : "success"} testId="diag-kpi-warn" />
              <KPICard label="unhandled" value={unhandledCount} variant={unhandledCount > 0 ? "danger" : "success"} testId="diag-kpi-unhandled" />
            </div>

            <section class="diag-card">
              <div class="diag-card__title-row">
                <span class="diag-card__title">启动 + 性能</span>
                {metrics.count > 0 && (
                  <span class="diag-card__meta">近 {metrics.count} 个采样</span>
                )}
              </div>
              {diagLoading && !startup && <div class="diag-card__empty">加载中…</div>}
              {startup && (
                <div class="diag-perf-row">
                  <div class="diag-perf-cell">
                    <span class="diag-perf-cell__label">bootstrap</span>
                    <span class="diag-perf-cell__value">
                      {startup.bootstrapMs == null ? "—" : `${startup.bootstrapMs} ms`}
                    </span>
                  </div>
                  <div class="diag-perf-cell">
                    <span class="diag-perf-cell__label">renderer ready</span>
                    <span class="diag-perf-cell__value">
                      {startup.readyMs == null ? "—" : `${startup.readyMs} ms`}
                    </span>
                  </div>
                </div>
              )}
              {metrics.latest && (
                <div class="diag-perf-row">
                  <div class="diag-perf-cell">
                    <span class="diag-perf-cell__label">heap</span>
                    <span class="diag-perf-cell__value">{fmtBytes(metrics.latest.heapUsed)}</span>
                  </div>
                  <div class="diag-perf-cell">
                    <span class="diag-perf-cell__label">rss</span>
                    <span class="diag-perf-cell__value">{fmtBytes(metrics.latest.rss)}</span>
                  </div>
                  <div class="diag-perf-cell">
                    <span class="diag-perf-cell__label">cpu</span>
                    <span class="diag-perf-cell__value">{metrics.latest.cpuUser} µs</span>
                  </div>
                </div>
              )}
              {metrics.peak && (
                <div class="diag-perf-meta">
                  peak heap {fmtBytes(metrics.peak.heapUsed)} · rss {fmtBytes(metrics.peak.rss)}
                </div>
              )}
              {samples.length > 1 && (
                <div class="diag-trend" title="heap trend (近 60 帧)">
                  {samples.map((s, i) => (
                    <span
                      key={i}
                      class="diag-trend__bar"
                      style={{ height: `${samplesMax > 0 ? Math.max(2, Math.round(((s.heapUsed || 0) / samplesMax) * 32)) : 2}px` }}
                    />
                  ))}
                </div>
              )}
            </section>

            <section class="diag-card">
              <div class="diag-card__title-row">
                <span class="diag-card__title">Top 5 失败</span>
                {topFailures.length > 0 && (
                  <span class="diag-card__meta">{topFailures.length} 类</span>
                )}
              </div>
              {topFailures.length === 0 && (
                <div class="diag-card__empty">暂无反复出现的失败</div>
              )}
              <ul class="diag-failure-list">
                {topFailures.map((t, i) => (
                  <li key={i} class="diag-failure">
                    <span class="diag-failure__count">{t.count}×</span>
                    <span class="diag-failure__source">[{t.source}]</span>
                    <span class="diag-failure__message">{t.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>

        <section class="diag-card diag-card--actions">
          <div class="diag-card__title-row">
            <span class="diag-card__title">操作</span>
          </div>
          <div class="diag-action-grid">
            <div class="diag-action-group">
              <div class="diag-action-group__label">诊断包</div>
              <button
                type="button"
                class="btn btn-sm"
                onClick={exportZip}
                disabled={exporting}
                data-testid="diag-export-zip"
              >
                {exporting ? "导出中…" : "导出 .tar.gz → 桌面"}
              </button>
              {lastExport && !lastExport.error && (
                <span class="diag-action-hint">
                  已导出 → <code>{lastExport.path}</code> ({fmtBytes(lastExport.sizeBytes)}, {lastExport.fileCount} 个文件)
                </span>
              )}
              {lastExport && lastExport.error && (
                <span class="diag-action-hint diag-action-hint--err">导出失败: {lastExport.error}</span>
              )}
            </div>

            <div class="diag-action-group">
              <div class="diag-action-group__label">配置</div>
              <button
                type="button"
                class="btn btn-sm"
                onClick={exportConfig}
                disabled={configExporting}
                data-testid="diag-export-config"
              >
                {configExporting ? "导出中…" : "导出 .json"}
              </button>
              <button
                type="button"
                class="btn btn-sm"
                onClick={() => setImportOpen(true)}
              >
                导入配置
              </button>
              {configExportState && !configExportState.error && (
                <span class="diag-action-hint">
                  已导出 → <code>{configExportState.path}</code>
                </span>
              )}
              {configExportState && configExportState.error && (
                <span class="diag-action-hint diag-action-hint--err">导出失败: {configExportState.error}</span>
              )}
              {importOpen && <ConfigImportModal onClose={() => setImportOpen(false)} />}
            </div>

            <div class="diag-action-group">
              <div class="diag-action-group__label">日志</div>
              <button type="button" class="btn btn-sm" onClick={openFolder}>打开文件夹</button>
              <button type="button" class="btn btn-sm" onClick={clearOld} data-testid="diag-clear-old">
                清理 &gt; 30 天
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default DiagnosticsPage;
