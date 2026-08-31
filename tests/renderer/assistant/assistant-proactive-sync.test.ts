import { describe, expect, it } from "vitest";
import type { AiChatMessage } from "../../../src/shared/ipc-contracts";
import { syncProactiveSystemMessages } from "../../../src/renderer/assistant/assistant-proactive-sync";
import { proactiveKindFromMessage } from "../../../src/renderer/assistant/assistant-proactive";

describe("assistant-proactive-sync", () => {
  it("proactiveKindFromMessage parses marker", () => {
    const m: AiChatMessage = {
      role: "system",
      content: "[pulse-proactive:apps:foo|bar]\n📱 应用更新提醒",
    };
    expect(proactiveKindFromMessage(m)).toBe("apps");
  });

  it("sync replaces stale proactive of same kind", () => {
    const old: AiChatMessage = {
      role: "system",
      content: "[pulse-proactive:apps:old]\n📱 应用更新提醒",
      systemItems: [{ text: "OldApp", message: "x" }],
    };
    const fresh: AiChatMessage = {
      role: "system",
      content: "[pulse-proactive:apps:new]\n📱 应用更新提醒",
      systemItems: [{ text: "NewApp", message: "y" }],
    };
    const user: AiChatMessage = { role: "user", content: "hi" };
    const out = syncProactiveSystemMessages([user, old], () => [fresh]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(user);
    expect(out[1].content).toContain("apps:new");
    expect(out[1].systemItems?.[0]?.text).toBe("NewApp");
  });

  it("sync drops proactive when builder returns empty", () => {
    const old: AiChatMessage = {
      role: "system",
      content: "[pulse-proactive:github:fp]\n🐙 GitHub",
    };
    const out = syncProactiveSystemMessages([old], () => []);
    expect(out).toEqual([]);
  });
});
