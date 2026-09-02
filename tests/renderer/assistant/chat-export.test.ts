import { describe, expect, it } from "vitest";
import { messagesToMarkdown } from "../../../src/renderer/assistant/chat-export.ts";

describe("chat-export", () => {
  it("messagesToMarkdown formats roles", () => {
    const md = messagesToMarkdown([
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好，有什么可以帮你？" },
    ]);
    expect(md).toContain("## 你");
    expect(md).toContain("你好");
    expect(md).toContain("## 助手");
  });
});
