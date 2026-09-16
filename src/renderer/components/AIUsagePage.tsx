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
  aiUsageDataState,
  aiUsageActiveProvider,
  aiUsageAlertPrefs,
  fetchAiUsage,
  setActiveProvider,
  openAiUsageAlertModal,
} from "../store/ai-usage-store.ts";
import { useNowTick } from "../hooks/useNowTick.tsx";
import { detectUsageAnomaly } from "../../ai-usage/anomaly-detect.ts";
import { pickPrimaryWindow } from "../../ai-usage/derive.ts";
import { todayKey } from "../../ai-usage/history-series.ts";
import { formatTokens } from "../../ai-usage/format-glm.ts";
import { UsageDashboard } from "./UsageDashboard.tsx";
import { taggedLog } from "../log.ts";
import { IconBell } from "./icons.tsx";

const log = taggedLog("[ai-usage]");

// ─── 格式化 helpers ────────────────────────────────────────────

function formatAge(ms: number, now: number) {
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
  minimax: { title: "Minimax 用量", label: "Minimax", planLabel: "Minimax coding plan 配额", usedLabel: "今日已用" },
  glm: { title: "GLM 用量", label: "GLM (智谱)", planLabel: "GLM 编程套餐配额", usedLabel: "今日已用" },
  codex: { title: "Codex 用量", label: "Codex", planLabel: "OpenAI Codex 配额", usedLabel: "本月已用" },
};

/**
 * GLM 的 token 数动辄亿级, 单独紧凑格式化 (复用 format-glm 纯函数).
 * minimax 用 toLocaleString 原样.
 */
function formatTodayUsed(provider: string, used: number | null) {
  if (used === null) return null;
  if (provider === "glm") {
    const s = formatTokens(used);
    return s ? `${s} tokens` : null;
  }
  if (provider === "codex") {
    // 月度 credit 池的 "used" 是 credit 数, 不是 token 也不是调用次数
    return `${used.toLocaleString()} credit`;
  }
  return `${used.toLocaleString()} 单位`;
}

