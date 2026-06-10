/**
 * src/ai-sessions/codex.js
 *
 * CodexDetectorImpl — 2026-06-10 redesign (rev2: 取消 topic 拆分).
 *
 * Codex JSONL 路径:
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<uuid>.jsonl
 *
 * Schema (实测 2026-04, codex CLI 0.122; 2026-06 仍稳定):
 *   每行 JSON: { timestamp, type, payload }
 *     - type='session_meta'    → payload.cwd (workspace), payload.id (uuid)
 *     - type='response_item'   → payload.type === 'message', payload.role='user'|'assistant',
 *                                payload.content[]={type:'input_text', text} (或 input_image 等)
 *                                ⚠ role='user' 的是 AGENTS.md / IDE selection / env system 注入, **跳过**
 *     - type='event_msg'       → payload.type 是关键:
 *                                  - 'user_message'   → payload.message 是真用户 query
 *                                  - 'agent_message'  → payload.message 是 assistant 回复
 *                                  - 'token_count' / 'agent_reasoning' / 'task_started' / 'task_complete' → 跳过
 *
 * Session 模型 (rev2):
 *   1 个 JSONL = 1 个 session (跟 Cursor / minimax-code 风格对齐).
 *   Codex 一次启动 = 一次长对话窗口, 里面的多次 user_query 是连续追问, 不切 topic.
 *   之前按 user_message 切 sub-session 是错误的 — 一个长会话被切成几十个小碎片.
 *
 *   id = 文件 basename 里的 uuid (跟之前一样)
 *   title = 第一条 event_msg.user_message 第一行非噪声文本 (跟 Cursor 同算法)
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const readline = require('readline');

const CODEX_BUNDLE_PATH = '/Applications/Codex.app';
const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

class CodexDetectorImpl {
  constructor(opts = {}) {
    this.appName = 'codex';
    this.bundlePath = opts.bundlePath || CODEX_BUNDLE_PATH;
    this.sessionsDir = opts.sessionsDir || CODEX_SESSIONS_DIR;
  }

  /**
   * 检查 Codex.app 是否安装. 也接受 CLI-only 安装 (Codex 不是必须装 desktop app).
   * @returns {boolean}
   */
  isInstalled() {
    try {
      if (fs.existsSync(this.bundlePath)) return true;
      try {
        return fs.existsSync(this.sessionsDir);
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * 扫所有 rollout-*.jsonl, 给每个文件输出 1 条 meta (1 文件 = 1 session).
   *
   * 默认只扫 mtime 在最近 maxMtimeAgeDays 天内的文件 (用户基本不查 N 个月前的).
   * opts.maxMtimeAgeDays 可覆盖; 0 = 不限.
   *
   * @param {object} [opts]
   * @param {number} [opts.maxMtimeAgeDays=60]
   * @returns {Promise<Array<{id: string, file: string, mtimeMs: number, sizeBytes: number}>>}
   */
  async listSessions(opts = {}) {
    const maxMtimeAgeDays = (opts && typeof opts.maxMtimeAgeDays === 'number')
      ? opts.maxMtimeAgeDays
      : 60;
    const cutoffMs = maxMtimeAgeDays > 0
      ? Date.now() - maxMtimeAgeDays * 86400_000
      : 0;
    const files = await _scanAllRollouts(this.sessionsDir, cutoffMs);
    return files.map((f) => ({
      id: _idFromFilename(path.basename(f.file)) || path.basename(f.file, '.jsonl'),
      file: f.file,
      mtimeMs: f.mtimeMs,
      sizeBytes: f.sizeBytes,
    }));
  }

  /**
   * 读 session 全文. id 格式: `<uuid>` 或 basename.
   *
   * @param {string} id
   * @returns {Promise<{id, startedAt, endedAt, messages, title?, workspaceDir?, file?}>}
   */
  async readSession(id) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('readSession: id must be non-empty string');
    }
    const file = await _findFileById(this.sessionsDir, id);
    if (!file) {
      throw new Error(`readSession: codex file not found for id=${id}`);
    }
    return await _parseCodexJsonl(file);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * 递归扫 sessionsDir, 列所有 rollout-*.jsonl 文件.
 * cutoffMs = 0 → 不限; >0 → mtime < cutoffMs 的跳过 (省 stat / parse).
 * @param {string} dir
 * @param {number} [cutoffMs=0]
 * @returns {Promise<Array<{file, mtimeMs, sizeBytes}>>}
 */
async function _scanAllRollouts(dir, cutoffMs = 0) {
  const out = [];
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'ENOTDIR')) {
      return [];
    }
    throw err;
  }
  for (const e of entries) {
    const sub = path.join(dir, e.name);
    if (e.isDirectory()) {
      const inner = await _scanAllRollouts(sub, cutoffMs);
      out.push(...inner);
    } else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) {
      try {
        const st = await fsp.stat(sub);
        if (cutoffMs > 0 && st.mtimeMs < cutoffMs) continue;
        out.push({ file: sub, mtimeMs: st.mtimeMs, sizeBytes: st.size });
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

/**
 * 从 rollout-YYYY-MM-DDTHH-MM-SS-<uuid>.jsonl 抽出 uuid.
 * @param {string} name
 * @returns {string|null}
 */
function _idFromFilename(name) {
  const m = /^rollout-[\d-]+T[\d-]+-(.+)\.jsonl$/.exec(name);
  return m ? m[1] : null;
}

/**
 * 通过 id (uuid / basename) 找文件 — 递归 walk sessionsDir.
 * @param {string} dir
 * @param {string} id
 * @returns {Promise<string|null>}
 */
async function _findFileById(dir, id) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    const sub = path.join(dir, e.name);
    if (e.isDirectory()) {
      const r = await _findFileById(sub, id);
      if (r) return r;
    } else if (e.isFile() && e.name.includes(id) && e.name.endsWith('.jsonl')) {
      return sub;
    }
  }
  return null;
}

