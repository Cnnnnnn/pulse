// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { ChatMessageTools } from "../../../src/renderer/assistant/ChatMessageTools.tsx";

const baseProps = {
  loading: false,
  roleFilter: "all" as const,
  roleFilterCount: 0,
  hasViewFilter: false,
  visibleIndices: [],
  messageQuery: "",
  matchIndices: [],
  activeMatchPos: 0,
  searchRef: { current: null },
  onRoleFilterChange: () => {},
  onReset: () => {},
  onCopyVisible: () => {},
  onExportVisible: () => {},
  onQueryChange: () => {},
  onGotoMatch: () => {},
  onClearSearch: () => {},
  onCopyMatches: () => {},
  onExportMatches: () => {},
};

describe("ChatMessageTools", () => {
  it("renders as a composer popover instead of a message-list section", () => {
    render(
      <ChatMessageTools open={false} onToggle={() => {}} {...baseProps} />,
    );

    expect(screen.getByText("消息工具")).toBeTruthy();
    expect(document.querySelector("details[data-placement='composer']")).toBeTruthy();
    expect(document.querySelector(".global-chat-message-tools-wrap")).toBeTruthy();
  });

  it("open 时点击面板外 → 收起", () => {
    const onToggle = vi.fn();
    render(<ChatMessageTools open onToggle={onToggle} {...baseProps} />);

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("open 时点击面板内部 → 不收起", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChatMessageTools open onToggle={onToggle} {...baseProps} />,
    );

    const wrap = container.querySelector(".global-chat-message-tools-wrap")!;
    wrap.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("open 时按 Esc(焦点不在输入框) → 收起; 焦点在搜索框 → 留给清除搜索, 不收起", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChatMessageTools open onToggle={onToggle} {...baseProps} />,
    );

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);

    const input = document.createElement("input");
    container.querySelector(".global-chat-message-tools-wrap")!.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1); // 仍是 1 次
  });
});

