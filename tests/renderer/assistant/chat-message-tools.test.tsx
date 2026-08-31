// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { ChatMessageTools } from "../../../src/renderer/assistant/ChatMessageTools.tsx";

describe("ChatMessageTools", () => {
  it("renders as a composer popover instead of a message-list section", () => {
    const noop = () => {};
    render(
      <ChatMessageTools
        open={false}
        onToggle={noop}
        loading={false}
        roleFilter="all"
        roleFilterCount={0}
        hasViewFilter={false}
        visibleIndices={[]}
        messageQuery=""
        matchIndices={[]}
        activeMatchPos={0}
        searchRef={{ current: null }}
        onRoleFilterChange={noop}
        onReset={noop}
        onCopyVisible={noop}
        onExportVisible={noop}
        onQueryChange={noop}
        onGotoMatch={noop}
        onClearSearch={noop}
        onCopyMatches={noop}
        onExportMatches={noop}
      />,
    );

    expect(screen.getByText("消息工具")).toBeTruthy();
    expect(document.querySelector("details[data-placement='composer']")).toBeTruthy();
    expect(document.querySelector(".global-chat-message-tools-wrap")).toBeTruthy();
  });
});