/**
 * 流式读 JSONL, 提取 Session {id, startedAt, endedAt, messages, title, workspaceDir}.
 *
 * 跟 Cursor / minimax-code 一致: 1 JSONL = 1 Session (一整次 Codex 对话窗口).
 * Codex 里 event_msg.user_message 是真用户 query (跳 AGENTS.md / IDE selection / env 注入).
 *
 * @param {string} file
 * @returns {Promise<{
 *   id: string,
 *   startedAt: number,
 *   endedAt: number,
 *   messages: Array<{role, content, ts}>,
 *   title: string,
 *   workspaceDir?: string,
 * }>}
 */
async function _parseCodexJsonl(file) {
  const fsRaw = require('fs');
  const stream = fsRaw.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const messages = []; // { role, content, ts }
  let sessionUuid = null;
  let workspaceDir = null;
  let idFromMeta = null;

  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row !== 'object') continue;

    const ts = _parseTs(row.timestamp);

    // session_meta → workspace / uuid
    if (row.type === 'session_meta' && row.payload && typeof row.payload === 'object') {
      if (typeof row.payload.cwd === 'string') workspaceDir = row.payload.cwd;
      if (typeof row.payload.id === 'string') idFromMeta = row.payload.id;
      if (idFromMeta) sessionUuid = idFromMeta;
      continue;
    }

    // event_msg.user_message → 真用户 query (codex 里这是唯一的 user 输入源)
    if (row.type === 'event_msg' && row.payload && row.payload.type === 'user_message') {
      const content = typeof row.payload.message === 'string' ? row.payload.message.trim() : '';
      if (content) {
        messages.push({ role: 'user', content, ts });
      }
      continue;
    }

    // event_msg.agent_message → assistant 回复 (新格式)
    if (row.type === 'event_msg' && row.payload && row.payload.type === 'agent_message') {
      const content = typeof row.payload.message === 'string' ? row.payload.message.trim() : '';
      if (content) {
        messages.push({ role: 'assistant', content, ts });
      }
      continue;
    }

    // response_item.message → assistant / user
    if (row.type === 'response_item' && row.payload && row.payload.type === 'message') {
      const role = row.payload.role;
      const content = _extractResponseContent(row.payload.content);
      // role='user' 在 codex 里是 AGENTS.md / IDE selection / env system 注入, **跳过**
      if (role === 'user') continue;
      if (role === 'assistant' && content) {
        messages.push({ role: 'assistant', content, ts });
      }
    }
  }

  // 按 ts asc 排序 (parse 阶段可能乱序, 取决于 IO)
  messages.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const tsList = messages.map((m) => m.ts).filter((t) => t > 0);
  const startedAt = tsList.length > 0 ? Math.min(...tsList) : 0;
  const endedAt = tsList.length > 0 ? Math.max(...tsList) : 0;

  const out = {
    id: sessionUuid || _idFromFilename(path.basename(file)) || path.basename(file, '.jsonl'),
    startedAt,
    endedAt,
    messages,
    title: _extractCodexTitle(messages),
  };
  if (workspaceDir) out.workspaceDir = workspaceDir;
  return out;
}

/**
 * 从 messages 抽 title.
 * 优先找**有信息量**的第一条 user 消息第一行非噪声文本, fallback 到 assistant.
 *
 * "信息量"过滤: 跳过 < 8 字符的 query (太短像 '可以'/'好的'/'ok'), 跳过常见语气词开头
 * (这样长会话里前几次短确认不会盖掉后续真正的 query).
 */
