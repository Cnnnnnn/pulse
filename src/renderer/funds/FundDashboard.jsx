/**
 * src/renderer/funds/FundDashboard.jsx
 *
 * 2026-07-14 计划 §3 Phase 1 — 基金「概览」仪表盘.
 *
 * 字段来源:
 *   - KPI 总市值/今日预估/总盈亏/收益率 → totalMetrics (fundStore.js)
 *   - 资产走势 (按区间切片) → dailySnapshots → recentTotals-like series
 *   - 持仓分布 → categoryAllocation (fundStore.js)
 *   - 收益对比 (本组合 vs 沪深 300) → indexHistoryCache (基准, fundStore.js)
 *   - 实时持仓 → rowsWithMetrics 顶部 N 只持仓的实时估值与日内涨跌
 *   - 风险概览 → 静态指标卡 (无真实数据时跳过, 显示等待主进程)
 *
 * 不重复 FundHero 已有 KPI / donut / 30d 走势: 这里侧重
 *   「按区间切换的资产走势」「收益对比」「风险概览」三块 FundHero 没覆盖的.
 *   总市值主磁贴复用 totalMetrics, 不复制一份.
 */

import { useMemo, useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import {
  totalMetrics,
  dailySnapshots,
  categoryAllocation,
  rowsWithMetrics,
  benchmarkEnabled,
  indexHistoryCache,
  benchmarkError,
  loadIndexHistory,
  DEFAULT_BENCHMARK,
  fetchNavNow,
  navSource,
  setNavSource,
  NAV_SOURCE_LABELS,
  fundsRefreshing,
  fundsRefreshError,
  schedulerState,
  navHistoryCache,
  holdingWeights,
} from "./fundStore.js";
import { api } from "../api.js";
import { FundAreaChart } from "./FundAreaChart.jsx";
import { FundSparkline } from "./FundSparkline.jsx";
import { FundAllocationDonut } from "./FundAllocationDonut.jsx";
import { computeConcentration } from "../../funds/concentration.js";
import { IconRefresh } from "../components/icons.jsx";
import { openAddModal } from "./fundStore.js";
import { openFundDetail } from "./fundRoute.js";
import { showToast } from "../store/toast-store.js";

const RANGE_OPTIONS = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
];
const RANGE_KEYS = new Set(RANGE_OPTIONS.map((o) => o.key));
const RANGE_STORAGE_KEY = "fund.dashboard.range.v1";

function loadSavedRange() {
  if (typeof window === "undefined" || !window.localStorage) return "3M";
  try {
    const v = window.localStorage.getItem(RANGE_STORAGE_KEY);
    return v && RANGE_KEYS.has(v) ? v : "3M";
  } catch {
    return "3M";
  }
}

