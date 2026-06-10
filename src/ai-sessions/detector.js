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
   * opts 透传给 impl (供 codex 传 maxMtimeAgeDays 等).
   * @param {object} [opts]
   * @returns {Promise<Array<{id: string, file: string, mtimeMs: number, sizeBytes: number, appName: string}>>}
   */
  async listSessions(opts) {
    const list = await this.impl.listSessions(opts);
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
    const out = {
      id: s.id || id,
      appName: this.appName,
      startedAt: typeof s.startedAt === 'number' ? s.startedAt : 0,
      endedAt: typeof s.endedAt === 'number' ? s.endedAt : 0,
      messages: Array.isArray(s.messages) ? s.messages : [],
    };
    // Phase B7c.4: 透传 file / workspaceDir / title / model 给 jump target.
    // 旧 schema 不含这些字段, 容错 — 只在 impl 返了才带出来.
    if (typeof s.file === 'string') out.file = s.file;
    if (typeof s.workspaceDir === 'string') out.workspaceDir = s.workspaceDir;
    if (typeof s.title === 'string') out.title = s.title;
    if (typeof s.model === 'string') out.model = s.model;
    return out;
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
 const dayEnd = dayStart +86400_000;
 return sessions.filter((s) => {
 // B7 fix:优先 endedAt > startedAt > mtimeMs (mtime只fallback, 不是主用)
 // state.vscdb mtime跟 session实际时间无关 (改文件就更新)
 const endedAt = (typeof s.endedAt === 'number' && s.endedAt >0) ? s.endedAt :0;
 const startedAt = (typeof s.startedAt === 'number' && s.startedAt >0) ? s.startedAt :0;
 const mtimeMs = (typeof s.mtimeMs === 'number' && s.mtimeMs >0) ? s.mtimeMs :0;
 // 任一 ts 在 day window →算 match (最宽松)
 const ts = endedAt || startedAt || mtimeMs;
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
    // 目标: 本地 YYYY-MM-DD 0:00 的 epoch ms.
    //   epoch = UTC YYYY-MM-DD 0:00 + (local - UTC) offset
    // 例子 (Asia/Shanghai, UTC+8): 期望 2026-06-08 00:00 local = 2026-06-07T16:00Z.
    //   utcMidnight = 2026-06-08T00:00Z (= 1749340800000)
    //   localMinusUtcMs = -(-480) * 60000 = +28800000 (8h)
    //   错: utcMidnight + 8h = 2026-06-08T08:00Z (NOT local midnight)
    //   对: utcMidnight - 8h = 2026-06-07T16:00Z (correct)
    // 所以公式应该是 utcMidnight - localMinusUtcMs (= utcMidnight - (local - UTC))
    // 之前 v2.5.0 错把 + 写成 +, 没考虑 Date.UTC 的输入是 "本地" 还是 "UTC".
    const probe = new Date(now);
    const localMinusUtcMs = -probe.getTimezoneOffset() * 60_000;
    const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
    return utcMidnight - localMinusUtcMs;
  }
}

module.exports = { AISessionDetector };
