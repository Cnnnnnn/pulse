/**
 * 对话导出为 Markdown / 复制剪贴板.
 */
import type { AiChatMessage } from "../../shared/ipc-contracts";
import { formatMessageTime } from "./chat-message-time.ts";

export type ShareMessagesOptions = {
  excludeSystem?: boolean;
  title?: string;
  exportedAt?: number;
  statsLine?: string;
  includeTimestamps?: boolean;
};

export function sanitizeExportFilename(title: string): string {
  const slug = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return slug || "pulse-chat";
}

export function messagesForShare(
  messages: AiChatMessage[],
  opts?: ShareMessagesOptions,
): AiChatMessage[] {
  if (!opts?.excludeSystem) return messages;
  return messages.filter((m) => m.role !== "system");
}

export function messagesToMarkdown(
  messages: AiChatMessage[],
  opts?: ShareMessagesOptions,
): string {
  const lines: string[] = [];
  lines.push(`# ${opts?.title?.trim() || "Pulse AI 助手对话"}\n`);
  if (opts?.exportedAt) {
    lines.push(
      `> 导出时间：${new Date(opts.exportedAt).toLocaleString("zh-CN")}\n`,
    );
  }
  if (opts?.statsLine?.trim()) {
    lines.push(`> ${opts.statsLine.trim()}\n`);
  }
  for (const m of messagesForShare(messages, opts)) {
    if (!m?.content?.trim()) continue;
    const who =
      m.role === "user" ? "你" : m.role === "system" ? "系统" : "助手";
    const timeLabel =
      opts?.includeTimestamps && m.ts
        ? formatMessageTime(m.ts)
        : "";
    const feedbackLabel =
      m.feedback === "up" ? " 👍" : m.feedback === "down" ? " 👎" : "";
    lines.push(
      `## ${who}${timeLabel ? ` · ${timeLabel}` : ""}${feedbackLabel}\n\n${m.content.trim()}\n`,
    );
    if (m.toolCards?.length) {
      for (const card of m.toolCards) {
        lines.push(`> **${card.tool}**: ${card.summary.replace(/\n/g, " ")}\n`);
      }
    }
  }
  return lines.join("\n").trim();
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function downloadChatMarkdown(
  messages: AiChatMessage[],
  filename?: string,
  opts?: ShareMessagesOptions,
): boolean {
  const md = messagesToMarkdown(messages, opts);
  if (!md || typeof document === "undefined") return false;
  try {
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = filename || `pulse-chat-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
