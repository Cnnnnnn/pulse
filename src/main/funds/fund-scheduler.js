/**
 * src/main/fund-scheduler.js
 *
 * 基金净值定时拉取 —— 状态机 + 定时器 + 手动触发 + 事件推送.
 *
 * 状态机:
 *   closed  → 不在交易时段, 定时器休眠, 手动 fetch 可触发
 *   idle    → 在交易时段, 等下次 tick
 *   running → 正在拉 (单只/批量), 不接受新 tick (重入由 in-flight flag 控制)
 *
 * 触发:
 *   - 自动: 交易时段内每 5 分钟 tick 一次
 *   - 手动: IPC funds:nav:fetch → 立即跑一次 (绕过定时器)
 *
 * 事件:
 *   - 'state'  → scheduler 状态变化 (closed / idle / running + lastFetch + nextFetch)
 *   - 'fetched' → 拉完一次, payload = { results, errors, fetchedAt }
 *
 * v1.0 (2026-06-12) — 初版
 */

const EventEmitter = require("events");
const { fetchFundNavBatch } = require("../../funds/fund-fetcher");
const { pickEffectiveNavNumber } = require("../../funds/fund-nav-merge");
const { NavSourceHealth } = require("../../funds/nav-source-health");
const {
  getTradingStatus,
  msUntilNextFetch,
  msUntilNextOpen,
} = require("../../funds/trading-hours");
const { mainLog } = require("../log");
const fundStore = require("./fund-store");
const fundHistoryStore = require("./fund-history-store");

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟
const DEFAULT_CONCURRENCY = 4;

/**
 * @param {{
 *   httpClient: { get: (url, opts) => Promise<{status, body, headers, error?}> },
 *   getCodes: () => string[],                        // 拉当前持仓的 code 列表 (动态)
 *   intervalMs?: number,
 *   concurrency?: number,
 *   logger?: { info, warn, error, debug },
 *   now?: () => Date,                                // 测试注入用
 *   health?: { record: (source: string, ok: boolean, code?: string) => void },
 * }} opts
 */
class FundScheduler extends EventEmitter {
  constructor(opts) {
    super();
    if (!opts || !opts.httpClient)
      throw new Error("FundScheduler: httpClient required");
    if (typeof opts.getCodes !== "function")
      throw new Error("FundScheduler: getCodes must be a function");
    this._http = opts.httpClient;
    this._getCodes = opts.getCodes;
    this._intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    this._concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
    this._log = opts.logger || mainLog;
    this._now = opts.now || (() => new Date());
    // 净值源健康度跟踪 — 给 fetcher 用, 也给 IPC snapshot 用
    this._health = opts.health || new NavSourceHealth();

    this._status = "closed"; // 'closed' | 'idle' | 'running'
    this._lastFetch = null; // unix ms
    this._nextFetch = null; // unix ms
    this._timer = null;
    this._inFlight = false;
    this._stopped = false;
    this._lastNavMap = {}; // code -> FundNav (最新一次拉到的, 给 backfill 用)
    this._backfillOnFetch = opts.backfillOnFetch !== false; // 默认 true
  }

  /**
   * 给定 code 拿最新拉到的 nav (供 funds:backfill IPC 用)
   * @param {string} code
   * @returns {{ nav: number, name: string } | null}
   */
  getLastNavForCode(code) {
    const snap = this._lastNavMap[code];
    if (!snap) return null;
    const nav =
      snap.estimatedNav != null && snap.estimatedNav > 0
        ? snap.estimatedNav
        : snap.nav != null && snap.nav > 0
          ? snap.nav
          : null;
    if (!nav) return null;
    return { nav, name: snap.name };
  }

  /** 合并单只/少量拉取结果到缓存 (供 funds:nav:fetch-codes 用) */
  cacheNavResults(results) {
    if (results && typeof results === "object") {
      Object.assign(this._lastNavMap, results);
    }
  }

  start() {
    if (this._timer) return;
    this._stopped = false;
    // 非交易时段启动时先拉一次 (交易时段由 _tick 负责, 避免重复请求)
    const now = this._now();
    const trading = getTradingStatus(now);
    const codes = this._getCodes();
    if (!trading.isTrading && codes && codes.length > 0) {
      this._runFetch(codes).finally(() => {
        if (!this._stopped) this._tick();
      });
    } else {
      this._tick();
    }
    // 启动一个 1 分钟心跳, 强制重新计算 status 并 emit
    // (防 _tick 因某种原因卡死, 比如 _runFetch 抛错后没正确重置)
    this._heartbeatTimer = setInterval(() => {
      if (this._stopped) return;
      const now = this._now();
      const trading = getTradingStatus(now);
      const newStatus = trading.isTrading ? "idle" : "closed";
      if (this._status !== "running" && this._status !== newStatus) {
        // status 漂移 → 重算
        this._status = newStatus;
        if (trading.isTrading) {
          this._nextFetch = now.getTime() + this._intervalMs;
        } else {
          this._nextFetch = now.getTime() + msUntilNextOpen(now);
        }
        this._emitState();
      } else if (this._status === "running" && !this._inFlight) {
        // status 卡在 running 但实际没在拉 → 重置为 idle/closed
        this._status = newStatus;
        this._emitState();
      }
    }, 60 * 1000);
  }

