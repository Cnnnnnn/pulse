/**
 * src/ai-sessions/cursor.js
 *
 * 重做版 CursorDetectorImpl — 任务粒度.
 *
 * 旧版把每个 workspace 的 state.vscdb 当一个 session (整个 workspace 几个月
 * 的对话混成一锅, prompts 还没时间戳). 重做后改用 Cursor 的 agent transcripts:
 *
 *   ~/.cursor/projects/<projectDir>/agent-transcripts/<uuid>/<uuid>.jsonl
 *
 * 一个 jsonl 文件 = 一次完整任务 (一个 chat session). 每行 JSON:
 *   { role: 'user'|'assistant', message: { content: [{type:'text', text}, {type:'tool_use', ...}] } }
 *
 * user 消息的 text 内嵌:
 *   <timestamp>Monday, Jun 8, 2026, 2:20 PM (UTC+8)</timestamp>
 *   <user_query>真正的用户输入</user_query>
 *
 * 解析输出 (统一 Session schema):
 *   - id:           uuid (文件 basename)
 *   - title:        第一条 user_query 的首行 (去噪)
 *   - startedAt:    第一条可解析的 <timestamp> (fallback 文件 birthtime)
 *   - endedAt:      文件 mtime
 *   - workspaceDir: 项目目录名还原出的可读 label (e.g. 'pj2026-admin')
 *   - messages:     [{role, content, ts}] (assistant 只取 text 块, 跳过 tool_use)
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { parseJsonlFile } = require('./jsonl-reader');
const { firstMeaningfulLine } = require('./text-utils');

const CURSOR_BUNDLE_PATH = '/Applications/Cursor.app';
const CURSOR_PROJECTS_DIR = path.join(os.homedir(), '.cursor', 'projects');

class CursorDetectorImpl {
  constructor(opts = {}) {
    this.appName = 'cursor';
    this.bundlePath = opts.bundlePath || CURSOR_BUNDLE_PATH;
    this.projectsDir = opts.projectsDir || CURSOR_PROJECTS_DIR;
    // listSessions 时建 id → {file, projectDirName} 索引, readSession 直接查
    this._fileIndex = new Map();
  }

  /**
   * Cursor.app 存在, 或 projects 目录存在 (CLI-only 也算装了).
   * @returns {boolean}
   */
  isInstalled() {
    try {
      return fs.existsSync(this.bundlePath) || fs.existsSync(this.projectsDir);
    } catch {
      return false;
    }
  }

  /**
   * 扫 ~/.cursor/projects/<projectDir>/agent-transcripts/<uuid>/<uuid>.jsonl
   * 一个 jsonl = 一个任务. 返 SessionMeta[].
   * @returns {Promise<Array<{id: string, file: string, mtimeMs: number, sizeBytes: number}>>}
   */
  async listSessions() {
    let projectEntries;
    try {
      projectEntries = await fsp.readdir(this.projectsDir, { withFileTypes: true });
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'ENOTDIR')) {
        return [];
      }
      throw err;
    }

    const out = [];
    this._fileIndex = new Map();
    for (const projectEntry of projectEntries) {
      if (!projectEntry.isDirectory()) continue;
      const projectDirName = projectEntry.name;
      const transcriptsDir = path.join(this.projectsDir, projectDirName, 'agent-transcripts');
      let sessionDirs;
      try {
        sessionDirs = await fsp.readdir(transcriptsDir, { withFileTypes: true });
      } catch {
        continue; // 项目没有 agent-transcripts, 跳过
      }
      for (const sessionEntry of sessionDirs) {
        let file = null;
        let id = null;
        if (sessionEntry.isDirectory()) {
          // 新结构: <uuid>/<uuid>.jsonl
          id = sessionEntry.name;
          file = path.join(transcriptsDir, id, `${id}.jsonl`);
        } else if (sessionEntry.isFile() && sessionEntry.name.endsWith('.jsonl')) {
          // 容错: 平铺 <uuid>.jsonl
          id = sessionEntry.name.slice(0, -'.jsonl'.length);
          file = path.join(transcriptsDir, sessionEntry.name);
        } else {
          continue;
        }
        try {
          const st = await fsp.stat(file);
          if (!st.isFile() || st.size === 0) continue;
          this._fileIndex.set(id, { file, projectDirName, birthtimeMs: st.birthtimeMs });
          out.push({ id, file, mtimeMs: st.mtimeMs, sizeBytes: st.size });
        } catch {
          continue; // 目录里没有同名 jsonl, 跳过
        }
      }
    }
    return out;
  }

  /**
   * 读单个任务全文. id = transcript uuid.
   * @param {string} id
   * @returns {Promise<{id, startedAt, endedAt, messages, title?, workspaceDir?, file?}>}
   */
  async readSession(id) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('readSession: id must be non-empty string');
    }
    let indexed = this._fileIndex.get(id);
    if (!indexed) {
      // 没经过 listSessions (或文件新出现) → 重扫一次
      await this.listSessions();
      indexed = this._fileIndex.get(id);
    }
    if (!indexed) {
      throw new Error(`readSession: cursor transcript not found for id=${id}`);
    }
    const st = await fsp.stat(indexed.file);
    const parsed = await _parseTranscriptJsonl(indexed.file);
    const startedAt = parsed.firstTs || Math.floor(st.birthtimeMs) || 0;
    const out = {
      id,
      startedAt,
      endedAt: Math.floor(st.mtimeMs) || startedAt,
      messages: parsed.messages,
      file: indexed.file,
    };
    if (parsed.title) out.title = parsed.title;
    const label = _projectLabel(indexed.projectDirName);
    if (label) out.workspaceDir = label;
    return out;
  }
}

