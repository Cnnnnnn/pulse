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

import { useEffect, useState, useMemo } from "preact/hooks";
import {
  AI_USAGE_PROVIDERS,
  aiUsageSnapshot,
  aiUsagePrevSnapshot,
  aiUsageHistory,
  aiUsageLastError,
  aiUsageFetching,
  aiUsageFromCache,
  aiUsageActiveProvider,
  fetchAiUsage,
  setActiveProvider,
} from "../store/ai-usage-store.js";
import { useNowTick } from "../hooks/useNowTick.jsx";
import { computeBlowUpAt, formatBlowUpIn } from "../../ai-usage/derive.js";
import { detectUsageAnomaly } from "../../ai-usage/anomaly-detect.js";
import { UsageSparkline } from "./UsageSparkline.jsx";
import { taggedLog } from "../log.js";

const log = taggedLog("[ai-usage]");

// ─── 格式化 helpers ────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatCountdown(resetInSec) {
  if (typeof resetInSec !== "number" || resetInSec < 0) return "—";
  const total = Math.floor(resetInSec);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * epoch ms → "HH:mm"  (本地时区)
 */
function formatClockTime(epochMs) {
  if (typeof epochMs !== "number" || epochMs <= 0) return null;
  const d = new Date(epochMs);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * status code → { label, className }
 * API 返 1=正常, 0=受限. 保守按这个二元处理.
 */
function formatStatus(status) {
  if (status === 1) return { label: "正常", className: "ai-usage-status--ok" };
  if (status === 0) return { label: "已限流", className: "ai-usage-status--throttled" };
  return null;
}

function formatAge(ms, now) {
  if (typeof ms !== "number" || ms <= 0) return "—";
  const diff = Math.max(0, Math.floor((now - ms) / 1000));
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

function formatPercent(used, total) {
  if (typeof used !== "number" || typeof total !== "number" || total <= 0) {
    return null;
  }
  return Math.min(100, Math.round((used / total) * 100));
}

// ─── 窗口卡 ──────────────────────────────────────────────

/**
 * @param {object} props
 * @param {{label: string, total: number, remaining: number, used: number, usedPercent: number, resetAt: number, resetInSec: number, fetchedAt: number} | null} props.window
 * @param {object|null} [props.prevWindow]  上一轮同 key 窗口, 用于算 burn rate
 * @param {number} props.now  用于倒计时
 */
function WindowCard({ window: w, prevWindow = null, now }) {
  if (!w) {
    return (
      <div class="ai-usage-card ai-usage-card--empty">
        <div class="ai-usage-card-label">—</div>
        <div class="ai-usage-card-empty-msg">本窗口数据暂不可用</div>
      </div>
    );
  }

  // 优先用后端给的 usedPercent (来自 *_remaining_percent 字段, 准);
  // fallback 客户端算 used/total
  const pct =
    typeof w.usedPercent === "number"
      ? w.usedPercent
      : formatPercent(w.used, w.total);

  // 倒计时优先用 resetAt (算到 now 的差), 都没有就用 resetInSec
  let countdown = null;
  if (typeof w.resetAt === "number") {
    countdown = Math.max(0, Math.floor((w.resetAt - now) / 1000));
  } else if (typeof w.resetInSec === "number") {
    countdown = w.resetInSec;
  }

  // 有 total + remaining 数字就显示 "剩 X / Y" (更具体).
  // total=0 视为"API 未返配额总额" (字段缺失/未订阅), fallback 到百分比显示,
  // 避免出现误导性的 "剩 0 / 0".
  const hasFraction = typeof w.total === "number" && w.total > 0 && typeof w.remaining === "number";
  // 没数字但有百分比 → 显示 "已用 X%"
  const statusBadge = formatStatus(w.status);
  // 重置时间绝对值: endTime 是 epoch ms, 算到 now 仍未来才显示
  const resetClock = typeof w.endTime === "number" && w.endTime > now
    ? formatClockTime(w.endTime)
    : null;

  // 预计耗尽: 用 prevWindow (上一轮同窗口) 算 burn rate
  const blowUpAt = computeBlowUpAt(
    { used: w.used, remaining: w.remaining, fetchedAt: w.fetchedAt || now },
    prevWindow && typeof prevWindow.used === "number" && typeof prevWindow.fetchedAt === "number"
      ? { used: prevWindow.used, fetchedAt: prevWindow.fetchedAt }
      : null,
  );
  const blowUpIn = formatBlowUpIn(blowUpAt, now);

  return (
    <div class="ai-usage-card">
      <div class="ai-usage-card-header">
        <div class="ai-usage-card-label">
          {w.label}
          {statusBadge && (
            <span class={`ai-usage-status ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
          )}
        </div>
        <div class="ai-usage-card-countdown">{formatCountdown(countdown)}</div>
      </div>

      <div class="ai-usage-card-numbers">
        {hasFraction ? (
          <>
            <span class="ai-usage-card-remaining">剩 {w.remaining}</span>
            <span class="ai-usage-card-divider">/</span>
            <span class="ai-usage-card-total">{w.total}</span>
          </>
        ) : (
          <span class="ai-usage-card-remaining">已用 {pct ?? "—"}%</span>
        )}
        {pct !== null && (
          <span class="ai-usage-card-pct">{pct}% 已用</span>
        )}
      </div>

      {pct !== null && (
        <div class="ai-usage-card-bar">
          <div
            class="ai-usage-card-bar-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div class="ai-usage-card-reset-hint">
        {countdown !== null && countdown > 0
          ? `${formatCountdown(countdown)} 后重置${resetClock ? ` (${resetClock})` : ""}`
          : resetClock
            ? `下次重置 ${resetClock}`
            : "已可重置"}
      </div>

      {blowUpIn && (
        <div class="ai-usage-card-burn-hint">
          按当前速度 {blowUpIn} 用完
        </div>
      )}
    </div>
  );
}

// ─── 单 provider 视图 (原 AIUsagePage body, 防御化 + GLM 感知) ──────────

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
  const prevSnapshots = aiUsagePrevSnapshot.value;
  const histories = aiUsageHistory.value;
  const errors = aiUsageLastError.value;
  const fetchingMap = aiUsageFetching.value;
  const fromCacheMap = aiUsageFromCache.value;
  const now = useNowTick();

  const snapshot = snapshots[provider] || null;
  const prevSnapshot = prevSnapshots[provider] || null;
  const history = histories[provider] || { days: [] };
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

  const anomaly = useMemo(
    () => detectUsageAnomaly(history.days || []),
    [history],
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
        <button
          class="ai-usage-refresh-btn"
          onClick={onRefresh}
          disabled={fetching}
        >
          {fetching ? "刷新中…" : "刷新"}
        </button>
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

      {snapshot && (
        <div class="ai-usage-cards">
          <WindowCard
            window={snapshot?.windows?.["5h"] ?? null}
            prevWindow={prevSnapshot?.windows?.["5h"] ?? null}
            now={now}
          />
          <WindowCard
            window={snapshot?.windows?.weekly ?? null}
            prevWindow={prevSnapshot?.windows?.weekly ?? null}
            now={now}
          />
          <WindowCard
            window={provider === "glm" ? (snapshot?.windows?.mcp ?? null) : (snapshot?.windows?.video ?? null)}
            prevWindow={
              provider === "glm"
                ? (prevSnapshot?.windows?.mcp ?? null)
                : (prevSnapshot?.windows?.video ?? null)
            }
            now={now}
          />
        </div>
      )}

      {snapshot && (
        <div class="ai-usage-history">
          <div class="ai-usage-history-title">最近 7 天用量趋势 (5h 窗口已用%)</div>
          <UsageSparkline
            history={history}
            days={7}
            height={56}
            anomalyToday={anomaly.anomaly}
          />
        </div>
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

  useEffect(() => {
    log.info("AIUsagePage mounted, active provider=", active);
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
