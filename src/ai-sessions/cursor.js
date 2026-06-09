/**
 * src/ai-sessions/cursor.js
 *
 * Phase B2a (AI Sessions Daily Digest): CursorDetectorImpl (第一实现).
 *
 * 跟 spec §4.2 一致:
 *   - appName: 'cursor'
 *   - isInstalled(): 同步检查 /Applications/Cursor.app 存在
 *   - listSessions(): 扫 workspaceStorage/<hash>/state.vscdb, 返 SessionMeta[]
 *   - readSession(id): B2b 才会用 better-sqlite3 读 SQLite (本文件不实现)
 *
 * 设计:
 *   - isInstalled 同步 (fs.existsSync 廉价) — caller 用 await 包装
 *   - listSessions 异步 (fs.promises) — 不阻塞 event loop
 *   - mtimeMs / sizeBytes 直接 stat 拿, 不读文件
 *   - id 用 workspace hash (state.vscdb 父目录名), readSession 直接拿
 *   - 路径默认在 macOS 上; 其它平台靠 env 覆盖 (B2b 才需要, 这里先硬编码).
 *   NOTE: JSDoc 注释里出现 star-slash 序列会被 parser 当 comment end, 全文避免.
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const CURSOR_BUNDLE_PATH = '/Applications/Cursor.app';
const WORKSPACE_STORAGE_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Cursor',
  'User',
  'workspaceStorage'
);

class CursorDetectorImpl {
  constructor(opts = {}) {
    this.appName = 'cursor';
    this.bundlePath = opts.bundlePath || CURSOR_BUNDLE_PATH;
    this.workspaceStorageDir = opts.workspaceStorageDir || WORKSPACE_STORAGE_DIR;
  }

  /**
   * 检查 Cursor.app 是否安装.
   * @returns {boolean}
   */
  isInstalled() {
    try {
      return fs.existsSync(this.bundlePath);
    } catch {
      return false;
    }
  }

  /**
   * 列所有 session (state.vscdb). 返 SessionMeta[]: { id, file, mtimeMs, sizeBytes }.
   * 不读 SQLite 内容. 父目录名 = workspace hash = session id.
   *
   * 错误处理:
   *   - workspaceStorageDir 不存在 → []
   *   - 单个 stat 失败 → 跳过该 entry, log warn (不 throw)
   *
   * @returns {Promise<Array<{id: string, file: string, mtimeMs: number, sizeBytes: number}>>}
   */
  async listSessions() {
    let entries;
    try {
      entries = await fsp.readdir(this.workspaceStorageDir, { withFileTypes: true });
    } catch (err) {
      // 目录不存在 / 权限不足 → 返 []
      if (err && (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'ENOTDIR')) {
        return [];
      }
      throw err;
    }

    const out = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const hash = e.name;
      const file = path.join(this.workspaceStorageDir, hash, 'state.vscdb');
      try {
        const st = await fsp.stat(file);
        if (!st.isFile()) continue;
        out.push({
          id: hash,
          file,
          mtimeMs: st.mtimeMs,
          sizeBytes: st.size,
        });
      } catch (err) {
        if (err && err.code === 'ENOENT') continue;  // 没 vscdb, 跳过
        // eslint-disable-next-line no-console
        console.warn(`[cursor] stat failed for ${file}: ${err.message}`);
      }
    }
    return out;
  }

  /**
   * 读 session 全文 (chat messages). 用 Node 22.5+ 内置的 node:sqlite (实验).
   * - vscdb 路径: <workspaceStorageDir>/<hash>/state.vscdb
   * - 表: cursorDiskKV, key LIKE 'aiService.prompts:%'
   * - value 是 JSON 字符串 (parse 出 messages array)
   * - startedAt = first message ts, endedAt = last message ts
   *
   * Schema 风险 (spec §3.3): Cursor 改 schema 频繁, 缺表 / 缺字段 → log warn + 抛
   * 带 'schema_mismatch' prefix 的 Error, caller 可 catch + skip.
   *
   * 关键: node:sqlite 需要 Node 22.5+. dev Node 18 / 老 Electron 没这模块,
   * 跑前 lazy-require 探测, 不在 → 抛 'node:sqlite unavailable' Error.
   *
   * @param {string} id   workspace hash
   * @returns {Promise<{id: string, startedAt: number, endedAt: number, messages: Array<{role: string, content: string, ts: number}>}>}
   */
  async readSession(id) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('readSession: id must be non-empty string');
    }
    const sqlite = _loadNodeSqlite();
    if (!sqlite) {
      throw new Error(
        'readSession: node:sqlite unavailable (need Node 22.5+ or Electron 35+ runtime)'
      );
    }
    const { DatabaseSync } = sqlite;
    const file = path.join(this.workspaceStorageDir, id, 'state.vscdb');
    let db;
    try {
      db = new DatabaseSync(file, { readOnly: true });
    } catch (err) {
      throw new Error(`readSession: failed to open ${file}: ${err.message}`);
    }
    try {
      // Schema check: 表存在? 实际 Cursor 用 'ItemTable' (vscdb 通用), 不是
      // 'cursorDiskKV' (spec §3.3 写错名, 我用 ItemTable, 兼容老 Cursor 版本).
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'"
      ).all();
      if (tables.length === 0) {
        throw new Error('schema_mismatch: ItemTable table missing (Cursor version may have changed)');
      }
      // Query: aiService.prompts / aiService.generations / composerData keys
      // 全部拉出来, _parseSessionRows 里 join.
      const rows = db.prepare(
        "SELECT key, value FROM ItemTable WHERE key IN ('aiService.prompts', 'aiService.generations', 'composerData', 'composer.composerData') ORDER BY key"
      ).all();

      return _parseSessionRows(id, rows);
    } finally {
      try { db.close(); } catch { /* noop */ }
    }
  }
}

