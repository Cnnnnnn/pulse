/**
 * src/renderer/components/UsageDashboard.jsx
 *
 * Minimax 用量仪表盘 — 依赖两个接口的合并 snapshot:
 *   - snapshot.windows["5h"/"weekly"/"video"]: 来自 /remains_percent (窗口配额)
 *   - snapshot.usageSummary:                  来自 /usage_summary (90 天用量统计)
 *
 * 渲染四块 (深色现代仪表盘风格):
 *   1. 顶部概览条 — 累计 / 已用天数 / 连续 / 排名 (带 icon)
 *   2. 最活跃日卡 — 单日峰值 + 模型/媒体分布
 *   3. 90 天 token 用量柱状图 (大图, hover 高亮 + 发光)
 *   4. 模型分布表 — 按 token 占比降序, 多色横条 + dot indicator
 *
 * 任一块数据缺失 → 整块不渲染 (防御性). GLM provider 没有 usageSummary, 整块不渲染.
 */

import { useMemo, useState } from "preact/hooks";

// ─── 工具: 数字格式化 (token 数) ────────────────────────────

/**
 * 大数 → 紧凑格式: 1234 → "1.2K", 12345678 → "12.3M", 1234567890 → "1.2B".
 */
function formatCompact(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 2 : 1)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
  return `${(n / 1_000_000_000).toFixed(n < 10_000_000_000 ? 2 : 1)}B`;
}

/**
 * 大数 → 千分位整数 (渲染 tooltip / 详情). 例: 12345678 → "12,345,678".
 */
function formatFull(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/**
 * 排名百分位 → 中文标签.
 * usage_ranking_percent: 1=Top 1%, 50=中位数, 100=垫底.
 */
function formatRankingLabel(pct) {
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0) return null;
  if (pct <= 0) return "Top 0%";
  if (pct >= 100) return "垫底";
  return `Top ${pct}%`;
}

/**
 * "2026-07-10" → "07-10" (短). null → "—".
 */
