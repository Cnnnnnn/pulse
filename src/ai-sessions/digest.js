/**
 * src/ai-sessions/digest.js
 *
 * Phase B1a (AI Sessions Daily Digest): DailyDigestRunner class.
 *
 * 跟 spec §4.5 一致:
 *   - runOne(dateKey)       detect → group → summarize → persist (idempotent)
 *   - runBackfill(days=7)   串行 N 天
 *   - bootstrap()           启动时: 跑昨天 (idempotent) + 可选 backfill
 *   - start()               setInterval 24h 定时
 *
 * B1 scope: 抽象 + 函数骨架, B4 才会真正接 detector + summarizer 实例 + 写盘.
 *
 * 设计:
 *   - detectors: AISessionDetector[]  (多 app 抽象, 第一实现是 cursor)
 *   - summarizer: LLMSummarizer
 *   - storage: { loadDigest, saveDigest }  (state-store.js 的 wrappers)
 *   - log: optional logger
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const DEFAULT_BACKFILL_DAYS = 7;
const BACKFILL_SLEEP_MS = 5000; // 防爆: 串行 N 天, 每 runOne 后 sleep 5s

class DailyDigestRunner {
  /**
   * @param {object} opts
   * @param {Array}  opts.detectors    AISessionDetector[]
   * @param {object} opts.summarizer   LLMSummarizer
   * @param {object} opts.storage      { loadDigests, saveDigest, hasDigest } — state-store wrappers
   * @param {object} [opts.config]     { enabled, backfillDays, locale }
   * @param {object} [opts.log]        logger, 接受 .info/.warn/.error(string)
   */
  constructor({
    detectors,
    summarizer,
    storage,
    config,
    log,
    backfillSleepMs,
  } = {}) {
    if (!Array.isArray(detectors)) {
      throw new TypeError("DailyDigestRunner: detectors must be array");
    }
    if (!summarizer || typeof summarizer.summarize !== "function") {
      throw new TypeError(
        "DailyDigestRunner: summarizer must have summarize()",
      );
    }
    if (
      !storage ||
      typeof storage.saveDigest !== "function" ||
      typeof storage.hasDigest !== "function"
    ) {
      throw new TypeError(
        "DailyDigestRunner: storage must have saveDigest/hasDigest",
      );
    }
    this.detectors = detectors;
    this.summarizer = summarizer;
    this.storage = storage;
    this.config = config || {};
    this.log = log || { info: () => {}, warn: () => {}, error: () => {} };
    // 可覆盖 BACKFILL_SLEEP_MS (单测用 0, 默认 5s 防爆)
    this._backfillSleepMs =
      typeof backfillSleepMs === "number" && backfillSleepMs >= 0
        ? backfillSleepMs
        : BACKFILL_SLEEP_MS;
    this._intervalHandle = null;
  }

  /**
   * 跑指定 dateKey 的 digest.
   * 幂等: 已存在 → 跳过 (除非 force=true).
   *
   * @param {string} dateKey    'YYYY-MM-DD'
   * @param {object} [opts]
   * @param {boolean} [opts.force=false]   强制 rerun, 覆盖现有
   * @param {number} [opts.now=Date.now()]
   * @returns {Promise<object|null>}  写完的 digest, 或 null (跳过)
   */
  async runOne(dateKey, opts = {}) {
    const force = Boolean(opts.force);
    const now = typeof opts.now === "number" ? opts.now : Date.now();
    if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new TypeError("runOne: dateKey must be YYYY-MM-DD");
    }
    if (!force && this.storage.hasDigest(dateKey)) {
      this.log.info(`[digest] ${dateKey} already exists, skip`);
      return null;
    }

    this.log.info(`[digest] ${dateKey} running (force=${force})`);

    // 1. collect sessions from all detectors
    const allSessions = [];
    for (const det of this.detectors) {
      if (!det || typeof det.isInstalled !== "function") continue;
      const installed = await det.isInstalled();
      if (!installed) {
        this.log.info(`[digest] ${det.appName} not installed, skip`);
        continue;
      }
      const metas = await det.listSessions();
      this.log.info(`[digest] ${det.appName}: ${metas.length} session metas`);

      for (const m of metas) {
        try {
          const sess = await det.readSession(m.id);
          // filter by dateKey
          const filtered = det.filterByLocalDay([sess], dateKey, now);
          if (filtered.length > 0) {
            allSessions.push(sess);
          }
        } catch (err) {
          this.log.warn(
            `[digest] ${det.appName}/${m.id} read failed: ${err.message}`,
          );
        }
      }
    }

    if (allSessions.length === 0) {
      this.log.info(`[digest] ${dateKey} no sessions, skip`);
      // 排查 patch: no-sessions 也写 trail, 让 "never runs" 排查能看到
      // "不是 digest 没跑, 是没数据"
      if (typeof this.onNoSessions === 'function') {
        try {
          this.onNoSessions({ dateKey, attemptedDetectors: this.detectors.length, at: now });
        } catch (err) {
          this.log.warn(`[digest] onNoSessions hook threw: ${err.message}`);
        }
      }
      return null;
    }

    this.log.info(
      `[digest] ${dateKey} ${allSessions.length} sessions to summarize`,
    );

    // 2. summarize
    const summary = await this.summarizer.summarize(allSessions, {
      dateKey,
      locale: this.config.locale || "zh-CN",
    });

    // 3. persist
    const digest = {
      dateKey,
      generatedAt: now,
      provider: this.summarizer.provider,
      model: this.summarizer.model,
      sessionCount: allSessions.length,
      summary,
      sessionIds: allSessions.map((s) => s.id),
    };
    this.storage.saveDigest(digest);
    this.log.info(
      `[digest] ${dateKey} saved (${allSessions.length} sessions, ${summary.length} chars)`,
    );
    return digest;
  }

  /**
   * 串行 N 天 digest, 跑 from oldest to newest.
   * 5s sleep 间隔防爆 (LLM API 限流).
   *
   * @param {number} [days=7]   backfill 天数
   * @param {object} [opts]     { now, onProgress }  onProgress(done, total)
   * @returns {Promise<{done: number, total: number, results: object[]}>}
   */
  async runBackfill(days, opts = {}) {
    const n =
      typeof days === "number" && days > 0
        ? Math.floor(days)
        : this.config.backfillDays || DEFAULT_BACKFILL_DAYS;
    const now = typeof opts.now === "number" ? opts.now : Date.now();
    const onProgress =
      typeof opts.onProgress === "function" ? opts.onProgress : () => {};

    const results = [];
    // 串行 from oldest to newest (昨天 - (n-1) → 昨天)
    for (let i = n - 1; i >= 0; i--) {
      const dateKey = this._dateKeyDaysAgo(i, now);
      try {
        const r = await this.runOne(dateKey, { now });
        if (r) results.push(r);
      } catch (err) {
        this.log.warn(`[digest] backfill ${dateKey} failed: ${err.message}`);
      }
      onProgress(n - i, n);
      if (i > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this._backfillSleepMs),
        );
      }
    }
    return { done: n, total: n, results };
  }

  /**
   * 启动时: 跑昨天 (idempotent) + 可选 backfill.
   *
   * 顺序: 先看有没有任何 digest → 没 → backfill (含 yesterday +之前 N-1 天)
   * 有 → 只跑 yesterday (其它天假设已有)
   *
   * @param {object} [opts]
   * @param {function} [opts.onProgress]  backfill 进度回调 onProgress(done, total)
   * @returns {Promise<{yesterday: object|null, backfill: object|null}>}
   */
  async bootstrap(opts = {}) {
    if (!this.config.enabled) {
      this.log.info("[digest] disabled in config, skip bootstrap");
      return { yesterday: null, backfill: null };
    }
    const now = Date.now();
    const yesterday = this._dateKeyDaysAgo(1, now);

    // B7c.2修: 先检查是否有 digest,决定是 backfill 还是只跑 yesterday.
    // (之前是先跑 yesterday →写盘 → 再 loadDigests 检查 →永远 hasAny=true跳 backfill)
    const digestsBefore = this.storage.loadDigests
      ? this.storage.loadDigests()
      : {};
    const hasAny = Object.keys(digestsBefore).length > 0;

    let yesterdayDigest = null;
    let backfillResult = null;
    if (!hasAny && this.config.backfillOnStart !== false) {
      // 首次启动 (没历史 digest): 跑完整 backfill (含 yesterday 在内)
      const backfillOpts = { now };
      if (typeof opts.onProgress === "function") {
        backfillOpts.onProgress = opts.onProgress;
      }
      backfillResult = await this.runBackfill(
        this.config.backfillDays || DEFAULT_BACKFILL_DAYS,
        backfillOpts,
      );
      // yesterday digest 就是 backfill 的最后1 天
      yesterdayDigest =
        backfillResult.results && backfillResult.results.length > 0
          ? backfillResult.results.find((r) => r && r.dateKey === yesterday) ||
            null
          : null;
    } else {
      // 有历史: 只跑昨天 (idempotent)
      yesterdayDigest = await this.runOne(yesterday, { now });
    }
    return { yesterday: yesterdayDigest, backfill: backfillResult };
  }

  /**
   * 24h 定时: 每 24h 跑一次昨天 digest.
   * 立即返回. Idempotent: 多次调不重复注册, 返同 handle.
   * @param {number} [intervalMs=86400000]
   * @returns {NodeJS.Timeout}
   */
  start(intervalMs = 86400_000) {
    if (this._intervalHandle) return this._intervalHandle;
    this._intervalHandle = setInterval(() => {
      const now = Date.now();
      const dateKey = this._dateKeyDaysAgo(1, now);
      this.runOne(dateKey, { now }).catch((err) => {
        this.log.error(`[digest] interval ${dateKey} failed: ${err.message}`);
      });
    }, intervalMs);
    return this._intervalHandle;
  }

  /**
   * 停 24h 定时. Idempotent.
   */
  stop() {
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
  }

  /**
   * 内部 helper: 拿 daysAgo 天前的本地 YYYY-MM-DD.
   * 用 now - daysAgo * 86400000 + Intl en-CA 拿本地 dateKey.
   * @param {number} daysAgo
   * @param {number} now
   * @returns {string}
   */
  _dateKeyDaysAgo(daysAgo, now) {
    const t = now - (daysAgo | 0) * 86400_000;
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(t));
  }
}

module.exports = {
  DailyDigestRunner,
  DEFAULT_BACKFILL_DAYS,
  BACKFILL_SLEEP_MS,
};
