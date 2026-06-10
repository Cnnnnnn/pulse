/**
 * src/ai-sessions/prompts.js
 *
 * Phase B1a (AI Sessions Daily Digest): prompt template 集中管理.
 *
 * 1 个主 prompt: buildDigestPrompt({ sessions, dateKey, locale, model, provider })
 *   - flatten sessions (id, role/content/ts) → markdown 块
 *   - 拼 system + user messages, 走 OpenAI / Ollama 兼容的 [{role, content}] 格式
 *
 * 后续可加: per-session prompt / different locale (spec §1.3 多语言 v2 留).
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const MAX_SESSION_MESSAGES = 60;       // 防止 prompt 爆 token
const MAX_MESSAGE_CONTENT_CHARS = 4000;  // 单条消息上限

/**
 * 单个 session → markdown 块 (id + role/content/ts 序列).
 * @param {object} session  Session (spec §4.1)
 * @returns {string}         markdown block
 */
function formatSessionBlock(session, idx) {
  if (!session) return '';
  const lines = [];
  lines.push(`### Session ${idx + 1}: ${session.id || '(unknown)'}`);
  if (session.appName) lines.push(`- app: ${session.appName}`);
  if (typeof session.title === 'string' && session.title.trim()) {
    lines.push(`- 任务标题(用户第一条输入): ${session.title.trim().slice(0, 80)}`);
  }
  if (typeof session.workspaceDir === 'string' && session.workspaceDir.trim()) {
    lines.push(`- 项目: ${session.workspaceDir.trim()}`);
  }
  if (session.startedAt) lines.push(`- started: ${new Date(session.startedAt).toISOString()}`);
  if (session.endedAt) lines.push(`- ended:   ${new Date(session.endedAt).toISOString()}`);
  const msgs = Array.isArray(session.messages) ? session.messages.slice(0, MAX_SESSION_MESSAGES) : [];
  if (Array.isArray(session.messages) && session.messages.length > MAX_SESSION_MESSAGES) {
    lines.push(`- (truncated to ${MAX_SESSION_MESSAGES} of ${session.messages.length} messages)`);
  }
  lines.push('');
  lines.push('```');
  for (const m of msgs) {
    const role = (m && m.role) || 'unknown';
    const content = String((m && m.content) || '').slice(0, MAX_MESSAGE_CONTENT_CHARS);
    const ts = (m && typeof m.ts === 'number') ? new Date(m.ts).toISOString() : '';
    lines.push(`[${ts}] ${role}: ${content}`);
  }
  lines.push('```');
  return lines.join('\n');
}

/**
 * Phase B5b (per-session digest): build prompt for SUMMARIZING ONE SESSION.
 *
 * 跟 buildDigestPrompt 不同 — 这只喂单 session, 强制 model 输出
 * "### Session N: <title>\n<summary>" 格式的短答 (2-3 句).
 *
 * 原因: 大模型 (尤其 coder 模型如 qwen2.5-coder:7b) 在 batch 模式下
 * 会忽略 "per-session" 指令, 1 坨输出. 拆成 N 次单 session 调,
 * 每次 prompt 小、token 紧、model 只能按指令给出短答.
 *
 * @param {object} opts
 * @param {object} opts.session    单个 session
 * @param {number}  opts.index     0-based session index (写进标题)
 * @param {string}  [opts.locale]  'zh-CN' (default)
 * @returns {{ messages: Array<{role: string, content: string}>, meta: object }}
 */
