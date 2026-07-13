/**
 * src/renderer/metals/MetalDetail.jsx
 *
 * 详情弹窗 (ModalShell): 点行情榜某行弹出.
 * - DetailHeader: 品种名 + 现价(¥/克, 实时 quote 换算) + 涨跌(▲▼ % + ±¥/克)
 * - ChartCard:   MetalTrendChart — 有 OHLC 画蜡烛, 否则画面积折线 (close 兜底).
 *                日/周/月前端聚合.
 * - IndicatorGrid: 现价 / 涨跌 / 区间高 / 区间低 / 振幅 (5 格).
 *
 * 数据口径说明:
 *   实时现价 = quote 换算的 ¥/克 (国际品种经 FX).
 *   K线/区间高低/振幅 = historyMap 的 close 序列 (代理品种元/克, 内部自洽).
 *   两套口径独立展示, 不混算 — 避免 "现价¥438 vs 历史¥900" 的失真.
 *   historyMap 数据可能混入不同 secid 的量纲 (已知数据层局限), 故指标标注"代理数据".
 */
import { useState, useMemo } from "preact/hooks";
import {
  quoteCache, fxCache, historyMap,
} from "./metalStore.js";
import { METALS, getMetalById } from "../../metals/metal-config.js";
import { calcChange } from "../../metals/metal-calc.js";
import { ModalShell } from "../components/ModalShell.jsx";
import { api } from "../api.js";
import {
  isMetalPinned,
  addWatchlistItem,
  removeWatchlistItem,
} from "../watchlist/watchlist-store.js";
import { AddToCompareButton } from "../stocks/AddToCompareButton.jsx";

const GRAM_PER_OZ = 31.1035;

