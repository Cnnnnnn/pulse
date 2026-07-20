/**
 * src/renderer/funds/FundDetail.jsx
 *
 * 2026-07-14 计划 §3 Phase 3 — 基金详情.
 *
 *   1. 头部 (emblem + 名称 + 类型/风险 + 4 个数字)
 *   2. 净值走势 (区间 1M/3M/6M/1Y + hover tooltip) — 复用 FundAreaChart
 *   3. 风险评级 (雷达 + 5 个指标 meters) — 复用 FundRadar
 *   4. 持仓明细 / 交易记录 (双栏 table)
 *   5. 返回列表 — closeFundDetail
 *
 * 数据真实来源:
 *   - holding + metrics: rowsWithMetrics.filter(r => r.holding.code === code)
 *   - nav history: navHistoryCache[code] (来自 loadFundNavHistory, 由 store prefetch)
 *   - 净值序列: navHistory.slice(0, 10) 渲染紧凑表 (替代原「交易记录」tab 删除后的空白)
 *
 * ponytail:
 *   - 持仓明细: holding 自身只有 shares/costNav 等汇总字段, 没有"底层持仓";
 *     这里复用 FundCard 那种展开行 (held shares × estimated price) 不可行, 改为展示
 *     「单只基金的份额/成本/市值/盈亏」派生指标. 等主进程接 holdings-detail 接口再升级.
 */

import { useEffect, useMemo, useState } from "preact/hooks";
import { useSignal } from "@preact/signals";
import {
  rowsWithMetrics,
  navHistoryCache,
  navHistoryLoading,
  loadFundNavHistory,
  removeFund,
} from "./fundStore.js";
import { closeFundDetail } from "./fundRoute.js";
import { api } from "../api.js";
import { FundAreaChart } from "./FundAreaChart.jsx";
import { FundRadar } from "./FundRadar.jsx";
import { openConfirm } from "../confirmStore.js";
import {
  isFundPinned,
  addWatchlistItem,
  removeWatchlistItem,
} from "../watchlist/watchlist-store.js";
import { showToast } from "../store/toast-store.js";
import { downloadCsv, safeFilename } from "../utils/csv.js";

const RANGE_OPTIONS = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
];
// 2026-07-14: 净值序列表的 5 档 — 1M / 3M / 6M / 1Y / 全部
//   ponytail: 加 6M/1Y 因为基金监控常要看半年/一年走势; "全部" 兜底展示最多 200 行
const NAV_HISTORY_OPTIONS = [
  { key: "1M", label: "近 1M", days: 30 },
  { key: "3M", label: "近 3M", days: 90 },
  { key: "6M", label: "近 6M", days: 180 },
  { key: "1Y", label: "近 1Y", days: 365 },
  { key: "ALL", label: "全部", days: null },
];
const NAV_HISTORY_MAX_ROWS = 200;
// 2026-07-15: 净值表分页 — 180/365 行一次渲太长, 20 行/页够扫
const NAV_TABLE_PAGE_SIZE = 20;
const NAV_RANGE_KEYS = new Set(NAV_HISTORY_OPTIONS.map((o) => o.key));
const NAV_RANGE_STORAGE_KEY = "fund.detail.navRange.v1";
function loadSavedNavRange() {
  if (typeof window === "undefined" || !window.localStorage) return "3M";
  try {
    const v = window.localStorage.getItem(NAV_RANGE_STORAGE_KEY);
    return v && NAV_RANGE_KEYS.has(v) ? v : "3M";
  } catch {
    return "3M";
  }
}

const TYPE_LABEL = { stock: "股票", bond: "债券", money: "货币", qdii: "QDII", other: "其他" };

