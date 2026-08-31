/**
 * 工具结果卡片 — 可点击跳转
 */
import type { AiChatToolCard } from "../../shared/ipc-contracts";
import { ASSISTANT_TOOL_CARD_LABELS } from "../../shared/assistant-tool-labels.ts";
import { executeRendererAction } from "./assistant-actions.ts";

function actionLabel(tool: string): string {
  if (tool === "upgrade_app") return "更新";
  if (tool === "navigate") return "打开";
  if (tool.startsWith("open_") || tool.startsWith("query_")) return "查看";
  return "执行";
}

export function ChatToolCards({ cards }: { cards: AiChatToolCard[] }) {
  if (!cards || cards.length === 0) return null;
  return (
    <div class="global-chat-tool-cards">
      {cards.map((card, ci) => (
        <div key={ci} class="global-chat-tool-card">
          <div class="global-chat-tool-card__head">
            <span class="global-chat-tool-card__tag">
              {card.tool === "query_apps"
                ? "可更新应用"
                : ASSISTANT_TOOL_CARD_LABELS[card.tool] || card.tool}
            </span>
            <p class="global-chat-tool-card__summary">{card.summary}</p>
          </div>
          {card.items && card.items.length > 0 && (
            <ul class="global-chat-tool-card__items">
              {card.items.map((item, ii) => (
                <li key={ii}>
                  {item.action ? (
                    <button
                      type="button"
                      class="global-chat-tool-card__item-btn"
                      onClick={() => void executeRendererAction(item.action!)}
                    >
                      <span class="global-chat-tool-card__item-label">{item.label}</span>
                      {item.meta && (
                        <span class="global-chat-tool-card__item-meta">{item.meta}</span>
                      )}
                      <span class="global-chat-tool-card__item-cta">
                        {actionLabel(item.action.tool)}
                      </span>
                    </button>
                  ) : (
                    <div class="global-chat-tool-card__item-static">
                      <span class="global-chat-tool-card__item-label">{item.label}</span>
                      {item.meta && (
                        <span class="global-chat-tool-card__item-meta">{item.meta}</span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
