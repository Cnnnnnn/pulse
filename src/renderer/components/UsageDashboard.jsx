/**
 * src/renderer/components/UsageDashboard.jsx
 *
 * Minimax 用量仪表盘 — 依赖合并 snapshot:
 *   - snapshot.usageSummary:                  来自 /usage_summary (minimax 未对订阅 key
 *                                             公开的内部端点; 拿不到时本组件 return null,
 *                                             AIUsagePage 回退到老 WindowCard 4 张)
 *
 * 渲染四块 (主站系统集成 — 跟随 data-theme 切换浅/暗, 引用主站 token):
 *   1. 顶部概览条 — 累计 / 已用天数 / 连续 / 排名 (带 icon)
 *   2. 最活跃日卡 — 单日峰值 + 模型/媒体分布
 *   3. 90 天 token 用量趋势 (UsageTrendChart SVG + brush + a11y)
 *   4. 模型分布表 — 按 token 占比降序, 多色横条 + dot indicator
 *
 * ponytail: 拿不到 usageSummary → return null (不渲染 dashboard, 也不渲染空 KPI 兜底).
 *   AIUsagePage 顶部的老 WindowCard 4 张继续展示 (它们来自公开 remains_percent, 数据真实).
 *   这样新 UI (4 分区 dashboard) 跟老 UI (WindowCard) 不会重复出现, 也不会展示"无数据占位".
 */

import { useMemo } from "preact/hooks";
import { UsageTrendChart } from "./UsageTrendChart.jsx";
import { useUsageSeries } from "../hooks/useUsageSeries.js";
import { UsageSparkline } from "./UsageSparkline.jsx";
import { UsageDetailList } from "./UsageDetailList.jsx";
import { modelColorIndex } from "./modelColor.js";

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

// 模型配色 (模型名 → 颜色索引) 抽至 modelColor.js, 与 UsageDetailList 共用.

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
      accent: "var(--model-color-1)",
    });
    out.push({
      key: "totalDays",
      icon: "◷",
      label: "统计周期",
      value: typeof usageSummary.totalDays === "number"
        ? `${usageSummary.totalDays} 天`
        : "—",
      sub: null,
      accent: "var(--model-color-3)",
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
      accent: "var(--model-color-4)",
    });
    out.push({
      key: "ranking",
      icon: rank != null && rank <= 5 ? "★" : "✦",
      label: "使用排名",
      value: formatRankingLabel(rank) ?? "—",
      sub: typeof rank === "number" && rank <= 5 ? "顶尖用户" : null,
      accent: "var(--model-color-2)",
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
 * 90 天趋势区 — 包含 UsageTrendChart (SVG + brush + a11y) + 7/30 天均值.
 *
 * 使用规范: docs/usage-trend-chart-spec.md
 * 数据流: snapshot.usageSummary.dailyTokenUsage (扁平 90 天数组)
 *         → useUsageSeries hook (派生 SeriesPoint[] + lastWeek 对照线)
 *         → UsageTrendChart (渲染 SVG 面积图 + 刷选 + 十字游标).
 */
function UsageTrendSection({ usageSummary }) {
  const { dailyTokenUsage, recent7Avg, recent30Avg } = usageSummary;
  const { points, status } = useUsageSeries(dailyTokenUsage);
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
        <UsageTrendChart
          data={points}
          loading={status === "loading"}
          title="近 90 天 token 用量"
        />
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
            <div key={m.model} class="ai-usage-model-row" style={{ "--model-color": `var(--model-color-${colorIdx + 1})` }}>
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

export function UsageDashboard({ snapshot, history }) {
  const usageSummary = snapshot && snapshot.usageSummary;
  if (!usageSummary || typeof usageSummary !== "object") return null;

  const hasDetail =
    Array.isArray(usageSummary.dateModelUsage) && usageSummary.dateModelUsage.length > 0;

  return (
    <div class="ai-usage-dashboard">
      {/* ▸ 分区: 概览 — KPI 四格 */}
      <section class="ai-usage-zone">
        <div class="ai-usage-zone-label">
          <span class="ai-usage-zone-eyebrow">概览</span>
        </div>
        <UsageOverviewStrip usageSummary={usageSummary} />
      </section>

      {/* ▸ 分区: 趋势 — 90 天 token 用量 (独占主区) */}
      <section class="ai-usage-zone">
        <div class="ai-usage-zone-label">
          <span class="ai-usage-zone-eyebrow">趋势</span>
        </div>
        <UsageTrendSection usageSummary={usageSummary} />
      </section>

      {/* ▸ 分区: 分析 — 模型分布 + 峰值日 + 近期迷你趋势 (响应式多栏) */}
      <section class="ai-usage-zone">
        <div class="ai-usage-zone-label">
          <span class="ai-usage-zone-eyebrow">分析</span>
        </div>
        <div class="ai-usage-analytics-grid">
          <ModelBreakdownTable usageSummary={usageSummary} />
          <MostActiveDayCard usageSummary={usageSummary} />
          {history && <UsageHistoryCard history={history} />}
        </div>
      </section>

      {/* ▸ 分区: 明细 — 每日用量明细表 (dateModelUsage 真实数据) */}
      {hasDetail && (
        <section class="ai-usage-zone">
          <div class="ai-usage-zone-label">
            <span class="ai-usage-zone-eyebrow">明细</span>
            <span class="ai-usage-zone-count">{usageSummary.dateModelUsage.length} 天</span>
          </div>
          <UsageDetailList dateModelUsage={usageSummary.dateModelUsage} />
        </section>
      )}
    </div>
  );
}

/**
 * 分析网格第三格 — 近 7 天用量迷你趋势 (从 AIUsagePage 的 history 传入).
 */
function UsageHistoryCard({ history }) {
  return (
    <div class="ai-usage-history-card">
      <div class="ai-usage-section-header">
        <span class="ai-usage-section-eyebrow">近期</span>
        <span class="ai-usage-section-title">近 7 天用量</span>
      </div>
      <UsageSparkline history={history} days={7} height={56} />
    </div>
  );
}