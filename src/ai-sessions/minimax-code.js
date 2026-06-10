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

const MINIMAX_CODE_BUNDLE_PATH = '/Applications/MiniMax Code.app';
const MINIMAX_SQLITE_PATH = path.join(os.homedir(), '.minimax', 'sqlite.db');

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
      return await _listSessionsViaCli(this.sqlitePath);
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
      return await _listSessionsViaCli(this.sqlitePath);
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
        return await _listSessionsViaCli(this.sqlitePath);
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
      return await _readSessionViaCli(this.sqlitePath, id);
    }
    const sqlite = loaded.sqlite;
    let db;
    try {
      db = new sqlite.DatabaseSync(this.sqlitePath, { readOnly: true });
    } catch (err) {
      // node:sqlite open 失败 → 走 CLI fallback
      // eslint-disable-next-line no-console
      console.warn(`[minimax-code] readSession node:sqlite open failed (${err.message}); falling back to sqlite3 CLI`);
      return await _readSessionViaCli(this.sqlitePath, id);
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
        return await _readSessionViaCli(this.sqlitePath, id);
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
 * Lazy require node:sqlite. 老 Node 18 / 老 Electron 没这模块, 返 null.
 * @returns {object|null} { sqlite, source: 'node:sqlite' } 或 null
 */
function _loadNodeSqlite() {
  try {
    // eslint-disable-next-line global-require
    const sqlite = require('node:sqlite');
    return { sqlite, source: 'node:sqlite' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[minimax-code] node:sqlite load failed: ${err.message}`);
    return null;
  }
}

/**
 * Fallback: 通过系统 sqlite3 CLI 读 sessions 表 (macOS 自带 /usr/bin/sqlite3).
 * 比 node:sqlite 慢 (spawn 进程), 但绝对可靠, 处理 WAL 也正确.
 * @param {string} sqlitePath
 * @returns {Promise<Array>}
 */
async function _listSessionsViaCli(sqlitePath) {
  const { spawn } = require('child_process');
  const sql = "SELECT session_id, title, workspace_dir, effective_model, status, created_at, updated_at, framework_type FROM sessions ORDER BY updated_at DESC";
  return new Promise((resolve) => {
    const proc = spawn('sqlite3', ['-separator', '\t', sqlitePath, sql], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.warn(`[minimax-code] sqlite3 CLI spawn failed: ${err.message}`);
      resolve([]);
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        // eslint-disable-next-line no-console
        console.warn(`[minimax-code] sqlite3 CLI exited code=${code}: ${stderr.slice(0, 200)}`);
        resolve([]);
        return;
      }
      let stat;
      try { stat = fs.statSync(sqlitePath); } catch { stat = null; }
      const rows = stdout.split('\n').filter((l) => l.length > 0).map((line) => {
        const [session_id, title, workspace_dir, effective_model, status, created_at, updated_at, framework_type] = line.split('\t');
        return {
          session_id: session_id || '',
          title: title || '',
          workspace_dir: workspace_dir || '',
          effective_model: effective_model || '',
          status: status || '',
          created_at: created_at ? parseInt(created_at, 10) : 0,
          updated_at: updated_at ? parseInt(updated_at, 10) : 0,
          framework_type: framework_type || '',
        };
      });
      // eslint-disable-next-line no-console
      console.log(`[minimax-code] listSessions via sqlite3 CLI: ${rows.length} rows from ${sqlitePath}`);
      resolve(rows.map((r) => ({
        id: r.session_id,
        file: sqlitePath,
        mtimeMs: r.updated_at > 0 ? r.updated_at : (stat ? stat.mtimeMs : 0),
        sizeBytes: stat ? stat.size : 0,
        _workspaceDir: r.workspace_dir || null,
        _title: r.title || null,
        _effectiveModel: r.effective_model || null,
        _frameworkType: r.framework_type || null,
      })));
    });
  });
}

/**
 * Fallback: 通过 sqlite3 CLI 读某 session 的 messages.
 * @param {string} sqlitePath
 * @param {string} sessionId
 * @returns {Promise<{id, startedAt, endedAt, messages, ...}>}
 */
async function _readSessionViaCli(sqlitePath, sessionId) {
  const { spawn } = require('child_process');
  // shell escape session_id (avoid injection)
  const safeId = String(sessionId).replace(/'/g, "''");
  const sql = `SELECT id, msg_id, role, data, timestamp FROM session_messages WHERE session_id = '${safeId}' ORDER BY id ASC`;
  return new Promise((resolve, reject) => {
    const proc = spawn('sqlite3', ['-separator', '\t', sqlitePath, sql], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`sqlite3 CLI exited code=${code}: ${stderr.slice(0, 200)}`));
        return;
      }
      const rows = stdout.split('\n').filter((l) => l.length > 0);
      const messages = [];
      for (const line of rows) {
        const parts = line.split('\t');
        const dataStr = parts[3] || '';
        const ts = parts[4] ? parseInt(parts[4], 10) : 0;
        let content = '';
        let role = parts[2] || 'unknown';
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            role = data.role || role;
            if (typeof data.content === 'string') content = data.content;
            else if (Array.isArray(data.content)) {
              content = data.content.map((c) => c.text || c.content || '').filter(Boolean).join('\n').trim();
            } else if (typeof data.text === 'string') content = data.text;
          } catch {
            content = dataStr;
          }
        }
        if (content) messages.push({ role, content, ts });
      }
      const tsList = messages.map((m) => m.ts).filter((t) => t > 0);
      resolve({
        id: sessionId,
        startedAt: tsList.length > 0 ? Math.min(...tsList) : 0,
        endedAt: tsList.length > 0 ? Math.max(...tsList) : 0,
        messages,
      });
    });
  });
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
  // content 可能是 string (简单) 或 array (parts)
  let content = '';
  if (typeof data.content === 'string') {
    content = data.content;
  } else if (Array.isArray(data.content)) {
    content = _extractContent(data.content);
  } else if (typeof data.text === 'string') {
    content = data.text;
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
  _listSessionsViaCli,
  _readSessionViaCli,
};