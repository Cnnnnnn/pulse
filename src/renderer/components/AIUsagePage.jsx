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
  aiUsageSnapshot,
  aiUsageLastError,
  aiUsageFetching,
  aiUsageFromCache,
  fetchAiUsage,
} from "../store/ai-usage-store.js";
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

// ─── 倒计时 tick hook ─────────────────────────────────────────

/**
 * 每秒返回一次 now, 强制组件 re-render. 当组件 unmount 时 clear.
 */
function useNowTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── 窗口卡 ──────────────────────────────────────────────

/**
 * @param {object} props
 * @param {{label: string, total: number, remaining: number, used: number, resetAt: number, resetInSec: number} | null} props.window
 * @param {number} props.now  用于倒计时
 */
function WindowCard({ window: w, now }) {
  if (!w) {
    return (
      <div class="ai-usage-card ai-usage-card--empty">
        <div class="ai-usage-card-label">—</div>
        <div class="ai-usage-card-empty-msg">本窗口数据暂不可用</div>
      </div>
    );
  }

  const pct = formatPercent(w.used, w.total);
  const countdown =
    typeof w.resetAt === "number" ? Math.max(0, Math.floor((w.resetAt - now) / 1000)) : w.resetInSec;

  return (
    <div class="ai-usage-card">
      <div class="ai-usage-card-header">
        <div class="ai-usage-card-label">{w.label}</div>
        <div class="ai-usage-card-countdown">{formatCountdown(countdown)}</div>
      </div>

      <div class="ai-usage-card-numbers">
        <span class="ai-usage-card-remaining">{w.remaining ?? "—"}</span>
        <span class="ai-usage-card-divider">/</span>
        <span class="ai-usage-card-total">{w.total ?? "—"}</span>
        {pct !== null && <span class="ai-usage-card-pct">{pct}% 已用</span>}
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
        {countdown > 0
          ? `${formatCountdown(countdown)} 后重置`
          : "已可重置"}
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────

export function AIUsagePage() {
  const snapshot = aiUsageSnapshot.value;
  const lastError = aiUsageLastError.value;
  const fetching = aiUsageFetching.value;
  const fromCache = aiUsageFromCache.value;
  const now = useNowTick();

  useEffect(() => {
    log.info("AIUsagePage mounted, snapshot provider=", snapshot && snapshot.provider);
  }, []);

  const onRefresh = async () => {
    log.info("manual refresh clicked");
    await fetchAiUsage();
  };

  const ageLabel = useMemo(
    () => (snapshot ? formatAge(snapshot.fetchedAt, now) : "—"),
    [snapshot, now],
  );

  return (
    <div class="ai-usage-page">
      <div class="ai-usage-header">
        <div>
          <h2 class="ai-usage-title">AI 用量</h2>
          <div class="ai-usage-subtitle">
            {snapshot ? (
              <>
                上次更新: {ageLabel}
                {fromCache && " (从缓存恢复)"}
              </>
            ) : (
              "尚无数据"
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

      {lastError && snapshot && (
        <div class="ai-usage-banner ai-usage-banner--warn">
          上次拉取失败 ({lastError}), 显示的是 {ageLabel} 的快照
        </div>
      )}

      {lastError && !snapshot && (
        <div class="ai-usage-banner ai-usage-banner--error">
          拉取失败: {lastError}
        </div>
      )}

      {!snapshot && !lastError && (
        <div class="ai-usage-empty">
          <p>还没有配额数据</p>
          <p class="ai-usage-empty-hint">点击右上角"刷新"按钮拉取最新用量</p>
        </div>
      )}

      {snapshot && (
        <div class="ai-usage-cards">
          <WindowCard window={snapshot.windows["5h"]} now={now} />
          <WindowCard window={snapshot.windows.weekly} now={now} />
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
