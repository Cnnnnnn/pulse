/**
 * src/main/twitter-serenity/scheduler.js
 *
 * 5 分钟轮询 + quiet hours (默认 23:00-07:00) 跳过 (spec §5.1).
 * triggerNow() 打破 quiet hours (用户手动刷新).
 *
 * nowFn 可注入便于测试 (默认 () => new Date()).
 */

function createScheduler(deps) {
  const fetchFn = deps.fetchFn;
  const intervalMs = deps.intervalMs || 5 * 60 * 1000;
  const quietHours = deps.quietHours || { start: 23, end: 7 };
  const nowFn = deps.nowFn || (() => new Date());
  const logger = deps.logger || { info() {}, warn() {}, error() {} };
  let timer = null;
  let running = false;

  function isInQuietHours(now) {
    const d = now || nowFn();
    const h = d.getHours();
    const { start, end } = quietHours;
    if (start === end) return false;
    if (start < end) {
      // 同日区间, 如 1-6
      return h >= start && h < end;
    }
    // 跨夜区间, 如 23-7
    return h >= start || h < end;
  }

  async function tick() {
    if (running) return; // 防重入
    running = true;
    try {
      if (isInQuietHours()) {
        logger.info("[scheduler] in quiet hours, skip");
        return;
      }
      await fetchFn();
    } catch (err) {
      logger.error(`[scheduler] tick threw: ${err && err.message}`);
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    // 立即触发首次 (tick 内判 quiet hours)
    tick();
    timer = setInterval(tick, intervalMs);
    if (timer.unref) timer.unref();
  }

  async function triggerNow() {
    if (running) return null;
    running = true;
    try {
      return await fetchFn();
    } catch (err) {
      logger.error(`[scheduler] triggerNow threw: ${err && err.message}`);
      return null;
    } finally {
      running = false;
    }
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop, triggerNow, isInQuietHours };
}

module.exports = { createScheduler };
