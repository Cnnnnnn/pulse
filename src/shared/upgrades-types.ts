/**
 * src/shared/upgrades-types.ts
 *
 * v3.0 alpha: 升级路径诊断类型 — 跨 main/renderer 共享.
 * 单 app 维度环形缓冲 (max 200 attempts), 写 state.json 走 patchState.
 *
 * 与 bulk-upgrade-actions 的 action.type 同步 (brew / open / open_url /
 * mas / winget / none). 新增 'none' 表示"该 app 没有自动升级路径",
 * 诊断面板里展示「打开下载页」按钮而不是「一键升级」.
 */

export type UpgradePathKind =
  | "brew"
  | "open"
  | "open_url"
  | "mas"
  | "winget"
  | "none";

export type UpgradeAttemptResult = "success" | "failed" | "skipped";

export type UpgradeAttempt = {
  id: string;
  ts: number;
  result: UpgradeAttemptResult;
  durationMs?: number;
  error?: string;
  output?: string;
  action: UpgradePathKind;
};

export type UpgradeDiagnostic = {
  attempts: UpgradeAttempt[];
  lastSuccessAt?: number;
  lastFailureAt?: number;
  consecutiveFailures: number;
};

/** 统计卡数据 — 给 4 块 KPI 用 */
export type UpgradeStats = {
  upgradable: number;
  autoPathable: number;
  success30d: number;
  failed30d: number;
};

/** 明细表行 — 渲染时一行一个 app */
export type UpgradeRow = {
  id: string;
  name: string;
  installedVersion: string;
  latestVersion: string;
  pathKind: UpgradePathKind;
  pathReason?: string;
  lastResult?: UpgradeAttemptResult;
  lastTs?: number;
  lastError?: string;
};

/** IPC 响应 */
export type UpgradeDiagnosticsResponse = {
  ok: boolean;
  stats?: UpgradeStats;
  rows?: UpgradeRow[];
  reason?: string;
  error?: string;
};

export const UPGRADE_DIAGNOSTICS_CAP = 200;
