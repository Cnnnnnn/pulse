/**
 * src/renderer/components/UsageDashboard.jsx
 *
 * Minimax 用量仪表盘 — 4 分区布局, 主站系统集成 (跟随 data-theme 切换浅/暗):
 *   1. 概览 — KPI 卡 (来自 windows: 5h / weekly / video / videoWeekly / credit)
 *   2. 趋势 — 90 天 token 走势 (UsageTrendChart, 需要 usageSummary.dailyTokenUsage)
 *   3. 分析 — 模型分布 + 最活跃日 + 近期 sparkline
 *   4. 明细 — 每日用量表 (UsageDetailList, 需要 usageSummary.dateModelUsage)
 *
 * 数据源策略 (用户: "基于新 UI 不断完善, 调用老的 api 去完善"):
 *   - 概览区 始终渲染 — 来自公开 remains_percent 端点 (windows + credits), 拿不到就 return null
 *   - 趋势 / 分析 / 明细区 仅在 usageSummary 拿到时渲染, 缺数据不渲染 (符合"拿不到数据的,
 *     不用展示"). usageSummary 来自 minimax 内部 usage_summary 端点, 当前订阅 key
 *     拿不到 (401 not login), 但将来开放后这些分区会自动出现.
 *
 * 顶部 banner 解释数据边界.
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
 * 概览 KPI 卡 — 用 windows 数据填充.
 *
 * 数据源: snapshot.windows (公开 remains_percent 端点).
 * 优先级: 5h / weekly / video / videoWeekly / credit — 有多少展示多少.
 * 信息量 >= 老 WindowCard 4 张: 已用% / 进度条 / 倒计时 / status / modelName.
 */
