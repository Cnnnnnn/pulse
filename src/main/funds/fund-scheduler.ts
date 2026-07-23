/**
 * src/main/funds/fund-scheduler.ts
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
"use strict";

const EventEmitter = require("events");
const { fetchFundNavBatch } = require("../../funds/fund-fetcher");
const { pickEffectiveNavNumber } = require("../../funds/fund-nav-merge");
const { NavSourceHealth } = require("../../funds/nav-source-health");
const {
  getTradingStatus,
  msUntilNextFetch,
  msUntilNextOpen,
} = require("../../funds/trading-hours");
const { mainLog } = require("../log.ts");
const fundStore = require("./fund-store.ts");
const fundHistoryStore = require("./fund-history-store.ts");

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_CONCURRENCY = 4;

export class FundScheduler extends EventEmitter {
  _http: any;
  _getCodes: any;
  _intervalMs: number;
  _concurrency: number;
  _log: any;
  _now: any;
  _health: any;
  _status: string;
  _lastFetch: any;
  _nextFetch: any;
  _timer: any;
  _heartbeatTimer: any;
  _inFlight: boolean;
  _stopped: boolean;
  _lastNavMap: Record<string, any>;
  _backfillOnFetch: boolean;

  constructor(opts: any) {
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
    this._health = opts.health || new NavSourceHealth();

    this._status = "closed";
    this._lastFetch = null;
    this._nextFetch = null;
    this._timer = null;
    this._inFlight = false;
    this._stopped = false;
    this._lastNavMap = {};
    this._backfillOnFetch = opts.backfillOnFetch !== false;
  }

  getLastNavForCode(code: string): any {
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

  cacheNavResults(results: any): void {
    if (results && typeof results === "object") {
      Object.assign(this._lastNavMap, results);
    }
  }

  start(): void {
    if (this._timer) return;
    this._stopped = false;
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
    this._heartbeatTimer = setInterval(() => {
      if (this._stopped) return;
      const now = this._now();
      const trading = getTradingStatus(now);
      const newStatus = trading.isTrading ? "idle" : "closed";
      if (this._status !== "running" && this._status !== newStatus) {
        this._status = newStatus;
        if (trading.isTrading) {
          this._nextFetch = now.getTime() + this._intervalMs;
        } else {
          this._nextFetch = now.getTime() + msUntilNextOpen(now);
        }
        this._emitState();
      } else if (this._status === "running" && !this._inFlight) {
        this._status = newStatus;
        this._emitState();
      }
    }, 60 * 1000);
  }

  stop(): void {
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

  getState(): any {
    return {
      status: this._status,
      lastFetch: this._lastFetch,
      nextFetch: this._nextFetch,
    };
  }

  getNavHealth(): any {
    return this._health.snapshot();
  }

  async fetchNow(): Promise<any> {
    if (this._inFlight) return { ok: false, reason: "in_flight" };
    const codes = this._getCodes();
    if (!codes || codes.length === 0) {
      this._lastFetch = Date.now();
      this._emitState();
      return { ok: true, results: {}, errors: {}, skipped: "empty_codes" };
    }
    return this._runFetch(codes);
  }

  _tick(): void {
    if (this._stopped) return;
    const now = this._now();
    const trading = getTradingStatus(now);

    if (trading.isTrading) {
      this._status = "idle";
      this._nextFetch = now.getTime() + this._intervalMs;
      this._emitState();
      this._runFetch(this._getCodes()).finally(() => {
        if (this._stopped) return;
        this._scheduleNext(this._intervalMs);
      });
    } else {
      this._status = "closed";
      const wait = msUntilNextOpen(now);
      this._nextFetch = now.getTime() + wait;
      this._emitState();
      const safeWait = Math.min(wait, 60 * 1000);
      this._scheduleNext(safeWait);
    }
  }

  _scheduleNext(ms: number): void {
    if (this._stopped) return;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._tick(), Math.max(ms, 1000));
  }

  async _runFetch(codes: string[]): Promise<any> {
    if (this._inFlight) return { ok: false, reason: "in_flight" };
    this._inFlight = true;
    this._status = "running";
    this._emitState();

    const startedAt = Date.now();
    try {
      const out: any = await fetchFundNavBatch(
        codes,
        this._http,
        {
          concurrency: this._concurrency,
          timeoutMs: 8000,
        },
        this._health,
      );
      this._lastFetch = Date.now();
      if (out.results) {
        Object.assign(this._lastNavMap, out.results);
      }
      if (this._backfillOnFetch && out.results) {
        const { navSource } = fundStore.loadAll();
        for (const [code, snap] of Object.entries(out.results) as [string, any][]) {
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
          const hist: any = fundHistoryStore.recordFromNavMap(
            out.results,
            this._now(),
          );
          if (hist.ok) {
            this.emit("history", {
              dailySnapshots: hist.dailySnapshots,
              entry: hist.entry,
            });
          }
        } catch (e: any) {
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
    } catch (err: any) {
      this._log.warn(`[fund-scheduler] fetch threw: ${err && err.message}`);
      return { ok: false, reason: "threw", error: err && err.message };
    } finally {
      this._inFlight = false;
    }
  }

  _emitState(): void {
    this.emit("state", this.getState());
  }
}

module.exports = { FundScheduler };
