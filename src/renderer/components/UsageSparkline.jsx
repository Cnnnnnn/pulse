/**
 * src/renderer/components/UsageSparkline.jsx
 *
 * 每日用量的 mini bar chart (sparkline).
 * - 横向 N 天 (默认 7), 纵轴 percent (0-100, normalize 到 bar 高度)
 * - 今天在最右, 视觉强调
 * - hover bar 显示 tooltip: "6/13: 已用 20%" (有 used 也显示单位)
 *
 * 纯组件, 数据从 props 传. 不依赖 store.
 *
 * 输入数据形如:
 *   { days: [{ date: "2026-06-08", percent: 20, used: 1200|null }, ...] }
 *   顺序无要求, 内部按 date 排序并补齐缺失的最近 N 天.
 *
 * V2: 主指标改 percent (0-100), used 改为可选辅助 (tooltip 显示).
 *     这样总配额 0 / 没订阅的账户也能画出 sparkline.
 */

import { useMemo, useState } from "preact/hooks";

const DEFAULT_DAYS = 7;

/**
 * @param {object} props
 * @param {{days: Array<{date: string, percent: number, used?: number|null}>}} props.history
 * @param {number} [props.days=7]  显示最近 N 天
 * @param {number} [props.height=56]  bar 区域高度
 */
export function UsageSparkline({ history, days = DEFAULT_DAYS, height = 56 }) {
  const [hoverIdx, setHoverIdx] = useState(-1);

  const data = useMemo(() => buildSeries(history && history.days ? history.days : [], days), [history, days]);

  // y 轴 0-100, 不用 normalize (percent 本身就是 0-100)
  return (
    <div class="ai-usage-sparkline">
      <div class="ai-usage-sparkline-bars" style={{ height: `${height}px` }}>
        {data.series.map((p, idx) => {
          // bar 高度按 percent (0-100) 算, percent=0 留 2px 痕迹
          const hasData = typeof p.percent === "number" && p.percent > 0;
          const barH = hasData
            ? Math.max(2, Math.round((p.percent / 100) * (height - 6)))
            : 0;
          const isToday = idx === data.series.length - 1;
          const isHover = idx === hoverIdx;
          const cls = [
            "ai-usage-sparkline-bar",
            hasData ? "ai-usage-sparkline-bar--filled" : "ai-usage-sparkline-bar--empty",
            isToday ? "ai-usage-sparkline-bar--today" : "",
            isHover ? "ai-usage-sparkline-bar--hover" : "",
          ].filter(Boolean).join(" ");
          return (
            <div
              key={p.date}
              class={cls}
              style={{ height: `${barH}px` }}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(-1)}
              title={formatTooltip(p)}
            />
          );
        })}
      </div>
      <div class="ai-usage-sparkline-x-labels">
        {data.series.map((p, idx) => {
          // 只显示第 0 / 中间 / 最后一根的标签, 避免拥挤
          const showLabel = idx === 0 || idx === data.series.length - 1 || idx === Math.floor(data.series.length / 2);
          return (
            <div key={p.date} class="ai-usage-sparkline-x-label">
              {showLabel ? p.date.slice(5) : ""}
            </div>
          );
        })}
      </div>
      {hoverIdx >= 0 && data.series[hoverIdx] && (
        <div class="ai-usage-sparkline-tooltip">
          {formatTooltip(data.series[hoverIdx])}
        </div>
      )}
    </div>
  );
}

function formatTooltip(p) {
  const dateLabel = formatDateLabel(p.date);
  if (typeof p.percent !== "number" || p.percent === 0) {
    return `${dateLabel}: 无数据`;
  }
  if (typeof p.used === "number" && p.used > 0) {
    return `${dateLabel}: 已用 ${p.percent}% (${p.used.toLocaleString()} 单位)`;
  }
  return `${dateLabel}: 已用 ${p.percent}%`;
}

/**
 * 纯函数 (测试用): 输入 raw days 数组 + N → 排好序的 series.
 * - 内部去重: 同 date 取 max percent
 * - 末尾不足 N 天补空 entry, 让"今天"永远在最右
 * - 多了的截前 N 条
 */
function buildSeries(rawDays, n) {
  if (!Array.isArray(rawDays) || rawDays.length === 0) {
    return buildAllEmpty(n);
  }
  // 1) 同 date 取 max percent, used 取 max
  const map = new Map();
  for (const d of rawDays) {
    if (!d || typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
    const prev = map.get(d.date);
    const percent = typeof d.percent === "number" ? d.percent : 0;
    const used = typeof d.used === "number" ? d.used : null;
    if (!prev || percent > prev.percent) {
      map.set(d.date, {
        date: d.date,
        percent,
        used: prev && used == null ? prev.used : used,
      });
    } else if (prev.used == null && used != null) {
      prev.used = used;
    }
  }
  // 2) 按 date 升序
  const sorted = [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  // 3) 截尾, 取最近 n 条
  let series = sorted.slice(-n);
  // 4) 末尾日期补齐到 "今天"
  const today = todayKey();
  const lastDate = series.length > 0 ? series[series.length - 1].date : today;
  let cursor = lastDate;
  while (cursor < today && series.length < n) {
    cursor = addDays(cursor, 1);
    series.push({ date: cursor, percent: 0, used: null });
  }
  // 5) 头部补齐 (如果 series < n, 往前补空)
  while (series.length < n) {
    const first = series[0].date;
    const prev = addDays(first, -1);
    series.unshift({ date: prev, percent: 0, used: null });
  }
  return { series };
}

function buildAllEmpty(n) {
  const series = [];
  for (let i = n - 1; i >= 0; i--) {
    series.push({ date: addDays(todayKey(), -i), used: 0, percent: null });
  }
  return { series };
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(yyyyMmDd, deltaDays) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function formatDateLabel(yyyyMmDd) {
  // "2026-06-13" → "6/13"
  const [, m, d] = yyyyMmDd.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}