function fmtNum(v, dp = 4) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}
function fmtSignedPct(p) {
  const v = Number(p);
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0.00%";
  const arrow = v > 0 ? "▲" : "▼";
  const sign = v > 0 ? "+" : "";
  return `${arrow}${sign}${v.toFixed(2)}%`;
}
// 2026-07-14: 与 Dashboard fmtCurrency 对齐 — ¥ + 千分位 + 2 位小数 + 负号前缀
//   ponytail: 复用同样的 localeZh / dp=2 习惯, 跨模块读数一致
function fmtCurrency(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "¥0.00";
  const sign = v < 0 ? "-" : "";
  return `${sign}¥${Math.abs(v).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function signClass(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return v >= 0 ? "positive" : "negative";
}

// 2026-07-15: 导出净值序列为 CSV — 用户想用 Excel/Numbers 进一步分析
//   ponytail: downloadCsv 已抽到 utils/csv.js 共享; 这里只负责组装 rows
function buildNavHistoryCsv(h, navHistory, rangeLabel) {
  const header = ["日期", "单位净值", "日涨跌(%)", "累计涨跌(%)"];
  const rows = [
    [`# ${h.name || ""} (${h.code || ""})`],
    [`# 区间: ${rangeLabel}`],
    [`# 导出时间: ${new Date().toLocaleString("zh-CN")}`],
    [],
    header,
  ];
  for (const p of navHistory) {
    const nav = Number(p.nav) || 0;
    const day = Number(p.dailyChange);
    const cum = Number(p.cumulativeChange);
    rows.push([
      String(p.date || "").slice(0, 10),
      nav.toFixed(4),
      Number.isFinite(day) ? day.toFixed(4) : "",
      Number.isFinite(cum) ? cum.toFixed(4) : "",
    ]);
  }
  return rows;
}

function pickRisk(metrics) {
  // 没有真实 riskRating, 用波动代理 — 今日盈亏幅度映射 R1..R5
  const today = Number(metrics && metrics.todayReturnPct) || 0;
  const profit = Number(metrics && metrics.profitPct) || 0;
  const abs = Math.max(Math.abs(today), Math.abs(profit) * 0.2);
  if (abs < 0.3) return "R1";
  if (abs < 1) return "R2";
  if (abs < 2.5) return "R3";
  if (abs < 5) return "R4";
  return "R5";
}
// 2026-07-14: 风险标签 — 与 FundList RISK_LABEL_MAP 同步
const RISK_LABEL_MAP_DETAIL = { R1: "低", R2: "中低", R3: "中", R4: "中高", R5: "高" };
function riskLabel(r) {
  return RISK_LABEL_MAP_DETAIL[r] || r || "—";
}

// 2026-07-15: 5 个风险指标的 hint — 大多数用户不懂「夏普」「贝塔」
//   ponytail: 文案要短, 但要能让用户决策; 不堆公式
const RISK_METRIC_HINT = {
  波动率: "价格上下波动的剧烈程度。>15% 算高波动, 适合长线持有；<5% 算稳健。",
  回撤: "从最高点跌到最低点的幅度。>20% 算较大回撤, >30% 算深度回撤。",
  夏普: "每承担一单位风险所获得的超额收益。>1 算优秀, <0 算亏损。",
  标准差: "日收益率的离散程度。和波动率类似, 但按日度计算。",
  贝塔: "相对沪深 300 的波动倍数。=1 表示同步, >1 表示比大盘更激进, <1 表示更保守。",
};

