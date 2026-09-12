/**
 * src/renderer/cli-packages/CliPackagesPage.tsx
 *
 * v3.2: CLI 包 (npm -g / pip / brew formulae) 版本监控页.
 *
 * 数据面: 主进程 sweepEcosystem 逐生态跑 `outdated` 命令 (无 HTTP),
 * 本页只负责展示 + 手动刷新 + 忽略/恢复. 首次打开无数据时自动刷一轮.
 */

import { useCallback, useEffect, useState } from "preact/hooks";
import { PageHeader } from "../components/PageHeader.tsx";
import { api } from "../api.ts";
import type {
  CliPackagesData,
  CliPackageItemDto,
} from "../../shared/ipc-contracts";
import "./cli-packages.css";

const ECO_LABEL: Record<string, string> = {
  npm: "npm -g",
  pip: "pip",
  brew: "brew formulae",
};

const ECO_ERROR_LABEL: Record<string, string> = {
  cli_missing: "未安装 CLI",
  timeout: "扫描超时",
  unsupported_platform: "平台不支持",
  sweep_failed: "扫描失败",
};

function fmtTime(ts: number): string {
  if (!ts) return "从未扫描";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function CliPackagesPage() {
  const [data, setData] = useState<CliPackagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set());

  const applyData = useCallback((d: CliPackagesData | null) => {
    setData(d);
    if (d) setIgnoredKeys(new Set(d.ignored.map((g) => `${g.ecosystem}::${g.name}`)));
  }, []);

  const doFetch = useCallback(async () => {
    try {
      const r = await api.cliPackagesFetch();
      if (r && r.ok && r.data) applyData(r.data);
    } catch {
      /* fetch 失败保持空态 */
    } finally {
      setLoading(false);
    }
  }, [applyData]);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const r = await api.cliPackagesRefresh();
      if (r && r.ok && r.data) {
        applyData(r.data);
      } else {
        setError(r?.error || r?.reason || "刷新失败");
      }
    } catch (e: any) {
      setError(e?.message || "刷新失败");
    } finally {
      setRefreshing(false);
    }
  }, [applyData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.cliPackagesFetch();
        if (cancelled) return;
        if (r && r.ok && r.data && r.data.checkedAt > 0) {
          applyData(r.data);
          setLoading(false);
          return;
        }
      } catch {
        /* 落到自动刷新 */
      }
      // 首次使用 (无缓存数据) — 自动跑一轮
      if (!cancelled) await doRefresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onToggleIgnore = useCallback(
    async (it: CliPackageItemDto) => {
      const key = `${it.ecosystem}::${it.name}`;
      try {
        const r = await api.cliPackagesToggleIgnore({ ecosystem: it.ecosystem, name: it.name });
        if (r && r.ok && r.ignored) {
          setIgnoredKeys(new Set(r.ignored.map((g) => `${g.ecosystem}::${g.name}`)));
        }
      } catch {
        /* 静默 */
      }
    },
    [],
  );

  const items = data?.items || [];
  const errors = data?.errors || [];
  const updateCount = items.filter(
    (it) => it.has_update && !ignoredKeys.has(`${it.ecosystem}::${it.name}`),
  ).length;
  const total = items.length;
  const ignoredCount = ignoredKeys.size;

  return (
    <div class="cli-packages-page">
      <PageHeader title="CLI 包" subtitle="npm -g / pip / brew 全局包版本监控">
        <button
          class="cli-btn cli-btn--primary"
          onClick={doRefresh}
          disabled={refreshing}
        >
          {refreshing ? "扫描中…" : "扫描更新"}
        </button>
      </PageHeader>

      <div class="cli-kpis">
        <div class="cli-kpi">
          <span class="cli-kpi__num cli-kpi__num--accent">{updateCount}</span>
          <span class="cli-kpi__label">可升级</span>
        </div>
        <div class="cli-kpi">
          <span class="cli-kpi__num">{total}</span>
          <span class="cli-kpi__label">已装包</span>
        </div>
        <div class="cli-kpi">
          <span class="cli-kpi__time">{fmtTime(data?.checkedAt || 0)}</span>
          <span class="cli-kpi__label">上次扫描</span>
        </div>
      </div>

      {errors.length > 0 && (
        <div class="cli-errors">
          {errors.map((e) => (
            <span class="cli-errors__pill" key={e.ecosystem}>
              {ECO_LABEL[e.ecosystem] || e.ecosystem}: {ECO_ERROR_LABEL[e.reason] || e.reason}
            </span>
          ))}
        </div>
      )}
      {error && <div class="cli-errors"><span class="cli-errors__pill cli-errors__pill--error">{error}</span></div>}

      {loading && !refreshing ? (
        <div class="cli-empty">
          <div class="cli-empty__icon">📦</div>
          <div class="cli-empty__title">加载中…</div>
        </div>
      ) : items.length === 0 ? (
        <div class="cli-empty">
          <div class="cli-empty__icon">✅</div>
          <div class="cli-empty__title">{refreshing ? "扫描中…" : "没有可升级的全局包"}</div>
          <div class="cli-empty__desc">扫描 npm -g / pip / brew formulae 的已装包并对比最新版本</div>
        </div>
      ) : (
        <div class="cli-table" role="table">
          <div class="cli-table__head cli-row" role="row">
            <span class="cli-row__eco">来源</span>
            <span class="cli-row__name">包名</span>
            <span class="cli-row__version">已装 → 最新</span>
            <span class="cli-row__actions" />
          </div>
          {items.map((it) => {
            const key = `${it.ecosystem}::${it.name}`;
            const isIgnored = ignoredKeys.has(key);
            return (
              <div
                class={`cli-row${it.has_update && !isIgnored ? " cli-row--update" : ""}${isIgnored ? " cli-row--ignored" : ""}`}
                key={key}
                role="row"
              >
                <span class="cli-row__eco">
                  <span class={`cli-eco cli-eco--${it.ecosystem}`}>{ECO_LABEL[it.ecosystem] || it.ecosystem}</span>
                </span>
                <span class="cli-row__name" title={it.name}>{it.name}</span>
                <span class="cli-row__version">
                  {it.has_update ? (
                    <>
                      <span class="cli-ver cli-ver--old">{it.installed || "?"}</span>
                      <span class="cli-ver__arrow">→</span>
                      <span class="cli-ver cli-ver--new">{it.latest}</span>
                    </>
                  ) : (
                    <span class="cli-ver">{it.installed}</span>
                  )}
                  {it.note === "installed_newer" && <span class="cli-note">本机更新</span>}
                  {isIgnored && <span class="cli-note">已忽略</span>}
                </span>
                <span class="cli-row__actions">
                  <button class="cli-btn cli-btn--ghost" onClick={() => onToggleIgnore(it)}>
                    {isIgnored ? "恢复" : "忽略"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {ignoredCount > 0 && (
        <div class="cli-ignored-hint">
          已忽略 {ignoredCount} 个包 — 忽略后不计入「可升级」, 下次扫描起从列表剔除
        </div>
      )}
    </div>
  );
}

export default CliPackagesPage;
