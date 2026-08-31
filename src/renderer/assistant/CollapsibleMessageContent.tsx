/**
 * 可折叠的长消息内容（用户纯文本 / 助手 Markdown）.
 */
import { useState } from "preact/hooks";
import { ChatMarkdown } from "./ChatMarkdown.tsx";
import { SearchHighlightedText } from "./SearchHighlightedText.tsx";
import {
  collapseMessagePreview,
  MESSAGE_COLLAPSE_CHAR_LIMIT,
  shouldCollapseMessage,
} from "./chat-message-collapse.ts";

export function CollapsibleMessageContent({
  role,
  content,
  highlightQuery = "",
}: {
  role: "user" | "assistant";
  content: string;
  highlightQuery?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsed = shouldCollapseMessage(role, content, expanded);
  const display = collapsed ? collapseMessagePreview(content) : content;

  return (
    <>
      {role === "assistant" ? (
        <ChatMarkdown content={display} />
      ) : (
        <SearchHighlightedText text={display} query={highlightQuery} />
      )}
      {collapsed && (
        <button
          type="button"
          class="global-chat-msg__expand"
          onClick={() => setExpanded(true)}
        >
          展开全文 ({content.length} 字)
        </button>
      )}
      {!collapsed && content.length > MESSAGE_COLLAPSE_CHAR_LIMIT && expanded && (
        <button
          type="button"
          class="global-chat-msg__expand"
          onClick={() => setExpanded(false)}
        >
          收起
        </button>
      )}
    </>
  );
}
