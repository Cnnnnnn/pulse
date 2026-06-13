/**
 * src/ai-sessions/minimax-code.js
 *
 * Phase B7d.2 (AI Sessions Daily Digest): MiniMaxCodeDetectorImpl.
 *
 * MiniMax Code (MiniMax 公司的 coding agent desktop app) 把所有 session 存在一个
 * sqlite db:
 *   ~/.minimax/sqlite.db
 *
 * Schema (实测 2026-06, MiniMax Code 2.x + mavis daemon v3.0.41):
 *   sessions(session_id, agent_name, session_type, title, workspace_dir,
 *            status, session_data_dir, framework_type, effective_model,
 *            created_at, updated_at, ...)
 *   session_messages(id, session_id, msg_id, role, data, timestamp)
 *     - data 是 JSON: {msg_id, role, msg_type, timestamp, thinking_content, content}
 *     - role: 'user' | 'assistant'
 *     - timestamp: ms epoch
 *
 * 限制:
 *   - 跨多个 agent_name (mavis / coder / general / verifier). 我们**全部**当
 *     MiniMax Code session 暴露 — 反正它们都跑在 MiniMax Code 内, 用户看到
 *     都是 "MiniMax Code sessions".
 *   - sessions.last_active_at 字段全是 null (schema bug), 用 updated_at 排序.
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadNodeSqlite,
  listSessionsViaCli,
  readSessionViaCli,
} = require('./sqlite-helper');

const MINIMAX_CODE_BUNDLE_PATH = '/Applications/MiniMax Code.app';
const MINIMAX_SQLITE_PATH = path.join(os.homedir(), '.minimax', 'sqlite.db');
const LOG_PREFIX = '[minimax-code]';

function _loadNodeSqlite() {
  return loadNodeSqlite(LOG_PREFIX);
}

class MiniMaxCodeDetectorImpl {
  constructor(opts = {}) {
    this.appName = 'minimax-code';
    this.bundlePath = opts.bundlePath || MINIMAX_CODE_BUNDLE_PATH;
    this.sqlitePath = opts.sqlitePath || MINIMAX_SQLITE_PATH;
  }

  /**
   * 检查 MiniMax Code.app + sqlite 是否在.
   * 两者都不可用 → 返 false (detector skip).
   * @returns {boolean}
   */
  isInstalled() {
    try {
      const appExists = fs.existsSync(this.bundlePath);
      const dbExists = fs.existsSync(this.sqlitePath);
      return appExists || dbExists;
    } catch {
      return false;
    }
  }

  /**
   * 列所有 session (从 sqlite sessions 表).
   * @returns {Promise<Array<{id: string, file: string, mtimeMs: number, sizeBytes: number}>>}
   */
  async listSessions() {
    const loaded = _loadNodeSqlite();
    if (!loaded) {
      // node:sqlite 不可用 — 用 sqlite3 CLI fallback
      return await listSessionsViaCli(this.sqlitePath, LOG_PREFIX);
    }
    const sqlite = loaded.sqlite;
    let stat;
    try {
      stat = fs.statSync(this.sqlitePath);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[minimax-code] stat failed for ${this.sqlitePath}: ${err.message}`);
      return [];
    }
    let db;
    try {
      // 注: minimax daemon 跑时 db 是 WAL mode, 只读 connection 可能拿不到最新 wal snapshot
      // 一些 node:sqlite 实现对 WAL + readOnly 跨进程有 bug (返 stale snapshot / 0 rows).
      // 先试 readOnly; 失败回退 read-write (我们不写, 但能拿到正确的 snapshot).
      try {
        db = new sqlite.DatabaseSync(this.sqlitePath, { readOnly: true });
        db.exec('PRAGMA journal_mode=wal');
      } catch (roErr) {
        db = new sqlite.DatabaseSync(this.sqlitePath);
        db.exec('PRAGMA journal_mode=wal');
      }
    } catch (err) {
      // 文件被 lock / schema 变了 / 其它 → 返空 (再走 CLI fallback)
      // eslint-disable-next-line no-console
      console.warn(`[minimax-code] node:sqlite open failed (${err.message}); falling back to sqlite3 CLI`);
      try { db.close(); } catch { /* noop */ }
      return await listSessionsViaCli(this.sqlitePath, LOG_PREFIX);
    }
    try {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
      ).all();
      if (tables.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(`[minimax-code] sessions table missing in ${this.sqlitePath}`);
        return [];
      }
      const hasDeleted = _hasColumn(db, 'sessions', 'deleted_at');
      const rows = db.prepare(
        // last_active_at 很多 null, 退一步用 updated_at 排序.
        // 注: 早期 MiniMax Code daemon schema 没 deleted_at 列 — 我们动态探测, 没列就不加 WHERE.
        // (避免 schema mismatch 让整个 detector 静默 0 rows)
        `SELECT session_id, title, workspace_dir, effective_model,
                status, created_at, updated_at, framework_type
         FROM sessions
         ${hasDeleted ? 'WHERE deleted_at IS NULL' : ''}
         ORDER BY updated_at DESC`
      ).all();
      // eslint-disable-next-line no-console
      console.log(`[minimax-code] listSessions via node:sqlite: ${rows.length} rows from ${this.sqlitePath}`);
      // 拿不到行 (WAL bug), fallback CLI
      if (rows.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(`[minimax-code] node:sqlite returned 0 rows (likely WAL snapshot issue); falling back to sqlite3 CLI`);
        return await listSessionsViaCli(this.sqlitePath, LOG_PREFIX);
      }
      return rows.map((r) => ({
        id: r.session_id,
        file: this.sqlitePath,  // 共享 1 个 db, file 用来 jump fallback
        mtimeMs: typeof r.updated_at === 'number' ? r.updated_at : stat.mtimeMs,
        sizeBytes: stat.size,
        // 额外 metadata 给 readSession 用, 也方便 debug log
        _workspaceDir: r.workspace_dir || null,
        _title: r.title || null,
        _effectiveModel: r.effective_model || null,
        _frameworkType: r.framework_type || null,
      }));
    } finally {
      try { db.close(); } catch { /* noop */ }
    }
  }

  /**
   * 读 session 全文 (chat messages).
   *
   * @param {string} id   session_id (mvs_xxx 之类)
   * @returns {Promise<{id: string, startedAt: number, endedAt: number, messages: Array<{role: string, content: string, ts: number}>, workspaceDir?: string, title?: string, model?: string}>}
   */
  async readSession(id) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('readSession: id must be non-empty string');
    }
    const loaded = _loadNodeSqlite();
    if (!loaded) {
      return await readSessionViaCli(this.sqlitePath, id, LOG_PREFIX);
    }
    const sqlite = loaded.sqlite;
    let db;
    try {
      db = new sqlite.DatabaseSync(this.sqlitePath, { readOnly: true });
    } catch (err) {
      // node:sqlite open 失败 → 走 CLI fallback
      // eslint-disable-next-line no-console
      console.warn(`[minimax-code] readSession node:sqlite open failed (${err.message}); falling back to sqlite3 CLI`);
      return await readSessionViaCli(this.sqlitePath, id, LOG_PREFIX);
    }
    try {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='session_messages'"
      ).all();
      if (tables.length === 0) {
        throw new Error('schema_mismatch: session_messages table missing');
      }
      // session metadata (title / workspace / model)
      const metaRows = db.prepare(
        `SELECT session_id, title, workspace_dir, effective_model, created_at, updated_at
         FROM sessions WHERE session_id = ?`
      ).all(id);
      const meta = metaRows[0] || null;

      const rows = db.prepare(
        `SELECT id, msg_id, role, data, timestamp
         FROM session_messages
         WHERE session_id = ?
         ORDER BY id ASC`
      ).all(id);

      const messages = [];
      for (const r of rows) {
        const m = _parseMessageRow(r);
        if (m) messages.push(m);
      }

      // 拿不到 messages (WAL bug) → CLI fallback
      if (messages.length === 0 && metaRows.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[minimax-code] readSession via node:sqlite returned 0 messages for ${id}; falling back to sqlite3 CLI`);
        return await readSessionViaCli(this.sqlitePath, id, LOG_PREFIX);
      }

      const tsList = messages.map(m => m.ts).filter(t => t > 0);
      const startedAt = tsList.length > 0 ? Math.min(...tsList) : 0;
      const endedAt = tsList.length > 0 ? Math.max(...tsList) : 0;

      const out = {
        id,
        startedAt,
        endedAt,
        messages,
      };
      if (meta) {
        if (typeof meta.workspace_dir === 'string') out.workspaceDir = meta.workspace_dir;
        if (typeof meta.title === 'string') out.title = meta.title;
        if (typeof meta.effective_model === 'string') out.model = meta.effective_model;
      }
      return out;
    } finally {
      try { db.close(); } catch { /* noop */ }
    }
  }
}

