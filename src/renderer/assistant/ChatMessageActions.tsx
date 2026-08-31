/**
 * 单条消息操作：复制 / 引用 / 编辑 / 重问 / 反馈 / 删除 + 时间戳.
 */
import type { AiChatMessage } from "../../shared/ipc-contracts.ts";
import {
  copyChatMessage,
  deleteMessageAt,
  regenerateLastResponse,
  resendFromUserMessage,
  setMessageFeedback,
} from "./assistant-store.ts";
import { formatMessageTime } from "./chat-message-time.ts";
import { IconThumbsDown, IconThumbsUp } from "../components/icons.tsx";

function handleDelete(message: AiChatMessage, messageIndex: number) {
  if (
    message.role === "assistant" &&
    message.content?.trim() &&
    !window.confirm("确定删除这条助手回复？")
  ) {
    return;
  }
  deleteMessageAt(messageIndex);
}

export function ChatMessageActions({
  message,
  messageIndex,
  canRegenerate,
  canResendFromTurn,
  canEditUserMessage,
  canQuote,
  canDelete,
  canFeedback,
  onEditUserMessage,
  onQuoteMessage,
  disabled,
}: {
  message: AiChatMessage;
  messageIndex?: number;
  canRegenerate?: boolean;
  canResendFromTurn?: boolean;
  canEditUserMessage?: boolean;
  canQuote?: boolean;
  canDelete?: boolean;
  canFeedback?: boolean;
  onEditUserMessage?: (_index: number) => void;
  onQuoteMessage?: (_index: number) => void;
  disabled?: boolean;
}) {
  if (message.role !== "user" && message.role !== "assistant") return null;
  const timeLabel = formatMessageTime(message.ts);
  if (
    !message.content?.trim() &&
    !canRegenerate &&
    !canResendFromTurn &&
    !canEditUserMessage &&
    !canQuote &&
    !canDelete &&
    !canFeedback &&
    !timeLabel
  ) {
    return null;
  }

  return (
    <div class="global-chat-msg__meta">
      {timeLabel && (
        <span class="global-chat-msg__time" title={timeLabel}>
          {timeLabel}
        </span>
      )}
      <div class="global-chat-msg__actions">
        {canFeedback && messageIndex != null && message.content?.trim() && (
          <>
            <button
              type="button"
              class={`global-chat-msg__action global-chat-msg__action--feedback${
                message.feedback === "up"
                  ? " global-chat-msg__action--feedback-active"
                  : ""
              }`}
              disabled={disabled}
              title="有帮助"
              aria-pressed={message.feedback === "up"}
              onClick={() => setMessageFeedback(messageIndex, "up")}
            >
              <IconThumbsUp size={13} />
            </button>
            <button
              type="button"
              class={`global-chat-msg__action global-chat-msg__action--feedback${
                message.feedback === "down"
                  ? " global-chat-msg__action--feedback-active"
                  : ""
              }`}
              disabled={disabled}
              title="没帮助"
              aria-pressed={message.feedback === "down"}
              onClick={() => setMessageFeedback(messageIndex, "down")}
            >
              <IconThumbsDown size={13} />
            </button>
          </>
        )}
        {canQuote && messageIndex != null && onQuoteMessage && (
          <button
            type="button"
            class="global-chat-msg__action"
            disabled={disabled}
            title="引用到输入框"
            onClick={() => onQuoteMessage(messageIndex)}
          >
            引用
          </button>
        )}
        {message.content?.trim() && (
          <button
            type="button"
            class="global-chat-msg__action"
            disabled={disabled}
            title="复制"
            onClick={() => void copyChatMessage(message)}
          >
            复制
          </button>
        )}
        {canEditUserMessage && messageIndex != null && onEditUserMessage && (
          <button
            type="button"
            class="global-chat-msg__action"
            disabled={disabled}
            title="编辑并重新发送"
            onClick={() => onEditUserMessage(messageIndex)}
          >
            编辑
          </button>
        )}
        {canResendFromTurn && messageIndex != null && (
          <button
            type="button"
            class="global-chat-msg__action"
            disabled={disabled}
            title="从此处重新提问"
            onClick={() => void resendFromUserMessage(messageIndex)}
          >
            从此重问
          </button>
        )}
        {canRegenerate && (
          <button
            type="button"
            class="global-chat-msg__action"
            disabled={disabled}
            title="重新生成"
            onClick={() => void regenerateLastResponse()}
          >
            重答
          </button>
        )}
        {canDelete && messageIndex != null && (
          <button
            type="button"
            class="global-chat-msg__action global-chat-msg__action--danger"
            disabled={disabled}
            title="删除此消息"
            onClick={() => handleDelete(message, messageIndex)}
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
}
