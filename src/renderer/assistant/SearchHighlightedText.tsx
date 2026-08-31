/**
 * 纯文本内搜索关键词高亮.
 */
import { splitTextBySearchHighlight } from "./chat-message-search.ts";

export function SearchHighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const parts = splitTextBySearchHighlight(text, query);
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} class="global-chat-search-mark">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