/**
 * Lazy require node:sqlite. dev Node 18 / 老 Electron 没这模块, 返 null.
 * @returns {object|null}  module exports ({ DatabaseSync, ... }) or null
 */
function _loadNodeSqlite() {
  try {
    // eslint-disable-next-line global-require
    return require('node:sqlite');
  } catch {
    return null;
  }
}

/**
 * 纯函数: 把 SQL rows 解析成 Session. 抽出来便于单测 (无需 node:sqlite).
 * rows 形如: [{ key: 'aiService.prompts', value: '[{text,commandType},...]' },
 *             { key: 'aiService.generations', value: '[{unixMs,generationUUID,textDescription},...]' }]
 *
 * Cursor 实测 (2026-06, ItemTable):
 *   - aiService.prompts: Array<{text, commandType}>  (用户问题)
 *   - aiService.generations: Array<{unixMs, generationUUID, type, textDescription}>
 *   - composer.composerData: 其它 metadata, 通常没 chat content, 跳过
 *
 * 输出 messages 形如: [{role: 'user'|'assistant'|'unknown', content, ts}]
 * 排序 by ts asc. ts=0 的排到末尾.
 *
 * 容错: parse fail / schema 不匹配 跳过 row, 不 throw.
 *
 * @param {string} id            workspace hash (即 session id)
 * @param {Array<{key: string, value: string}>} rows
 * @returns {{id: string, startedAt: number, endedAt: number, messages: Array}}
 */
function _parseSessionRows(id, rows) {
  if (!Array.isArray(rows)) {
    return { id, startedAt: 0, endedAt: 0, messages: [] };
  }
  const allMessages = [];
  for (const r of rows) {
    if (!r || typeof r.value !== 'string') continue;
    let parsed;
    try {
      parsed = JSON.parse(r.value);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[cursor] skip unparseable row key=${r.key}: ${err.message}`);
      continue;
    }
    if (!Array.isArray(parsed)) continue;  // 不是 array 就跳过 (跟老 schema {messages:[...]} 兼容无关, 反正 array 直接用)
    if (r.key === 'aiService.prompts') {
      // 用户问题 → role='user', ts=0 (没有 timestamp 字段, 后面用 generations unixMs 推)
      for (const m of parsed) {
        if (!m || typeof m !== 'object') continue;
        const text = typeof m.text === 'string' ? m.text : '';
        allMessages.push({ role: 'user', content: text, ts: 0 });
      }
    } else if (r.key === 'aiService.generations') {
      // 模型回答 → role='assistant', ts=unixMs
      for (const m of parsed) {
        if (!m || typeof m !== 'object') continue;
        const ts = (typeof m.unixMs === 'number') ? m.unixMs : 0;
        const text = typeof m.textDescription === 'string' ? m.textDescription
                   : (typeof m.text === 'string' ? m.text : '');
        allMessages.push({ role: 'assistant', content: text, ts });
      }
    }
  }
  // 排序 by ts asc (没 ts 的 prompts 排到末尾 — Infinity 占位, 但 prompts 数应该近似
  // 跟 generations 配对, 如果 prompts 多了就排到最末; 不影响 summary 准确度)
  allMessages.sort((a, b) => {
    const ta = (a.ts && a.ts > 0) ? a.ts : Number.POSITIVE_INFINITY;
    const tb = (b.ts && b.ts > 0) ? b.ts : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  // startedAt/endedAt: 用 messages 数组中**实际带 ts 的**min/max, 不依赖
  // 排序后的 [0]/[length-1] (因为 prompts ts=0 可能排末尾).
  const tsList = allMessages.map(m => m.ts).filter(t => t > 0);
  const startedAt = tsList.length > 0 ? Math.min(...tsList) : (allMessages[0] ? allMessages[0].ts : 0);
  const endedAt = tsList.length > 0 ? Math.max(...tsList) : (allMessages.length > 0 ? allMessages[allMessages.length - 1].ts : 0);
  return { id, startedAt, endedAt, messages: allMessages };
}

module.exports = {
  CursorDetectorImpl,
  CURSOR_BUNDLE_PATH,
  WORKSPACE_STORAGE_DIR,
  // 内部 helper (测试 / 高级用法)
  _loadNodeSqlite,
  _parseSessionRows,
};
