/**
 * src/renderer/components/UsageTrendChart.jsx
 *
 * 用量趋势图 — 单一可复用 Preact 组件（规范见 docs/usage-trend-chart-spec.md）。
 *
 * 设计令牌: 全部引用 styles.css 全局令牌（浅色毛玻璃默认 / 深色次级）。
 *   - 序列「总用量」用 --app-minimax-code（MiniMax 琥珀）= AI Coding 用量特性色
 *   - 全局 chrome（选区/焦点/激活）走 --accent-primary（Apple 系统蓝）
 *   - 可选叠加序列: input(--accent-blue) / output(--accent-green) / lastWeek(--accent-gray)
 *
 * 数据: 消费 SeriesPoint[]（由 useUsageSeries 从 dailyTokenUsage 适配而来）。
 * 交互: 面积/折线切换 · 序列开关 · 区间刷选缩放(minimap) · 十字游标 + tooltip ·
 *       键盘 ←/→/Home/End/Enter · 加载/空/错误态 · 隐藏数据表(a11y) ·
 *       prefers-reduced-motion 友好。
 *
 * 纯 SVG（无图表库依赖），viewBox 跟随容器宽度，渲染 1:1 不失真。
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { useBrushRange } from "../hooks/useBrushRange.js";

// ─── 工具 ────────────────────────────────────────────────────

/** 大数 → 紧凑格式: 1234 → "1.2K" / 12345678 → "12.3M" / 1234567890 → "1.2B". */
function formatCompact(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 2 : 1)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
  return `${(n / 1_000_000_000).toFixed(n < 10_000_000_000 ? 2 : 1)}B`;
}