/**
 * 流式解析 transcript jsonl.
 * @param {string} file
 * @returns {Promise<{messages: Array, firstTs: number, title: string|null}>}
 */
async function _parseTranscriptJsonl(file) {
  const messages = [];
  let firstTs = 0;
  let lastTs = 0;
  let title = null;

  await parseJsonlFile(file, (row) => {
    const role = row.role === 'user' || row.role === 'assistant' ? row.role : null;
    if (!role) return;
    const rawText = _extractTextBlocks(row.message && row.message.content);
    if (!rawText) return;

    if (role === 'user') {
      const ts = _parseTimestampTag(rawText);
      if (ts > 0) {
        if (!firstTs) firstTs = ts;
        lastTs = ts;
      }
      const query = _extractUserQuery(rawText);
      if (!query) return;
      if (!title) title = firstMeaningfulLine(query, 60);
      messages.push({ role: 'user', content: query, ts: ts || lastTs || 0 });
    } else {
      messages.push({ role: 'assistant', content: rawText, ts: lastTs || 0 });
    }
  });
  return { messages, firstTs, title };
}

/**
 * message.content 数组里抽 text 块 (跳过 tool_use / image 等), 拼成字符串.
 */
function _extractTextBlocks(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const c of content) {
    if (!c || typeof c !== 'object') continue;
    if (c.type === 'text' && typeof c.text === 'string' && c.text.trim()) {
      parts.push(c.text);
    }
  }
  return parts.join('\n').trim();
}

/**
 * 抽 <user_query>...</user_query> 内文. 没标签时退回原文 (老格式容错),
 * 但要剔除 <timestamp>/<system_reminder> 等系统注入标签块.
 */
function _extractUserQuery(text) {
  const matches = [...String(text || '').matchAll(/<user_query>([\s\S]*?)<\/user_query>/g)];
  if (matches.length > 0) {
    return matches.map((m) => m[1].trim()).filter(Boolean).join('\n').trim();
  }
  // 无 user_query 标签: 去掉已知系统标签块后, 剩文本才算用户输入
  const stripped = String(text || '')
    .replace(/<timestamp>[\s\S]*?<\/timestamp>/g, '')
    .replace(/<system_reminder>[\s\S]*?<\/system_reminder>/g, '')
    .replace(/<attached_files>[\s\S]*?<\/attached_files>/g, '')
    .replace(/<system_notification>[\s\S]*?<\/system_notification>/g, '')
    .trim();
  // 整段都是别的 <xxx>...</xxx> 注入 → 不算用户输入
  if (!stripped || /^<[a-z_]+>[\s\S]*<\/[a-z_]+>$/.test(stripped)) return '';
  return stripped;
}

const _MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * 解析 <timestamp>Monday, Jun 8, 2026, 2:20 PM (UTC+8)</timestamp> → epoch ms.
 * 解析失败返 0.
 */
function _parseTimestampTag(text) {
  const m = /<timestamp>([\s\S]*?)<\/timestamp>/.exec(String(text || ''));
  if (!m) return 0;
  return _parseCursorTimestamp(m[1]);
}

function _parseCursorTimestamp(raw) {
  const m = /([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*\(UTC([+-]\d{1,2})(?::(\d{2}))?\)/i.exec(String(raw || ''));
  if (!m) return 0;
  const month = _MONTHS[m[1].toLowerCase()];
  if (month === undefined) return 0;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10) % 12;
  if (/pm/i.test(m[6])) hour += 12;
  const minute = parseInt(m[5], 10);
  const offsetHours = parseInt(m[7], 10);
  const offsetMinutes = m[8] ? parseInt(m[8], 10) * Math.sign(offsetHours || 1) : 0;
  const utc = Date.UTC(year, month, day, hour, minute, 0, 0);
  return utc - (offsetHours * 60 + offsetMinutes) * 60_000;
}

/**
 * 取首个有意义的行做 title (跳过 markdown 标题 / 路径 / URL 等噪声).
 * 单测仍从此模块导出.
 */
function _firstMeaningfulLine(text) {
  return firstMeaningfulLine(text, 60);
}

/**
 * 项目目录名 → 可读 label.
 *   'Users-shien-liang-Desktop-pj2026-admin' → 'pj2026-admin'
 *   'Users-shien-liang'                      → '~'
 *   '1777109260121' (数字临时目录)            → ''
 *   'empty-window'                           → 'empty-window'
 */
function _projectLabel(dirName) {
  const name = String(dirName || '');
  if (!name || /^\d+$/.test(name)) return '';
  const idx = name.indexOf('-Desktop-');
  if (idx >= 0) return name.slice(idx + '-Desktop-'.length);
  if (/^Users-/.test(name)) return '~';
  return name;
}

module.exports = {
  CursorDetectorImpl,
  CURSOR_BUNDLE_PATH,
  CURSOR_PROJECTS_DIR,
  // 内部 helper (单测)
  _parseTranscriptJsonl,
  _extractUserQuery,
  _parseCursorTimestamp,
  _projectLabel,
  _firstMeaningfulLine,
};
