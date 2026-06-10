/**
 * src/ai-sessions/engine.js
 *
 * 重做版总结引擎 — TaskSummaryEngine.
 *
 * 取代旧 DailyDigestRunner (digest.js) 的"按天自动 digest"模型:
 *   - 没有 bootstrap / backfill / 24h cron / marker digest / v1+v2 双存储
 *   - listTasks(dateKey):   扫描所有 detector, 按本地日过滤, 返任务卡列表 (不调 LLM)
 *   - summarizeTasks(keys): 逐任务调 LLM, 每完成一个回调 onTaskDone, 结果按任务缓存
 *
 * 缓存 (state.json task_summaries):
 *   key   = "<appName>:<sessionId>"
 *   entry = { taskKey, sessionId, appName, title, userGoal, outcome,
 *             provider, model, generatedAt, contentHash, dateKey }
 *   任务消息变了 (contentHash 不匹配) → 卡片标 stale, UI 提示可重新生成.
 *
 * CommonJS, 跟 src/config/ 一致.
 */

class TaskSummaryEngine {
  /**
   * @param {object} opts
   * @param {Array}  opts.detectors    AISessionDetector[]
   * @param {object} opts.summarizer   LLMSummarizer
   * @param {object} opts.storage      { loadTaskSummaries, saveTaskSummary }
   * @param {object} [opts.config]     { locale }
   * @param {object} [opts.log]        logger (.info/.warn/.error)
   */
  constructor({ detectors, summarizer, storage, config, log } = {}) {
    if (!Array.isArray(detectors)) {
      throw new TypeError('TaskSummaryEngine: detectors must be array');
    }
    if (!summarizer || typeof summarizer.summarize !== 'function') {
      throw new TypeError('TaskSummaryEngine: summarizer must have summarize()');
    }
    if (!storage || typeof storage.loadTaskSummaries !== 'function'
                 || typeof storage.saveTaskSummary !== 'function') {
      throw new TypeError('TaskSummaryEngine: storage must have loadTaskSummaries/saveTaskSummary');
    }
    this.detectors = detectors;
    this.summarizer = summarizer;
    this.storage = storage;
    this.config = config || {};
    this.log = log || { info: () => {}, warn: () => {}, error: () => {} };
  }

  /**
   * 扫描指定日期的任务列表 (不调 LLM). 已缓存的总结直接带出.
   *
   * @param {string} dateKey   'YYYY-MM-DD'
   * @param {object} [opts]    { now }
   * @returns {Promise<{dateKey, collectedAt, tasks: Array, sourceStats: Array}>}
   */
  async listTasks(dateKey, opts = {}) {
    _assertDateKey(dateKey, 'listTasks');
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    const snapshot = await this._collectSessions(dateKey, now);
    let cache = {};
    try {
      cache = this.storage.loadTaskSummaries() || {};
    } catch (err) {
      this.log.warn(`[tasks] loadTaskSummaries failed: ${err.message}`);
    }
    const tasks = snapshot.sessions
      .map((s) => _toTaskCard(s, cache))
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    return { dateKey, collectedAt: now, tasks, sourceStats: snapshot.sourceStats };
  }

