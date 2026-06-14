/**
 * src/renderer/components/UsageSparkline.jsx
 *
 * 每日用量的 mini bar chart (sparkline).
 * - 横向 N 天 (默认 7), 纵轴 used (最大值 normalize 到 bar 高度)
 * - 今天在最右, 视觉强调
 * - hover bar 显示 tooltip: "6/13: 1,200 单位 (20%)"
 *
 * 纯组件, 数据从 props 传. 不依赖 store.
 *
 * 输入数据形如:
 *   { days: [{ date: "2026-06-08", used: 1200, percent: 20 }, ...] }
 *   顺序无要求, 内部按 date 排序并补齐缺失的最近 N 天.
 */

import { useMemo, useState } from "preact/hooks";

const DEFAULT_DAYS = 7;
const BAR_GAP = 4;

/**
 * @param {object} props
 * @param {{days: Array<{date: string, used: number, percent?: number|null}>}} props.history
 * @param {number} [props.days=7]  显示最近 N 天
 * @param {number} [props.height=60]  bar 区域高度
 * @param {string} [props.emptyText]  无数据时显示
 */
export function UsageSparkline({ history, days = DEFAULT_DAYS, height = 60, emptyText = "暂无历史" }) {
  const [hoverIdx, setHoverIdx] = useState(-1);

  const data = useMemo(() => buildSeries(history && history.days ? history.days : [], days), [history, days]);

  if (data.series.length === 0) {
    return <div class="ai-usage-sparkline ai-usage-sparkline--empty">{emptyText}</div>;
  }

  // 用 yMax 归一化; 至少 1 避免空 bar
  const yMax = Math.max(1, ...data.series.map((p) => p.used || 0));

  return (
    <div class="ai-usage-sparkline">
      <div class="ai-usage-sparkline-bars" style={{ height: `${height}px` }}>
        {data.series.map((p, idx) => {
          const barH = p.used > 0 ? Math.max(2, Math.round((p.used / yMax) * (height - 6))) : 0;
          const isToday = idx === data.series.length - 1;
          const isHover = idx === hoverIdx;
          const cls = [
            "ai-usage-sparkline-bar",
            p.used > 0 ? "ai-usage-sparkline-bar--filled" : "ai-usage-sparkline-bar--empty",
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
              title={p.used > 0
                ? `${formatDateLabel(p.date)}: ${p.used.toLocaleString()} 单位${p.percent != null ? ` (${p.percent}%)` : ""}`
                : `${formatDateLabel(p.date)}: 无数据`}
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
          {data.series[hoverIdx].used > 0
            ? `${formatDateLabel(data.series[hoverIdx].date)}: ${data.series[hoverIdx].used.toLocaleString()} 单位${data.series[hoverIdx].percent != null ? ` (${data.series[hoverIdx].percent}%)` : ""}`
            : `${formatDateLabel(data.series[hoverIdx].date)}: 无数据`}
        </div>
      )}
    </div>
  );
}

/**
 * 纯函数 (测试用): 输入 raw days 数组 + N → 排好序的 series.
 * - 内部去重 (同 date 取最大 used)
 * - 末尾不足 N 天补空 entry (date 接续前一天的 +1 天), 让"今天"永远在最右
 * - 多了的截前 N 条
 */
function buildSeries(rawDays, n) {
  if (!Array.isArray(rawDays) || rawDays.length === 0) {
    return buildAllEmpty(n);
  }
  // 1) 同 date 取 max used, percent 取 max
  const map = new Map();
  for (const d of rawDays) {
    if (!d || typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
    const prev = map.get(d.date);
    const used = typeof d.used === "number" ? d.used : 0;
    const percent = typeof d.percent === "number" ? d.percent : null;
    if (!prev || used > prev.used) {
      map.set(d.date, {
        date: d.date,
        used,
        percent: prev && percent == null ? prev.percent : percent,
      });
    } else if (prev.percent == null && percent != null) {
      prev.percent = percent;
    }
  }
  // 2) 按 date 升序
  const sorted = [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  // 3) 截尾, 取最近 n 条 (从末尾倒推)
  let series = sorted.slice(-n);
  // 4) 末尾日期补齐到 "今天"
  const lastDate = series.length > 0 ? series[series.length - 1].date : todayKey();
  // 末尾补到 today
  const today = todayKey();
  let cursor = lastDate;
  while (cursor < today && series.length < n) {
    cursor = addDays(cursor, 1);
    series.push({ date: cursor, used: 0, percent: null });
  }
  // 5) 头部补齐 (如果 series < n, 往前补空)
  while (series.length < n) {
    const first = series[0].date;
    const prev = addDays(first, -1);
    series.unshift({ date: prev, used: 0, percent: null });
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
