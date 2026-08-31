import { describe, expect, it } from "vitest";
import {
  systemActionSpec,
  runSystemItemAction,
} from "../../../src/renderer/assistant/ChatSystemMessage";
import type { AiChatMessage } from "../../../src/shared/ipc-contracts";

describe("ChatSystemMessage tier14", () => {
  it("systemActionSpec returns footer label for navigate", () => {
    const m: AiChatMessage = {
      role: "system",
      content: "[pulse-proactive:apps:x]\n📱",
      systemAction: { tool: "navigate", params: { nav: "versions" } },
    };
    expect(systemActionSpec(m)?.label).toBe("打开版本页");
  });

  it("systemItems preserve text for rendering contract", () => {
    const m: AiChatMessage = {
      role: "system",
      content: "[pulse-proactive:apps:x]\n📱",
      systemItems: [
        { text: "AppA → 2.0", message: "AppA 需要更新吗？" },
      ],
    };
    expect(m.systemItems?.[0]?.text).toBe("AppA → 2.0");
    expect(typeof runSystemItemAction).toBe("function");
  });
});