/** 轴最大值向上取整到「好看」的数（1/2/5 × 10^n）。 */
function niceMax(v) {
  if (!Number.isFinite(v) || v <= 0) return 10;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * 把可见序列点（{v} 数组，按 x 等距）构建成 SVG path。
 * @param {number[]} vals 已按 x 顺序的值
 * @param {(i:number)=>number} xAt 第 i 个点 x 坐标
 * @param {(v:number)=>number} yAt 值 → y 坐标
 * @param {boolean} close 是否闭合到 plotBottom（面积）
 * @param {number} plotBottom
 */
function buildLinePath(vals, xAt, yAt) {
  if (vals.length === 0) return "";
  let d = "";
  for (let i = 0; i < vals.length; i++) {
    d += `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(vals[i]).toFixed(2)} `;
  }
  return d.trim();
}

function buildAreaPath(vals, xAt, yAt, plotBottom) {
  if (vals.length === 0) return "";
  const line = buildLinePath(vals, xAt, yAt);
  const x0 = xAt(0).toFixed(2);
  const xN = xAt(vals.length - 1).toFixed(2);
  return `${line} L ${xN} ${plotBottom} L ${x0} ${plotBottom} Z`;
}

// ─── 主组件 ──────────────────────────────────────────────────

/**
 * @param {Object} props
 * @param {Array<{date:string,total:number,lastWeek?:number|null,input?:number,output?:number}>} props.data
 * @param {"day"|"week"|"month"} [props.period]
 * @param {boolean} [props.loading]
 * @param {boolean} [props.error]
 * @param {Partial<Record<"total"|"input"|"output"|"lastWeek", boolean>>} [props.visibleSeries]
 * @param {number} [props.target]
 * @param {"area"|"line"} [props.mode]
 * @param {(range:[number,number])=>void} [props.onBrush]
 * @param {(p:any|null)=>void} [props.onFocusPoint]
 * @param {()=>void} [props.onRetry]
 * @param {()=>void} [props.onReset]
 * @param {number} [props.height]
 * @param {string} [props.title]
 */
export function UsageTrendChart(props) {
  const {
    data = [],
    loading = false,
    error = false,
    visibleSeries: visibleSeriesProp,
    target,
    mode: modeProp = "area",
    onBrush,
    onFocusPoint,
    onRetry,
    onReset,
    height = 320,
    title = "用量趋势",
  } = props;

  const uid = useId().replace(/:/g, "");
  const length = data.length;

  // 容器宽度测量 → viewBox 1:1，避免非均匀缩放导致描边变形
  const containerRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const svgRef = useRef(/** @type {SVGSVGElement|null} */ (null));
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0] && entries[0].contentRect.width;
      if (w && w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 序列开关（total 默认开）
  const [visible, setVisible] = useState(
    visibleSeriesProp || { total: true }
  );
  useEffect(() => {
    if (visibleSeriesProp) setVisible(visibleSeriesProp);
  }, [visibleSeriesProp]);

  const [mode, setMode] = useState(modeProp);
  useEffect(() => setMode(modeProp), [modeProp]);

  const { range, setBrush, reset, visible: visRange } = useBrushRange(length);
  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);
  const [hoverIdx, setHoverIdx] = useState(/** @type {number|null} */ (null));
  const [cursorLocked, setCursorLocked] = useState(false);
  const dragRef = useRef(/** @type {null|{mode:"start"|"end"|"move", startX:number, orig:[number,number]}} */ (null));

  // 几何
  const H = height;
  const plotLeft = 44;
  const plotRight = Math.max(plotLeft + 40, width - 16);
  const plotTop = 16;
  const plotBottom = H - 64;
  const minimapTop = H - 40;
  const minimapBottom = H - 12;
  const xAxisLabelY = H - 52;

  // 可见切片
  const slice = useMemo(() => {
    const [s, e] = visRange;
    return data.slice(s, e + 1);
  }, [data, visRange]);
  const visN = slice.length;

  // 最大值 / 基线
  const maxVal = useMemo(() => {
    let m = 0;
    for (const p of slice) if (typeof p.total === "number" && p.total > m) m = p.total;
    if (typeof target === "number" && target > m) m = target;
    return niceMax(m || 10);
  }, [slice, target]);

  const baseline = useMemo(() => {
    if (visN === 0) return 0;
    let s = 0;
    for (const p of slice) s += typeof p.total === "number" ? p.total : 0;
    return s / visN;
  }, [slice, visN]);

  // 坐标换算（可见局部索引 j → 全局 index = visRange[0] + j）
  const xAt = useCallback(
    (j) => (visN <= 1 ? plotLeft : plotLeft + (j / (visN - 1)) * (plotRight - plotLeft)),
    [visN, plotLeft, plotRight]
  );
  const yAt = useCallback(
    (v) => plotBottom - (maxVal > 0 ? v / maxVal : 0) * (plotBottom - plotTop),
    [maxVal, plotBottom, plotTop]
  );

  // 把客户端 X → 序列全局索引
  const clientToIndex = useCallback(
    (clientX) => {
      const svg = svgRef.current;
      if (!svg || length <= 1) return 0;
      const rect = svg.getBoundingClientRect();
      const svgX = (clientX - rect.left) * (width / rect.width);
      const ratio = (svgX - plotLeft) / (plotRight - plotLeft);
      return Math.max(0, Math.min(length - 1, Math.round(ratio * (length - 1))));
    },
    [length, plotLeft, plotRight, width]
  );

  // 十字游标 / 聚焦回调
  const setHover = useCallback(
    (idx) => {
      setHoverIdx(idx);
      if (typeof onFocusPoint === "function") {
        onFocusPoint(idx != null ? data[idx] || null : null);
      }
    },
    [data, onFocusPoint]
  );

  const handlePlotMove = (e) => {
    if (dragRef.current) return; // 拖拽刷选时不动游标
    setHover(clientToIndex(e.clientX));
  };
  const handlePlotLeave = () => {
    if (!cursorLocked) setHover(null);
  };

  // 键盘导航
  const handleKeyDown = (e) => {
    if (length <= 0) return;
    const [s, en] = visRange;
    const cur = hoverIdx == null ? s : hoverIdx;
    let next = cur;
    if (e.key === "ArrowRight") next = Math.min(en, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(s, cur - 1);
    else if (e.key === "Home") next = s;
    else if (e.key === "End") next = en;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCursorLocked((v) => !v);
      return;
    } else return;
    e.preventDefault();
    setHover(next);
  };

  // minimap 刷选
  const onHandleDown = (e, handle) => {
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (svg && e.pointerId != null && svg.setPointerCapture) {
      // ponytail: setPointerCapture 在某些浏览器对 SVG 元素不抛即可忽略
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* noop: setPointerCapture 兼容性 */ }
    }
    dragRef.current = {
      mode: handle,
      startX: e.clientX,
      orig: range || [visRange[0], visRange[1]],
    };
  };
  const onSvgPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const idx = clientToIndex(e.clientX);
    if (drag.mode === "move") {
      const [os, oe] = drag.orig;
      const delta = idx - Math.round((os + oe) / 2);
      setBrush(os + delta, oe + delta);
    } else if (drag.mode === "start") {
      setBrush(idx, drag.orig[1]);
    } else if (drag.mode === "end") {
      setBrush(drag.orig[0], idx);
    }
  };
  const onSvgPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      if (typeof onBrush === "function" && rangeRef.current) onBrush(rangeRef.current);
    }
  };

  const doReset = () => {
    reset();
    if (typeof onBrush === "function") onBrush([0, Math.max(0, length - 1)]);
  };

  // ── 状态分支 ──
  const status = error ? "error" : loading ? "loading" : length === 0 ? "empty" : "ready";

  // 系列路径
  const totalPath = useMemo(
    () => (visible.total ? buildLinePath(slice.map((p) => p.total || 0), xAt, yAt) : ""),
    [visible.total, slice, xAt, yAt]
  );
  const totalArea = useMemo(
    () => (visible.total && mode === "area" ? buildAreaPath(slice.map((p) => p.total || 0), xAt, yAt, plotBottom) : ""),
    [visible.total, mode, slice, xAt, yAt, plotBottom]
  );
  const inputPath = useMemo(
    () => (visible.input ? buildLinePath(slice.map((p) => p.input || 0), xAt, yAt) : ""),
    [visible.input, slice, xAt, yAt]
  );
  const outputPath = useMemo(
    () => (visible.output ? buildLinePath(slice.map((p) => p.output || 0), xAt, yAt) : ""),
    [visible.output, slice, xAt, yAt]
  );
  const lastWeekPath = useMemo(
    () => (visible.lastWeek ? buildLinePath(slice.map((p) => (p.lastWeek != null ? p.lastWeek : 0)), xAt, yAt) : ""),
    [visible.lastWeek, slice, xAt, yAt]
  );

  const hasInput = slice.some((p) => typeof p.input === "number");
  const hasOutput = slice.some((p) => typeof p.output === "number");
  const hasLastWeek = slice.some((p) => p.lastWeek != null);

  // 游标位置（可见局部）
  const hoverLocal = hoverIdx == null ? null : hoverIdx - visRange[0];
  const hoverX = hoverLocal != null && hoverLocal >= 0 && hoverLocal < visN ? xAt(hoverLocal) : null;
  const hoverPoint = hoverIdx != null ? data[hoverIdx] : null;

  // tooltip 水平定位（百分比 + 翻转防溢出）
  const tipLeftPct = hoverX != null ? (hoverX / width) * 100 : 50;
  const tipFlip = hoverLocal != null && hoverLocal < visN * 0.15
    ? "start"
    : hoverLocal != null && hoverLocal > visN * 0.85
    ? "end"
    : "mid";

  const gradId = `utc-grad-${uid}`;
  const statusMsg =
    status === "loading" ? "趋势图加载中" : status === "empty" ? "暂无用量数据" : status === "error" ? "用量数据加载失败" : "";

  return (
    <div class="usage-trend" ref={containerRef} data-status={status}>
      {/* 头部：标题 + 序列开关 + 模式 + 重置 */}
      <div class="usage-trend__head">
        <span class="usage-trend__title">{title}</span>
        <div class="usage-trend__controls">
          {hasLastWeek && (
            <button
              type="button"
              class={`usage-trend__chip${visible.lastWeek ? " is-on" : ""}`}
              aria-pressed={!!visible.lastWeek}
              onClick={() => setVisible((v) => ({ ...v, lastWeek: !v.lastWeek }))}
              style={{ "--chip": "var(--chart-series-lastweek)" }}
            >
              上周同期
            </button>
          )}
          {hasInput && (
            <button
              type="button"
              class={`usage-trend__chip${visible.input ? " is-on" : ""}`}
              aria-pressed={!!visible.input}
              onClick={() => setVisible((v) => ({ ...v, input: !v.input }))}
              style={{ "--chip": "var(--chart-series-input)" }}
            >
              输入
            </button>
          )}
          {hasOutput && (
            <button
              type="button"
              class={`usage-trend__chip${visible.output ? " is-on" : ""}`}
              aria-pressed={!!visible.output}
              onClick={() => setVisible((v) => ({ ...v, output: !v.output }))}
              style={{ "--chip": "var(--chart-series-output)" }}
            >
              输出
            </button>
          )}
          <button
            type="button"
            class="usage-trend__mode"
            aria-label="切换面积图/折线图"
            onClick={() => setMode((m) => (m === "area" ? "line" : "area"))}
          >
            {mode === "area" ? "面积" : "折线"}
          </button>
          {range && (
            <button type="button" class="usage-trend__reset" onClick={doReset}>
              重置缩放
            </button>
          )}
        </div>
      </div>

      {/* 状态播报（屏幕阅读器） */}
      <div class="sr-only" aria-live="polite">{statusMsg}</div>

      {/* 加载骨架 */}
      {status === "loading" && (
        <div class="usage-trend__skeleton" style={{ height: `${H}px` }} aria-hidden="true">
          {[0.55, 0.72, 0.4, 0.85, 0.62].map((h, i) => (
            <span class="usage-trend__skeleton-bar" style={{ height: `${h * 60}%`, animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
      )}

      {/* 空态 */}
      {status === "empty" && (
        <div class="usage-trend__state" style={{ height: `${H}px` }}>
          <svg viewBox="0 0 64 64" class="usage-trend__state-icon" aria-hidden="true">
            <path d="M10 46 L24 30 L36 40 L54 20" fill="none" stroke="var(--chart-series-total)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="54" cy="20" r="3.5" fill="var(--chart-series-total)" />
          </svg>
          <p class="usage-trend__state-text">近 90 天还没有用量记录</p>
          {typeof onReset === "function" && (
            <button type="button" class="usage-trend__state-btn" onClick={onReset}>重新加载</button>
          )}
        </div>
      )}

      {/* 错误态 */}
      {status === "error" && (
        <div class="usage-trend__state" style={{ height: `${H}px` }}>
          <svg viewBox="0 0 64 64" class="usage-trend__state-icon" aria-hidden="true">
            <circle cx="32" cy="32" r="22" fill="none" stroke="var(--accent-red)" stroke-width="3" />
            <path d="M32 20v14M32 42v.5" stroke="var(--accent-red)" stroke-width="3" stroke-linecap="round" />
          </svg>
          <p class="usage-trend__state-text">用量数据加载失败</p>
          {typeof onRetry === "function" && (
            <button type="button" class="usage-trend__state-btn" onClick={onRetry}>重试</button>
          )}
        </div>
      )}

      {/* 主图 */}
      {status === "ready" && (
        <div class="usage-trend__plot-wrap">
          <svg
            ref={svgRef}
            class="usage-trend__svg"
            viewBox={`0 0 ${width} ${H}`}
            role="img"
            aria-label={`${title}：近 ${length} 天 AI Coding 用量趋势`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onMouseMove={handlePlotMove}
            onMouseLeave={handlePlotLeave}
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--chart-series-total)" stop-opacity="0.28" />
                <stop offset="100%" stop-color="var(--chart-series-total)" stop-opacity="0" />
              </linearGradient>
            </defs>

            {/* 网格 + Y 轴标签 */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = plotTop + t * (plotBottom - plotTop);
              const val = maxVal * (1 - t);
              return (
                <g key={t}>
                  <line x1={plotLeft} y1={y} x2={plotRight} y2={y} class="usage-trend__grid" />
                  <text x={plotLeft - 8} y={y + 4} class="usage-trend__ylabel">{formatCompact(val)}</text>
                </g>
              );
            })}

            {/* 面积（总用量） */}
            {totalArea && <path d={totalArea} fill={`url(#${gradId})`} class="usage-trend__area" />}

            {/* 可选叠加序列 */}
            {lastWeekPath && <path d={lastWeekPath} class="usage-trend__line-lastweek" />}
            {inputPath && <path d={inputPath} class="usage-trend__line-input" />}
            {outputPath && <path d={outputPath} class="usage-trend__line-output" />}

            {/* 总用量主线（特性色） */}
            {totalPath && <path d={totalPath} class="usage-trend__line-total" />}

            {/* 均值基准线 */}
            <line
              x1={plotLeft}
              y1={yAt(baseline)}
              x2={plotRight}
              y2={yAt(baseline)}
              class="usage-trend__baseline"
            />
            <text x={plotRight} y={yAt(baseline) - 6} class="usage-trend__baseline-label">
              均值 {formatCompact(baseline)}
            </text>

            {/* 目标线 */}
            {typeof target === "number" && (
              <>
                <line x1={plotLeft} y1={yAt(target)} x2={plotRight} y2={yAt(target)} class="usage-trend__target" />
                <text x={plotRight} y={yAt(target) - 6} class="usage-trend__target-label">
                  目标 {formatCompact(target)}
                </text>
              </>
            )}

            {/* X 轴标签（最多 ~6 个） */}
            {visN > 1 &&
              Array.from({ length: Math.min(6, visN) }).map((_, k) => {
                const j = Math.round((k / (Math.min(6, visN) - 1)) * (visN - 1));
                const p = slice[j];
                return (
                  <text key={k} x={xAt(j)} y={xAxisLabelY} class="usage-trend__xlabel">
                    {p ? p.date.slice(5) : ""}
                  </text>
                );
              })}

            {/* 十字游标 */}
            {hoverX != null && (
              <g class="usage-trend__cursor">
                <line x1={hoverX} y1={plotTop} x2={hoverX} y2={plotBottom} class="usage-trend__cursor-line" />
                {visible.total && (
                  <circle cx={hoverX} cy={yAt(hoverPoint?.total || 0)} r="3.5" class="usage-trend__cursor-dot usage-trend__cursor-dot--total" />
                )}
                {visible.lastWeek && hoverPoint?.lastWeek != null && (
                  <circle cx={hoverX} cy={yAt(hoverPoint.lastWeek)} r="3" class="usage-trend__cursor-dot usage-trend__cursor-dot--lastweek" />
                )}
                {visible.input && hoverPoint?.input != null && (
                  <circle cx={hoverX} cy={yAt(hoverPoint.input)} r="3" class="usage-trend__cursor-dot usage-trend__cursor-dot--input" />
                )}
                {visible.output && hoverPoint?.output != null && (
                  <circle cx={hoverX} cy={yAt(hoverPoint.output)} r="3" class="usage-trend__cursor-dot usage-trend__cursor-dot--output" />
                )}
              </g>
            )}

            {/* 透明捕获层（触发热区） */}
            <rect
              x={plotLeft}
              y={plotTop}
              width={Math.max(0, plotRight - plotLeft)}
              height={Math.max(0, plotBottom - plotTop)}
              fill="transparent"
              style={{ cursor: "crosshair" }}
            />

            {/* minimap：全量缩略 + 刷选窗 */}
            <g class="usage-trend__minimap">
              <rect x={plotLeft} y={minimapTop} width={Math.max(0, plotRight - plotLeft)} height={minimapBottom - minimapTop} class="usage-trend__minimap-track" />
              {/* 全量面积缩略 */}
              {(() => {
                if (length === 0) return null;
                const mmX = (i) => plotLeft + (length <= 1 ? 0 : (i / (length - 1)) * (plotRight - plotLeft));
                const mmMax = niceMax(Math.max(...data.map((p) => p.total || 0), 1));
                const mmY = (v) => minimapBottom - (v / mmMax) * (minimapBottom - minimapTop);
                let d = `M ${mmX(0)} ${minimapBottom}`;
                for (let i = 0; i < length; i++) d += ` L ${mmX(i).toFixed(2)} ${mmY(data[i].total || 0).toFixed(2)}`;
                d += ` L ${mmX(length - 1)} ${minimapBottom} Z`;
                const mmGrad = `utc-mm-${uid}`;
                return (
                  <>
                    <defs>
                      <linearGradient id={mmGrad} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--chart-series-total)" stop-opacity="0.35" />
                        <stop offset="100%" stop-color="var(--chart-series-total)" stop-opacity="0.02" />
                      </linearGradient>
                    </defs>
                    <path d={d} fill={`url(#${mmGrad})`} />
                  </>
                );
              })()}
              {/* 刷选窗 */}
              {range && (() => {
                const [s, e] = range;
                const x0 = plotLeft + (s / Math.max(1, length - 1)) * (plotRight - plotLeft);
                const x1 = plotLeft + (e / Math.max(1, length - 1)) * (plotRight - plotLeft);
                return (
                  <>
                    <rect x={x0} y={minimapTop} width={Math.max(2, x1 - x0)} height={minimapBottom - minimapTop} class="usage-trend__brush" />
                    <rect x={x0 - 4} y={minimapTop} width="8" height={minimapBottom - minimapTop} class="usage-trend__brush-handle" onPointerDown={(e) => onHandleDown(e, "start")} />
                    <rect x={x1 - 4} y={minimapTop} width="8" height={minimapBottom - minimapTop} class="usage-trend__brush-handle" onPointerDown={(e) => onHandleDown(e, "end")} />
                  </>
                );
              })()}
            </g>
          </svg>

          {/* tooltip（HTML，便于文字渲染与令牌） */}
          {hoverX != null && hoverPoint && (
            <div
              class={`usage-trend__tooltip usage-trend__tooltip--${tipFlip}`}
              style={{ left: `${tipLeftPct}%` }}
              role="status"
            >
              <div class="usage-trend__tooltip-date">{hoverPoint.date}</div>
              <div class="usage-trend__tooltip-row">
                <span class="usage-trend__tooltip-key"><i style={{ background: "var(--chart-series-total)" }} />总用量</span>
                <span class="usage-trend__tooltip-val">{formatCompact(hoverPoint.total || 0)}</span>
              </div>
              {hoverPoint.lastWeek != null && (
                <div class="usage-trend__tooltip-row">
                  <span class="usage-trend__tooltip-key"><i style={{ background: "var(--chart-series-lastweek)" }} />上周同期</span>
                  <span class="usage-trend__tooltip-val">{formatCompact(hoverPoint.lastWeek)}</span>
                </div>
              )}
              {typeof hoverPoint.input === "number" && (
                <div class="usage-trend__tooltip-row">
                  <span class="usage-trend__tooltip-key"><i style={{ background: "var(--chart-series-input)" }} />输入</span>
                  <span class="usage-trend__tooltip-val">{formatCompact(hoverPoint.input)}</span>
                </div>
              )}
              {typeof hoverPoint.output === "number" && (
                <div class="usage-trend__tooltip-row">
                  <span class="usage-trend__tooltip-key"><i style={{ background: "var(--chart-series-output)" }} />输出</span>
                  <span class="usage-trend__tooltip-val">{formatCompact(hoverPoint.output)}</span>
                </div>
              )}
            </div>
          )}

          {/* 隐藏数据表（屏幕阅读器 + 可访问性） */}
          <table class="sr-only">
            <caption>{title}：每日用量明细</caption>
            <thead>
              <tr>
                <th>日期</th>
                <th>总用量</th>
                {hasLastWeek && <th>上周同期</th>}
                {hasInput && <th>输入</th>}
                {hasOutput && <th>输出</th>}
              </tr>
            </thead>
            <tbody>
              {slice.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>{p.total}</td>
                  {hasLastWeek && <td>{p.lastWeek != null ? p.lastWeek : "—"}</td>}
                  {hasInput && <td>{typeof p.input === "number" ? p.input : "—"}</td>}
                  {hasOutput && <td>{typeof p.output === "number" ? p.output : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default UsageTrendChart;