function ProviderUsageView({ provider }: { provider: string }) {
  const snapshots = aiUsageSnapshot.value as Record<string, any>;
  const histories = aiUsageHistory.value as Record<string, any>;
  const errors = aiUsageLastError.value as Record<string, any>;
  const fetchingMap = aiUsageFetching.value as Record<string, any>;
  const fromCacheMap = aiUsageFromCache.value as Record<string, any>;
  const dataState = aiUsageDataState?.value || { phase: "idle", error: null };
  const now = useNowTick();

  const snapshot = snapshots[provider] || null;
  const history = histories[provider] || EMPTY_HISTORY;
  const lastError = errors[provider] || null;
  const fetching = !!fetchingMap[provider];
  const fromCache = !!fromCacheMap[provider];
  const hasAnySnapshot = Object.values(snapshots).some(Boolean);
  const dataStateError =
    !snapshot && !lastError && !hasAnySnapshot ? dataState.error : null;
  const initialLoading =
    !snapshot && !lastError && !dataStateError && dataState.phase === "loading";
  const meta = PROVIDER_META[provider as keyof typeof PROVIDER_META] || PROVIDER_META.minimax;

  const onRefresh = async () => {
    log.info("manual refresh clicked, provider=", provider);
    await fetchAiUsage({ provider });
  };

  const ageLabel = useMemo(
    () => (snapshot ? formatAge(snapshot.fetchedAt, now) : "—"),
    [snapshot, now],
  );

  // 今日/本月已用: 主窗口的 used 值.
  // 主窗口 = 5h → monthly → weekly (codex business 账号没有 5h 窗口, 主约束是月度池).
  // 防御: snapshot / windows 任一为空都不崩.
  const primaryWin = useMemo(
    () => pickPrimaryWindow(snapshot)?.window ?? null,
    [snapshot],
  );
  const todayUsed = useMemo(() => {
    if (!primaryWin) return null;
    if (typeof primaryWin.used === "number" && primaryWin.used > 0) return primaryWin.used;
    if (typeof primaryWin.usedPercent === "number" && typeof primaryWin.total === "number" && primaryWin.total > 0) {
      return Math.round((primaryWin.usedPercent / 100) * primaryWin.total);
    }
    return null;
  }, [primaryWin]);

  const todayLabel = formatTodayUsed(provider, todayUsed);

  const prefs = aiUsageAlertPrefs.value as { enabled: boolean; absMinPct: number; spikeRatio: number; reAlertStepPct: number; lastNotified: Record<string, { date: string; percent: number }> };
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

  const failureReason = lastError || dataStateError;
  // codex 的凭据问题全是"需要用户去终端动一次 codex", 归到同一档文案.
  const CODEX_AUTH_REASONS = ["codex_auth_missing", "token_expired", "auth_401", "auth_403"];

  return (
    <div class="ai-usage-page">
      <div class="ai-usage-header">
        <div>
          <h2 class="ai-usage-title">{meta.title}</h2>
          <div class="ai-usage-subtitle">
            {snapshot ? (
              <>
                {meta.planLabel} · {meta.usedLabel}{" "}
                {todayLabel !== null ? (
                  <span class="ai-usage-today-value">{todayLabel}</span>
                ) : primaryWin && typeof primaryWin.usedPercent === "number" ? (
                  <span class="ai-usage-today-value">{primaryWin.usedPercent}%</span>
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
          <div class="ai-usage-tabs" role="tablist" aria-label="AI 用量提供商">
            {AI_USAGE_PROVIDERS.map((pid) => (
              <button
                key={pid}
                type="button"
                role="tab"
                aria-selected={pid === provider}
                class={`ai-usage-tab${pid === provider ? " ai-usage-tab--active" : ""}`}
                onClick={() => setActiveProvider(pid)}
              >
                {(PROVIDER_META[pid as keyof typeof PROVIDER_META] || { label: pid }).label}
              </button>
            ))}
          </div>
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
          {provider === "codex" && CODEX_AUTH_REASONS.includes(lastError) && (
            <span>
              {" "}· 在终端跑一次 <code>codex</code> 自动续期，过期太久则重新 <code>codex login</code>
            </span>
          )}
        </div>
      )}

      {failureReason && !snapshot && (
        <>
          <div class="ai-usage-banner ai-usage-banner--error">
            拉取失败: {failureReason}
            {failureReason === "api_key_missing" && (
              <span> · 请在左下角"AI 配置"中填入 {meta.label} 的 API key</span>
            )}
            {provider === "codex" && CODEX_AUTH_REASONS.includes(failureReason) && (
              <span>
                {" "}· Codex 登录态不可用（读 ~/.codex/auth.json）。在终端跑一次{" "}
                <code>codex</code>，它会自己续期；若提示重新登录则跑 <code>codex login</code>
              </span>
            )}
            {failureReason === "network_failed" && (
              <span> · 请检查网络连接或代理设置</span>
            )}
          </div>
          <div class="ai-usage-empty">
            <p>还没有配额数据</p>
            <p class="ai-usage-empty-hint">点击右上角"刷新"按钮重试,或排查上面失败原因</p>
          </div>
        </>
      )}

      {initialLoading && (
        <div class="ai-usage-empty">
          <p>正在读取用量缓存…</p>
          <p class="ai-usage-empty-hint">缓存加载完成后会显示最近一次可用数据</p>
        </div>
      )}

      {!snapshot && !lastError && !dataStateError && !initialLoading && (
        <div class="ai-usage-empty">
          <p>还没有配额数据</p>
          <p class="ai-usage-empty-hint">点击右上角"刷新"按钮拉取最新用量</p>
        </div>
      )}

      {snapshot && (
        <UsageDashboard snapshot={snapshot} history={history} provider={provider} />
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
      <ProviderUsageView provider={active} />
    </div>
  );
}
