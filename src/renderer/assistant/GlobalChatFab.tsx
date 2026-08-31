/**
 * src/renderer/assistant/GlobalChatFab.tsx
 *
 * 全局 AI 助手悬浮入口 — 右下角固定按钮.
 */
import {
  globalChatOpen,
  toggleGlobalChat,
} from "./assistant-store.ts";
import { chatFabBadge, chatFabHint } from "./assistant-proactive.ts";
import { IconSparkles } from "../components/icons.tsx";
import "./global-chat.css";

export function GlobalChatFab() {
  const open = globalChatOpen.value;
  const badge = chatFabBadge.value;
  const hint = chatFabHint.value;
  if (open) return null;
  return (
    <button
      type="button"
      class="global-chat-fab"
      onClick={toggleGlobalChat}
      title={hint ? `AI 助手 — ${hint} (⌘⇧J)` : "AI 助手 (⌘⇧J)"}
      aria-label={hint ? `打开 AI 助手，${hint}` : "打开 AI 助手"}
      aria-expanded={false}
    >
      <span class="global-chat-fab__icon" aria-hidden="true">
        <IconSparkles size={20} />
      </span>
      {badge > 0 && (
        <span class="global-chat-fab__badge" aria-hidden="true">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}