function formatCNY(value, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })}`;
}

function formatNum(value, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
}

function getRefPriceCNY(quote, fx) {
  if (!quote) return null;
  if (quote.currency === "CNY") return quote.price;
  if (fx == null) return null;
  return (quote.price * fx) / GRAM_PER_OZ;
}

function getChangePerGramCNY(quote, fx) {
  if (!quote) return null;
  if (quote.currency === "CNY") return calcChange(quote).change;
  if (fx == null) return null;
  return (calcChange(quote).change * fx) / GRAM_PER_OZ;
}

/** ISO 8601 周号 (YYYY-Www). */
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay() || 7;
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + (4 - day));
  const year = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday - jan1) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function monthKey(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : "";
}

/** 聚合日线到周/月线. close 必有; OHLC 缺用 close 补. */
function aggregateKlines(points, period) {
  if (!Array.isArray(points) || points.length === 0) return [];
  if (period === "day") return points.map(normalizePoint);
  const buckets = new Map();
  const order = [];
  for (const p of points) {
    if (p.close == null) continue;
    const key = period === "week" ? isoWeekKey(p.date) : monthKey(p.date);
    if (!buckets.has(key)) {
      buckets.set(key, normalizePoint(p));
      order.push(key);
    } else {
      mergePoint(buckets.get(key), p);
    }
  }
  return order.map((k) => buckets.get(k));
}

function normalizePoint(p) {
  const c = p.close;
  return {
    date: p.date,
    open: p.open != null ? p.open : c,
    high: p.high != null ? p.high : c,
    low: p.low != null ? p.low : c,
    close: c,
  };
}

function mergePoint(dst, src) {
  dst.high = Math.max(dst.high, src.high != null ? src.high : src.close);
  dst.low = Math.min(dst.low, src.low != null ? src.low : src.close);
  dst.close = src.close;
  dst.date = src.date;
}

/**
 * 轻量趋势图: 有 OHLC 画蜡烛, 纯 close 画面积折线.
 * 宽度自适应 (viewBox + preserveAspectRatio=none).
 */
function MetalTrendChart({ points }) {
  if (!points || points.length < 2) return null;
  const W = 640;
  const H = 240;
  const padY = 12;
  const closes = points.map((p) => p.close);
  let min = Infinity, max = -Infinity;
  for (const p of points) {
    const hi = p.high != null ? p.high : p.close;
    const lo = p.low != null ? p.low : p.close;
    if (hi > max) max = hi;
    if (lo < min) min = lo;
  }
  const range = (max - min) || 1;
  const pad = range * 0.08;
  const yMin = min - pad;
  const yMax = max + pad;
  const yRange = yMax - yMin || 1;
  const slot = W / points.length;
  const xAt = (i) => slot * i + slot / 2;
  const yAt = (v) => padY + (H - 2 * padY) * (1 - (v - yMin) / yRange);

  const first = closes[0];
  const last = closes[closes.length - 1];
  const isUp = last >= first;
  const color = isUp ? "var(--metals-up)" : "var(--metals-down)";

  const candlePoints = points.filter((p) =>
    (p.open != null && p.open !== p.close) ||
    (p.high != null && p.high !== p.close) ||
    (p.low != null && p.low !== p.close));
  const useCandles = candlePoints.length >= Math.ceil(points.length * 0.5);

  if (!useCandles) {
    const linePts = closes.map((c, i) => `${xAt(i).toFixed(1)},${yAt(c).toFixed(1)}`).join(" ");
    const areaPts = `${xAt(0).toFixed(1)},${H} ${linePts} ${xAt(points.length - 1).toFixed(1)},${H}`;
    return (
      <svg class="metals-trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="价格走势折线图">
        <defs>
          <linearGradient id="metals-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color={color} stop-opacity="0.28" />
            <stop offset="100%" stop-color={color} stop-opacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill="url(#metals-trend-fill)" />
        <polyline points={linePts} fill="none" stroke={color} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
        <line x1="0" y1={yAt(last)} x2={W} y2={yAt(last)} stroke="var(--metals-gold-line)" stroke-width="1" stroke-dasharray="3 4" />
        <circle cx={xAt(points.length - 1)} cy={yAt(last)} r="2.5" fill={color} />
      </svg>
    );
  }

  const candleW = Math.max(2, slot * 0.6);
  return (
    <svg class="metals-trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="K 线蜡烛图">
      {points.map((p, i) => {
        const up = p.close >= p.open;
        const col = up ? "var(--metals-up)" : "var(--metals-down)";
        const x = xAt(i) - candleW / 2;
        const yOpen = yAt(p.open);
        const yClose = yAt(p.close);
        const yHigh = yAt(p.high);
        const yLow = yAt(p.low);
        const bodyY = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
        return (
          <g key={i}>
            <line x1={xAt(i)} x2={xAt(i)} y1={yHigh} y2={yLow} stroke={col} stroke-width="1" />
            <rect x={x} y={bodyY} width={candleW} height={bodyH} fill={col} rx="0.5" />
          </g>
        );
      })}
      <line x1="0" y1={yAt(last)} x2={W} y2={yAt(last)} stroke="var(--metals-gold-line)" stroke-width="1" stroke-dasharray="3 4" />
    </svg>
  );
}

const INTERVALS = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
];

export function MetalDetail({ metalId, onClose }) {
  const [interval, setInterval] = useState("day");
  const metal = getMetalById(metalId) || METALS[0];

  const quote = quoteCache.value.data[metal.id];
  const fx = fxCache.value.rate;
  const arr = historyMap.value[metal.id] || [];

  const refCNY = getRefPriceCNY(quote, fx);
  const changePerGram = getChangePerGramCNY(quote, fx);
  let changePct = 0;
  let direction = "flat";
  if (quote) {
    const c = calcChange(quote);
    changePct = c.changePct;
    direction = c.change > 0 ? "up" : c.change < 0 ? "down" : "flat";
  }
  const chgClass = direction === "up" ? "metals-up" : direction === "down" ? "metals-down" : "";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "—";

  // K线/指标: 只用 historyMap 的 close (代理品种元/克, 内部自洽), 不除 unitDivisor
  // (historyMap 存的就是代理品种原始报价, 跟实时 ¥/克 是两套口径, 各自独立展示).
  const chartPoints = useMemo(() => {
    const valid = arr.filter((p) => p.close != null && Number.isFinite(p.close));
    return aggregateKlines(valid, interval);
  }, [arr, interval]);

  // 指标: 区间高低/振幅基于 historyMap close 序列 (代理数据, 标注来源)
  const indicators = useMemo(() => {
    const closes = arr
      .map((p) => p.close)
      .filter((v) => v != null && Number.isFinite(v));
    let hi = null, lo = null;
    for (const p of arr) {
      if (p.high != null) { if (hi == null || p.high > hi) hi = p.high; }
      if (p.low != null) { if (lo == null || p.low < lo) lo = p.low; }
    }
    if (hi == null && closes.length > 0) hi = Math.max(...closes);
    if (lo == null && closes.length > 0) lo = Math.min(...closes);
    // 振幅 = (hi-lo)/|序列首点| (相对历史自身, 不跟实时现价比)
    let amplitude = null;
    if (hi != null && lo != null && closes.length > 0) {
      const base = closes[0] || (hi + lo) / 2;
      amplitude = base !== 0 ? ((hi - lo) / Math.abs(base)) * 100 : null;
    }
    return { hi, lo, amplitude, days: closes.length };
  }, [arr]);

  const fxMissing = quote && quote.currency !== "CNY" && fx == null;
  const proxyLabel = metal.proxyLabel || (metal.currency === "CNY" ? "国内现货" : "国际现货");

  // ponytail 2026-07-13 投资 nav 合并 — 操作行: 加入自选 + 加入对比.
  //   自选 toggle (用现有 watchlist-store, kind=metal)
  //   对比池走 metal.compareCode (Task 9 映射到场内 ETF/LOF ticker)
  const pinned = isMetalPinned(metal.id);
  const onPinToggle = () => {
    if (pinned) removeWatchlistItem({ type: "metal", ref: metal.id });
    else addWatchlistItem({ type: "metal", ref: metal.id });
  };
  const compareEntry = metal.compareCode
    ? {
        kind: "metal",
        code: metal.compareCode,
        name: metal.compareName || metal.name,
        price: refCNY ?? null,
        changePct: quote ? changePct : null,
      }
    : null;

  return (
    <ModalShell
      open
      onClose={onClose}
      usePortal
      cardClass="metals-detail-modal"
      role="dialog"
      ariaLabel={`${metal.name} 详情`}
    >
      <div class="metals-detail-modal-header">
        <div class="metals-detail-modal-title">
          <span class="metals-detail-modal-short">{metal.shortName}</span>
          <span class="metals-detail-modal-full">{metal.name}</span>
        </div>
        <button type="button" class="metals-detail-modal-close" onClick={onClose} aria-label="关闭">×</button>
      </div>

      <div class="metals-detail-modal-body">
        {/* 操作行 (2026-07-13 投资 nav 合并): 自选 + 加入对比池 */}
        <div class="metals-detail-actions">
          <button
            type="button"
            class={`metals-detail-pin${pinned ? " is-on" : ""}`}
            onClick={onPinToggle}
            aria-pressed={pinned}
            title={pinned ? "已在自选, 点击移除" : "加入自选"}
          >
            <span class="metals-detail-pin-mark" aria-hidden="true">{pinned ? "★" : "☆"}</span>
            <span>{pinned ? "已自选" : "加入自选"}</span>
          </button>
          {compareEntry ? (
            <AddToCompareButton entry={compareEntry} variant="card" api={api} />
          ) : (
            <span class="metals-detail-nocmp" title="无对应场内 ETF">不可比</span>
          )}
        </div>

        {/* 现价 + 涨跌 */}
        <div class="metals-detail-quote">
          <div class="metals-detail-quote-left">
            <span class="metals-detail-quote-label">现价 ¥/克</span>
            <span class={`metals-detail-quote-px num ${chgClass}`}>
              {refCNY != null ? formatCNY(refCNY) : "—"}
            </span>
          </div>
          <div class={`metals-detail-quote-chg num ${chgClass}`}>
            {quote ? (
              <>
                <span class="metals-detail-chg-pct">
                  {arrow} {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                </span>
                {changePerGram != null && (
                  <span class="metals-detail-chg-amt">
                    {changePerGram >= 0 ? "+" : ""}{formatCNY(changePerGram)}/克
                  </span>
                )}
              </>
            ) : (
              <span class="metals-detail-chg-pct muted">等待行情</span>
            )}
          </div>
        </div>

        {fxMissing && (
          <div class="metals-fx-warn">汇率更新中 — 国际品种 ¥/克 暂不可用</div>
        )}

        {/* 趋势图 */}
        <div class="metals-chart-card">
          <div class="metals-chart-card-head">
            <span class="metals-chart-card-title">价格走势</span>
            <div class="metals-seg" role="tablist" aria-label="周期切换">
              {INTERVALS.map((iv) => (
                <button
                  key={iv.key}
                  role="tab"
                  aria-selected={interval === iv.key}
                  class={interval === iv.key ? "is-on" : ""}
                  onClick={() => setInterval(iv.key)}
                >
                  {iv.label}
                </button>
              ))}
            </div>
          </div>
          <div class="metals-chart-area">
            {chartPoints.length >= 2 ? (
              <MetalTrendChart points={chartPoints} />
            ) : (
              <div class="metals-chart-empty">
                {arr.length === 0 ? "历史数据加载中…" : "历史数据不足"}
              </div>
            )}
          </div>
          <div class="metals-chart-foot">
            基于 {chartPoints.length} 个数据点 · 来源: {proxyLabel}
          </div>
        </div>

        {/* 指标卡 — 历史区间 (代理数据, 自洽) */}
        <div class="metals-ind-section">
          <div class="metals-ind-section-title">区间统计 (近 {indicators.days} 日)</div>
          <div class="metals-ind-grid num">
            <div class="metals-ind">
              <div class="metals-ind-k">区间最高</div>
              <div class="metals-ind-v">{indicators.hi != null ? formatNum(indicators.hi) : "—"}</div>
            </div>
            <div class="metals-ind">
              <div class="metals-ind-k">区间最低</div>
              <div class="metals-ind-v">{indicators.lo != null ? formatNum(indicators.lo) : "—"}</div>
            </div>
            <div class="metals-ind">
              <div class="metals-ind-k">振幅</div>
              <div class="metals-ind-v">{indicators.amplitude != null ? `${indicators.amplitude.toFixed(2)}%` : "—"}</div>
            </div>
          </div>
          <div class="metals-ind-note">
            注: 历史走势来源 {proxyLabel}, 与实时 ¥/克 报价口径不同, 区间统计仅作趋势参考.
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

export default MetalDetail;
