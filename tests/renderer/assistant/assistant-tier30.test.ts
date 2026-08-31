import { describe, expect, it, beforeEach } from "vitest";
import {
  findAdjacentAssistantMessageIndex,
  findFirstAssistantMessageIndex,
  findLastAssistantMessageIndex,
  resolveAdjacentAssistantMessageIndex,
  getVisibleMessageIndices,
} from "../../../src/renderer/assistant/chat-message-index";
import {
  messageMatchesRoleFilter,
  countMessagesForRoleFilter,
} from "../../../src/renderer/assistant/chat-message-filter";
import {
  messageMatchesQuery,
  messageSearchHaystack,
  findMessageMatchIndices,
} from "../../../src/renderer/assistant/chat-message-search";
import {
  loadMessageToolsOpen,
  saveMessageToolsOpen,
} from "../../../src/renderer/assistant/chat-message-tools-prefs";
import type { AiChatMessage } from "../../../src/shared/ipc-contracts";

describe("chat-message-index assistant tier30", () => {
  const msgs: AiChatMessage[] = [
    { role: "user", content: "q1" },
    { role: "assistant", content: "a1" },
    { role: "user", content: "q2" },
    { role: "assistant", content: "a2" },
  ];

  it("findAdjacentAssistantMessageIndex walks assistant messages", () => {
    expect(findFirstAssistantMessageIndex(msgs)).toBe(1);
    expect(findLastAssistantMessageIndex(msgs)).toBe(3);
    expect(findAdjacentAssistantMessageIndex(msgs, 2, "prev")).toBe(1);
    expect(findAdjacentAssistantMessageIndex(msgs, 1, "next")).toBe(3);
  });

  it("resolveAdjacentAssistantMessageIndex wraps", () => {
    expect(resolveAdjacentAssistantMessageIndex(msgs, 1, "prev")).toBe(3);
    expect(resolveAdjacentAssistantMessageIndex(msgs, 3, "next")).toBe(1);
  });
});

describe("chat-message-search tool cards tier30", () => {
  const msg: AiChatMessage = {
    role: "assistant",
    content: "查询结果如下",
    toolCards: [
      {
        tool: "query_funds",
        summary: "基金持仓 3 只",
        items: [{ label: "易方达蓝筹", meta: "+2.1%" }],
      },
    ],
  };

  it("messageSearchHaystack includes tool card fields", () => {
    const hay = messageSearchHaystack(msg);
    expect(hay).toContain("query_funds");
    expect(hay).toContain("易方达蓝筹");
  });

  it("messageMatchesQuery finds tool card text", () => {
    expect(messageMatchesQuery(msg, "易方达")).toBe(true);
    expect(messageMatchesQuery(msg, "query_funds")).toBe(true);
    expect(messageMatchesQuery(msg, "不存在")).toBe(false);
  });

  it("findMessageMatchIndices includes tool-only matches", () => {
    expect(
      findMessageMatchIndices(
        [{ role: "assistant", content: "ok", toolCards: msg.toolCards }],
        "持仓",
      ),
    ).toEqual([0]);
  });
});

describe("chat-message-filter has_tools tier30", () => {
  const msgs: AiChatMessage[] = [
    { role: "assistant", content: "plain" },
    {
      role: "assistant",
      content: "tools",
      toolCards: [{ tool: "query_apps", summary: "apps" }],
    },
  ];

  it("has_tools filter matches tool card messages", () => {
    expect(messageMatchesRoleFilter(msgs[0], "has_tools")).toBe(false);
    expect(messageMatchesRoleFilter(msgs[1], "has_tools")).toBe(true);
    expect(countMessagesForRoleFilter(msgs, "has_tools")).toBe(1);
  });

  it("getVisibleMessageIndices combines has_tools with search", () => {
    expect(
      getVisibleMessageIndices(msgs, {
        roleFilter: "has_tools",
        searchQuery: "apps",
      }),
    ).toEqual([1]);
  });
});

describe("chat-message-tools-prefs tier30", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("defaults to open", () => {
    expect(loadMessageToolsOpen()).toBe(true);
  });

  it("persists collapsed state", () => {
    saveMessageToolsOpen(false);
    expect(loadMessageToolsOpen()).toBe(false);
    saveMessageToolsOpen(true);
    expect(loadMessageToolsOpen()).toBe(true);
  });
});
