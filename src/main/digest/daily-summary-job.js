/**
 * src/main/digest/daily-summary-job.js
 *
 * Phase I1+I5: scheduler — checks every 60s whether to fire the daily digest
 * notification. Pure tick logic; notification sending is injected for test.
 *
 * Public API:
 *   startDailySummaryJob(deps) → { stop, triggerNow }
 *   __resetForTest()  // clear module-level interval handle between tests
 *
 * deps:
 *   getState()           → state object
 *   setState(partial)    → merge into state (only used to write last_push_date)
 *   getConfig()          → { notifications: { quiet_hours_start, quiet_hours_end } }
 *   sendNotification(n)  → { title, body }
 *   aggregate(state, { now }) → { date, sections, lines }   (optional; defaults to ./aggregate)
 *   now()                → Date (defaults to () => new Date())
 */

const { inQuietHours } = require('../notification-policy');
const { aggregate: defaultAggregate } = require('./aggregate');

const DEFAULT_TIME = '08:30';
const _handle = { interval: null, deps: null };

function parseTargetMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function ymd(d) {
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function checkAndPush(deps) {
  const state = deps.getState() || {};
  const cfg = (state.daily_digest) || {};
  if (cfg.enabled === false) return { skipped: 'disabled' };

  const nowFn = deps.now || (() => new Date());
  const now = nowFn();
  const notifCfg = (deps.getConfig && deps.getConfig().notifications) || {};
  if (notifCfg.quiet_hours_start && notifCfg.quiet_hours_end) {
    if (inQuietHours(now, notifCfg.quiet_hours_start, notifCfg.quiet_hours_end)) {
      return { skipped: 'quiet_hours' };
    }
  }

  const target = parseTargetMinutes(cfg.time) ?? parseTargetMinutes(DEFAULT_TIME);
  if (target === null) return { skipped: 'bad_time' };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin !== target) return { skipped: 'wrong_minute' };

  const today = ymd(now);
  if (cfg.last_push_date === today) return { skipped: 'already_pushed_today' };

  const aggregate = deps.aggregate || defaultAggregate;
  let result;
  try {
    result = aggregate(state, { now });
  } catch (err) {
    return { skipped: 'aggregate_threw', error: err && err.message };
  }
  if (!result || !Array.isArray(result.lines) || result.lines.length === 0) {
    return { skipped: 'empty_lines' };
  }

  deps.sendNotification({
    title: `🌅 Pulse 早报 · ${result.date}`,
    body: result.lines.join('\n'),
  });

  deps.setState({
    daily_digest: {
      ...cfg,
      last_push_date: today,
    },
  });

  return { pushed: true, lines: result.lines.length };
}

function startDailySummaryJob(deps) {
  if (!deps || typeof deps.sendNotification !== 'function') {
    throw new TypeError('startDailySummaryJob: deps.sendNotification is required');
  }
  if (_handle.interval) {
    clearInterval(_handle.interval);
  }
  _handle.deps = deps;
  _handle.interval = setInterval(() => {
    try {
      checkAndPush(_handle.deps);
    } catch {
      /* swallow — never let timer callback crash */
    }
  }, 60_000);

  return {
    stop: () => {
      if (_handle.interval) {
        clearInterval(_handle.interval);
        _handle.interval = null;
      }
    },
    triggerNow: () => checkAndPush(deps),
  };
}

function __resetForTest() {
  if (_handle.interval) {
    clearInterval(_handle.interval);
    _handle.interval = null;
  }
  _handle.deps = null;
}

module.exports = { startDailySummaryJob, __resetForTest, parseTargetMinutes, checkAndPush };
