/**
 * 系统消息气泡（proactive 提醒 + 逐条/底部可点击操作）.
 */
import type { AiChatMessage, AiChatSystemItem } from "../../shared/ipc-contracts.ts";
import { executeRendererAction } from "./assistant-actions.ts";
import {
  ackProactiveKind,
  isProactiveKind,
} from "./assistant-proactive.ts";
import { proactiveKindFromMessage } from "./assistant-proactive-sync.ts";
import {
  dismissProactiveSystemKind,
  sendChatMessage,
} from "./assistant-store.ts";
import { SearchHighlightedText } from "./SearchHighlightedText.tsx";

const MARKER_RE = /^\[pulse-proactive:[^\]]+\]\n?/;

export function systemMessageBody(content: string): string {
  return content.replace(MARKER_RE, "").trim();
}

type SystemActionSpec = {
  label: string;
  message?: string;
};

export function systemActionSpec(m: AiChatMessage): SystemActionSpec | null {
  if (m.systemAction) {
    const tool = m.systemAction.tool;
    if (tool === "navigate") {
      const nav = m.systemAction.params?.nav;
      const labels: Record<string, string> = {
        concerts: "打开演出页",
        versions: "打开版本页",
        github: "打开 GitHub",
        news: "打开新闻",
      };
      return {
        label: labels[String(nav)] || "前往查看",
      };
    }
    return { label: "前往查看" };
  }
  const marker = m.content.split("\n")[0] || "";
  if (marker.includes(":concert:")) {
    return { label: "查看演出票价", message: "我监控的演出票价怎样？" };
  }
  if (marker.includes(":apps:")) {
    return { label: "查看应用更新", message: "有哪些应用需要更新？" };
  }
  if (marker.includes(":github:")) {
    return { label: "查看 GitHub", message: "哪些 GitHub 项目有新 release？" };
  }
  return null;
}

function ackMessageKind(message: AiChatMessage) {
  const kind = proactiveKindFromMessage(message);
  if (isProactiveKind(kind)) ackProactiveKind(kind);
}

export async function runSystemItemAction(
  item: AiChatSystemItem,
  message: AiChatMessage,
) {
  ackMessageKind(message);
  if (item.action) {
    await executeRendererAction(item.action);
    return;
  }
  if (item.message) {
    await sendChatMessage(item.message);
  }
}

export async function runSystemFooterAction(message: AiChatMessage) {
  ackMessageKind(message);
  const spec = systemActionSpec(message);
  if (message.systemAction) {
    await executeRendererAction(message.systemAction);
    return;
  }
  if (spec?.message) {
    await sendChatMessage(spec.message);
  }
}

export function ChatSystemMessage({
  message,
  highlightQuery = "",
}: {
  message: AiChatMessage;
  highlightQuery?: string;
}) {
  const spec = systemActionSpec(message);
  const body = systemMessageBody(message.content);
  const items = message.systemItems || [];
  const kind = proactiveKindFromMessage(message);
  const dismissible = isProactiveKind(kind);

  return (
    <div class="global-chat-msg global-chat-msg--system">
      <div class="global-chat-msg__bubble global-chat-msg__bubble--system">
        {dismissible && (
          <button
            type="button"
            class="global-chat-system__dismiss"
            aria-label="关闭此提醒"
            title="关闭"
            onClick={() => dismissProactiveSystemKind(kind)}
          >
            ×
          </button>
        )}
        {body && (
          <div class="global-chat-system__text">
            <SearchHighlightedText text={body} query={highlightQuery} />
          </div>
        )}
        {items.length > 0 && (
          <ul class="global-chat-system__items">
            {items.map((item, i) => (
              <li key={i}>
                <button
                  type="button"
                  class="global-chat-system__item-btn"
                  onClick={() => void runSystemItemAction(item, message)}
                  disabled={!item.action && !item.message}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        )}
        {spec && (
          <button
            type="button"
            class="global-chat-system__action"
            onClick={() => void runSystemFooterAction(message)}
          >
            {spec.label}
          </button>
        )}
      </div>
    </div>
  );
}
