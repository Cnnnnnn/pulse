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
        'Produce a concise daily summary in markdown:',
        '- Group by theme/task',
        '- Highlight important decisions or blockers',
        '- Keep it under 300 words',
        '- Reply ONLY with the summary, no preamble',
      ].join(' ')
    : [
        '你是一位个人 AI 助理, 帮开发者总结一天的工作。',
        '你会拿到一组跟 AI 编码工具的聊天 session。',
        '请用 markdown 输出当日工作总结:',
        '- 按主题/任务分组',
        '- 标出重要决策或卡点',
        '- 控制在 300 字以内',
        '- 只返 summary, 不要客套话',
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
  formatSessionBlock,
  MAX_SESSION_MESSAGES,
  MAX_MESSAGE_CONTENT_CHARS,
};
