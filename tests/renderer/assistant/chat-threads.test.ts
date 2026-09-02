import { describe, expect, it } from "vitest";
import {
  titleFromMessages,
  touchThread,
  createThread,
} from "../../../src/renderer/assistant/chat-threads.ts";

describe("chat-threads", () => {
  it("titleFromMessages uses first user message", () => {
    expect(
      titleFromMessages([{ role: "user", content: "基金盈亏怎样？" }]),
    ).toBe("基金盈亏怎样？");
    const long = "a".repeat(40);
    expect(titleFromMessages([{ role: "user", content: long }])).toMatch(/…$/);
  });

  it("touchThread updates title from 新对话", () => {
    const t = createThread();
    const updated = touchThread(t, [
      { role: "user", content: "查一下黄金" },
      { role: "assistant", content: "好的" },
    ]);
    expect(updated.title).toBe("查一下黄金");
    expect(updated.messages).toHaveLength(2);
  });
});
