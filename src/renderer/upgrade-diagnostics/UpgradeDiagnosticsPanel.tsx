/**
 * src/renderer/upgrade-diagnostics/UpgradeDiagnosticsPanel.tsx
 *
 * v3.0 alpha: 升级路径诊断 — 4 块 KPI + 明细表.
 *
 * 只读视图 — 详情行不直接触发升级; 单击"打开下载页 / 一键升级"按钮走
 * 现有 `bulkUpgradeStart` + `shell.openExternal` 范式. alpha 阶段先展示
 * 路径类型 + 上次结果, 升级动作留给后续接入 (走单条 bulk-upgrade).
 */
import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { KPICard } from "../components/KPICard.tsx";
import { api } from "../api.ts";
import type {
  UpgradePathKind,
  UpgradeRow,
  UpgradeStats,
} from "../../shared/upgrades-types";

const stats = signal<UpgradeStats | null>(null);
const rows = signal<UpgradeRow[]>([]);
const loading = signal<boolean>(false);

async function refresh() {
  loading.value = true;
  try {
    const resp = await api.upgradeDiagnosticsFetch();
    if (resp && resp.ok) {
      stats.value = resp.stats || null;
      rows.value = resp.rows || [];
    }
  } finally {
    loading.value = false;
  }
}

const PATH_LABEL: Record<UpgradePathKind, string> = {
  brew: "Homebrew",
  open: "打开 App",
  open_url: "下载页",
  mas: "App Store",
  winget: "winget",
  none: "手动",
};

function pathVariant(kind: UpgradePathKind): string {
  if (kind === "none") return "danger";
  if (kind === "brew" || kind === "winget" || kind === "mas") return "success";
  if (kind === "open_url") return "warning";
  return "neutral";
}

function rowVariant(r: UpgradeRow): string {
  if (r.lastResult === "failed") return "danger";
  if (r.lastResult === "success") return "success";
  if (r.pathKind === "none") return "warning";
  return "neutral";
}

function fmtTime(ts: number | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function UpgradeDiagnosticsPanel() {
  useEffect(() => {
    refresh();
  }, []);
  const s = stats.value;
  return (
    <div class="upgrade-diagnostics" data-testid="upgrade-diagnostics">
      <div class="upgrade-diagnostics__kpis">
        <KPICard
          label="可升级"
          value={s ? s.upgradable : "—"}
          variant="default"
          testId="ud-upgradable"
        />
        <KPICard
          label="可自动升级"
          value={s ? s.autoPathable : "—"}
          variant="success"
          testId="ud-auto"
        />
        <KPICard
          label="30 天成功"
          value={s ? s.success30d : "—"}
          variant="success"
          testId="ud-success"
        />
        <KPICard
          label="30 天失败"
          value={s ? s.failed30d : "—"}
          variant={s && s.failed30d > 0 ? "danger" : "neutral"}
          testId="ud-failed"
        />
      </div>
      <div class="upgrade-diagnostics__tablewrap">
        <table class="upgrade-diagnostics__table" data-testid="ud-table">
          <thead>
            <tr>
              <th>应用</th>
              <th>当前</th>
              <th>最新</th>
              <th>路径</th>
              <th>上次结果</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.value.length === 0 ? (
              <tr>
                <td colSpan={6} class="upgrade-diagnostics__empty">
                  {loading.value ? "加载中..." : "当前无可升级应用"}
                </td>
              </tr>
            ) : (
              rows.value.map((r) => (
                <tr key={r.id} data-app-id={r.id}>
                  <td class="upgrade-diagnostics__name">{r.name}</td>
                  <td>{r.installedVersion || "—"}</td>
                  <td>{r.latestVersion || "—"}</td>
                  <td>
                    <span class={`path-badge path-badge--${pathVariant(r.pathKind)}`}>
                      {PATH_LABEL[r.pathKind]}
                    </span>
                  </td>
                  <td>
                    <span class={`result-badge result-badge--${rowVariant(r)}`}>
                      {r.lastResult === "success"
                        ? "成功"
                        : r.lastResult === "failed"
                          ? "失败"
                          : r.pathKind === "none"
                            ? "需手动"
                            : "—"}
                    </span>
                    {r.lastResult === "failed" && r.lastError ? (
                      <div class="upgrade-diagnostics__err" title={r.lastError}>
                        {r.lastError.slice(0, 60)}
                      </div>
                    ) : null}
                  </td>
                  <td>{fmtTime(r.lastTs)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div class="upgrade-diagnostics__footer">
        <button
          type="button"
          class="upgrade-diagnostics__refresh"
          onClick={refresh}
          disabled={loading.value}
        >
          {loading.value ? "刷新中..." : "刷新"}
        </button>
      </div>
    </div>
  );
}