/**
 * 探测某表是否含某列 (用于 schema 兼容 — 不同 MiniMax daemon 版本 schema 略不同).
 * @param {object} db   DatabaseSync
 * @param {string} table
 * @param {string} col
 * @returns {boolean}
 */
function _hasColumn(db, table, col) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    return Array.isArray(rows) && rows.some((r) => r && r.name === col);
  } catch {
    return false;
  }
}

/**
 * Parse session_messages 一行 → {role, content, ts}.
 * 容错: data 不是 JSON / 缺字段 → 跳过.
 *
 * MiniMax daemon schema 实测 (2026-06):
 *   data = { msg_id, role, msg_type, msg_content, timestamp, source?, tool_calls?, usage?, finish_reason? }
 *   注: 字段叫 msg_content, 不是 content / text (跟 OpenAI / Anthropic 不同).
 */
function _parseMessageRow(row) {
  if (!row || typeof row.role !== 'string') return null;
  let data = null;
  if (typeof row.data === 'string' && row.data.length > 0) {
    try {
      data = JSON.parse(row.data);
    } catch {
      // 容错: 当 raw string 当 content
      return { role: row.role, content: row.data, ts: _toMs(row.timestamp) };
    }
  }
  if (!data || typeof data !== 'object') return null;
  const role = data.role || row.role;
  // content 可能是 string (简单) 或 array (parts). 优先级: content > text > msg_content > msg_text
  let content = '';
  if (typeof data.content === 'string') {
    content = data.content;
  } else if (Array.isArray(data.content)) {
    content = _extractContent(data.content);
  } else if (typeof data.text === 'string') {
    content = data.text;
  } else if (typeof data.msg_content === 'string') {
    // MiniMax daemon 实际用的字段名
    content = data.msg_content;
  } else if (Array.isArray(data.msg_content)) {
    content = _extractContent(data.msg_content);
  }
  // 跳过 system / 空内容
  if (!content || content.length === 0) return null;
  // ts: 优先 data.timestamp, fallback row.timestamp
  const ts = _toMs(data.timestamp) || _toMs(row.timestamp);
  return { role: _normalizeRole(role), content, ts };
}