// 2026-07-14: 时间格式化 — 短时:分, 用于 "上次刷新 14:32 / 下次 14:37"
function fmtClock(ts) {
  if (!ts || !Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
function fmtCountdown(ts, now) {
  if (!ts || !Number.isFinite(ts)) return "";
  const diff = ts - now;
  if (diff <= 0) return "即将刷新";
  const min = Math.floor(diff / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  if (min >= 1) return `${min} 分钟后`;
  return `${sec} 秒后`;
}
// 2026-07-14: 实时持仓行内 mini sparkline 用 — 取该基金最近 30 个交易日的单位净值
//   ponytail: 复用 navHistoryCache, 缺失时返回空数组 (FundSparkline 自带兜底渲染)
function pickLast30DayValues(code) {
  if (!code) return [];
  const c = navHistoryCache.value && navHistoryCache.value[code];
  if (!c || !Array.isArray(c.series) || c.series.length < 2) return [];
  return c.series
    .slice(-30)
    .map((s) => Number(s.nav))
    .filter(Number.isFinite);
}

function fmtCurrency(n) {
  if (!Number.isFinite(n)) return "¥0.00";
  const sign = n < 0 ? "-" : "";
  return `${sign}¥${Math.abs(n).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function fmtPct(p) {
  if (!Number.isFinite(p)) return "0.00%";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}
function fmtSignedPct(p) {
  if (!Number.isFinite(p)) return "—";
  if (p === 0) return "0.00%";
  const arrow = p > 0 ? "▲" : "▼";
  const sign = p > 0 ? "+" : "";
  return `${arrow}${sign}${p.toFixed(2)}%`;
}
function magnitudeClass(pct) {
  const v = Math.abs(Number(pct));
  if (!Number.isFinite(v)) return "";
  if (v < 1) return "mag-low";
  if (v < 3) return "mag-mid";
  return "mag-high";
}
// 2026-07-14: 风险 R1-R5 映射 — 与 FundList 保持一致 (从 category 推, 后续接 holding.risk)
//   ponytail: 不抽公共工具 (两处), 改动小, 一致即可
const RISK_BY_CATEGORY_DASH = {
  money: "R1",
  bond: "R2",
  stock: "R4",
  qdii: "R4",
  other: "R3",
};
function riskFromCategoryDashboard(cat) {
  return RISK_BY_CATEGORY_DASH[cat] || "R3";
}
function signClass(n) {
  return n >= 0 ? "positive" : "negative";
}

function pickRangeSeries(snaps, days) {
  const arr = Array.isArray(snaps) ? [...snaps] : [];
  arr.sort((a, b) => (a.date < b.date ? -1 : 1));
  return arr.slice(-days).map((s) => ({
    date: s.date,
    value: Number(s.totalMarketValue) || 0,
  }));
}

function buildSparkFromSnapshots(snaps, days) {
  return pickRangeSeries(snaps, days).map((s) => s.value);
}

/**
 * ponytail: 简单回撤估算 — 用 dailySnapshots 在区间内找峰值, 与当前值的差.
 * 不是严格 MDD (peak-to-trough 遍历), 但对概览仪表盘足够, 主进程后续可接真实指标.
 */
function estimateDrawdown(snaps, days) {
  const series = pickRangeSeries(snaps, days);
  if (!series.length) return 0;
  let peak = -Infinity;
  for (const p of series) {
    if (p.value > peak) peak = p.value;
  }
  if (!Number.isFinite(peak) || peak <= 0) return 0;
  const last = series[series.length - 1].value;
  return ((peak - last) / peak) * 100;
}

async function refreshNow() {
  try {
    await fetchNavNow(api);
  } catch {
    /* noop — store 自带错误处理 */
  }
}

export function FundDashboard() {
  const range = useSignal(loadSavedRange());
  // 2026-07-14: range 持久化到 localStorage, 跨会话保留用户选的区间
  //   ponytail: 写入失败 (隐私模式 / 配额) 不影响主流程, 用 try/catch 吞掉
  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(RANGE_STORAGE_KEY, range.value);
    } catch {
      /* noop */
    }
  }, [range.value]);
  // 2026-07-14: 「下次刷新倒计时」需要每秒重算; 用一个 now tick 触发 signal 读取
  //   ponytail: 只在有 nextFetch 时挂定时器, 没数据不浪费 CPU
  const nowTick = useSignal(Date.now());
  useEffect(() => {
    if (!schedulerState.value || !schedulerState.value.nextFetch) return undefined;
    const id = setInterval(() => {
      nowTick.value = Date.now();
    }, 1000);
    return () => clearInterval(id);
  }, [schedulerState.value && schedulerState.value.nextFetch]);
  const metrics = totalMetrics.value;
  const snaps = dailySnapshots.value;
  const alloc = categoryAllocation.value;
  const benchEnabled = benchmarkEnabled.value;
  const benchError = benchmarkError.value;
  const symbol = DEFAULT_BENCHMARK;
  const benchSeries = benchEnabled ? indexHistoryCache.value[symbol] || [] : [];

  // 数据源切换: 立即 toast, 等 IPC 返回后给结果 toast
  async function handleSwitchSource(id) {
    const label = NAV_SOURCE_LABELS[id] || id;
    if (navSource.value === id) return;
    showToast(`已切换到 ${label}，正在拉取最新净值…`, "info");
    try {
      const r = await setNavSource(api, id);
      if (r && r.ok) {
        showToast(`${label} 估值已更新`, "success");
      } else {
        const why =
          r && r.reason === "save_failed"
            ? "保存失败"
            : r && r.reason === "refresh_failed"
              ? "拉取失败"
              : "切换失败";
        showToast(`${label} ${why}`, "error");
      }
    } catch (err) {
      showToast(`切换失败: ${(err && err.message) || err}`, "error");
    }
  }

  const days = useMemo(() => {
    const o = RANGE_OPTIONS.find((r) => r.key === range.value);
    return o ? o.days : 90;
  }, [range.value]);

  const trendSeries = useMemo(() => pickRangeSeries(snaps, days), [snaps, days]);

  // 触发一次基准拉取 (缓存空 + 无错误)
  useMemo(() => {
    if (!benchEnabled || benchError) return;
    if (indexHistoryCache.value[symbol] && indexHistoryCache.value[symbol].length)
      return;
    loadIndexHistory(api, symbol).catch(() => {});
  }, [benchEnabled, benchError, symbol]);

  // 给 KPI 卡里 sparkline 用 — 用 dailySnapshots 切区间; 无数据时用最近持仓的 nav history
  const totalSpark = useMemo(() => buildSparkFromSnapshots(snaps, days), [snaps, days]);
  // 实时持仓视图: 按市值排序取 Top 5, 显示当前估值/日涨跌
  const topRows = useMemo(() => {
    const all = Array.isArray(rowsWithMetrics.value) ? rowsWithMetrics.value : [];
    return all
      .filter((r) => r && r.holding)
      .slice()
      .sort(
        (a, b) =>
          Number((b.metrics && b.metrics.marketValue) || 0) -
          Number((a.metrics && a.metrics.marketValue) || 0),
      )
      .slice(0, 5);
  }, [rowsWithMetrics.value]);

  // 收益对比: 组合区间首尾 vs 沪深 300 区间首尾, 算累计收益%
  const comparison = useMemo(() => {
    if (!trendSeries.length) return [];
    const first = trendSeries[0].value;
    const last = trendSeries[trendSeries.length - 1].value;
    const combo = first > 0 ? ((last - first) / first) * 100 : 0;
    let bench = 0;
    if (benchSeries.length) {
      const dates = trendSeries.map((s) => s.date);
      const benchMap = new Map();
      for (const p of benchSeries) {
        if (p && p.date != null && Number.isFinite(p.value)) {
          benchMap.set(String(p.date), p.value);
        }
      }
      let bFirst = null;
      let bLast = null;
      for (const d of dates) {
        const v = benchMap.get(d);
        if (v != null) {
          if (bFirst == null) bFirst = v;
          bLast = v;
        }
      }
      if (bFirst != null && bLast != null && bFirst > 0) {
        bench = ((bLast - bFirst) / bFirst) * 100;
      }
    }
    return [
      { label: "组合", fund: combo, bench },
      { label: "沪深300", fund: bench, bench },
    ];
  }, [trendSeries, benchSeries]);

  const totalMarket = Number(metrics.totalMarketValue) || 0;
  const todayProfit = Number(metrics.todayProfit) || 0;
  const totalProfit = Number(metrics.totalProfit) || 0;
  const todayPct = totalMarket > 0 ? (todayProfit / totalMarket) * 100 : 0;
  const returnRate = Number(metrics.totalProfitPct) || 0;
  const fundCount = Number(metrics.count) || 0;

  // 集中度风险指标 (与 FundAllocationDonut 同一来源)
  const concentration = useMemo(
    () => computeConcentration(rowsWithMetrics.value),
    // rowsWithMetrics 是 signal, 直接依赖 signal.value
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowsWithMetrics.value, totalMarket],
  );
  const drawdownPct = useMemo(
    () => estimateDrawdown(snaps, days),
    [snaps, days],
  );

  const kpis = [
    {
      label: "总市值",
      value: fmtCurrency(totalMarket),
      sub: "持仓市值汇总",
      subClass: "muted",
      subMagClass: "",
      valueMagClass: "",
      hint: "当前所有持仓的实时市值总和 = Σ(份额 × 最新单位净值)。市场实时变化时该数字会随之波动。",
      spark: totalSpark,
    },
    {
      label: "今日预估",
      value: fmtCurrency(todayProfit),
      sub: fmtSignedPct(todayPct),
      subClass: signClass(todayProfit),
      subMagClass: magnitudeClass(todayPct),
      // 2026-07-14: 主值按 "盈亏 / 持仓" 算幅度 — 跟 sub 同步, 但更细粒度
      //   ponytail: 1000 元盈亏在 1万 持仓上比在 100万 上更值得关注, 复用 mag 体系
      valueMagClass: magnitudeClass(todayPct),
      hint: "自昨日收盘至当前的预估盈亏。盘中数字按估值源推送的净值估算, 与实际结算可能有差异。",
      spark: totalSpark,
    },
    {
      label: "累计盈亏",
      value: fmtCurrency(totalProfit),
      sub: fmtSignedPct(returnRate),
      subClass: signClass(totalProfit),
      subMagClass: magnitudeClass(returnRate),
      valueMagClass: magnitudeClass(returnRate),
      hint: "自建仓以来所有持仓的累计盈亏金额与收益率。= 当前市值 − 总投入成本。",
      spark: totalSpark,
    },
    {
      label: "持仓基金",
      value: `${fundCount}`,
      sub: "只",
      subClass: "muted",
      subMagClass: "",
      valueMagClass: "",
      hint: "当前组合中持有的基金数量 (不含已清仓)。新增 / 删除持仓会在此实时反映。",
      spark: [],
    },
  ];

  return (
    <div class="fund-page fund-dashboard" aria-label="基金概览仪表盘">
      {/*
        2026-07-14: 净值拉取失败兜底 — 之前 fetchNavNow 失败时只在 hero status 行
        显示一行小字, 容易错过. 现在在 dashboard 顶部加一个 banner:
          - 加载中: 蓝底 + spinner 行内
          - 失败: 黄/红底 + 错误原因 + 手动重试按钮
        改进可观察性, 用户不再觉得 "数据没了".
      */}
      {(fundsRefreshing.value || fundsRefreshError.value) && (
        <div
          class={`fund-fetch-banner${fundsRefreshError.value ? " error" : ""}`}
          role={fundsRefreshError.value ? "alert" : "status"}
          aria-live="polite"
        >
          {fundsRefreshing.value && !fundsRefreshError.value ? (
            <span class="fund-fetch-banner-text">
              <span class="fund-fetch-spinner" aria-hidden="true" />
              正在拉取最新净值…
            </span>
          ) : (
            <span class="fund-fetch-banner-text">
              <strong>净值未拉取</strong>
              <span class="fund-fetch-banner-reason">
                · {fundsRefreshError.value}
              </span>
              <button
                type="button"
                class="fund-btn fund-btn-ghost fund-fetch-retry"
                onClick={() => void refreshNow()}
                disabled={!!fundsRefreshing.value}
              >
                重试
              </button>
            </span>
          )}
        </div>
      )}

      <div class="fund-page-head">
        <div>
          <h1>概览</h1>
          <p>组合总览、资产走势、持仓分布与收益对比</p>
        </div>
      </div>

      {/*
        2026-07-15: 顶部「数据新鲜度」状态条 — 显眼地告诉用户净值有多新 / 多久后自动刷新
        ponytail: 不抢 hero 信息, 单独 sticky 一行, 含进度条 + 倒计时秒数 + 立即刷新按钮
      */}
      {(() => {
        const st = schedulerState.value;
        if (!st || (!st.lastFetch && !st.nextFetch)) return null;
        const last = st.lastFetch ? fmtClock(st.lastFetch) : "—";
        const ageMs = st.lastFetch ? nowTick.value - st.lastFetch : null;
        // 新鲜度分级: <5min 新鲜, 5-30min 还行, >30min 偏旧
        const freshness =
          ageMs == null
            ? "unknown"
            : ageMs < 5 * 60 * 1000
            ? "fresh"
            : ageMs < 30 * 60 * 1000
            ? "aging"
            : "stale";
        const countdownMs = st.nextFetch ? st.nextFetch - nowTick.value : null;
        const totalMs = st.intervalMs || 5 * 60 * 1000;
        // 进度条: 已用 / 总间隔. 当数据正在拉取时, 显示"拉取中"满条.
        const inFlight = !!fundsRefreshing.value;
        const elapsed = inFlight
          ? totalMs
          : st.lastFetch && st.nextFetch
          ? Math.min(totalMs, Math.max(0, nowTick.value - st.lastFetch))
          : 0;
        const pct = Math.min(100, (elapsed / totalMs) * 100);
        const nextText = st.nextFetch ? fmtCountdown(st.nextFetch, nowTick.value) : "—";
        return (
          <div
            class={`fund-freshness ${freshness}${inFlight ? " in-flight" : ""}`}
            role="status"
            aria-live="polite"
            aria-label={`数据上次刷新 ${last}, ${nextText} 自动刷新`}
          >
            <div class="fund-freshness-bar">
              <div
                class="fund-freshness-fill"
                style={`width:${pct}%`}
                aria-hidden="true"
              />
            </div>
            <div class="fund-freshness-content">
              <span class="fund-freshness-label">数据新鲜度</span>
              <span class={`fund-freshness-tag ${freshness}`}>
                {freshness === "fresh"
                  ? "新鲜"
                  : freshness === "aging"
                  ? "偏旧"
                  : freshness === "stale"
                  ? "陈旧"
                  : "未知"}
              </span>
              <span class="fund-freshness-meta">
                上次 {last}
                {st.nextFetch && (
                  <span class="fund-freshness-sep" aria-hidden="true">·</span>
                )}
                {st.nextFetch && <span>下次 {nextText}</span>}
              </span>
              <button
                type="button"
                class="fund-btn fund-btn-ghost fund-freshness-retry"
                onClick={() => void refreshNow()}
                disabled={inFlight}
                title="立即拉取最新净值"
              >
                {inFlight ? "拉取中…" : "立即刷新"}
              </button>
            </div>
          </div>
        );
      })()}

      <section class="fund-page-section fund-page-section-tools">
        <div class="head-tools">
          <div
            class="fund-source-toggle"
            role="radiogroup"
            aria-label="净值数据源"
            title="切换估值源 (部分基金在某个源更准确)"
          >
            {Object.entries(NAV_SOURCE_LABELS).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={navSource.value === id}
                class={`fund-source-btn${navSource.value === id ? " active" : ""}`}
                onClick={() => void handleSwitchSource(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            class="fund-btn fund-btn-primary"
            onClick={() => openAddModal()}
            aria-label="添加持仓"
          >
            <span aria-hidden="true">＋</span>
            <span style="margin-left:6px">添加持仓</span>
          </button>
          <button
            type="button"
            class="fund-btn fund-btn-ghost"
            onClick={() => void refreshNow()}
            aria-label="同步数据"
            title="同步最新净值"
          >
            <IconRefresh size={16} />
            <span style="margin-left:6px">同步数据</span>
          </button>
        </div>
      </section>

      <section class="fund-kpi-strip" aria-label="组合关键指标">
        {kpis.map((k) => (
          <div class="fund-kpi" key={k.label} title={k.hint}>
            <span class="fund-kpi-label" title={k.hint}>
              {k.label}
              {/* 2026-07-15: 小 ⓘ 标记 — 视觉提示该卡可 hover 看解释
                 ponytail: 不用第三方 tooltip 库, 复用浏览器 title + 自定义悬浮层 */}
              <span class="fund-kpi-info" aria-hidden="true">ⓘ</span>
            </span>
            <span class={`fund-kpi-value ${k.subClass === "muted" ? "" : signClass(Number(k.sub))} ${k.valueMagClass || ""}`}>
              {k.value}
            </span>
            <FundSparkline values={k.spark} />
            <span class={`fund-kpi-sub ${k.subClass === "muted" ? "" : k.subClass} ${k.subMagClass || ""}`}>
              {k.sub}
            </span>
            {/* 2026-07-15: 自定义 hover 解释卡 — title 弹得太慢, 用 :hover 立即可见 */}
            <div class="fund-kpi-hint" role="tooltip">
              {k.hint}
            </div>
          </div>
        ))}
      </section>

      <section class="fund-dash-row mt-5">
        <div class="fund-card-flat">
          <div class="fund-card-flat-head">
            <div>
              <h3>资产走势</h3>
              <div class="sub">组合总市值</div>
            </div>
            <div class="fund-range" role="tablist" aria-label="走势区间">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  class={range.value === r.key ? "active" : ""}
                  aria-pressed={range.value === r.key}
                  onClick={() => {
                    range.value = r.key;
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <FundAreaChart
            series={trendSeries}
            formatValue={(v) => fmtCurrency(v)}
            ariaLabel={`近${days}天资产走势`}
            emptyHint="净值刷新后将展示资产走势"
          />
        </div>
        <div class="fund-card-flat">
          <div class="fund-card-flat-head">
            <div>
              <h3>持仓分布</h3>
              <div class="sub">按基金类型</div>
            </div>
          </div>
          <FundAllocationDonut />
          {alloc.total <= 0 && (
            <div class="fund-empty-card" style="padding-top:8px">
              添加持仓后将展示分布
            </div>
          )}
        </div>
      </section>

      <section class="fund-dash-row-3 mt-5">
        <div class="fund-card-flat">
          <div class="fund-card-flat-head">
            <div>
              <h3>收益对比</h3>
              <div class="sub">组合 vs 沪深 300 (区间累计 %)</div>
            </div>
            {benchError && (
              <span class="fund-kpi-sub negative">基准不可用</span>
            )}
          </div>
          {comparison.length ? (
            <>
              {/*
                2026-07-14: 重排 — 之前用 absolute label (top: -20px) 在每根柱子顶部居中,
                两根 18px + 4px gap 的柱子, label 居中坐标 (9px / 31px), 文本宽 ~24px →
                两条 label 横向重叠 6px. 这里改成「常规流式」:
                - 每列 (col) 包含 track (双柱容器) + 下方数字行 + axis 标签.
                - 数字 stack 显示本组合 / 沪深 300 两段, 不再绝对定位.
              */}
              <div class="fund-bars-row">
                {comparison.map((g) => {
                  // 2026-07-15: 每列加「差值」(本组合 − 沪深 300) 和正/负 tint
                  //   ponytail: 不复用 magnitudeClass (按绝对值分级, 没法区分赢/输),
                  //             直接用 win/loss/even 三态决定徽章颜色
                  const diff = (g.fund || 0) - (g.bench || 0);
                  const winLabel = diff > 0.05 ? "跑赢" : diff < -0.05 ? "跑输" : "持平";
                  const ariaText = `${g.label} 区间: 组合 ${g.fund.toFixed(2)}%, 沪深300 ${g.bench.toFixed(2)}%, ${winLabel} ${Math.abs(diff).toFixed(2)}%`;
                  return (
                    <div
                      class={`fund-bar-col ${diff > 0.05 ? "win" : diff < -0.05 ? "loss" : "even"}`}
                      key={g.label}
                      title={ariaText}
                      aria-label={ariaText}
                    >
                      <div class="fund-bar-track">
                        <div
                          class="fund-bar brand"
                          style={`height:${Math.min(100, Math.max(2, Math.abs(g.fund) * 4))}%`}
                          title={`组合区间 ${g.fund.toFixed(2)}%`}
                        />
                        <div
                          class="fund-bar accent"
                          style={`height:${Math.min(100, Math.max(2, Math.abs(g.bench) * 4))}%`}
                          title={`沪深300 区间 ${g.bench.toFixed(2)}%`}
                        />
                      </div>
                      <div class="fund-bar-pct">
                        <span class={`brand ${magnitudeClass(g.fund)}`}>
                          {g.fund === 0
                            ? "0.0%"
                            : `${g.fund > 0 ? "▲" : "▼"}${g.fund > 0 ? "+" : ""}${g.fund.toFixed(1)}%`}
                        </span>
                        <span class={`accent ${magnitudeClass(g.bench)}`}>
                          {g.bench === 0
                            ? "0.0%"
                            : `${g.bench > 0 ? "▲" : "▼"}${g.bench > 0 ? "+" : ""}${g.bench.toFixed(1)}%`}
                        </span>
                      </div>
                      {/* 2026-07-15: 差值徽章 — 视觉回答"跑赢/跑输沪深 300 多少" */}
                      <div class="fund-bar-diff">
                        <span class="fund-bar-diff-label">{winLabel}</span>
                        <span class="fund-bar-diff-val">
                          {diff > 0 ? "+" : diff < 0 ? "" : ""}
                          {diff.toFixed(1)}%
                        </span>
                      </div>
                      <div class="fund-bar-axis">{g.label}</div>
                    </div>
                  );
                })}
              </div>
              <div class="fund-bars-legend">
                <span>
                  <span class="fund-bars-legend-swatch brand" />本组合
                </span>
                <span>
                  <span class="fund-bars-legend-swatch accent" />沪深 300
                </span>
              </div>
            </>
          ) : (
            <div class="fund-empty-card">净值数据不足</div>
          )}
        </div>

        <div class="fund-card-flat">
          <div class="fund-card-flat-head">
            <div>
              <h3>实时持仓</h3>
              <div class="sub">按市值排序 · Top {topRows.length}</div>
            </div>
          </div>
          {topRows.length === 0 ? (
            <div class="fund-empty-card">尚无持仓，请先添加</div>
          ) : (
            <table class="fund-list-table">
              <thead>
                <tr>
                  <th>基金</th>
                  <th class="num">当前估值</th>
                  <th class="num">30天走势</th>
                  <th class="num">当日</th>
                  <th class="num">累计</th>
                </tr>
              </thead>
              <tbody>
                {topRows.map((r) => {
                  const m = (r.metrics && r.metrics) || {};
                  const mv = Number(m.marketValue) || 0;
                  const todayP = Number(m.todayProfit) || 0;
                  const todayPctNum = mv > 0 ? (todayP / mv) * 100 : 0;
                  const cumP = Number(m.profit) || 0;
                  const cumPct = Number(m.profitPct) || 0;
                  const sparkValues = pickLast30DayValues(r.holding && r.holding.code);
                  // 2026-07-14: 行 tint 标记 — 与 FundList 共享 CSS (tr[data-risk-row]/[data-deep-loss]/[data-high-weight])
                  const risk = riskFromCategoryDashboard(r.holding && r.holding.category);
                  const isHighRisk = risk === "R5";
                  const isDeepLoss = cumPct <= -30;
                  const weightByCode = holdingWeights.value && holdingWeights.value.byCode;
                  const weight = (weightByCode && weightByCode[r.holding.code]) || 0;
                  const isHighWeight = weight >= 0.3;
                  return (
                    <tr
                      key={r.holding.code}
                      role="button"
                      tabIndex={0}
                      aria-label={`查看 ${r.holding.name} 详情`}
                      onClick={() => openFundDetail(r.holding.code)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openFundDetail(r.holding.code);
                        }
                      }}
                      data-risk-row={isHighRisk ? "R5" : ""}
                      data-deep-loss={isDeepLoss ? "1" : ""}
                      data-high-weight={isHighWeight ? "1" : ""}
                    >
                      <td>
                        <div class="fund-name">{r.holding.name}</div>
                        <div class="fund-code">{r.holding.code}</div>
                      </td>
                      <td class="num">{fmtCurrency(mv)}</td>
                      <td class="fund-row-spark">
                        <FundSparkline values={sparkValues} width={64} height={22} />
                      </td>
                      <td class={`num ${signClass(todayP)}`}>
                        <div>{fmtPct(todayPctNum)}</div>
                        <div class="sub-cell">{fmtCurrency(todayP)}</div>
                      </td>
                      <td class={`num ${signClass(cumP)}`}>
                        <div>{fmtPct(cumPct)}</div>
                        <div class="sub-cell">{fmtCurrency(cumP)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div class="fund-card-flat">
          <div class="fund-card-flat-head">
            <div>
              <h3>风险概览</h3>
              <div class="sub">组合层面</div>
            </div>
          </div>
          {[
            {
              // HHI = Σ weight² (0..1). 全部押一只基金 = 1, 平均分配 = 1/N.
              // ponytail: 业界常识: <0.15 分散, 0.15-0.25 中等, >0.25 集中
              label: "持仓集中度 (HHI)",
              val: Number(concentration.hhi) || 0,
              scale: 400,
              unit: "",
              hint: "HHI 越低越分散。=1 表示全押单只基金, 越接近 0 表示越平均。",
              band: (v) =>
                v < 0.15
                  ? { text: "低", level: "ok" }
                  : v < 0.25
                  ? { text: "中", level: "mid" }
                  : { text: "高", level: "warn" },
            },
            {
              label: "最大单一权重",
              val: Number(concentration.maxWeight) || 0,
              scale: 2,
              unit: "%",
              hint: "占组合市值最大的一只基金占比。>30% 表示鸡蛋过于集中在一只篮子里。",
              band: (v) =>
                v < 20
                  ? { text: "分散", level: "ok" }
                  : v < 30
                  ? { text: "适中", level: "mid" }
                  : { text: "集中", level: "warn" },
            },
            {
              label: "前 3 大占比",
              val: Number(concentration.top3Pct) || 0,
              scale: 1.2,
              unit: "%",
              hint: "市值最大的 3 只基金合计占比。>60% 意味着组合高度依赖少数几只。",
              band: (v) =>
                v < 50
                  ? { text: "分散", level: "ok" }
                  : v < 70
                  ? { text: "适中", level: "mid" }
                  : { text: "集中", level: "warn" },
            },
            {
              label: "区间回撤估算",
              val: -Math.abs(drawdownPct),
              scale: 2,
              unit: "%",
              hint: "所选区间内组合峰值到谷底的最大跌幅。>15% 算明显回撤, >30% 算深度回撤。",
              band: (v) =>
                v < 5
                  ? { text: "平稳", level: "ok" }
                  : v < 15
                  ? { text: "正常", level: "mid" }
                  : { text: "显著", level: "warn" },
            },
          ].map((m) => {
            const band = m.band(Math.abs(m.val));
            // 进度条宽度: 用 scale 决定的归一化比例 (已经存在)
            const pct = Math.min(100, Math.abs(m.val) * m.scale);
            const valLabel =
              Math.abs(m.val).toFixed(m.unit === "%" || m.label.includes("HHI") ? 1 : 2) + (m.unit || "");
            return (
              <div class="fund-meter-row" key={m.label} data-hint={m.hint}>
                <span class="fund-meter-label" title={m.hint}>
                  {m.label}
                </span>
                <span class={`fund-meter-val level-${band.level}`}>
                  {valLabel} <span class="fund-meter-band">{band.text}</span>
                </span>
                <div
                  class="fund-meter-track"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct)}
                  aria-label={`${m.label} ${valLabel} ${band.text}`}
                >
                  <div
                    class={`fund-meter-fill level-${band.level}`}
                    style={`width:${pct}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default FundDashboard;