/**
 * src/main/stocks-scheduler.js
 *
 * 自选股行情后台刷新 scheduler. 对照 spec §5.3.
 *
 * 盘中 (周一-周五 9:30-15:00) 每 quoteRefreshMinutes 分钟拉一次自选股行情,
 * 推送 "stocks:watchlist:quotes" 到渲染端. 非盘中休眠.
 *
 * 独立实例, 不复用 FundScheduler (避免两套数据耦合).
 */
const { HttpClient } = require("./http-client");
const { fetchStocks } = require("../stocks/stock-fetcher");
const stockStore = require("./stock-store");

/**
 * 是否在 A 股交易时段 (周一-周五 9:30-15:00, 本地时间).
 * 注: 不处理节假日 (节假日数据无变化, 多拉几次无害).
 * @param {Date} [now]
 * @returns {boolean}
 */
function isTradingHours(now = new Date()) {
  const day = now.getDay();
  if (day === 0 || day === 6) return false; // 周日 0 / 周六 6
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= 570 && mins <= 900; // 9:30=570, 15:00=900
}

class StockQuoteScheduler {
  /**
   * @param {{sendToRenderer:(channel:string,payload:any)=>void, intervalMs?:number, logger?:object}} opts
   */
  constructor({ sendToRenderer, intervalMs = 5 * 60 * 1000, logger } = {}) {
    this._send = sendToRenderer || (() => {});
    this._intervalMs = intervalMs;
    this._logger = logger;
    this._timer = null;
    this._running = false;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), this._intervalMs);
    // 启动后立即跑一次 (但只在盘中)
    this._tick();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  async _tick() {
    if (this._running) return;
    if (!isTradingHours()) return;
    this._running = true;
    try {
      const items = stockStore.loadStockWatchlist();
      if (items.length === 0) return;
      const httpClient = new HttpClient({ timeout: 8000, maxRetries: 0 });
      const out = await fetchStocks(httpClient);
      if (out.error) {
        this._log("warn", `stock quote fetch failed: ${out.error}`);
        return;
      }
      const want = new Set(items.map((i) => i.code));
      const quotes = {};
      for (const row of out.rows) {
        if (want.has(row.code)) {
          quotes[row.code] = {
            price: row.price,
            changePct: row.changePct,
            pe: row.pe,
            roe: row.roe,
          };
        }
      }
      this._send("stocks:watchlist:quotes", {
        quotes,
        fetchedAt: out.fetchedAt,
      });
    } catch (err) {
      this._log("warn", `stock scheduler tick failed: ${err && err.message}`);
    } finally {
      this._running = false;
    }
  }

  _log(level, msg) {
    try {
      const l = this._logger;
      if (l && typeof l[level] === "function") l[level](msg);
    } catch {
      /* noop */
    }
  }
}

module.exports = { StockQuoteScheduler, isTradingHours };