  /**
   * 为选中任务生成总结 (逐任务 1 次 LLM call, 串行防限流).
   * 每完成 / 失败一个任务调 onTaskDone(event):
   *   { taskKey, ok: true, task }   — 成功, task 是带 summary 的新任务卡
   *   { taskKey, ok: false, error } — 失败
   *
   * @param {string[]} taskKeys       ["cursor:<uuid>", ...]
   * @param {object} opts             { dateKey, now, onTaskDone }
   * @returns {Promise<{ok: boolean, dateKey, results: Array, failures: Array}>}
   */
  async summarizeTasks(taskKeys, opts = {}) {
    const dateKey = opts.dateKey;
    _assertDateKey(dateKey, 'summarizeTasks');
    const keys = Array.isArray(taskKeys)
      ? taskKeys.filter((k) => typeof k === 'string' && k.length > 0)
      : [];
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    const onTaskDone = typeof opts.onTaskDone === 'function' ? opts.onTaskDone : () => {};
    if (keys.length === 0) {
      return { ok: false, dateKey, results: [], failures: [{ taskKey: null, message: 'no_tasks_selected' }] };
    }

    const snapshot = await this._collectSessions(dateKey, now);
    const byKey = new Map(snapshot.sessions.map((s) => [_taskKeyOf(s), s]));
    const locale = this.config.locale || 'zh-CN';
    const results = [];
    const failures = [];

    for (let i = 0; i < keys.length; i++) {
      const taskKey = keys[i];
      const session = byKey.get(taskKey);
      if (!session) {
        failures.push({ taskKey, message: 'task_not_found' });
        onTaskDone({ taskKey, ok: false, error: 'task_not_found' });
        continue;
      }
      const t0 = Date.now();
      try {
        const rawText = await this.summarizer.summarize([session], {
          dateKey,
          locale,
          perSession: true,
          perSessionIndex: i,
        });
        const parsed = _parsePerSessionBlock(rawText, i);
        const fields = _extractSummaryFields(parsed.summary);
        const entry = {
          taskKey,
          sessionId: session.id,
          appName: session.appName || 'unknown',
          title: parsed.title,
          userGoal: fields.userGoal,
          outcome: fields.outcome,
          provider: this.summarizer.provider,
          model: this.summarizer.model,
          generatedAt: Date.now(),
          contentHash: _contentHash(session),
          dateKey,
        };
        this.storage.saveTaskSummary(entry);
        const task = _toTaskCard(session, { [taskKey]: entry });
        results.push(task);
        onTaskDone({ taskKey, ok: true, task });
        this.log.info(`[tasks] ${dateKey} ${taskKey} summarized (${Date.now() - t0}ms)`);
      } catch (err) {
        const message = (err && err.message) || 'unknown';
        failures.push({ taskKey, message });
        onTaskDone({ taskKey, ok: false, error: message });
        this.log.warn(`[tasks] ${dateKey} ${taskKey} summarize failed: ${message}`);
      }
    }
    return { ok: failures.length === 0, dateKey, results, failures };
  }

  /**
   * 内部: 问所有 detector, 按本地日过滤, 返 {sessions, sourceStats}.
   */
  async _collectSessions(dateKey, now) {
    const sessions = [];
    const sourceStats = [];
    for (const det of this.detectors) {
      if (!det || typeof det.isInstalled !== 'function') continue;
      let installed = false;
      try {
        installed = await det.isInstalled();
      } catch { /* treat as not installed */ }
      if (!installed) {
        sourceStats.push({ appName: det.appName, installed: false, metaCount: 0, matchedCount: 0 });
        continue;
      }
      let metas = [];
      try {
        metas = await det.listSessions();
      } catch (err) {
        this.log.warn(`[tasks] ${det.appName} listSessions failed: ${err.message}`);
        sourceStats.push({ appName: det.appName, installed: true, metaCount: 0, matchedCount: 0 });
        continue;
      }
      let matchedCount = 0;
      for (const m of metas) {
        // 粗过滤: mtime 距 dateKey 超过 2 天的不必读全文 (省 IO)
        if (typeof m.mtimeMs === 'number' && m.mtimeMs > 0 && !_nearDay(m.mtimeMs, dateKey, now)) {
          continue;
        }
        try {
          const sess = await det.readSession(m.id);
          const normalized = { ...sess, appName: sess.appName || det.appName || 'unknown' };
          const filtered = det.filterByLocalDay([normalized], dateKey, now);
          if (filtered.length > 0) {
            sessions.push(filtered[0]);
            matchedCount += 1;
          }
        } catch (err) {
          this.log.warn(`[tasks] ${det.appName}/${m.id} read failed: ${err.message}`);
        }
      }
      sourceStats.push({ appName: det.appName, installed: true, metaCount: metas.length, matchedCount });
    }
    return { sessions, sourceStats };
  }
}

