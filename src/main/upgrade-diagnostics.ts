/**
 * src/main/upgrade-diagnostics.ts
 *
 * v3.0 alpha: 升级路径诊断 — 纯函数 + 写盘薄壳.
 *
 * - getStats / getRows: 读 state, 派生统计 + 明细. 不写盘.
 * - appendAttempt: 写盘, 走 state-store.patchState 公共范式, 自动 preserve 其它字段.
 *
 * 复用:
 * - getActionForApp(item) 决定 pathKind (bulk-upgrade-actions)
 * - 写盘走 state-store.patchState (v2.83.0 compact writeAtomic 已经在内部)
 *
 * ponytail: 不重写聚合, 不重写写盘; 只做"诊断视角"的派生 + 落盘薄壳.
 */
import type {
  UpgradeAttempt,
  UpgradeDiagnostic,
  UpgradePathKind,
  UpgradeRow,
  UpgradeStats,
} from "../shared/upgrades-types";
import { UPGRADE_DIAGNOSTICS_CAP } from "../shared/upgrades-types";

import { getActionForApp } from "./bulk-upgrade-actions";
import * as stateStore from "./state-store";

const THIRTY_DAYS_MS = 30 * 86400_000;

function emptyDiag(): UpgradeDiagnostic {
  return { attempts: [], consecutiveFailures: 0 };
}

/** 把 attempts 数组规范成 UpgradeDiagnostic 形状 */
function shapeFromAttempts(arr: unknown): UpgradeDiagnostic {
  const attempts = Array.isArray(arr)
    ? arr.filter(
        (a): a is UpgradeAttempt =>
          !!a &&
          typeof a === "object" &&
          typeof (a as { id?: unknown }).id === "string",
      )
    : [];
  const lastSuccess = attempts.find((a) => a.result === "success");
  const lastFailure = attempts.find((a) => a.result === "failed");
  let consecutive = 0;
  for (const a of attempts) {
    if (a.result === "failed") consecutive += 1;
    else break;
  }
  return {
    attempts,
    lastSuccessAt: lastSuccess ? lastSuccess.ts : undefined,
    lastFailureAt: lastFailure ? lastFailure.ts : undefined,
    consecutiveFailures: consecutive,
  };
}

/**
 * 读某 app 的诊断. 老 state.json 无 upgrade_diagnostics 字段 → 空诊断.
 * @param appId
 * @param state
 */
export function getAppDiagnostic(appId: string, state: any): UpgradeDiagnostic {
  if (!appId) return emptyDiag();
  const map = state && state.upgrade_diagnostics;
  if (!map || typeof map !== "object" || Array.isArray(map)) return emptyDiag();
  return shapeFromAttempts(map[appId]);
}

/**
 * 统计卡数据.
 * @param state
 */
export function getStats(state: any, now: number = Date.now()): UpgradeStats {
  const apps = (state && state.apps) || {};
  let upgradable = 0;
  let autoPathable = 0;
  let success30d = 0;
  let failed30d = 0;
  for (const app of Object.values(apps) as any[]) {
    if (!app || app.has_update !== true) continue;
    upgradable += 1;
    const action = getActionForApp({
      id: app.name,
      name: app.name,
      source: app.source,
      cask: app.cask,
      bundleName: app.bundle,
      trackId: app.trackId,
      wingetId: app.wingetId || app.winget_id,
      releaseUrl: app.release_url,
    });
    if (action && action.type !== "none") autoPathable += 1;
  }
  const cutoff = now - THIRTY_DAYS_MS;
  const diagMap =
    state && state.upgrade_diagnostics && typeof state.upgrade_diagnostics === "object"
      ? state.upgrade_diagnostics
      : {};
  for (const arr of Object.values(diagMap) as unknown[]) {
    if (!Array.isArray(arr)) continue;
    for (const a of arr as UpgradeAttempt[]) {
      if (!a || typeof a.ts !== "number" || a.ts < cutoff) continue;
      if (a.result === "success") success30d += 1;
      else if (a.result === "failed") failed30d += 1;
    }
  }
  return { upgradable, autoPathable, success30d, failed30d };
}

/**
 * 明细表行.
 * @param state
 */
export function getRows(state: any, now: number = Date.now()): UpgradeRow[] {
  const apps = (state && state.apps) || {};
  const diagMap =
    state && state.upgrade_diagnostics && typeof state.upgrade_diagnostics === "object"
      ? state.upgrade_diagnostics
      : {};
  const rows: UpgradeRow[] = [];
  for (const app of Object.values(apps) as any[]) {
    if (!app || app.has_update !== true || !app.name) continue;
    const action = getActionForApp({
      id: app.name,
      name: app.name,
      source: app.source,
      cask: app.cask,
      bundleName: app.bundle,
      trackId: app.trackId,
      wingetId: app.wingetId || app.winget_id,
      releaseUrl: app.release_url,
    });
    const pathKind: UpgradePathKind = (action && action.type) || "none";
    const attempts = Array.isArray(diagMap[app.name]) ? diagMap[app.name] : [];
    const recent = attempts[0] as UpgradeAttempt | undefined;
    rows.push({
      id: app.name,
      name: app.name,
      installedVersion: app.installed_version || "",
      latestVersion: app.latest_version || "",
      pathKind,
      pathReason: action && action.reason,
      lastResult: recent ? recent.result : undefined,
      lastTs: recent ? recent.ts : undefined,
      lastError: recent && recent.result === "failed" ? recent.error : undefined,
    });
  }
  // 默认按"失败优先 + 时间倒序"排序 — alpha 阶段够用
  rows.sort((a, b) => {
    const aFail = a.lastResult === "failed" ? 0 : 1;
    const bFail = b.lastResult === "failed" ? 0 : 1;
    if (aFail !== bFail) return aFail - bFail;
    return (b.lastTs || 0) - (a.lastTs || 0);
  });
  return rows;
}

/**
 * 追加一条 attempt. 走 patchState 公共范式, 自动 preserve 其它字段.
 * 环形缓冲: 单 app 维度, 超过 UPGRADE_DIAGNOSTICS_CAP 截断.
 *
 * @param attempt  必须含 id / ts / result / action
 */
export function appendAttempt(attempt: UpgradeAttempt): void {
  if (!attempt || !attempt.id) return;
  stateStore.patchState((next: any, existing: any) => {
    const prev =
      existing.upgrade_diagnostics &&
      typeof existing.upgrade_diagnostics === "object" &&
      !Array.isArray(existing.upgrade_diagnostics)
        ? existing.upgrade_diagnostics
        : {};
    const old = Array.isArray(prev[attempt.id]) ? prev[attempt.id] : [];
    // 输出截断 — 防止 brew 长 stderr 撑 state.json
    const safe: UpgradeAttempt = {
      ...attempt,
      output:
        typeof attempt.output === "string" && attempt.output.length > 500
          ? attempt.output.slice(0, 500) + "…"
          : attempt.output,
    };
    const nextArr = [safe, ...old].slice(0, UPGRADE_DIAGNOSTICS_CAP);
    next.upgrade_diagnostics = { ...prev, [attempt.id]: nextArr };
  });
}