  stop() {
    this._stopped = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  getState() {
    return {
      status: this._status,
      lastFetch: this._lastFetch,
      nextFetch: this._nextFetch,
    };
  }

  /**
   * 净值源健康度快照 — 供 IPC funds:nav:health 返回给 UI.
   */
  getNavHealth() {
    return this._health.snapshot();
  }

  /**
   * 手动立即触发一次拉取. 绕过定时器, 不论 status 是否 closed.
   * 已在 running 时返回 { ok: false, reason: 'in_flight' }.
   */
  async fetchNow() {
    if (this._inFlight) return { ok: false, reason: "in_flight" };
    const codes = this._getCodes();
    if (!codes || codes.length === 0) {
      this._lastFetch = Date.now();
      this._emitState();
      return { ok: true, results: {}, errors: {}, skipped: "empty_codes" };
    }
    return this._runFetch(codes);
  }

  // ── 内部 ──

  _tick() {
    if (this._stopped) return;
    const now = this._now();
    const trading = getTradingStatus(now);

    if (trading.isTrading) {
      this._status = "idle";
      this._nextFetch = now.getTime() + this._intervalMs;
      this._emitState();
      // 在交易时段内: 立即跑一次, 完成后排下一次 (按 intervalMs)
      this._runFetch(this._getCodes()).finally(() => {
        if (this._stopped) return;
        this._scheduleNext(this._intervalMs);
      });
    } else {
      this._status = "closed";
      const wait = msUntilNextOpen(now);
      this._nextFetch = now.getTime() + wait;
      this._emitState();
      // 非交易时段: 等到下次开盘 (兜底 1 分钟重 tick 一次以防 wait 算长导致卡死)
      const safeWait = Math.min(wait, 60 * 1000);
      this._scheduleNext(safeWait);
    }
  }

  _scheduleNext(ms) {
    if (this._stopped) return;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._tick(), Math.max(ms, 1000));
  }

  async _runFetch(codes) {
    if (this._inFlight) return { ok: false, reason: "in_flight" };
    this._inFlight = true;
    this._status = "running";
    this._emitState();

    const startedAt = Date.now();
    try {
      const out = await fetchFundNavBatch(
        codes,
        this._http,
        {
          concurrency: this._concurrency,
          timeoutMs: 8000,
        },
        this._health,
      );
      this._lastFetch = Date.now();
      // 存最新 nav (供 backfill + IPC funds:backfill 用)
      if (out.results) {
        Object.assign(this._lastNavMap, out.results);
      }
      // 拉到了 → 自动反填占位的 holding (costNav=0 + _pendingNav=true)
      if (this._backfillOnFetch && out.results) {
        const { navSource } = fundStore.loadAll();
        for (const [code, snap] of Object.entries(out.results)) {
          try {
            const nav = pickEffectiveNavNumber(snap, navSource);
            if (nav) {
              const r = fundStore.backfillFromNav(code, nav);
              if (r.ok)
                this._log.info(
                  `[fund-scheduler] backfilled ${code} → ${nav.toFixed(4)}`,
                );
            }
          } catch (e) {
            /* 单只反填失败不阻塞 */
          }
        }
      }
      if (out.results && Object.keys(out.results).length > 0) {
        try {
          const hist = fundHistoryStore.recordFromNavMap(
            out.results,
            this._now(),
          );
          if (hist.ok) {
            this.emit("history", {
              dailySnapshots: hist.dailySnapshots,
              entry: hist.entry,
            });
          }
        } catch (e) {
          this._log.warn(
            `[fund-scheduler] history record failed: ${e && e.message}`,
          );
        }
      }
      const payload = {
        results: out.results,
        errors: out.errors,
        fetchedAt: this._lastFetch,
        durationMs: this._lastFetch - startedAt,
      };
      this.emit("fetched", payload);
      return { ok: true, ...out };
    } catch (err) {
      this._log.warn(`[fund-scheduler] fetch threw: ${err && err.message}`);
      return { ok: false, reason: "threw", error: err && err.message };
    } finally {
      this._inFlight = false;
      // status 在 _tick 里设, 这里不重置
    }
  }

  _emitState() {
    this.emit("state", this.getState());
  }
}

module.exports = { FundScheduler };
