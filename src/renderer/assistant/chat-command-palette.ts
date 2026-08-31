/**
 * Cmd+K 命令面板 — AI 助手相关命令.
 */

export type AssistantPaletteItem = {
  id: string;
  kind: "action";
  label: string;
};

const OPEN_RE = /助手|ai|pulse|问/i;

export function parseAssistantAskText(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.match(/^(?:问[：:]?\s*|ai[：:]\s*)(.+)$/i);
  return (prefixed ? prefixed[1] : trimmed).trim() || null;
}

export function matchAssistantCommands(query: string): AssistantPaletteItem[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const out: AssistantPaletteItem[] = [];
  if (OPEN_RE.test(trimmed)) {
    out.push({
      id: "assistant-open",
      kind: "action",
      label: "打开 AI 助手",
    });
  }
  const askText = parseAssistantAskText(trimmed);
  if (!askText || askText.length < 2) return out;
  const preview =
    askText.length > 40 ? `${askText.slice(0, 40)}…` : askText;
  out.push({
    id: `assistant-ask:${askText}`,
    kind: "action",
    label: `问 AI 助手：${preview}`,
  });
  return out;
}
