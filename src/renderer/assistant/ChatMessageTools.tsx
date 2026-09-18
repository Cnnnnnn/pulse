import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { IconChevronDown } from "../components/icons.tsx";
import type { MessageRoleFilter } from "./chat-message-filter.ts";

type ChatMessageToolsProps = {
  open: boolean;
  onToggle: (_open: boolean) => void;
  loading: boolean;
  roleFilter: MessageRoleFilter;
  roleFilterCount: number;
  hasViewFilter: boolean;
  visibleIndices: number[];
  messageQuery: string;
  matchIndices: number[];
  activeMatchPos: number;
  searchRef: RefObject<HTMLInputElement>;
  onRoleFilterChange: (_value: MessageRoleFilter) => void;
  onReset: () => void;
  onCopyVisible: () => void;
  onExportVisible: () => void;
  onQueryChange: (_query: string) => void;
  onGotoMatch: (_delta: number) => void;
  onClearSearch: () => void;
  onCopyMatches: () => void;
  onExportMatches: () => void;
};

export function ChatMessageTools({
  open,
  onToggle,
  loading,
  roleFilter,
  roleFilterCount,
  hasViewFilter,
  visibleIndices,
  messageQuery,
  matchIndices,
  activeMatchPos,
  searchRef,
  onRoleFilterChange,
  onReset,
  onCopyVisible,
  onExportVisible,
  onQueryChange,
  onGotoMatch,
  onClearSearch,
  onCopyMatches,
  onExportMatches,
}: ChatMessageToolsProps) {
  const wrapRef = useRef<HTMLDetailsElement>(null);

  // 浮层开着时: 点面板外任意处 / 在非搜索框处按 Esc → 收起。
  // 否则它会一直悬在会话上方盖住内容, 只能再点一次「消息工具」才能关。
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      if (event.target instanceof Node && !wrap.contains(event.target)) {
        onToggle(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // 搜索框内的 Esc 留给「清除搜索」(组件内已有), 不在这里抢
      if (event.key === "Escape" && !(event.target instanceof HTMLInputElement)) {
        onToggle(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onToggle]);

  return (
    <details
      ref={wrapRef}
      class="global-chat-message-tools-wrap"
      data-placement="composer"
      open={open}
      onToggle={(event) =>
        onToggle((event.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary>
        <span>消息工具</span>
        <IconChevronDown size={12} />
      </summary>
      <div class="global-chat-message-tools__body">
        <div class="global-chat-message-filters" role="toolbar" aria-label="消息筛选">
          {(
            [
              ["all", "全部"],
              ["user", "用户"],
              ["assistant", "助手"],
              ["system", "系统"],
              ["feedback_up", "已赞"],
              ["feedback_down", "已踩"],
              ["has_tools", "工具"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              class={`global-chat-message-filter${roleFilter === value ? " is-active" : ""}`}
              disabled={loading}
              onClick={() => onRoleFilterChange(value)}
            >
              {label}
            </button>
          ))}
          {roleFilter !== "all" && (
            <span class="global-chat-message-filter__count">{roleFilterCount} 条</span>
          )}
          {hasViewFilter && (
            <button
              type="button"
              class="global-chat-message-search__clear"
              disabled={loading}
              title="重置角色筛选与搜索（⌘⇧L）"
              onClick={onReset}
            >
              重置
            </button>
          )}
          {hasViewFilter && visibleIndices.length > 0 && !messageQuery.trim() && (
            <>
              <button
                type="button"
                class="global-chat-message-search__copy"
                disabled={loading}
                title="复制当前筛选可见消息"
                onClick={onCopyVisible}
              >
                复制可见
              </button>
              <button
                type="button"
                class="global-chat-message-search__copy"
                disabled={loading}
                title="导出当前筛选可见消息"
                onClick={onExportVisible}
              >
                导出可见
              </button>
            </>
          )}
        </div>
        <div class="global-chat-message-search">
          <input
            ref={searchRef}
            class="global-chat-message-search__input"
            type="search"
            value={messageQuery}
            placeholder="搜索当前对话…"
            disabled={loading}
            onInput={(event) =>
              onQueryChange((event.currentTarget as HTMLInputElement).value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onGotoMatch(event.shiftKey ? -1 : 1);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClearSearch();
              }
            }}
          />
          {messageQuery.trim() && (
            <span class="global-chat-message-search__count">
              {matchIndices.length === 0
                ? "无匹配"
                : `${Math.min(activeMatchPos + 1, matchIndices.length)}/${matchIndices.length}`}
            </span>
          )}
          {matchIndices.length > 0 && (
            <>
              <button
                type="button"
                class="global-chat-message-search__copy"
                disabled={loading}
                title="复制匹配消息为 Markdown"
                onClick={onCopyMatches}
              >
                复制匹配
              </button>
              <button
                type="button"
                class="global-chat-message-search__copy"
                disabled={loading}
                title="导出匹配消息为 Markdown 文件"
                onClick={onExportMatches}
              >
                导出匹配
              </button>
            </>
          )}
          {matchIndices.length > 1 && (
            <>
              <button
                type="button"
                class="global-chat-message-search__nav"
                disabled={loading}
                title="上一条匹配 (Shift+Enter)"
                onClick={() => onGotoMatch(-1)}
              >
                ↑
              </button>
              <button
                type="button"
                class="global-chat-message-search__nav"
                disabled={loading}
                title="下一条匹配 (Enter)"
                onClick={() => onGotoMatch(1)}
              >
                ↓
              </button>
            </>
          )}
          {messageQuery.trim() && (
            <button
              type="button"
              class="global-chat-message-search__clear"
              disabled={loading}
              title="清除搜索"
              onClick={onClearSearch}
            >
              ×
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
