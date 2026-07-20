/**
 * src/renderer/components/AIUsagePage.jsx
 *
 * AI 用量页面 — Minimax coding plan quota.
 *
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md
 *
 * UI 组成:
 *   - 顶部 header: 标题 + 刷新按钮 + last fetched 相对时间
 *   - 错误 banner: 上次 fetch 失败的 reason (只展示 last-known snapshot 时)
 *   - 5h 窗口卡: 进度条 + 数字 + 重置倒计时
 *   - 周窗口卡: 进度条 + 数字 + 重置倒计时
 *   - 空态: "尚无数据, 点击刷新" (从未 fetch 成功)
 *
 * 注意:
 *   - 配额倒计时: 每秒 tick 重渲染 (使用 setInterval 强制 re-render preact 组件)
 *   - 数据来源: aiUsageSnapshot signal (从 main 同步)
 */

import { useEffect, useMemo } from "preact/hooks";
import {
  AI_USAGE_PROVIDERS,
  aiUsageSnapshot,
  aiUsageHistory,
  aiUsageLastError,
  aiUsageFetching,
  aiUsageFromCache,
  aiUsageActiveProvider,
  aiUsageAlertPrefs,
  fetchAiUsage,
  setActiveProvider,
  openAiUsageAlertModal,
} from "../store/ai-usage-store.js";
import { useNowTick } from "../hooks/useNowTick.jsx";
import { detectUsageAnomaly } from "../../ai-usage/anomaly-detect.js";
import { todayKey } from "../../ai-usage/history-series.js";
import { UsageDashboard } from "./UsageDashboard.jsx";
import { taggedLog } from "../log.js";
import { IconBell } from "./icons.jsx";

const log = taggedLog("[ai-usage]");

// ─── 格式化 helpers ────────────────────────────────────────────

