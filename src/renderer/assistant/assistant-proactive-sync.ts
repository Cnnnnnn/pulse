/**
 * Proactive system 消息同步 — 按 kind 替换/剔除过期项.
 */
import type { AiChatMessage } from "../../shared/ipc-contracts.ts";

const PROACTIVE_MARKER_RE = /^\[pulse-proactive:(\w+):/;

export function proactiveKindFromMessage(m: AiChatMessage): string | null {
  if (m.role !== "system") return null;
  const head = (m.content.split("\n")[0] || "").trim();
  const match = head.match(PROACTIVE_MARKER_RE);
  return match ? match[1] : null;
}

export function syncProactiveSystemMessages(
  messages: AiChatMessage[],
  buildFresh: () => AiChatMessage[],
): AiChatMessage[] {
  const fresh = buildFresh();
  const freshByKind = new Map<string, AiChatMessage>();
  for (const msg of fresh) {
    const kind = proactiveKindFromMessage(msg);
    if (kind) freshByKind.set(kind, msg);
  }

  const rest = messages.filter((m) => {
    const kind = proactiveKindFromMessage(m);
    return !kind || !freshByKind.has(kind);
  });

  return [...rest, ...freshByKind.values()];
}
