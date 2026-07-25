/**
 * src/funds/nav-source-health.ts
 *
 * 净值源健康度跟踪 — 滑动窗口 + 连续失败计数.
 *
 * 给 fetchFundNavWithAlt 用: 主源连续失败 / 成功率低时自动切到备用源.
 * 也给 scheduler 用: 把 stats 暴露到 IPC, UI 显示当前哪个源在抽风.
 *
 * 设计:
 *   - 滑动窗口 N=20: 只保留最近 N 次 result
 *   - 连续失败 >= CONSECUTIVE_FAIL_THRESHOLD → 标 unhealthy
 *   - 成功率 < MIN_SUCCESS_RATE → 标 unhealthy
 *   - unhealthy 时, fetcher 应尝试备用源 (即使主源名义上还 ok)
 *   - 健康度恢复: 一次成功就清零连续失败
 *
 * v1.0 (2026-06-13) — 初版
 */

export const WINDOW_SIZE = 20;
export const CONSECUTIVE_FAIL_THRESHOLD = 3;
export const MIN_SUCCESS_RATE = 0.5; // 滑动窗口内 < 50% 成功 → unhealthy

export const SOURCES = ["tiantian", "sina"];

/**
 * @typedef {{ ok: boolean, ts: number, code?: string }} HealthSample
 */

export class NavSourceHealth {
  _windowSize: any;
  _consecutiveThreshold: any;
  _minSuccessRate: any;
  _samples: any;
  _consecutiveFails: any;

  constructor(opts: any = {}) {
    this._windowSize = opts.windowSize ?? WINDOW_SIZE;
    this._consecutiveThreshold =
      opts.consecutiveFailThreshold ?? CONSECUTIVE_FAIL_THRESHOLD;
    this._minSuccessRate = opts.minSuccessRate ?? MIN_SUCCESS_RATE;
    /** @type {Record<string, HealthSample[]>} */
    this._samples = Object.fromEntries(SOURCES.map((s: any) => [s, []]));
    /** @type {Record<string, number>} */
    this._consecutiveFails = Object.fromEntries(SOURCES.map((s: any) => [s, 0]));
  }

  /**
   * 记录一次拉取结果.
   * @param {string} source    'tiantian' | 'sina'
   * @param {boolean} ok
   * @param {string} [code]    基金代码 (调试用)
   */
  record(source: any, ok: any, code?: any) {
    if (!SOURCES.includes(source)) return;
    const list = this._samples[source];
    list.push({ ok: !!ok, ts: Date.now(), code });
    while (list.length > this._windowSize) list.shift();
    if (ok) {
      this._consecutiveFails[source] = 0;
    } else {
      this._consecutiveFails[source] += 1;
    }
  }

  /**
   * 当前源是否 unhealthy (建议切备用).
   */
  isUnhealthy(source: any) {
    if (!SOURCES.includes(source)) return false;
    if (this._consecutiveFails[source] >= this._consecutiveThreshold)
      return true;
    const list = this._samples[source];
    if (list.length < 3) return false; // 样本太少别瞎判
    const succ = list.filter((s: any) => s.ok).length;
    return succ / list.length < this._minSuccessRate;
  }

  /**
   * 取统计快照 (供 IPC / UI 显示).
   */
  snapshot() {
    const out: any = {};
    for (const s of SOURCES) {
      const list = this._samples[s];
      const succ = list.filter((x: any) => x.ok).length;
      out[s] = {
        samples: list.length,
        successRate: list.length > 0 ? +(succ / list.length).toFixed(3) : null,
        consecutiveFails: this._consecutiveFails[s],
        unhealthy: this.isUnhealthy(s),
      };
    }
    return out;
  }

  /**
   * 选健康度最高的源 (主源健康 → 用主源; 主源不健康 → 用备用源).
   *
   * 边界: 两源都 unhealthy → 返主源 (没更优选择, 别瞎返 undefined).
   *
   * @param {string} primary     'tiantian' | 'sina'
   * @returns {string} 建议先用哪个源
   */
  pickPreferred(primary: any) {
    if (!SOURCES.includes(primary)) primary = SOURCES[0];
    if (!this.isUnhealthy(primary)) return primary;
    const alt = SOURCES.find((s: any) => s !== primary);
    if (!alt) return primary;
    if (this.isUnhealthy(alt)) return primary; // 两源都挂 → 主源
    return alt;
  }
}