function buildRiskMetrics(metrics) {
  // 5 维: 波动/回撤/夏普/标准差/贝塔 — 没真实数据时用近似
  const today = Math.abs(Number(metrics && metrics.todayReturnPct) || 0);
  const profitPct = Number(metrics && metrics.profitPct) || 0;
  const dd = Math.max(0, -profitPct);
  const sharpe = Math.max(0, Math.min(3, 1 + profitPct / 30));
  const stddev = Math.min(15, Math.max(2, today * 4));
  const beta = Math.max(0, Math.min(2, 0.5 + today / 5));
  const vol = Math.min(20, Math.max(2, today * 8));
  // 2026-07-15: 每个指标带 hint + band (按 norm 三档 oklch 色)
  //   ponytail: 阈值沿用 RISK_METRIC_HINT 的口径 (vol>15 高 / dd>20 中等 / sharpe>1 好等)
  return [
    {
      label: "波动率",
      norm: vol / 20,
      value: vol.toFixed(2) + "%",
      hint: RISK_METRIC_HINT["波动率"],
      band: (n) =>
        n < 0.25 ? { text: "稳健", level: "ok" } : n < 0.75 ? { text: "适中", level: "mid" } : { text: "高", level: "warn" },
    },
    {
      label: "回撤",
      norm: dd / 30,
      value: dd.toFixed(2) + "%",
      hint: RISK_METRIC_HINT["回撤"],
      band: (n) =>
        n < 0.33 ? { text: "平稳", level: "ok" } : n < 0.66 ? { text: "正常", level: "mid" } : { text: "显著", level: "warn" },
    },
    {
      label: "夏普",
      norm: sharpe / 3,
      value: sharpe.toFixed(2),
      hint: RISK_METRIC_HINT["夏普"],
      // 注意: 夏普越高越好, band 反向 (norm 越高 → 越好)
      band: (n) =>
        n > 0.5 ? { text: "优秀", level: "ok" } : n > 0.2 ? { text: "一般", level: "mid" } : { text: "差", level: "warn" },
    },
    {
      label: "标准差",
      norm: stddev / 15,
      value: stddev.toFixed(2) + "%",
      hint: RISK_METRIC_HINT["标准差"],
      band: (n) =>
        n < 0.25 ? { text: "稳健", level: "ok" } : n < 0.75 ? { text: "适中", level: "mid" } : { text: "高", level: "warn" },
    },
    {
      label: "贝塔",
      norm: beta / 2,
      value: beta.toFixed(2),
      hint: RISK_METRIC_HINT["贝塔"],
      // 贝塔: ≈0.5 中等 (1=大盘同步), 太偏离都算波动放大
      band: (n) =>
        n < 0.4 ? { text: "保守", level: "ok" } : n < 0.6 ? { text: "同步", level: "mid" } : { text: "激进", level: "warn" },
    },
  ];
}

function pickNavSeries(code) {
  const c = navHistoryCache.value && navHistoryCache.value[code];
  if (!c || !Array.isArray(c.series)) return [];
  return c.series
    .map((s) => ({
      date: s.date,
      value: Number(s.nav) || 0,
    }))
    .filter((s) => Number.isFinite(s.value));
}

/**
 * 从升序净值行里切「最近 N 日」, 并按最新在上返回.
 * @param {Array<{date:string, nav:number, dailyChange?:number}>} rowsAsc
 * @param {number|null} days null = 全部 (截到 maxRows)
 */
export function pickNavHistoryWindow(rowsAsc, days, maxRows = NAV_HISTORY_MAX_ROWS) {
  if (!Array.isArray(rowsAsc) || !rowsAsc.length) return [];
  const windowAsc =
    days == null ? rowsAsc.slice(-maxRows) : rowsAsc.slice(-Math.max(1, days));
  const base = windowAsc[0] && Number(windowAsc[0].nav);
  const withCum = windowAsc.map((p) => ({
    ...p,
    cumulativeChange:
      base && base > 0 ? ((Number(p.nav) - base) / base) * 100 : null,
  }));
  return withCum.slice().reverse();
}

function subTextForNavRange(key, total) {
  if (total === 0) return "尚无历史净值";
  const opt = NAV_HISTORY_OPTIONS.find((o) => o.key === key) || NAV_HISTORY_OPTIONS[0];
  if (opt.days == null) return `全部 ${Math.min(total, NAV_HISTORY_MAX_ROWS)} / ${total} 个交易日`;
  return `近 ${opt.days} 个交易日（总计 ${total}）`;
}

