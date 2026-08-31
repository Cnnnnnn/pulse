/**
 * 快捷操作芯片条.
 */
import { sendChatMessage } from "./assistant-store.ts";
import { useState } from "preact/hooks";
import { executeRendererAction } from "./assistant-actions.ts";
import {
  IconBarChart,
  IconCoin,
  IconNews,
  IconRefresh,
  IconSearch,
  IconTicket,
} from "../components/icons.tsx";
import {
  getQuickActionsForNav,
  type QuickAction,
} from "./chat-quick-actions.ts";
import { activeNav } from "../nav/navStore.ts";

async function runQuickAction(action: QuickAction) {
  if (action.message) {
    await sendChatMessage(action.message);
    return;
  }
  if (action.action) {
    await executeRendererAction(action.action);
  }
}

function quickActionIcon(id: string) {
  if (id === "digest") return IconNews;
  if (id === "funds") return IconCoin;
  if (id === "search") return IconSearch;
  if (id === "concerts" || id === "refresh-concerts") return IconTicket;
  if (id === "check" || id === "updates") return IconRefresh;
  return IconBarChart;
}

export function ChatQuickActionsBar({ disabled }: { disabled?: boolean }) {
  const actions = getQuickActionsForNav(activeNav.value, 3);
  const [runningId, setRunningId] = useState<string | null>(null);

  async function handleQuickAction(action: QuickAction) {
    if (disabled || runningId) return;
    setRunningId(action.id);
    try {
      await runQuickAction(action);
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div class="global-chat-quick-actions" role="toolbar" aria-label="快捷操作">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          class={`global-chat-quick-actions__chip${a.id === actions[0]?.id ? " is-primary" : ""}`}
          disabled={disabled || !!runningId}
          aria-busy={runningId === a.id}
          onClick={() => void handleQuickAction(a)}
        >
          <span class="global-chat-quick-actions__icon" aria-hidden="true">
            {(() => {
              const Icon = quickActionIcon(a.id);
              return <Icon size={13} />;
            })()}
          </span>
          <span>{runningId === a.id ? "处理中…" : a.label}</span>
        </button>
      ))}
    </div>
  );
}
