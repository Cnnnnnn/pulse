/**
 * src/metals/metal-scheduler.js
 *
 * 5-minute setInterval state machine for metals. Runs in main process.
 * No worker_threads — only 2 HTTP requests per cycle.
 *
 * HTTP abstraction: takes an injected `httpGet(url, headers) => Promise<string>`
 * so the scheduler itself has no electron / http deps. The caller wires up the
 * Pulse httpClient adapter (which always returns a UTF-8 string).
 *
 * State machine:
 *   idle → running → idle
 *   running → running (manual fetch re-entry via in-flight guard)
 *   idle → running (manual fetch bypasses timer)
 */

const { fetchAllQuotes } = require('./metal-fetcher.js');

const FIVE_MINUTES_MS = 5 * 60 * 1000;

class MetalScheduler {
  constructor({ onUpdate, httpGet } = {}) {
    this.status = 'idle';
    this.lastFetch = null;
    this.nextFetch = null;
    this.intervalId = null;
    this.onUpdate = onUpdate || (() => {});
    this.httpGet = httpGet;
    this.fetchInFlight = null;
  }

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this._tick(), FIVE_MINUTES_MS);
    // Fire immediately on start (don't wait 5 min for first data)
    this.fetchNow();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async fetchNow() {
    if (!this.httpGet) {
      throw new Error('MetalScheduler: httpGet not injected');
    }

    // Re-entrancy guard: if a fetch is in flight, await it instead of starting a new one
    if (this.fetchInFlight) {
      return this.fetchInFlight;
    }

    this.status = 'running';
    this.fetchInFlight = (async () => {
      try {
        const { quotes, fx, errors } = await fetchAllQuotes(this.httpGet);
        this.onUpdate({ quotes, fx, errors, fetchedAt: Date.now() });
      } finally {
        this.fetchInFlight = null;
        this.status = 'idle';
        this.lastFetch = Date.now();
        this.nextFetch = this.lastFetch + FIVE_MINUTES_MS;
        this._emitState();
      }
    })();

    return this.fetchInFlight;
  }

  getState() {
    return {
      status: this.status,
      lastFetch: this.lastFetch,
      nextFetch: this.nextFetch,
    };
  }

  _tick() {
    this.fetchNow().catch((err) => {
      console.error('[metals] scheduled fetch failed:', err);
    });
  }

  _emitState() {
    this.onUpdate({ state: this.getState() });
  }

  /**
   * 把当前 quotes 的 price 当作"当日 close"写入 historyMap.
   * 同日重复调用不重复写 (按 date 去重). 超过 30 天的条目裁掉.
   * @param {Object} quotes   metal id → {price, ...}
   * @param {Object} historyMap  metal id → [{date, close}]
   * @param {Date}   [now]    可注入当前时间, 测试用
   */
  snapshotDailyClose(quotes, historyMap, now = new Date()) {
    if (!quotes || !historyMap) return;
    const today = isoDate(now);
    for (const [id, q] of Object.entries(quotes)) {
      if (!q || !Number.isFinite(q.price)) continue;
      const arr = historyMap[id] || (historyMap[id] = []);
      if (arr.some((p) => p.date === today)) continue;
      arr.push({ date: today, close: q.price });
      arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      while (arr.length > 30) arr.shift();
    }
  }

  /**
   * 检查 historyMap, 返 { need: [{id, secid, unitDivisor}] }.
   * @param {Object} historyMap   metal id → array of {date, close}
   * @param {Array}  configMetals [{id, historySecid, unitDivisor}, ...]
   */
  detectHistoryGap(historyMap, configMetals) {
    const need = [];
    for (const m of configMetals || []) {
      const arr = (historyMap && historyMap[m.id]) || [];
      if (arr.length < 30) {
        need.push({
          id: m.id,
          secid: m.historySecid,
          unitDivisor: m.unitDivisor,
        });
      }
    }
    return { need };
  }
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

module.exports = { MetalScheduler, FIVE_MINUTES_MS };