function _normalizeRole(role) {
  if (role === 'user' || role === 'assistant' || role === 'system' || role === 'tool') return role;
  return 'unknown';
}

function _extractContent(arr) {
  if (!Array.isArray(arr)) return '';
  const parts = [];
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue;
    if (typeof c.text === 'string') parts.push(c.text);
    else if (typeof c.content === 'string') parts.push(c.content);
    else if (typeof c.msg_content === 'string') parts.push(c.msg_content); // MiniMax daemon 字段名
    else if (typeof c.msg_text === 'string') parts.push(c.msg_text);
  }
  return parts.join('\n').trim();
}

function _toMs(v) {
  if (typeof v === 'number' && v > 0) return v;
  if (typeof v === 'string' && v.length > 0) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

module.exports = {
  MiniMaxCodeDetectorImpl,
  MINIMAX_CODE_BUNDLE_PATH,
  MINIMAX_SQLITE_PATH,
  // 内部 helper (单测)
  _loadNodeSqlite,
  _parseMessageRow,
  _extractContent,
  _hasColumn,
  _listSessionsViaCli: (sqlitePath) => listSessionsViaCli(sqlitePath, LOG_PREFIX),
  _readSessionViaCli: (sqlitePath, sessionId) =>
    readSessionViaCli(sqlitePath, sessionId, LOG_PREFIX),
};