function formatDateShort(isoDate) {
  if (typeof isoDate !== "string" || isoDate.length === 0) return "—";
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[1]}-${m[2]}`;
}

// ─── 模型配色 (CSS 用 var(--ai-color-N)) ──────────────────────

/**
 * 模型名 → 颜色索引. 用稳定的 hash 避免重复颜色, 但优先给已知模型固定色.
 */
const MODEL_COLOR_HINTS = {
  "MiniMax-M3-512k": 1,
  "MiniMax-M2.7": 2,
  "MiniMax-M2.7-highspeed": 3,
  "MiniMax-M2.5": 4,
  "coding-plan-vlm": 5,
};
function modelColorIndex(modelName, fallback = 0) {
  if (typeof modelName !== "string") return fallback;
  if (Object.prototype.hasOwnProperty.call(MODEL_COLOR_HINTS, modelName)) {
    return MODEL_COLOR_HINTS[modelName];
  }
  // 未知模型: 简单 hash 取模
  let h = 0;
  for (let i = 0; i < modelName.length; i++) h = (h * 31 + modelName.charCodeAt(i)) | 0;
  return Math.abs(h) % 6;
}

// ─── 子组件 ──────────────────────────────────────────────

/**
 * 顶部概览条 — 4 个等宽数据格 (每格带 icon + 重点色 + 微动画).
 */
function UsageOverviewStrip({ usageSummary }) {
  const cells = useMemo(() => {
    const out = [];
    const rank = usageSummary.usageRankingPercent;
    out.push({
      key: "total",
      icon: "∑",
      label: "累计消耗",
      value: formatCompact(usageSummary.totalTokenConsumed),
      sub: usageSummary.totalTokenConsumed != null
        ? `${formatFull(usageSummary.totalTokenConsumed)} tokens`
        : null,
      accent: "var(--ai-color-1)",
    });
    out.push({
      key: "totalDays",
      icon: "◷",
      label: "统计周期",
      value: typeof usageSummary.totalDays === "number"
        ? `${usageSummary.totalDays} 天`
        : "—",
      sub: null,
      accent: "var(--ai-color-3)",
    });
    out.push({
      key: "consecutive",
      icon: "♺",
      label: "连续使用",
      value: typeof usageSummary.currentConsecutiveDays === "number"
        ? `${usageSummary.currentConsecutiveDays} 天`
        : "—",
      sub: typeof usageSummary.activeDays === "number"
        ? `活跃 ${usageSummary.activeDays} 天`
        : null,
      accent: "var(--ai-color-4)",
    });
    out.push({
      key: "ranking",
      icon: rank != null && rank <= 5 ? "★" : "✦",
      label: "使用排名",
      value: formatRankingLabel(rank) ?? "—",
      sub: typeof rank === "number" && rank <= 5 ? "顶尖用户" : null,
      accent: "var(--ai-color-2)",
      highlight: typeof rank === "number" && rank <= 5,
    });
    return out;
  }, [usageSummary]);

  return (
    <div class="ai-usage-overview">
      {cells.map((c) => (
        <div
          key={c.key}
          class={`ai-usage-overview-cell${c.highlight ? " ai-usage-overview-cell--highlight" : ""}`}
          style={{ "--cell-accent": c.accent }}
        >
          <div class="ai-usage-overview-top">
            <span class="ai-usage-overview-icon" aria-hidden="true">{c.icon}</span>
            <span class="ai-usage-overview-label">{c.label}</span>
          </div>
          <div class="ai-usage-overview-value">{c.value}</div>
          {c.sub && <div class="ai-usage-overview-sub">{c.sub}</div>}
          <div class="ai-usage-overview-bar" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

/**
 * 最活跃日卡 — 大数字 + 日期徽章 + 媒体计数 chip.
 */
function MostActiveDayCard({ usageSummary }) {
  const mad = usageSummary.mostActiveDay;
  if (!mad || !mad.date) return null;
  const totalMedia = (mad.imageCount ?? 0) + (mad.videoCount ?? 0) + (mad.musicCount ?? 0) + (mad.voiceCharacterCount ?? 0);
  return (
    <div class="ai-usage-most-active">
      <div class="ai-usage-section-header">
        <span class="ai-usage-section-eyebrow">峰值日</span>
        <span class="ai-usage-section-title">最活跃一天</span>
      </div>
      <div class="ai-usage-most-active-date-badge">{formatDateShort(mad.date)}</div>
      <div class="ai-usage-most-active-token">
        {formatCompact(mad.tokenCount)}
        <span class="ai-usage-most-active-unit">tokens</span>
      </div>
      <div class="ai-usage-most-active-meta">
        {totalMedia === 0
          ? <span class="ai-usage-most-active-meta-empty">纯文本 · 无媒体</span>
          : (
            <>
              {(mad.imageCount ?? 0) > 0 && <span class="ai-usage-chip">🖼 {mad.imageCount}</span>}
              {(mad.videoCount ?? 0) > 0 && <span class="ai-usage-chip">🎬 {mad.videoCount}</span>}
              {(mad.musicCount ?? 0) > 0 && <span class="ai-usage-chip">🎵 {mad.musicCount}</span>}
              {(mad.voiceCharacterCount ?? 0) > 0 && <span class="ai-usage-chip">🎤 {mad.voiceCharacterCount}</span>}
            </>
          )}
      </div>
    </div>
  );
}

/**
 * 90 天 token 用量柱状图 (CSS 渲染, hover 时显示数值).
 */
function DailyTokenBarChart({ daily }) {
  const [hovered, setHovered] = useState(null);
  if (!Array.isArray(daily) || daily.length === 0) return null;
  const max = Math.max(...daily, 1);
  const hoveredDay = hovered != null ? daily[hovered] : null;
  const hoveredLabel = hovered != null
    ? `${formatDateShort(_shiftDate(-hovered))} · ${formatFull(hoveredDay)}`
    : null;

  return (
    <div class="ai-usage-daily-bars-wrap">
      {hovered != null && (
        <div class="ai-usage-daily-tooltip" aria-hidden="true">{hoveredLabel}</div>
      )}
      <div class="ai-usage-daily-bars" role="img" aria-label={`近 ${daily.length} 天 token 用量柱状图`}>
        {daily.map((v, i) => {
          const heightPct = max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0;
          const isRecent = i >= daily.length - 7; // 最近 7 天高亮
          const isHovered = hovered === i;
          return (
            <div
              key={i}
              class={`ai-usage-daily-bar${isRecent ? " ai-usage-daily-bar--recent" : ""}${isHovered ? " ai-usage-daily-bar--hovered" : ""}`}
              style={{ height: `${heightPct}%` }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              title={`${i + 1} 天前 · ${formatFull(v)} tokens`}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * 把 "N 天前" 换算成 ISO date 字符串 (本地日期). 给 tooltip 用.
 */
function _shiftDate(daysAgo) {
  if (typeof daysAgo !== "number" || daysAgo < 0) return null;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 90 天趋势区 — 包含 daily token bar chart + 7/30 天均值 + 最活跃日.
 */
function UsageTrendSection({ usageSummary }) {
  const { dailyTokenUsage, recent7Avg, recent30Avg } = usageSummary;
  if (!Array.isArray(dailyTokenUsage) || dailyTokenUsage.length === 0) return null;
  return (
    <div class="ai-usage-trend">
      <div class="ai-usage-trend-header">
        <div class="ai-usage-section-header">
          <span class="ai-usage-section-eyebrow">趋势</span>
          <span class="ai-usage-section-title">近 90 天 token 用量</span>
        </div>
        <div class="ai-usage-trend-averages">
          {typeof recent7Avg === "number" && (
            <span class="ai-usage-trend-avg">
              <span class="ai-usage-trend-avg-label">7 天日均</span>
              <span class="ai-usage-trend-avg-value">{formatCompact(recent7Avg)}</span>
            </span>
          )}
          {typeof recent30Avg === "number" && (
            <span class="ai-usage-trend-avg">
              <span class="ai-usage-trend-avg-label">30 天日均</span>
              <span class="ai-usage-trend-avg-value">{formatCompact(recent30Avg)}</span>
            </span>
          )}
        </div>
      </div>
      <div class="ai-usage-trend-chart">
        <DailyTokenBarChart daily={dailyTokenUsage} />
      </div>
    </div>
  );
}

/**
 * 模型分布表 — 按 90 天 token 占比降序, 多色横条 + dot indicator.
 */
function ModelBreakdownTable({ usageSummary }) {
  const breakdown = usageSummary.modelBreakdown;
  if (!Array.isArray(breakdown) || breakdown.length === 0) return null;
  return (
    <div class="ai-usage-model-breakdown">
      <div class="ai-usage-section-header">
        <span class="ai-usage-section-eyebrow">模型</span>
        <span class="ai-usage-section-title">分布 · 近 {usageSummary.totalDays ?? 90} 天</span>
      </div>
      <div class="ai-usage-model-list">
        {breakdown.map((m, i) => {
          const colorIdx = modelColorIndex(m.model, i);
          return (
            <div key={m.model} class="ai-usage-model-row" style={{ "--model-color": `var(--ai-color-${colorIdx + 1})` }}>
              <div class="ai-usage-model-name">
                <span class="ai-usage-model-dot" aria-hidden="true" />
                {m.model}
              </div>
              <div class="ai-usage-model-bar-wrap">
                <div
                  class="ai-usage-model-bar"
                  style={{ width: `${Math.max(2, m.sharePercent)}%` }}
                  title={`${formatFull(m.totalToken)} tokens · ${m.sharePercent}%`}
                />
              </div>
              <div class="ai-usage-model-share">{m.sharePercent}%</div>
              <div class="ai-usage-model-total">{formatCompact(m.totalToken)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────

export function UsageDashboard({ snapshot }) {
  const usageSummary = snapshot && snapshot.usageSummary;
  if (!usageSummary || typeof usageSummary !== "object") return null;

  return (
    <div class="ai-usage-dashboard">
      <UsageOverviewStrip usageSummary={usageSummary} />
      <div class="ai-usage-dashboard-row">
        <MostActiveDayCard usageSummary={usageSummary} />
        <UsageTrendSection usageSummary={usageSummary} />
      </div>
      <ModelBreakdownTable usageSummary={usageSummary} />
    </div>
  );
}