function buildPerSessionPrompt({ session, index, locale }) {
  const safeLocale = (locale === 'en-US' || locale === 'en') ? 'en' : 'zh-CN';

  const system = safeLocale === 'en'
    ? [
        'You are a personal AI assistant that summarises ONE AI coding chat session.',
        'You will be given the messages of a single session between a user and an AI coding tool.',
        'Output EXACTLY this format (no preamble, no extra text):',
        '',
        '### Session <N>: <short title, 3-6 words>',
        '<2-3 sentence summary>',
        '',
        '- The summary must capture: what the user was trying to do, and the key outcome',
        '  (fixed / blocked / exploring / decided / etc.).',
        '- Be concrete. Use the language from the chat (Chinese if user spoke Chinese, English otherwise).',
        '- Do NOT add explanations before or after the block.',
      ].join('\n')
    : [
        '你是一位个人 AI 助理, 帮开发者总结"单个"AI 编码聊天 session。',
        '无论原始对话里出现中文还是英文, 最终都必须只用简体中文输出。',
        '你会拿到 1 个 session 的 user / assistant 对话消息。',
        '严格按下面格式输出 (不要客套话, 不要多余文字, 不要输出英文标题):',
        '',
        '### Session <N>: <6-14字中文标题>',
        '- 用户诉求：<1句话，说明用户想做什么>',
        '- 处理结果：<1-2句话，说明做了什么、结果如何>',
        '',
        '- 标题必须简洁、明确、自然，不要写英文，不要写 session 编号解释。',
        '- “用户诉求” 只写目标，不要展开过程。',
        '- “处理结果” 只写关键动作和最终状态，可写修复完成 / 待继续排查 / 仅完成设计等。',
        '- 不能输出项目符号以外的额外段落，不能写“总结如下”“好的”。',
        '- 不要写开头或结尾。',
      ].join('\n');

  const block = formatSessionBlock(session, index);
  const user = `# 日期: ${(session && session.startedAt) ? new Date(session.startedAt).toISOString().slice(0, 10) : 'unknown'}\n\n${block}`;

  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    meta: {
      locale: safeLocale,
      sessionId: session && session.id,
      index,
    },
  };
}

/**
 * Build digest prompt messages (system + user).
 *
 * @param {object} opts
 * @param {Array} opts.sessions
 * @param {string} opts.dateKey       'YYYY-MM-DD'
 * @param {string} [opts.locale]      'zh-CN' (default)
 * @param {string} [opts.model]       注入 meta, 写进 system prompt (让 LLM 知道模型)
 * @param {string} [opts.provider]    注入 meta
 * @returns {{ messages: Array<{role: string, content: string}>, meta: object }}
 */
function buildDigestPrompt({ sessions, dateKey, locale, model, provider }) {
  const safeLocale = (locale === 'en-US' || locale === 'en') ? 'en' : 'zh-CN';

  const system = safeLocale === 'en'
    ? [
        'You are a personal AI assistant that summarises a developer\'s daily work.',
        'You will be given a set of chat sessions with an AI coding tool.',
        'Produce a PER-SESSION summary in markdown:',
        '- For EACH session, write a short title (3-6 words) and a 2-3 sentence summary.',
        '  The summary should capture what the user was trying to do and the key outcome',
        '  (fixed / blocked / exploring / decided / etc.).',
        '- Format each session EXACTLY as:',
        '  ### Session <N>: <title>',
        '  <summary>',
        '- Do NOT group sessions by theme — keep them in input order.',
        '- Do NOT add an overall intro or outro.',
        '- Reply ONLY with the per-session blocks, no preamble.',
      ].join(' ')
    : [
        '你是一位个人 AI 助理, 帮开发者总结一天的工作。',
        '无论原始对话里出现中文还是英文, 最终都必须只用简体中文输出。',
        '你会拿到一组跟 AI 编码工具的聊天 session。',
        '请用 markdown 逐个 session 输出总结:',
        '- 每个 session 都必须严格使用下面固定格式，不要自由发挥段落样式。',
        '- 严格按下面格式:',
        '  ### Session <N>: <6-14字中文标题>',
        '  - 用户诉求：<1句话>',
        '  - 处理结果：<1-2句话>',
        '- 不要按主题把多个 session 合并到一段, 保持每个 session 独立。',
        '- 标题必须是中文短标题，不要英文，不要空泛词。',
        '- “用户诉求” 只写目标，“处理结果” 只写关键动作和最终状态。',
        '- 不要写开头总述或结尾总结。',
        '- 只返 per-session 块, 不要客套话。',
      ].join(' ');

  const lines = [];
  lines.push(`# 日期: ${dateKey}`);
  lines.push(`# Session 总数: ${sessions.length}`);
  lines.push('');
  if (sessions.length === 0) {
    lines.push('(无 session 数据)');
  } else {
    sessions.forEach((s, i) => {
      const block = formatSessionBlock(s, i);
      if (block) {
        lines.push(block);
        lines.push('');
      }
    });
  }

  const user = lines.join('\n').trim();

  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    meta: {
      dateKey,
      locale: safeLocale,
      sessionCount: sessions.length,
      model: model || null,
      provider: provider || null,
    },
  };
}

module.exports = {
  buildDigestPrompt,
  buildPerSessionPrompt,
  formatSessionBlock,
  MAX_SESSION_MESSAGES,
  MAX_MESSAGE_CONTENT_CHARS,
};
