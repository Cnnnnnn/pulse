/**
 * src/renderer/components/NewCarReleaseCalendar.jsx
 *
 * 日历 / 时间轴视图 (P0):
 *   - 月历网格: 每格显示"当日发布数"圆点, 点击有发布的日期 → 下钻到该日列表 (onSelectDate)
 *   - 纵向时间轴: 按月分区, 每月列出当日发布 (onClick 可开详情)
 *   - 顶部按月 sparkline (复用 UsageSparkline)
 *
 * 仅引用现有设计令牌, 无裸 hex.
 */

import { useMemo, useState } from 'preact/hooks';
import { groupByMonth, groupByDate } from '../../newcar/aggregate.js';
import { STATUS_TOKEN, RELEASE_STATUSES } from '../../newcar/types.js';
import { UsageSparkline } from './UsageSparkline.jsx';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/**
 * 构造某月的日历网格 (周一为一周起点). 返回长度为 7 倍数的数组, null = 占位.
 * @returns {Array<{day:number, key:string, count:number, records:Array}|null>}
 */
function buildMonthGrid(year, monthIndex, byDate) {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startDay = (first.getDay() + 6) % 7; // 周一=0
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const recs = byDate.get(key) || [];
    cells.push({ day: d, key, count: recs.length, records: recs });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * @param {object} props
 * @param {import('../../newcar/types.js').ReleaseRecord[]} props.releases
 * @param {(date: string) => void} props.onSelectDate
 * @param {(r: import('../../newcar/types.js').ReleaseRecord) => void} props.onOpen
 */
export function NewCarReleaseCalendar({ releases, onSelectDate, onOpen }) {
  const byDate = useMemo(() => groupByDate(releases), [releases]);
  const monthMap = useMemo(() => groupByMonth(releases), [releases]);
  const months = useMemo(() => [...monthMap.keys()].sort(), [monthMap]);

  const today = new Date();
  const [cursor, setCursor] = useState(() => {
    const ym = today.toISOString().slice(0, 7);
    return months.includes(ym) ? ym : months[0] || ym;
  });

  const [year, month] = cursor.split('-').map(Number);
  const grid = useMemo(
    () => buildMonthGrid(year, month - 1, byDate),
    [year, month, byDate],
  );

  const monthLabel = `${year} 年 ${month} 月`;

  const goPrev = () => {
    const d = new Date(year, month - 2, 1);
    setCursor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const goNext = () => {
    const d = new Date(year, month, 1);
    setCursor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // 按月 sparkline: 每个月一个点, percent = 该月数量归一化
  const spark = useMemo(() => {
    const max = Math.max(1, ...months.map((m) => (monthMap.get(m) || []).length));
    return {
      days: months.map((m) => ({
        date: `${m}-01`,
        percent: Math.round(((monthMap.get(m) || []).length / max) * 100),
        used: null,
      })),
    };
  }, [months, monthMap]);

  return (
    <div class="newcar-calendar">
      <div class="newcar-spark-wrap">
        <div class="newcar-spark-title">全年发布节奏（按月）</div>
        <UsageSparkline history={spark} days={Math.max(7, spark.days.length)} />
      </div>

      {/* 月历网格 */}
      <div class="newcar-cal-card">
        <div class="newcar-cal-head">
          <button type="button" class="newcar-cal-nav" onClick={goPrev} aria-label="上个月">
            ‹
          </button>
          <div class="newcar-cal-title">{monthLabel}</div>
          <button type="button" class="newcar-cal-nav" onClick={goNext} aria-label="下个月">
            ›
          </button>
        </div>
        <div class="newcar-cal-dow">
          {WEEK_LABELS.map((w) => (
            <span class="newcar-cal-dow-cell" key={w}>
              {w}
            </span>
          ))}
        </div>
        <div class="newcar-cal-grid">
          {grid.map((cell, idx) => {
            if (!cell) return <span class="newcar-cal-cell newcar-cal-cell--empty" key={`e${idx}`} />;
            const has = cell.count > 0;
            return (
              <button
                type="button"
                key={cell.key}
                class={`newcar-cal-cell${has ? ' is-has' : ''}`}
                disabled={!has}
                onClick={() => has && onSelectDate(cell.key)}
                title={has ? `${cell.key} · ${cell.count} 款发布` : cell.key}
              >
                <span class="newcar-cal-day">{cell.day}</span>
                {has && <span class="newcar-cal-count">{cell.count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 纵向时间轴 (按月分区) */}
      <div class="newcar-timeline">
        {months.map((m) => {
          const recs = monthMap.get(m) || [];
          return (
            <section class="newcar-tl-month" key={m}>
              <header class="newcar-tl-head">
                <span class="newcar-tl-month">{m.replace('-', ' 年')} 月</span>
                <span class="newcar-tl-count">{recs.length} 款</span>
              </header>
              <ul class="newcar-tl-list">
                {recs
                  .slice()
                  .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
                  .map((r) => (
                    <li
                      key={r.id}
                      class="newcar-tl-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpen && onOpen(r)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpen && onOpen(r);
                        }
                      }}
                    >
                      <span class="newcar-tl-dot" style={{ background: STATUS_TOKEN[r.status] }} />
                      <span class="newcar-tl-date">{r.releaseDate.slice(5)}</span>
                      <span class="newcar-tl-name">{r.name}</span>
                      <span class="newcar-tl-energy">{r.energyType}</span>
                    </li>
                  ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default NewCarReleaseCalendar;