// ── Module helpers ───────────────────────────────────────────────────

function _assertDateKey(dateKey, fn) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new TypeError(`${fn}: dateKey must be YYYY-MM-DD`);
  }
}

/**
 * 粗过滤: mtime 是否落在 dateKey 前后 2 天窗口内 (本地时区误差容忍).
 * 不精确 — 精确过滤交给 detector.filterByLocalDay; 这里只为省读全文的 IO.
 */
function _nearDay(mtimeMs, dateKey, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return true;
  const approx = Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return Math.abs(mtimeMs - approx) <= 2 * 86400_000;
}

function _taskKeyOf(session) {
  return `${(session && session.appName) || 'unknown'}:${(session && session.id) || ''}`;
}

/**
 * 任务内容 hash (djb2). 消息变了 → hash 变 → 缓存标 stale.
 */
function _contentHash(session) {
  const messages = Array.isArray(session && session.messages) ? session.messages : [];
  let h = 5381;
  for (const m of messages) {
    const s = `${(m && m.role) || ''}\n${(m && m.content) || ''}\n`;
    for (let i = 0; i < s.length; i++) {
      h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    }
  }
  return `${messages.length}-${h.toString(16)}`;
}

/**
 * Session → 任务卡 (UI 渲染用). cacheMap 命中时带 summary.
 */
function _toTaskCard(session, cacheMap) {
  const taskKey = _taskKeyOf(session);
  const hash = _contentHash(session);
  const cached = cacheMap && typeof cacheMap === 'object' ? cacheMap[taskKey] : null;
  const summary = cached && typeof cached === 'object'
    ? {
      title: cached.title || '',
      userGoal: cached.userGoal || '',
      outcome: cached.outcome || '',
      provider: cached.provider || null,
      model: cached.model || null,
      generatedAt: cached.generatedAt || 0,
      stale: cached.contentHash !== hash,
    }
    : null;
  return {
    taskKey,
    sessionId: session.id,
    appName: session.appName || 'unknown',
    title: _inferTaskTitle(session),
    project: _projectOf(session),
    startedAt: session.startedAt || 0,
    endedAt: session.endedAt || 0,
    msgCount: Array.isArray(session.messages) ? session.messages.length : 0,
    jumpTarget: _resolveJumpTarget(session),
    contentHash: hash,
    summary,
  };
}

/**
 * 项目 label: workspaceDir 是绝对路径取最后一段, 已是 label 直接用.
 */
function _projectOf(session) {
  const dir = session && typeof session.workspaceDir === 'string' ? session.workspaceDir.trim() : '';
  if (!dir) return '';
  if (dir.includes('/')) {
    const parts = dir.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : '';
  }
  return dir;
}

/**
 * 任务标题: detector 的 title 优先, 否则第一条非噪声 user 消息首行.
 */
function _inferTaskTitle(session) {
  if (session && typeof session.title === 'string' && session.title.trim() && !_looksLikePromptNoise(session.title)) {
    return session.title.trim().replace(/\s+/g, ' ').slice(0, 48);
  }
  if (!session || !Array.isArray(session.messages)) return '';
  for (const msg of session.messages) {
    if (!msg || msg.role !== 'user' || typeof msg.content !== 'string') continue;
    const lines = msg.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (_looksLikePromptNoise(line)) continue;
      return line.replace(/\s+/g, ' ').slice(0, 48);
    }
  }
  return '';
}