function _extractCodexTitle(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  // 1. 优先 user 消息 (codex 这里的 user 一定是真 query, 不是 system 注入)
  for (const msg of messages) {
    if (!msg || msg.role !== 'user' || typeof msg.content !== 'string') continue;
    const line = _firstInformativeLine(msg.content);
    if (line) return _trimTitle(line);
  }
  // 2. fallback: assistant 第一条有意义文本
  for (const msg of messages) {
    if (!msg || msg.role !== 'assistant' || typeof msg.content !== 'string') continue;
    const line = _firstInformativeLine(msg.content);
    if (line) return _trimTitle(line);
  }
  // 3. 实在没找到: 第一条 user 第一条 non-noise 行 (即便短)
  for (const msg of messages) {
    if (!msg || msg.role !== 'user' || typeof msg.content !== 'string') continue;
    const line = _firstMeaningfulLine(msg.content);
    if (line) return _trimTitle(line);
  }
  return '';
}

// 常见短确认/语气词开头 — 不足以作为 title, 跳过
// 注: 只匹配**整个 string**或**极短**(< 10字符)的. '麻烦看下...' 不是语气词, 不跳.
const _GENERIC_QUERY_RE = /^(可以|好的|好|ok|okay|yes|no|嗯|啊|哦|行|对|是|不是|继续|接着|然后|下一步|next|continue|go|ok,|好的,|好,|行,)$/i;

/**
 * 判断一行是否 "信息量足够" 做 title.
 *  - 非空, 去噪后 ≥ 8 字符
 *  - 不以常见短确认/语气词开头
 *  - 不全是标点/数字
 */
function _isInformativeLine(line) {
  if (!line || typeof line !== 'string') return false;
  const t = line.trim();
  if (t.length < 8) return false;
  if (_GENERIC_QUERY_RE.test(t)) return false;
  // 全是数字/标点不算
  if (!/[一-龥a-zA-Z]/.test(t)) return false;
  return true;
}

/**
 * 找第一条**信息量足够**的非噪声行 (vs _firstMeaningfulLine 只跳噪声不过滤信息量).
 * 用于 _extractCodexTitle 的"主路径".
 */
function _firstInformativeLine(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const clean = _stripNoiseLine(line);
    if (!clean) continue;
    if (_isInformativeLine(clean)) return clean;
  }
  return null;
}

/**
 * 跳 markdown 标题 / 单行 tag / 绝对路径 / URL / XML 标签块开头, 提取 clean 行.
 */
function _stripNoiseLine(line) {
  if (/^#/.test(line)) return null;
  if (/^<[^>]+>$/.test(line)) return null;
  if (/^<[a-z_]+>/i.test(line)) return null;
  if (/^\/Users\//.test(line)) return null;
  if (/^https?:\/\//i.test(line)) return null;
  if (/\/Users\/[^\s]+/.test(line)) return null;
  if (/https?:\/\/\S+/.test(line)) return null;
  return line.replace(/\s+/g, ' ');
}

/**
 * 找第一条 non-noise 行 (去掉 markdown 标题 / tag / 路径 / URL 后剩下的第一行).
 * 跟 cursor.js 的 _firstMeaningfulLine 同思路 (独立实现, 避免跨文件 require).
 */
function _firstMeaningfulLine(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const clean = _stripNoiseLine(line);
    if (clean) return clean;
  }
  return null;
}

function _trimTitle(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 48);
}

/**
 * Codex response_item.content 抽 text. 形如:
 *   [{type:'input_text', text:'...'}, {type:'input_image', image_url:'...'}, ...]
 * 跟 OpenAI Chat Completions content 数组同结构.
 */
function _extractResponseContent(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const c of content) {
    if (!c || typeof c !== 'object') continue;
    if (typeof c.text === 'string') {
      parts.push(c.text);
    } else if (typeof c.input_text === 'string') {
      // 容错: 有些 agent 把字段名写成 input_text
      parts.push(c.input_text);
    }
  }
  return parts.join('\n').trim();
}

/**
 * ISO timestamp 字符串 → epoch ms. 失败返 0.
 */
function _parseTs(ts) {
  if (typeof ts !== 'string' || ts.length === 0) return 0;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : 0;
}

module.exports = {
  CodexDetectorImpl,
  CODEX_BUNDLE_PATH,
  CODEX_SESSIONS_DIR,
  // 内部 helper (单测)
  _parseCodexJsonl,
  _extractCodexTitle,
  _firstMeaningfulLine,
  _idFromFilename,
  _extractResponseContent,
};