function formatAge(ms, now) {
  if (typeof ms !== "number" || ms <= 0) return "—";
  const diff = Math.max(0, Math.floor((now - ms) / 1000));
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

// ─── 单 provider 视图 (原 AIUsagePage body, 防御化 + GLM 感知) ──────────

// ponytail: 复用同一引用, 避免 useMemo deps 每次渲染都是新对象 (react-hooks/exhaustive-deps 警告)
const EMPTY_HISTORY = { days: [] };

const PROVIDER_META = {
  minimax: { title: "Minimax 用量", label: "Minimax", planLabel: "Minimax coding plan 配额" },
  glm: { title: "GLM 用量", label: "GLM (智谱)", planLabel: "GLM 编程套餐配额" },
};

/**
 * GLM 的 token 数动辄亿级, 单独紧凑格式化 (复用 format-glm 纯函数).
 * minimax 用 toLocaleString 原样.
 */
function formatTodayUsed(provider, used) {
  if (used === null) return null;
  if (provider === "glm") {
    const { formatTokens } = require("../../ai-usage/format-glm");
    const s = formatTokens(used);
    return s ? `${s} tokens` : null;
  }
  return `${used.toLocaleString()} 单位`;
}

function ProviderUsageView({ provider }) {
  const snapshots = aiUsageSnapshot.value;
  const histories = aiUsageHistory.value;
  const errors = aiUsageLastError.value;
  const fetchingMap = aiUsageFetching.value;
  const fromCacheMap = aiUsageFromCache.value;
  const now = useNowTick();

  const snapshot = snapshots[provider] || null;
  const history = histories[provider] || EMPTY_HISTORY;
  const lastError = errors[provider] || null;
  const fetching = !!fetchingMap[provider];
  const fromCache = !!fromCacheMap[provider];
  const meta = PROVIDER_META[provider] || PROVIDER_META.minimax;

  const onRefresh = async () => {
    log.info("manual refresh clicked, provider=", provider);
    await fetchAiUsage({ provider });
  };

  const ageLabel = useMemo(
    () => (snapshot ? formatAge(snapshot.fetchedAt, now) : "—"),
    [snapshot, now],
  );

  // 今日已用: 5h 窗口的 used 值 (滚动窗口 ≈ 当天累积消耗).
  // 防御: snapshot / windows / windows["5h"] 任一为空都不崩.
  const w5h = snapshot?.windows?.["5h"] ?? null;
  const todayUsed = useMemo(() => {
    if (!w5h) return null;
    if (typeof w5h.used === "number" && w5h.used > 0) return w5h.used;
    if (typeof w5h.usedPercent === "number" && typeof w5h.total === "number" && w5h.total > 0) {
      return Math.round((w5h.usedPercent / 100) * w5h.total);
    }
    return null;
  }, [w5h]);

  const todayLabel = formatTodayUsed(provider, todayUsed);

  const prefs = aiUsageAlertPrefs.value;
  const prevNotified = prefs.lastNotified?.[provider];
  const lastNotifiedPercent =
    prevNotified && prevNotified.date === todayKey()
      ? prevNotified.percent
      : undefined;

  const anomaly = useMemo(
    () =>
      detectUsageAnomaly(history.days || [], {
        enabled: prefs.enabled,
        absMinPct: prefs.absMinPct,
        spikeRatio: prefs.spikeRatio,
        reAlertStepPct: prefs.reAlertStepPct,
        lastNotifiedPercent,
      }),
    [history, prefs, lastNotifiedPercent],
  );

  return (
    <div class="ai-usage-page">
      <div class="ai-usage-header">
        <div>
          <h2 class="ai-usage-title">{meta.title}</h2>
          <div class="ai-usage-subtitle">
            {snapshot ? (
              <>
                {meta.planLabel} · 今日已用{" "}
                {todayLabel !== null ? (
                  <span class="ai-usage-today-value">{todayLabel}</span>
                ) : w5h && typeof w5h.usedPercent === "number" ? (
                  <span class="ai-usage-today-value">{w5h.usedPercent}%</span>
                ) : (
                  "—"
                )}
                {" "}· 上次更新: {ageLabel}
                {fromCache && " (从缓存恢复)"}
              </>
            ) : (
              `${meta.planLabel} · 尚无数据`
            )}
          </div>
        </div>
        <div class="ai-usage-header-actions">
          <button
            type="button"
            class="ai-usage-bell-btn fund-btn fund-btn-ghost"
            onClick={() => openAiUsageAlertModal()}
            title="用量异常提醒"
            aria-label="用量异常提醒"
            aria-pressed={prefs.enabled !== false}
          >
            <IconBell size={18} />
          </button>
          <button
            class="ai-usage-refresh-btn"
            onClick={onRefresh}
            disabled={fetching}
          >
            {fetching ? "刷新中…" : "刷新"}
          </button>
        </div>
      </div>

      {anomaly.anomaly && (
        <div class="ai-usage-banner ai-usage-banner--warn ai-usage-anomaly-banner">
          今日用量 {anomaly.todayPercent}% 明显高于近 7 日中位（约 {Math.round(anomaly.baselineMedian)}%），建议检查 AI 任务用量
        </div>
      )}

      {lastError && snapshot && (
        <div class="ai-usage-banner ai-usage-banner--warn">
          上次拉取失败 ({lastError}), 显示的是 {ageLabel} 的快照
        </div>
      )}

      {lastError && !snapshot && (
        <>
          <div class="ai-usage-banner ai-usage-banner--error">
            拉取失败: {lastError}
            {lastError === "api_key_missing" && (
              <span> · 请在左下角"AI 配置"中填入 {meta.label} 的 API key</span>
            )}
            {lastError === "network_failed" && (
              <span> · 请检查网络连接或代理设置</span>
            )}
          </div>
          <div class="ai-usage-empty">
            <p>还没有配额数据</p>
            <p class="ai-usage-empty-hint">点击右上角"刷新"按钮重试,或排查上面失败原因</p>
          </div>
        </>
      )}

      {!snapshot && !lastError && (
        <div class="ai-usage-empty">
          <p>还没有配额数据</p>
          <p class="ai-usage-empty-hint">点击右上角"刷新"按钮拉取最新用量</p>
        </div>
      )}

      {snapshot && provider === "minimax" && (
        <UsageDashboard snapshot={snapshot} history={history} provider="minimax" />
      )}

      {snapshot && provider === "glm" && (
        <UsageDashboard snapshot={snapshot} history={history} provider="glm" />
      )}

      {snapshot && snapshot.endpoint && (
        <div class="ai-usage-footer">
          endpoint: <code>{snapshot.endpoint}</code>
        </div>
      )}
    </div>
  );
}

// ─── 主页面: Tab 切换 + 当前 provider 视图 ──────────────────────

export function AIUsagePage() {
  const active = aiUsageActiveProvider.value;

  // ponytail: 仅 mount 日志, 故意只跑一次
  useEffect(() => {
    log.info("AIUsagePage mounted, active provider=", active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div class="ai-usage-layout-inner">
      <div class="ai-usage-tabs">
        {AI_USAGE_PROVIDERS.map((pid) => (
          <button
            key={pid}
            class={`ai-usage-tab${pid === active ? " ai-usage-tab--active" : ""}`}
            onClick={() => setActiveProvider(pid)}
          >
            {(PROVIDER_META[pid] || { label: pid }).label}
          </button>
        ))}
      </div>
      <ProviderUsageView provider={active} />
    </div>
  );
}
