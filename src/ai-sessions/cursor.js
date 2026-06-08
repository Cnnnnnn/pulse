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
   * 读 session 全文 (chat messages). B2b 用 better-sqlite3 实现.
   * 本文件 (B2a) 抛 NotImplemented, B2b 会替换.
   * @param {string} id   workspace hash
   * @returns {Promise<{id, startedAt, endedAt, messages}>}
   */
  async readSession(id) {
    throw new Error('CursorDetectorImpl.readSession: not implemented yet (B2b)');
  }
}

module.exports = {
  CursorDetectorImpl,
  CURSOR_BUNDLE_PATH,
  WORKSPACE_STORAGE_DIR,
};
