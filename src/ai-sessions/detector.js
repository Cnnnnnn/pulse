/**
 * src/ai-sessions/detector.js
 *
 * Phase B1a (AI Sessions Daily Digest): 抽象 AISessionDetector class.
 *
 * 跟 spec §4.1 一致:
 *   - isInstalled()          -> bool
 *   - listSessions()         -> SessionMeta[]
 *   - readSession(id)        -> Session
 *   - filterByLocalDay(sessions, dateKey) -> Session[]
 *
 * 第一实现见 src/ai-sessions/cursor.js (B2).
 *
 * CommonJS, 跟 src/config/ 一致. main + renderer 都可 require.
 *
 * 类型 (跟 spec §4.1 一致):
 *   SessionMeta: { id, file, mtimeMs, sizeBytes, appName }
 *   Session:     { id, appName, startedAt, endedAt, messages: [{role, content, ts}] }
 */

class AISessionDetector {
  /**
   * @param {object} opts
   * @param {string} opts.appName     e.g. 'cursor'
   * @param {object} opts.impl        具体实现 (CursorDetectorImpl 等)
   *                                  必须实现: isInstalled / listSessions / readSession
   */
  constructor({ appName, impl }) {
    if (!appName || typeof appName !== 'string') {
      throw new TypeError('AISessionDetector: appName must be non-empty string');
    }
    if (!impl || typeof impl.isInstalled !== 'function'
             || typeof impl.listSessions !== 'function'
             || typeof impl.readSession !== 'function') {
      throw new TypeError('AISessionDetector: impl must have isInstalled/listSessions/readSession');
    }
    this.appName = appName;
    this.impl = impl;
  }

  /**
   * 检查 app 是否安装 (e.g. /Applications/Cursor.app 存在).
   * @returns {Promise<boolean>}
   */
  async isInstalled() {
    return Boolean(await this.impl.isInstalled());
  }

  /**
   * 列出所有 session (从磁盘扫). 不读全文, 只返 meta.
   * @returns {Promise<Array<{id: string, file: string, mtimeMs: number, sizeBytes: number, appName: string}>>}
   */
  async listSessions() {
    const list = await this.impl.listSessions();
    if (!Array.isArray(list)) return [];
    return list.map((m) => ({
      id: m.id,
      file: m.file,
      mtimeMs: m.mtimeMs,
      sizeBytes: m.sizeBytes,
      appName: this.appName,
    }));
  }

  /**
   * 读 session 全文 (chat messages).
   * @param {string} id
   * @returns {Promise<{id: string, appName: string, startedAt: number, endedAt: number, messages: Array<{role: string, content: string, ts: number}>}>}
   */
  async readSession(id) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('readSession: id must be non-empty string');
    }
    const s = await this.impl.readSession(id);
    return {
      id: s.id || id,
      appName: this.appName,
      startedAt: typeof s.startedAt === 'number' ? s.startedAt : 0,
      endedAt: typeof s.endedAt === 'number' ? s.endedAt : 0,
      messages: Array.isArray(s.messages) ? s.messages : [],
    };
  }

  /**
   * 按本地日历日 (YYYY-MM-DD) 过滤 sessions. mtimeMs (或 startedAt/endedAt) 落在 [dayStart, dayEnd).
   *
   * @param {Array<{mtimeMs?: number, startedAt?: number, endedAt?: number}>} sessions
   * @param {string} dateKey                'YYYY-MM-DD' (本地时区)
   * @param {number} [now]                   注入便于测试, 默认 Date.now()
   * @returns {Array}
   */
  filterByLocalDay(sessions, dateKey, now) {
    if (!Array.isArray(sessions)) return [];
    if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return [];
    const t = (typeof now === 'number') ? now : Date.now();
    const dayStart = AISessionDetector._localDayStart(dateKey, t);
    const dayEnd = dayStart + 86400_000;
    return sessions.filter((s) => {
      // 优先 mtimeMs, 否则 endedAt, 否则 startedAt
      const ts = (typeof s.mtimeMs === 'number') ? s.mtimeMs
              : (typeof s.endedAt === 'number' ? s.endedAt : 0)
              || (typeof s.startedAt === 'number' ? s.startedAt : 0);
      return ts >= dayStart && ts < dayEnd;
    });
  }

  /**
   * 拿 dateKey 'YYYY-MM-DD' (本地时区) 当天 0:00 的 epoch ms.
   * 用 Intl 反推本地 UTC offset, 然后 UTC midnight - offset.
   *
   * @param {string} dateKey   'YYYY-MM-DD'
   * @param {number} now        注入便于测试
   * @returns {number}          epoch ms (本地 0:00)
   */
  static _localDayStart(dateKey, now) {
    const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!m1) return NaN;
    const y = parseInt(m1[1], 10);
    const m = parseInt(m1[2], 10);
    const d = parseInt(m1[3], 10);
    // range check: 月份 1-12, 日期 1-31
    if (m < 1 || m > 12 || d < 1 || d > 31) return NaN;
    // 用 probe 算 local - UTC offset (ms). Date.getTimezoneOffset() 返 "UTC - local" 分钟数.
    // local - UTC = -getTimezoneOffset() * 60_000
    const probe = new Date(now);
    const localMinusUtcMs = -probe.getTimezoneOffset() * 60_000;
    const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
    return utcMidnight + localMinusUtcMs;
  }
}

module.exports = { AISessionDetector };