export function FundDetail({ code }) {
  const all = rowsWithMetrics.value || [];
  const row = useMemo(
    () => all.find((r) => r.holding && r.holding.code === code) || null,
    [all, code],
  );
  const range = useSignal("6M");
  const days = useMemo(() => {
    const o = RANGE_OPTIONS.find((r) => r.key === range.value);
    return o ? o.days : 180;
  }, [range.value]);
  // 2026-07-14: 净值序列展示区间 — 与走势图联动, 但多一个 "全部" 档; 默认 3M 便于看趋势
  //   ponytail: 选择也持久化到 localStorage, 与 Dashboard range 同样的处理
  const navRange = useSignal(loadSavedNavRange());
  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(NAV_RANGE_STORAGE_KEY, navRange.value);
    } catch {
      /* noop */
    }
  }, [navRange.value]);

  // 2026-07-15: 走势图 range + 净值表 navRange 任一变大 → 补拉
  //   ponytail: 之前只盯 navRange, 用户切图表 1M/3M/1Y 时根本不触发 fetch
  useEffect(() => {
    if (!code) return;
    const chartOpt = RANGE_OPTIONS.find((r) => r.key === range.value);
    const navOpt =
      NAV_HISTORY_OPTIONS.find((o) => o.key === navRange.value) ||
      NAV_HISTORY_OPTIONS[0];
    const chartDays = chartOpt ? chartOpt.days : 180;
    const navDays = navOpt.days == null ? 9999 : navOpt.days;
    const requestedDays = Math.max(chartDays, navDays);
    const c = navHistoryCache.value && navHistoryCache.value[code];
    const haveRows = c && c.series && c.series.length >= requestedDays;
    const alreadyTried = c && (c.fetchedDays || 0) >= requestedDays;
    if (!haveRows && !alreadyTried) {
      void loadFundNavHistory(api, code, { days: requestedDays });
    }
     
  }, [code, range.value, navRange.value]);

  const fullSeries = useMemo(() => pickNavSeries(code), [code, navHistoryCache.value]);
  const trendSeries = useMemo(() => fullSeries.slice(-days), [fullSeries, days]);
  // 净值序列表: series 升序 (旧→新); 日涨跌对前一日, 累计对区间首日
  const navHistoryAll = useMemo(() => {
    const arr = fullSeries;
    if (!arr.length) return [];
    return arr.map((p, i) => {
      const prev = i > 0 ? arr[i - 1].value : null;
      const dailyChange =
        prev && prev > 0 ? ((p.value - prev) / prev) * 100 : null;
      return {
        date: p.date,
        nav: p.value,
        dailyChange,
      };
    });
  }, [fullSeries]);
  // 2026-07-15: 取末尾 N 条 (最近), 再 reverse 最新在上
  //   ponytail: 之前 slice(0, N) 拿的是 2019 年起的最老数据 — 用户截图实锤
  const navHistory = useMemo(() => {
    if (!navHistoryAll.length) return [];
    const opt =
      NAV_HISTORY_OPTIONS.find((o) => o.key === navRange.value) ||
      NAV_HISTORY_OPTIONS[0];
    return pickNavHistoryWindow(navHistoryAll, opt.days);
  }, [navHistoryAll, navRange.value]);

  // 净值表分页 — 切区间/换基金时回到第 1 页
  const [navPage, setNavPage] = useState(1);
  useEffect(() => {
    setNavPage(1);
  }, [code, navRange.value]);
  const navTotalPages = Math.max(1, Math.ceil(navHistory.length / NAV_TABLE_PAGE_SIZE));
  const navSafePage = Math.min(navPage, navTotalPages);
  const navStart = (navSafePage - 1) * NAV_TABLE_PAGE_SIZE;
  const navPageRows = navHistory.slice(navStart, navStart + NAV_TABLE_PAGE_SIZE);

  if (!code || !row) {
    return (
      <div class="fund-page fund-detail">
        <div class="fund-page-head">
          <div>
            <button
              type="button"
              class="fund-back-link"
              onClick={() => closeFundDetail()}
            >
              ‹ 返回列表
            </button>
            <h1>未找到基金</h1>
            <p>code: {code || "(未知)"}</p>
          </div>
        </div>
        <div class="fund-empty-card">
          该基金不在持仓中, 请先添加到持仓再查看详情。
        </div>
      </div>
    );
  }

  const h = row.holding;
  const m = row.metrics || {};
  const cat = h.category || "other";
  const typeLabel = TYPE_LABEL[cat] || "其他";
  const risk = pickRisk(m);
  const emblemChar = (h.name || h.code || "?").charAt(0);
  const pinned = isFundPinned(h.code);
  // 2026-07-14: 加自选 / 取消自选 — 与 FundList 共享 watchlist-store
  //   ponytail: 复用同一个 signal, 列表里的 ⭐ 状态会自动同步, 反之亦然
  async function togglePin() {
    try {
      if (isFundPinned(h.code)) {
        await removeWatchlistItem({ type: "fund", ref: h.code });
        showToast(`已从自选移除：${h.name}`, "info");
      } else {
        await addWatchlistItem({ type: "fund", ref: h.code });
        showToast(`已加入自选：${h.name}`, "success");
      }
    } catch (err) {
      showToast(`自选操作失败: ${(err && err.message) || err}`, "error");
    }
  }

  // 2026-07-15: 删除持仓 — 详情页目前只能查看不能删, 加一个右上角危险按钮
  //   ponytail: 复用 openConfirm + removeFund (与 FundCard 同源), 不重复 confirm 弹窗
  async function handleDelete() {
    const ok = await openConfirm({
      title: "删除持仓",
      message: `确定删除 ${h.name || code}？7 天内可在回收站恢复。`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!ok) return;
    const r = await removeFund(api, h.id);
    if (r && r.ok) {
      showToast("已删除", { type: "success" });
      closeFundDetail();
    } else {
      showToast("删除失败", { type: "error" });
    }
  }

  return (
    <div class="fund-page fund-detail" aria-label={`基金详情 ${h.name || code}`}>
      <div class="fund-page-head">
        <div>
          <button
            type="button"
            class="fund-back-link"
            onClick={() => closeFundDetail()}
            aria-label="返回列表"
          >
            ‹ 返回列表
          </button>
        </div>
        <div class="head-tools">
          <button
            type="button"
            class="fund-btn fund-btn-danger"
            onClick={handleDelete}
            aria-label={`删除持仓 ${h.name || code}`}
            title="从持仓中删除 (7 天内可在回收站恢复)"
          >
            <span aria-hidden="true">🗑</span>
            <span style="margin-left:6px">删除持仓</span>
          </button>
        </div>
      </div>

      <section class="fund-card-flat fund-detail-head">
        <div class="fund-detail-title">
          <div class="fund-detail-emblem" aria-hidden="true">
            {emblemChar}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="fund-detail-name">{h.name}</span>
              <span class="risk-pill">{typeLabel}</span>
              <span
                class="risk-pill"
                data-risk={risk}
                aria-label={`风险等级 ${riskLabel(risk)}`}
                title={`风险等级 ${riskLabel(risk)}`}
              >
                {risk}
              </span>
              <button
                type="button"
                class={`fund-star fund-star-md${pinned ? " pinned" : ""}`}
                aria-label={pinned ? "从自选移除" : "加入自选"}
                aria-pressed={pinned}
                onClick={() => void togglePin()}
                title={pinned ? "已加入自选，点击移除" : "加入自选"}
              >
                {pinned ? "★" : "☆"}
                <span class="fund-star-label">{pinned ? "已自选" : "加自选"}</span>
              </button>
            </div>
            <div class="fund-detail-meta">
              {h.code} · 份额 {(Number(h.shares) || 0).toFixed(2)} · 成本净值{" "}
              {fmtNum(h.costNav, 4)}
            </div>
          </div>
        </div>
        <div class="fund-detail-stats" aria-label="关键数据">
          <div>
            <div class="fund-detail-stat-label">单位净值</div>
            <div class="fund-detail-stat-val">{fmtNum(m.nav, 4)}</div>
          </div>
          <div>
            <div class="fund-detail-stat-label">日涨跌</div>
            <div
              class={`fund-detail-stat-val ${signClass(m.dailyReturnPct)}`}
            >
              {fmtSignedPct(m.dailyReturnPct)}
            </div>
          </div>
          <div>
            <div class="fund-detail-stat-label">累计收益</div>
            <div class={`fund-detail-stat-val ${signClass(m.profitPct)}`}>
              {fmtSignedPct(m.profitPct)}
            </div>
          </div>
          <div>
            <div class="fund-detail-stat-label">持仓市值</div>
            <div class="fund-detail-stat-val">{fmtCurrency(m.marketValue)}</div>
          </div>
        </div>
      </section>

      <section class="fund-detail-grid mt-5">
        <div class="fund-card-flat">
          <div class="fund-card-flat-head">
            <div>
              <h3>净值走势</h3>
              <div class="sub">
                单位净值（元）
                {fullSeries.length > 0 && (
                  <span title={`已加载 ${fullSeries.length} 个交易日`}>
                    {" "}· 已加载 {fullSeries.length} 日
                  </span>
                )}
                {navHistoryLoading.value[code] && (
                  <span class="fund-fetch-tag" role="status" aria-live="polite">
                    <span class="fund-fetch-spinner" aria-hidden="true" />
                    加载更长历史…
                  </span>
                )}
              </div>
            </div>
            <div class="fund-range" role="tablist" aria-label="净值区间">
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
            formatValue={(v) => fmtNum(v, 4)}
            ariaLabel={`近${days}天净值走势`}
            emptyHint="净值数据加载中…"
          />
        </div>
        <div class="fund-card-flat">
          <div class="fund-card-flat-head">
            <div>
              <h3>风险评级</h3>
              <div class="sub">{risk} 级 · 估算</div>
            </div>
          </div>
          <FundRadar metrics={buildRiskMetrics(m)} />
          {buildRiskMetrics(m).map((mm) => {
            const band = mm.band(mm.norm);
            return (
              <div class="fund-meter-row" key={mm.label} title={mm.hint}>
                <span class="fund-meter-label" title={mm.hint}>
                  {mm.label}
                  <span class="fund-meter-info" aria-hidden="true">ⓘ</span>
                </span>
                <span class={`fund-meter-val level-${band.level}`}>
                  {mm.value} <span class="fund-meter-band">{band.text}</span>
                </span>
                <div
                  class="fund-meter-track"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(mm.norm * 100)}
                  aria-label={`${mm.label} ${mm.value} ${band.text}`}
                >
                  <div
                    class={`fund-meter-fill level-${band.level}`}
                    style={`width:${Math.min(100, mm.norm * 100)}%`}
                  />
                </div>
                <div class="fund-meter-hint" role="tooltip">
                  {mm.hint}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section class="fund-detail-grid-2 mt-5">
        <div class="fund-card-flat">
          <div class="fund-card-flat-head">
            <div>
              <h3>持仓明细</h3>
              <div class="sub">该基金仓位</div>
            </div>
          </div>
          <table class="fund-list-table">
            <thead>
              <tr>
                <th>指标</th>
                <th class="num">数值</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>持有份额</td>
                <td class="num">{(Number(h.shares) || 0).toFixed(2)}</td>
              </tr>
              <tr>
                <td>成本净值</td>
                <td class="num">{fmtNum(h.costNav, 4)}</td>
              </tr>
              <tr>
                <td>当前净值</td>
                <td class="num">{fmtNum(m.nav, 4)}</td>
              </tr>
              <tr>
                <td>持仓成本</td>
                <td class="num">{fmtCurrency(m.costValue)}</td>
              </tr>
              <tr>
                <td>持仓市值</td>
                <td class="num">{fmtCurrency(m.marketValue)}</td>
              </tr>
              <tr>
                <td>累计盈亏</td>
                <td class={`num ${signClass(m.profit)}`}>{fmtCurrency(m.profit)}</td>
              </tr>
              <tr>
                <td>今日盈亏</td>
                <td class={`num ${signClass(m.todayProfit)}`}>
                  {fmtCurrency(m.todayProfit)}
                </td>
              </tr>
              <tr>
                <td>添加时间</td>
                <td class="num" style="font-variant-numeric:auto">
                  {h.addedAt
                    ? new Date(h.addedAt).toLocaleDateString("zh-CN")
                    : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="fund-card-flat">
          <div class="fund-card-flat-head">
            <div>
              <h3>净值序列</h3>
              <div class="sub">
                {subTextForNavRange(navRange.value, navHistoryAll.length)}
                {/* 2026-07-15: 数据完整度指示 — 区间 > 缓存时显示"加载中", 避免用户以为数据没了
                   ponytail: 走信号响应式, 加载态自动更新, 不需要手 setState */}
                {navHistoryLoading.value[code] && (
                  <span class="fund-fetch-tag" role="status" aria-live="polite">
                    <span class="fund-fetch-spinner" aria-hidden="true" />
                    加载更长历史…
                  </span>
                )}
              </div>
            </div>
            <div class="head-tools">
              <div class="fund-range" role="tablist" aria-label="净值序列区间">
                {NAV_HISTORY_OPTIONS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    class={navRange.value === r.key ? "active" : ""}
                    aria-pressed={navRange.value === r.key}
                    onClick={() => {
                      navRange.value = r.key;
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                class="fund-btn fund-btn-ghost fund-detail-csv-export"
                onClick={() => {
                  const rangeLabel = subTextForNavRange(navRange.value, navHistoryAll.length);
                  const rows = buildNavHistoryCsv(h, navHistory, rangeLabel);
                  const stamp = new Date().toISOString().slice(0, 10);
                  downloadCsv(`${safeFilename(h.code)}-nav-${stamp}.csv`, rows);
                  showToast(`已导出 ${rows.length - 5} 行`, { type: "success" });
                }}
                disabled={navHistory.length === 0}
                title="导出当前区间的净值序列为 CSV (Excel/Numbers 可直接打开)"
                aria-label="导出净值序列为 CSV"
              >
                <span aria-hidden="true">↓</span>
                <span style="margin-left:4px">导出 CSV</span>
              </button>
            </div>
          </div>
          {navHistory.length === 0 ? (
            <div class="fund-empty-card">尚无历史净值</div>
          ) : (
            <>
              <table class="fund-list-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th class="num">单位净值</th>
                    <th class="num">日涨跌</th>
                    <th class="num">累计</th>
                  </tr>
                </thead>
                <tbody>
                  {navPageRows.map((p) => {
                    const nav = Number(p.nav) || 0;
                    const day = Number(p.dailyChange);
                    const cum = Number(p.cumulativeChange);
                    return (
                      <tr key={p.date}>
                        <td>{String(p.date || "").slice(0, 10)}</td>
                        <td class="num">{fmtNum(nav, 4)}</td>
                        <td class={`num ${signClass(day)}`}>
                          {Number.isFinite(day) ? fmtSignedPct(day) : "—"}
                        </td>
                        <td class={`num ${signClass(cum)}`}>
                          {Number.isFinite(cum) ? fmtSignedPct(cum) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div class="fund-pager">
                <span class="fund-pager-info">
                  显示 {navStart + 1}–{Math.min(navHistory.length, navStart + NAV_TABLE_PAGE_SIZE)} / 共 {navHistory.length} 个交易日
                </span>
                <div class="fund-pager-btns" role="navigation" aria-label="净值序列分页">
                  <button
                    type="button"
                    onClick={() => setNavPage(Math.max(1, navSafePage - 1))}
                    disabled={navSafePage === 1}
                    aria-label="上一页"
                  >
                    ‹
                  </button>
                  <span class="fund-pager-info" aria-live="polite">
                    {navSafePage} / {navTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNavPage(Math.min(navTotalPages, navSafePage + 1))}
                    disabled={navSafePage === navTotalPages}
                    aria-label="下一页"
                  >
                    ›
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default FundDetail;