/**
 * src/ai/assistant-threads-migrate.ts
 *
 * 历史会话读取时的一次性迁移清洗 — 旧版本会把 MiniMax 原生工具标记
 * (<minimax:tool_call>… / 杂散残片) 原样持久化进 assistantThreads,
 * 读取时统一清洗, 下次保存即自愈落盘。
 */

import { stripMiniMaxToolMarkup } from "./minimax-tool-markup";

export function sanitizePersistedThreads<T>(threads: unknown): T[] {
  if (!Array.isArray(threads)) return [];
  return threads.map((t: any) => {
    if (!t || !Array.isArray(t.messages)) return t;
    let changed = false;
    const messages = t.messages.map((m: any) => {
      if (
        m &&
        m.role === "assistant" &&
        typeof m.content === "string" &&
        /<minimax/i.test(m.content)
      ) {
        changed = true;
        return { ...m, content: stripMiniMaxToolMarkup(m.content) };
      }
      return m;
    });
    return changed ? { ...t, messages } : t;
  });
}
