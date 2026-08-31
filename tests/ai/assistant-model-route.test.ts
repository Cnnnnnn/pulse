import { describe, expect, it } from "vitest";
import {
  lastUserText,
  pickFastModel,
  shouldUseFastAssistantPath,
} from "../../src/ai/assistant-model-route";

describe("assistant-model-route", () => {
  it("pickFastModel returns built-in lighter model for openai", () => {
    expect(pickFastModel("openai")).toMatch(/mini|gpt-4o/);
  });

  it("routes greetings to fast path", () => {
    expect(
      shouldUseFastAssistantPath(
        [{ role: "user", content: "你好" }],
        "gpt-4o",
        "gpt-4o-mini",
      ),
    ).toBe(true);
  });

  it("does not route tool-intent queries", () => {
    expect(
      shouldUseFastAssistantPath(
        [{ role: "user", content: "我的基金盈亏怎样？" }],
        "gpt-4o",
        "gpt-4o-mini",
      ),
    ).toBe(false);
  });

  it("does not route greeting compounded with open intent", () => {
    expect(
      shouldUseFastAssistantPath(
        [{ role: "user", content: "你好，帮我打开电影页面" }],
        "gpt-4o",
        "gpt-4o-mini",
      ),
    ).toBe(false);
  });

  it("does not route affirmation after navigation offer", () => {
    expect(
      shouldUseFastAssistantPath(
        [
          { role: "assistant", content: "要不要打开电影页面看看？" },
          { role: "user", content: "需要" },
        ],
        "gpt-4o",
        "gpt-4o-mini",
      ),
    ).toBe(false);
  });

  it("does not route bare 好的 when prior offered navigation", () => {
    expect(
      shouldUseFastAssistantPath(
        [
          { role: "assistant", content: "需要我帮你打开应用列表吗？" },
          { role: "user", content: "好的" },
        ],
        "gpt-4o",
        "gpt-4o-mini",
      ),
    ).toBe(false);
  });

  it("skips routing when fast equals primary", () => {
    expect(
      shouldUseFastAssistantPath(
        [{ role: "user", content: "你好" }],
        "deepseek-chat",
        "deepseek-chat",
      ),
    ).toBe(false);
  });

  it("lastUserText picks latest user message", () => {
    expect(
      lastUserText([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ]),
    ).toBe("c");
  });
});
