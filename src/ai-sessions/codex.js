/**
 * src/ai-sessions/codex.js
 *
 * CodexDetectorImpl — 2026-06-10 redesign.
 *
 * 之前: 1 个 JSONL 文件 = 1 个 session, readSession 返 1 个 Session, title 字段缺失
 *       (fallback 到第一条 user 消息 — 但那条是 AGENTS.md system 注入, 所有 session 都一样)
 *
 * 现在: 1 个 JSONL = N 个 sub-session, 按真实 user_query 边界切 (event_msg.user_message.timestamp).
 *       title 从 user_message 第一行非噪声文本抽. 跟 Cursor / minimax-code 行为对齐.
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
 * Sub-session 模型:
 *   sub-session id = `<original-uuid>#topic-<index>` (0-based)
 *   sub-session 包含 1 条 user (来自 user_message) + N 条 assistant
 *   0 user_message → 1 个 stub sub-session (全部 assistant)
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
    // 缓存 listSessions 时 parse 出来的 sub-sessions, 供 readSession 复用
    // key: 绝对文件路径, value: { originalUuid, workspaceDir, subSessions: [...] }
    this._parsedByFile = new Map();
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
   * 扫所有 rollout-*.jsonl, parse 每个, 给每个 sub-session 输出 1 条 meta.
   *
   * @returns {Promise<Array<{id: string, file: string, mtimeMs: number, sizeBytes: number}>>}
   */
  async listSessions() {
    this._parsedByFile = new Map();
    const files = await _scanAllRollouts(this.sessionsDir);
    const out = [];
    for (const f of files) {
      try {
        const parsed = await _parseCodexJsonl(f.file);
        this._parsedByFile.set(f.file, parsed);
        for (let i = 0; i < parsed.subSessions.length; i++) {
          out.push({
            id: parsed.subSessions[i].id,
            file: f.file,
            mtimeMs: f.mtimeMs,
            sizeBytes: f.sizeBytes,
          });
        }
      } catch (err) {
        // 单文件 parse 失败不阻塞其他文件
        // eslint-disable-next-line no-console
        console.warn(`[codex] parse failed for ${f.file}: ${err && err.message}`);
      }
    }
    return out;
  }

  /**
   * 读 sub-session 全文. id 格式: `<uuid>#topic-<N>` 或兼容老的 `<uuid>` / basename.
   *
   * @param {string} id
   * @returns {Promise<{id, startedAt, endedAt, messages, title?, workspaceDir?, file?}>}
   */
  async readSession(id) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('readSession: id must be non-empty string');
    }
    // 解析 id: 优先 "<uuid>#topic-<N>", fallback 到 "<uuid>" 兼容老 cache
    const m = /^(.+?)#topic-(\d+)$/.exec(id);
    const targetUuid = m ? m[1] : id;
    const targetIndex = m ? parseInt(m[2], 10) : 0;

    let file = null;
    let parsed = null;
    // 先在已 parse 的缓存里查 uuid
    for (const [f, p] of this._parsedByFile.entries()) {
      if (p.originalUuid === targetUuid || path.basename(f, '.jsonl').includes(targetUuid)) {
        file = f;
        parsed = p;
        break;
      }
    }
    // 没命中 (没经过 listSessions 或文件新出现) → 重扫
    if (!parsed) {
      file = await _findFileById(this.sessionsDir, targetUuid);
      if (!file) {
        throw new Error(`readSession: codex file not found for id=${id}`);
      }
      parsed = await _parseCodexJsonl(file);
      this._parsedByFile.set(file, parsed);
    }

    const sub = parsed.subSessions[targetIndex];
    if (!sub) {
      throw new Error(`readSession: codex sub-session not found for id=${id} (parsed ${parsed.subSessions.length} sub-sessions)`);
    }
    const out = {
      id: sub.id,
      startedAt: sub.startedAt,
      endedAt: sub.endedAt,
      messages: sub.messages,
      title: sub.title,
      file: parsed.filePath,
    };
    if (parsed.workspaceDir) out.workspaceDir = parsed.workspaceDir;
    return out;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * 递归扫 sessionsDir, 列所有 rollout-*.jsonl 文件.
 * @returns {Promise<Array<{file, mtimeMs, sizeBytes}>>}
 */