function _looksLikePromptNoise(text) {
  const line = String(text || '').trim();
  if (!line) return true;
  if (/^#/.test(line)) return true;
  if (/^<[^>]+>$/.test(line)) return true;
  if (/^You are /i.test(line)) return true;
  if (/AGENTS\.md/i.test(line)) return true;
  if (/instructions?\s+for/i.test(line)) return true;
  if (/^\/Users\//.test(line)) return true;
  if (/^https?:\/\//i.test(line)) return true;
  if (/^\[[^\]]+\]\(.+\)$/.test(line)) return true;
  if (line.split('/').length >= 4) return true;
  return false;
}

/**
 * Parse 单任务 LLM 输出, 抽出 (title, summary). 期望格式:
 *   ### Session <N>: <title>
 *   - 用户诉求：...
 *   - 处理结果：...
 * 容错: 模型漏 "###" / 加前言 / 标题含 ":".
 */
function _parsePerSessionBlock(text, index) {
  const fallbackTitle = `任务 ${index + 1}`;
  if (typeof text !== 'string' || text.length === 0) {
    return { title: fallbackTitle, summary: '' };
  }
  const lines = text.split(/\r?\n/);
  let titleLine = null;
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*#{1,3}\s*Session\s*\d+\s*[:：]\s*(.+?)\s*$/i.exec(lines[i]);
    if (m) {
      titleLine = m[1];
      bodyStart = i + 1;
      break;
    }
  }
  if (!titleLine) {
    const title = _normalizeTitle((lines[0] || fallbackTitle).trim().slice(0, 60), fallbackTitle);
    return { title, summary: text.trim() };
  }
  const body = lines.slice(bodyStart).join('\n').trim();
  return {
    title: _normalizeTitle(titleLine.trim() || fallbackTitle, fallbackTitle),
    summary: body || text,
  };
}

function _normalizeTitle(title, fallbackTitle) {
  const raw = String(title || '').replace(/^[-*#\s]+/, '').replace(/\s+/g, ' ').trim();
  if (!raw) return fallbackTitle;
  return raw.slice(0, 40);
}

/**
 * 从 summary 文本抽 (用户诉求, 处理结果). 模型没按格式时尽量兜底.
 */
function _extractSummaryFields(summary) {
  const text = typeof summary === 'string' ? summary : '';
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^#{1,6}\s*/.test(l))
    .filter((l) => !/^session\s*\d+/i.test(l));

  let userGoal = '';
  let outcome = '';
  const extra = [];
  for (const line of rawLines) {
    const clean = line.replace(/^[-*•]\s*/, '').trim();
    if (!userGoal) {
      const m = /^(用户诉求|目标|需求|任务)[:：]\s*(.+)$/.exec(clean);
      if (m) { userGoal = m[2].trim(); continue; }
    }
    if (!outcome) {
      const m = /^(处理结果|结果|结论|进展)[:：]\s*(.+)$/.exec(clean);
      if (m) { outcome = m[2].trim(); continue; }
    }
    extra.push(clean);
  }
  if (!userGoal && extra.length > 0) userGoal = extra.shift();
  if (!outcome && extra.length > 0) outcome = extra.join(' ');
  return {
    userGoal: userGoal.replace(/\s+/g, ' ').trim().slice(0, 160),
    outcome: outcome.replace(/\s+/g, ' ').trim().slice(0, 300),
  };
}

/**
 * "跳到原始 session" 链接:
 *   - codex        : codex://<session-uuid>
 *   - minimax-code : minimax://<session-id>
 *   - cursor / 其它: session.file 绝对路径 (shell.openPath)
 */
function _resolveJumpTarget(session) {
  if (!session) return null;
  const app = session.appName || '';
  const id = session.id || '';
  const file = session.file || null;
  if (app === 'codex') return `codex://${id}`;
  if (app === 'minimax-code') return `minimax://${id}`;
  return file || null;
}

module.exports = {
  TaskSummaryEngine,
  // helpers export (单测)
  _taskKeyOf,
  _contentHash,
  _toTaskCard,
  _parsePerSessionBlock,
  _extractSummaryFields,
  _inferTaskTitle,
  _resolveJumpTarget,
  _projectOf,
};
