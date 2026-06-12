/**
 * src/funds/trading-hours.js
 *
 * A 股基金交易时段判定 — 纯函数, 无副作用, 全可测.
 *
 * 交易时段规则:
 *   - 工作日 (周一 - 周五) 上午 09:30 - 11:30, 下午 13:00 - 15:00
 *   - 周末 / 法定节假日 不开市 (节假日识别 backlog, v1 按周末判定)
 *
 * v1.0 (2026-06-12) — 初版
 */

/**
 * 判定给定 Date 是否处于 A 股基金交易时段.
 *
 * @param {Date} now  本地时间 (默认行为跟用户预期一致)
 * @param {Date[]} [holidays]  节假日列表 (可选, MVP 不传则按周末判定)
 * @returns {{
 *   isTrading: boolean,    // 当前是否在交易时段
 *   session: 'morning' | 'afternoon' | 'closed',
 *   nextOpenAt: Date | null,  // 当前不在交易时段时, 下次开盘时间 (null = 已收当周)
 * }}
 */
function getTradingStatus(now, holidays = []) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return { isTrading: false, session: 'closed', nextOpenAt: null };
  }

  // 用 Asia/Shanghai 显式拿 hour/day/minute (不受 process.env.TZ 影响)
  const parts = shanghaiParts(now);

  // 节假日优先判定
  if (holidays.some((h) => h instanceof Date && ymdShanghai(h) === parts.ymd)) {
    return { isTrading: false, session: 'closed', nextOpenAt: nextWeekdayOpen(now, holidays) };
  }

  const day = parts.day; // 0=Sun, 6=Sat (Asia/Shanghai)
  if (day === 0 || day === 6) {
    return { isTrading: false, session: 'closed', nextOpenAt: nextWeekdayOpen(now, holidays) };
  }

  const minutes = parts.hour * 60 + parts.minute;
  const MORNING_START = 9 * 60 + 30;   // 09:30
  const MORNING_END = 11 * 60 + 30;    // 11:30
  const AFTERNOON_START = 13 * 60;     // 13:00
  const AFTERNOON_END = 15 * 60;       // 15:00

  if (minutes >= MORNING_START && minutes < MORNING_END) {
    return { isTrading: true, session: 'morning', nextOpenAt: null };
  }
  if (minutes >= AFTERNOON_START && minutes < AFTERNOON_END) {
    return { isTrading: true, session: 'afternoon', nextOpenAt: null };
  }

  return { isTrading: false, session: 'closed', nextOpenAt: nextOpenAfter(now, holidays) };
}

/**
 * 用 Intl.DateTimeFormat 显式拿 Asia/Shanghai 时区的 day/hour/minute.
 * 不依赖 process.env.TZ, 不依赖本地时区.
 */
function shanghaiParts(d) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = {};
  for (const p of fmt.formatToParts(d)) {
    parts[p.type] = p.value;
  }
  // weekday: short → "Mon" / "Sun" / ...
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = weekdayMap[parts.weekday] != null ? weekdayMap[parts.weekday] : d.getDay();
  const hour = parseInt(parts.hour, 10) % 24;  // 24:00 防 0
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    day,
    hour,
    minute: parseInt(parts.minute, 10),
  };
}

function ymdShanghai(d) {
  return shanghaiParts(d).ymd;
}

/**
 * 计算给定时间到下一次开盘的等待毫秒数.
 * - 交易时段内返回 0
 * - 盘前/午休: 返回到下一段的 ms
 * - 收盘后/周末/节假日: 返回到下一个交易日开盘的 ms
 *
 * @param {Date} now
 * @param {Date[]} [holidays]
 * @returns {number} ms, 0 表示"立即可拉"
 */
function msUntilNextOpen(now, holidays = []) {
  const status = getTradingStatus(now, holidays);
  if (status.isTrading) return 0;
  if (!status.nextOpenAt) return 0;  // 已收当周 (理论上不会发生, fallback)
  return Math.max(0, status.nextOpenAt.getTime() - now.getTime());
}

/**
 * 给定当前时间 + 配置 (每 N 分钟拉一次), 算出下次定时器触发时间.
 * - 交易时段内: 严格按 intervalMs (比如 5 * 60 * 1000)
 * - 非交易时段: 跳到下次开盘
 *
 * @param {Date} now
 * @param {{ intervalMs: number, holidays?: Date[] }} opts
 * @returns {number} ms, 从 now 到下次拉取的等待
 */
function msUntilNextFetch(now, { intervalMs, holidays = [] }) {
  const status = getTradingStatus(now, holidays);
  if (status.isTrading) return intervalMs;
  // 非交易时段 → 等到下次开盘
  return msUntilNextOpen(now, holidays);
}

// ── 内部 ──

/**
 * 当前时间 < 今天 09:30 → 今天 09:30
 * 当前时间 在 11:30-13:00 → 今天 13:00
 * 当前时间 >= 今天 15:00 → 下一个交易日 09:30
 *
 * 注: 所有时间判定都用 Asia/Shanghai (不依赖 process.env.TZ)
 */
function nextOpenAfter(now, holidays) {
  const parts = shanghaiParts(now);
  const day = parts.day;
  const minutes = parts.hour * 60 + parts.minute;

  if (day === 0 || day === 6) return nextWeekdayOpen(now, holidays);
  if (holidays.some((h) => h instanceof Date && ymdShanghai(h) === parts.ymd)) {
    return nextWeekdayOpen(now, holidays);
  }

  // 在 Asia/Shanghai 时区上构造当天/次日 09:30 / 13:00
  if (minutes < 9 * 60 + 30) return shanghaiAt(now, 9, 30);
  if (minutes >= 11 * 60 + 30 && minutes < 13 * 60) return shanghaiAt(now, 13, 0);
  return nextWeekdayOpen(now, holidays);
}

function nextWeekdayOpen(now, holidays) {
  const d = shanghaiAt(now, 9, 30);  // 当天 09:30 Shanghai
  for (let i = 0; i < 14; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const parts = shanghaiParts(d);
    if (parts.day === 0 || parts.day === 6) continue;
    if (holidays.some((h) => h instanceof Date && ymdShanghai(h) === parts.ymd)) continue;
    // 用 shanghaiAt 重设到 09:30 (setUTCDate 后时间可能漂了)
    return shanghaiAt(d, 9, 30);
  }
  d.setUTCDate(d.getUTCDate() + 7);
  return shanghaiAt(d, 9, 30);
}

/**
 * 给定 Date + 时分 (Asia/Shanghai), 返回对应的真实 Date 对象 (UTC 时刻).
 * 用 "YYYY-MM-DD HH:mm" 字符串 + TZ=Asia/Shanghai 反解, 避免 setHours 受本地 TZ 影响.
 */
function shanghaiAt(d, h, m) {
  const parts = shanghaiParts(d);
  // 用 Date.UTC 反算 UTC 时间 (Asia/Shanghai = UTC+8, 无夏令时)
  const utcMs = Date.UTC(
    parseInt(parts.ymd.slice(0, 4), 10),
    parseInt(parts.ymd.slice(5, 7), 10) - 1,
    parseInt(parts.ymd.slice(8, 10), 10),
    h - 8, m, 0
  );
  return new Date(utcMs);
}

module.exports = { getTradingStatus, msUntilNextOpen, msUntilNextFetch };