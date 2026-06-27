/**
 * src/renderer/components/OverviewPage.jsx
 *
 * v2.50 (T5): 重写 — 3 列布局 (KPI / 关注 / 最近) + EmptyState 切换.
 * 4 个 Overview* 子组件 (T1-T4) 已是 dumb components, signal 注入.
 * 本组件是 composing smart component: 拉数据 + 切分支 + IPC 接线.
 *
 * 数据流 (跟 plan §4.1 一致):
 *   - 首次挂载 → 调 3 个 IPC 拉数据 → 写本地 signal
 *   - kpis.total === 0 → 显 EmptyState (大按钮 CTA)
 *   - kpis.total > 0   → 显 3 列 grid
 *   - EmptyState CTA click → api.versionsRunCheck → loading 态 2s
 *
 * v2.49 错位的 TrendSparkline / AIInsightsBlock 已 @deprecated, 不再 import.
 *
 * T3 形状映射: IPC 返 { kind, appName, ts }, T3 要 { type, description, timestamp }.
 * mapRecentEvent() 写在文件底部, 单纯去掉前缀 + 拼 description.
 */
import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { api } from "../api.js";
import { navigateTo } from "../route-store.js";
import { OverviewKPIWall } from "./OverviewKPIWall.jsx";
import { OverviewWatchlistMini } from "./OverviewWatchlistMini.jsx";
import { OverviewRecentMini } from "./OverviewRecentMini.jsx";
import { OverviewEmptyState } from "./OverviewEmptyState.jsx";
import "./OverviewPage.css";

const kpisSignal = signal({ upgradable: 0, latest: 0, error: 0, total: 0 });
const watchlistSignal = signal([]);
const recentSignal = signal([]);

// 测试用 reset — module-level signals 在多 test 间共享, 需手动归零.
export function _resetOverviewSignals() {
  kpisSignal.value = { upgradable: 0, latest: 0, error: 0, total: 0 };
  watchlistSignal.value = [];
  recentSignal.value = [];
}

// kind → type 映射 (跟 plan brief §"CRITICAL: T3 hand-off shape mismatch" 一致).
// 已知 5 个 kind 给短 type; 其它 kind 原样透传 (T3 用 "·" 兜底展示).
const KIND_TO_TYPE = {
  "app-upgrade": "upgrade",
  "app-check": "check",
  "app-error": "error",
  "app-snooze": "snooze",
  "star-app": "star",
};

function mapRecentEvent(e) {
  if (!e || typeof e !== "object") return null;
  const kind = typeof e.kind === "string" ? e.kind : "";
  const type = KIND_TO_TYPE[kind] || kind || "other";
  // 简单 description: appName + kind 后缀. 后续可改用 track.js label 字段.
  const appName = typeof e.appName === "string" && e.appName ? e.appName : "";
  const description = appName
    ? `${appName} · ${type}`
    : type;
  return {
    type,
    description,
    timestamp: typeof e.ts === "number" ? e.ts : 0,
  };
}

export function OverviewPage() {
  const [isLoadingCheck, setIsLoadingCheck] = useState(false);
  const total = kpisSignal.value.total;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.versionsOverviewKpis().then((d) => {
        if (!cancelled && d) kpisSignal.value = d;
      }),
      api.versionsOverviewWatchlist().then((d) => {
        if (!cancelled && Array.isArray(d)) watchlistSignal.value = d;
      }),
      api.versionsOverviewRecent().then((d) => {
        if (!cancelled && Array.isArray(d)) {
          // 形状映射: IPC shape (kind/appName/ts) → T3 contract (type/description/timestamp)
          // ponytail: 全部透传 (不 filter), 让 T3 的 "·" 兜底渲染未知 type.
          // 这样未来 track.js 加新 kind 不会让 Overview 静默丢事件.
          recentSignal.value = d.map(mapRecentEvent).filter(Boolean);
        }
      }),
    ]).catch(() => {
      // 单个 IPC 失败不阻塞其它; 其它 signal 已写, UI 仍能渲染.
    });
    return () => { cancelled = true; };
  }, []);

  const runCheck = async () => {
    setIsLoadingCheck(true);
    try {
      await api.versionsRunCheck();
    } catch {
      /* swallowed — main 侧 safeHandle 已返 { started: false, error } */
    } finally {
      // 简单 2s 视觉 hold (check 通常 < 2s). 避免按钮闪一下又可点.
      setTimeout(() => setIsLoadingCheck(false), 2000);
    }
  };

  if (total === 0) {
    return <OverviewEmptyState onRunCheck={runCheck} isLoading={isLoadingCheck} />;
  }

  return (
    <div class="overview-page">
      <div class="overview-grid">
        <OverviewKPIWall kpis={kpisSignal} />
        <OverviewWatchlistMini
          watchlist={watchlistSignal}
          onViewAll={() => navigateTo("library")}
        />
        <OverviewRecentMini
          events={recentSignal}
          onViewAll={() => navigateTo("settings")}
        />
      </div>
    </div>
  );
}

export default OverviewPage;