function UsageWindowOverview({ snapshot }) {
  const windows = (snapshot && snapshot.windows) || {};
  const credit = snapshot && snapshot.credits;
  const entries = useMemo(() => {
    const out = [];
    const order = [
      ["5h", { icon: "⏱", label: "5 小时窗口", accent: "var(--model-color-1)" }],
      ["weekly", { icon: "📅", label: "周窗口", accent: "var(--model-color-3)", isWeekly: true }],
      ["video", { icon: "🎬", label: "视频赠送", accent: "var(--model-color-4)" }],
      ["videoWeekly", { icon: "🎞", label: "视频周额度", accent: "var(--model-color-6)" }],
    ];
    for (const [key, meta] of order) {
      const w = windows[key];
      if (!w || typeof w !== "object") continue;
      const usedPct = typeof w.usedPercent === "number" ? w.usedPercent : null;
      const resetInSec = typeof w.resetInSec === "number" ? w.resetInSec : null;
      const total = typeof w.total === "number" ? w.total : null;
      const remaining = typeof w.remaining === "number" ? w.remaining : null;
      const used = typeof w.used === "number" ? w.used : null;
      const status = typeof w.status === "number" ? w.status : null;
      out.push({
        key,
        ...meta,
        usedPct,
        resetInSec,
        total,
        remaining,
        used,
        status,
        highlight: usedPct != null && usedPct >= 50,
      });
    }
    if (credit && typeof credit === "object") {
      const remaining = typeof credit.remaining === "number" ? credit.remaining : null;
      const total = typeof credit.total === "number" ? credit.total : null;
      out.push({
        key: "credit",
        icon: "💎",
        label: "积分余额",
        usedPct: (remaining != null && total != null && total > 0)
          ? Math.round(((total - remaining) / total) * 100)
          : null,
        total,
        remaining,
        used: (total != null && remaining != null) ? total - remaining : null,
        resetInSec: null,
        status: null,
        accent: "var(--model-color-2)",
      });
    }
    return out;
  }, [windows, credit]);

  if (entries.length === 0) return null;

  return (
    <div class="ai-usage-overview">
      {entries.map((c) => (
        <div
          key={c.key}
          class={`ai-usage-overview-cell${c.highlight ? " ai-usage-overview-cell--highlight" : ""}`}
          style={{ "--cell-accent": c.accent }}
        >
          <div class="ai-usage-overview-top">
            <span class="ai-usage-overview-icon" aria-hidden="true">{c.icon}</span>
            <span class="ai-usage-overview-label">{c.label}</span>
            {c.isWeekly && snapshot && typeof snapshot.weeklyBoostPermille === "number" && (
              <span class="ai-usage-overview-badge">
                {snapshot.weeklyBoostPermille >= 1000
                  ? `+${((snapshot.weeklyBoostPermille / 1000 - 1) * 100).toFixed(0)}%`
                  : null}
              </span>
            )}
          </div>
          <div class="ai-usage-overview-value">
            {c.usedPct != null ? `${c.usedPct}%` : "—"}
          </div>
          <div class="ai-usage-overview-sub">
            {c.remaining != null ? `剩 ${formatCompact(c.remaining)}` : null}
            {c.resetInSec != null && (
              <span class="ai-usage-overview-sub-time">
                重置 {formatResetIn(c.resetInSec)}
              </span>
            )}
          </div>
          {typeof c.status === "number" && (
            <div class="ai-usage-overview-status">status {c.status}</div>
          )}
          <div class="ai-usage-overview-bar" aria-hidden="true">
            <div
              class="ai-usage-overview-bar-fill"
              style={{ width: `${Math.max(0, Math.min(100, c.usedPct ?? 0))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 把秒数倒计时格式化成简短中文: 3600 → "1h 0m", 90 → "1m 30s".
 */
function formatResetIn(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(sec / 86400);
  const h = Math.round((sec % 86400) / 3600);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

/**
 * 顶部概览条 — 用 usageSummary 数据的 4 KPI 卡 (累计 / 周期 / 连续 / 排名).
 * 仅当 usageSummary 拿到时渲染 (深度统计).
 */
function UsageOverviewStrip({ usageSummary }) {
  const daily = Array.isArray(usageSummary.dailyTokenUsage) ? usageSummary.dailyTokenUsage : [];
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
      lineMode: "total",
      lineValues: daily,
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
      lineMode: "consecutive",
      lineValues: daily,
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
  }, [usageSummary, daily]);

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
          {c.lineMode
            ? <MiniLineChart values={c.lineValues} mode={c.lineMode} />
            : <div class="ai-usage-overview-bar" aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}

/**
 * MiniLineChart — 用量 KPI 卡内嵌的 mini 折线 sparkline (纯 SVG, 无依赖).
 *
 *  - mode="total": 渲染每日 token 数 (近 90 天趋势)
 *  - mode="consecutive": 把每日 token 二值化 (>0 → 1, =0 → 0), 渲染活跃度节奏
 *
 * 数据缺失 (values 为空 / 全为 null) → 渲染占位横线, 不崩.
 * ponytail: 复用 UsageTrendChart 的 buildLinePath 思想, 但简化为单序列 mini SVG.
 */
function MiniLineChart({ values, mode }) {
  const W = 220;
  const H = 36;
  const PAD = 2;

  const series = useMemo(() => {
    if (!Array.isArray(values) || values.length === 0) return [];
    if (mode === "consecutive") {
      // 二值化: 有数据=1, 无数据=0 — 表达活跃度节奏
      return values.map((v) => (typeof v === "number" && v > 0 ? 1 : 0));
    }
    return values.map((v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0));
  }, [values, mode]);

  if (series.length === 0) {
    return (
      <svg class="ai-usage-overview-line" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <line x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} class="ai-usage-overview-line-empty" />
      </svg>
    );
  }

  const max = mode === "consecutive" ? 1 : series.reduce((m, v) => (v > m ? v : m), 0);
  const xAt = (i) => PAD + (i * (W - 2 * PAD)) / Math.max(1, series.length - 1);
  const yAt = (v) => {
    const norm = max > 0 ? v / max : 0;
    return H - PAD - norm * (H - 2 * PAD);
  };

  const path = (() => {
    let d = "";
    for (let i = 0; i < series.length; i++) {
      d += `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(series[i]).toFixed(2)} `;
    }
    return d.trim();
  })();
  const areaPath = `${path} L ${xAt(series.length - 1).toFixed(2)} ${H - PAD} L ${xAt(0).toFixed(2)} ${H - PAD} Z`;

  return (
    <svg class="ai-usage-overview-line" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={areaPath} class="ai-usage-overview-line-area" />
      <path d={path} class="ai-usage-overview-line-stroke" />
    </svg>
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

export function UsageDashboard({ snapshot, history, provider }) {
  const usageSummary = snapshot && snapshot.usageSummary;
  const hasUsageSummary = usageSummary && typeof usageSummary === "object";
  const hasWindows = snapshot && snapshot.windows && Object.keys(snapshot.windows).length > 0;
  const toolUsageDetails =
    snapshot && Array.isArray(snapshot.toolUsageDetails) ? snapshot.toolUsageDetails : null;
  const level = snapshot && typeof snapshot.level === "string" ? snapshot.level : null;
  const isGlm = provider === "glm" || (snapshot && snapshot.provider === "glm");

  // 任何分区都没有数据 → 不渲染 dashboard
  if (!hasWindows && !hasUsageSummary) return null;

  const hasDetail =
    hasUsageSummary && Array.isArray(usageSummary.dateModelUsage) && usageSummary.dateModelUsage.length > 0;
  const hasTrend =
    hasUsageSummary && Array.isArray(usageSummary.dailyTokenUsage) && usageSummary.dailyTokenUsage.length > 0;
  const hasBreakdown =
    hasUsageSummary && Array.isArray(usageSummary.modelBreakdown) && usageSummary.modelBreakdown.length > 0;
  const hasMostActive = hasUsageSummary && usageSummary.mostActiveDay && usageSummary.mostActiveDay.date;

  return (
    <div class="ai-usage-dashboard">
      {/* ▸ 数据边界 banner — 只有当深度统计拿不到时提示 */}
      {!hasUsageSummary && hasWindows && (
        <div class="ai-usage-dashboard-banner" role="status">
          <span class="ai-usage-dashboard-banner-icon" aria-hidden="true">ⓘ</span>
          <span class="ai-usage-dashboard-banner-text">
            <strong>仅展示公开数据</strong>
            — 累计消耗 / 模型分布 / 每日明细 来自 minimax usage_summary 端点, 当前订阅 key 拿不到.
          </span>
        </div>
      )}

      {/* ▸ 分区: 概览 — windows KPI (公开 API) + 可选 usageSummary KPI */}
      <section class="ai-usage-zone">
        <div class="ai-usage-zone-label">
          <span class="ai-usage-zone-eyebrow">概览</span>
        </div>
        <UsageWindowOverview snapshot={snapshot} />
        {hasUsageSummary && <UsageOverviewStrip usageSummary={usageSummary} />}
      </section>

      {/* ▸ 分区: 趋势 — 90 天 token 用量 (需要 usageSummary) */}
      {hasTrend && (
        <section class="ai-usage-zone">
          <div class="ai-usage-zone-label">
            <span class="ai-usage-zone-eyebrow">趋势</span>
          </div>
          <UsageTrendSection usageSummary={usageSummary} />
        </section>
      )}

      {/* ▸ 分区: 分析 — 模型分布 + 峰值日 + 近期迷你趋势 */}
      {(hasBreakdown || hasMostActive || history) && (
        <section class="ai-usage-zone">
          <div class="ai-usage-zone-label">
            <span class="ai-usage-zone-eyebrow">分析</span>
          </div>
          <div class="ai-usage-analytics-grid">
            {hasBreakdown && <ModelBreakdownTable usageSummary={usageSummary} />}
            {hasMostActive && <MostActiveDayCard usageSummary={usageSummary} />}
            {history && <UsageHistoryCard history={history} />}
          </div>
        </section>
      )}

      {/* ▸ 分区: 明细 — 每日用量明细表 */}
      {hasDetail && (
        <section class="ai-usage-zone">
          <div class="ai-usage-zone-label">
            <span class="ai-usage-zone-eyebrow">明细</span>
            <span class="ai-usage-zone-count">{usageSummary.dateModelUsage.length} 天</span>
          </div>
          <UsageDetailList dateModelUsage={usageSummary.dateModelUsage} />
        </section>
      )}

      {/* ▸ 分区: GLM 专属 — 套餐 + 工具调用细分 (GLM 数据独有) */}
      {isGlm && (level || (toolUsageDetails && toolUsageDetails.length > 0)) && (
        <section class="ai-usage-zone">
          <div class="ai-usage-zone-label">
            <span class="ai-usage-zone-eyebrow">套餐</span>
          </div>
          <div class="ai-usage-glm-extras">
            {level && <UsagePlanBadge level={level} />}
            {toolUsageDetails && toolUsageDetails.length > 0 && (
              <UsageToolBreakdown items={toolUsageDetails} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * GLM 套餐档 badge — 把 lite / pro / max 显示成可读 badge.
 */
function UsagePlanBadge({ level }) {
  const meta = useMemo(() => {
    const key = (level || "").toLowerCase();
    if (key === "lite") return { label: "Lite", accent: "var(--model-color-3)" };
    if (key === "pro") return { label: "Pro", accent: "var(--accent-primary)" };
    if (key === "max") return { label: "Max", accent: "var(--model-color-4)" };
    return { label: level, accent: "var(--text-tertiary)" };
  }, [level]);
  return (
    <div class="ai-usage-plan-badge" style={{ "--plan-accent": meta.accent }}>
      <span class="ai-usage-plan-eyebrow">套餐档位</span>
      <span class="ai-usage-plan-value">{meta.label}</span>
    </div>
  );
}

/**
 * GLM 工具调用细分 — search-prime / web-reader / zread 的 usage.
 * 数据形状: [{ modelCode, usage }]
 * 按 usage 降序, 每条一个 chip + 调用次数.
 */
function UsageToolBreakdown({ items }) {
  const sorted = useMemo(
    () => items.slice().sort((a, b) => (b.usage || 0) - (a.usage || 0)),
    [items],
  );
  const total = useMemo(
    () => sorted.reduce((sum, it) => sum + (it.usage || 0), 0),
    [sorted],
  );
  return (
    <div class="ai-usage-tool-breakdown">
      <div class="ai-usage-section-header">
        <span class="ai-usage-section-eyebrow">工具</span>
        <span class="ai-usage-section-title">调用细分 · 当月</span>
      </div>
      <div class="ai-usage-tool-list">
        {sorted.map((it, i) => {
          const colorIdx = modelColorIndex(it.modelCode, i);
          const pct = total > 0 ? Math.round(((it.usage || 0) / total) * 100) : 0;
          return (
            <div
              key={it.modelCode}
              class="ai-usage-tool-row"
              style={{ "--model-color": `var(--model-color-${colorIdx + 1})` }}
            >
              <div class="ai-usage-tool-name">
                <span class="ai-usage-model-dot" aria-hidden="true" />
                <span class="ai-usage-tool-code">{it.modelCode}</span>
              </div>
              <div class="ai-usage-tool-bar-wrap">
                <div
                  class="ai-usage-tool-bar"
                  style={{ width: `${Math.max(2, pct)}%` }}
                  title={`${it.usage} 次 · ${pct}%`}
                />
              </div>
              <div class="ai-usage-tool-usage">{it.usage}</div>
              <div class="ai-usage-tool-pct">{pct}%</div>
            </div>
          );
        })}
      </div>
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