async function _scanAllRollouts(dir) {
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
      const inner = await _scanAllRollouts(sub);
      out.push(...inner);
    } else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) {
      try {
        const st = await fsp.stat(sub);
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
 * 流式读 JSONL, 提取所有 events (按时间顺序), 然后按 user_message 切 sub-session.
 *
 * @param {string} file
 * @returns {Promise<{
 *   originalUuid: string,
 *   workspaceDir: string|null,
 *   filePath: string,
 *   subSessions: Array<{id, startedAt, endedAt, messages, title}>
 * }>}
 */
async function _parseCodexJsonl(file) {
  const fsRaw = require('fs');
  const stream = fsRaw.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const events = []; // { kind: 'user'|'assistant', content, ts }
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
        events.push({ kind: 'user', content, ts });
      }
      continue;
    }

    // event_msg.agent_message → assistant 回复 (新格式)
    if (row.type === 'event_msg' && row.payload && row.payload.type === 'agent_message') {
      const content = typeof row.payload.message === 'string' ? row.payload.message.trim() : '';
      if (content) {
        events.push({ kind: 'assistant', content, ts });
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
        events.push({ kind: 'assistant', content, ts });
      }
    }
  }

  const originalUuid = sessionUuid || _idFromFilename(path.basename(file)) || path.basename(file, '.jsonl');
  const subSessions = _splitByUserMessage(events, originalUuid);

  const out = {
    originalUuid,
    workspaceDir: workspaceDir || null,
    filePath: file,
    subSessions,
  };
  return out;
}

/**
 * 按 user 事件切分 events → N 个 sub-session.
 * 0 user → 1 个 stub sub-session (全部 assistant messages).
 * assistant 在 user 之前 (agent prefill / artifact) → 跟下一个 user sub-session 合并,
 *   不丢消息, 不单独成 stub.
 */
function _splitByUserMessage(events, originalUuid) {
  // 按 ts asc 排序 (parse 阶段可能乱序, 取决于 IO)
  const sorted = [...events].sort((a, b) => (a.ts || 0) - (b.ts || 0));

  const subs = [];
  let current = null;
  let prefill = []; // assistant 在 user 之前 → 累积, 见到 user 时一起带过去

  for (const ev of sorted) {
    if (ev.kind === 'user') {
      // 提交上一个 sub
      if (current) subs.push(current);
      current = { messages: [...prefill, { role: 'user', content: ev.content, ts: ev.ts || 0 }] };
      prefill = [];
    } else {
      // assistant
      const msg = { role: 'assistant', content: ev.content, ts: ev.ts || 0 };
      if (current) {
        current.messages.push(msg);
      } else {
        // 还在 prefill 阶段, 等第一个 user
        prefill.push(msg);
      }
    }
  }
  if (current) subs.push(current);

  // 整文件没 user: prefill 全部收尾成 1 个 stub
  if (subs.length === 0) {
    subs.push({ messages: prefill });
  }

  return subs.map((sub, index) => {
    const tsList = sub.messages.map((m) => m.ts).filter((t) => t > 0);
    const startedAt = tsList.length > 0 ? Math.min(...tsList) : 0;
    const endedAt = tsList.length > 0 ? Math.max(...tsList) : 0;
    return {
      id: `${originalUuid}#topic-${index}`,
      startedAt,
      endedAt,
      messages: sub.messages,
      title: _extractCodexTitle(sub.messages),
    };
  });
}

/**
 * 从 sub-session messages 抽 title.
 * 优先 user 消息第一行非噪声文本, fallback 到 assistant 文本.
 */
function _extractCodexTitle(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  // 1. 优先 user (codex 这里的 user 一定是真 query, 不是 system 注入)
  for (const msg of messages) {
    if (!msg || msg.role !== 'user' || typeof msg.content !== 'string') continue;
    const line = _firstMeaningfulLine(msg.content);
    if (line) return _trimTitle(line);
  }
  // 2. fallback: assistant 第一条有意义文本
  for (const msg of messages) {
    if (!msg || msg.role !== 'assistant' || typeof msg.content !== 'string') continue;
    const line = _firstMeaningfulLine(msg.content);
    if (line) return _trimTitle(line);
  }
  return '';
}

/**
 * 跳 markdown 标题 / 单行 tag / 绝对路径 / URL / XML 标签块开头.
 * 跟 cursor.js 的 _firstMeaningfulLine 同思路 (独立实现, 避免跨文件 require).
 */
function _firstMeaningfulLine(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^#/.test(line)) continue;          // markdown 标题
    if (/^<[^>]+>$/.test(line)) continue;   // 单行 <tag>
    if (/^<[a-z_]+>/i.test(line)) continue; // <tag>...</tag> 开头 (XML 注入)
    if (/^\/Users\//.test(line)) continue;  // 绝对路径开头
    if (/^https?:\/\//i.test(line)) continue; // URL
    // 行内含绝对路径 (e.g. "- config.toml: /Users/.../config.toml") 也跳
    if (/\/Users\/[^\s]+/.test(line)) continue;
    // 行内含 URL 也跳
    if (/https?:\/\/\S+/.test(line)) continue;
    return line.replace(/\s+/g, ' ');
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
  _splitByUserMessage,
  _extractCodexTitle,
  _firstMeaningfulLine,
  _idFromFilename,
  _extractResponseContent,
};