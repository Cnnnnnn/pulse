import { describe, expect, it } from "vitest";
import {
  parseDataUrl,
  buildUserContentWithImage,
  providerSupportsImage,
} from "../../src/ai/multimodal";

describe("multimodal", () => {
  it("parseDataUrl 解析 data URL", () => {
    expect(parseDataUrl("data:image/png;base64,iVBORw0")).toEqual({
      mediaType: "image/png",
      base64: "iVBORw0",
    });
    expect(parseDataUrl("data:image/jpeg;base64,abc")).toEqual({
      mediaType: "image/jpeg",
      base64: "abc",
    });
    expect(parseDataUrl("not-a-data-url")).toBeNull();
    expect(parseDataUrl("data:image/png;nocode")).toBeNull();
  });

  it("buildUserContentWithImage 无图像返回纯文本", () => {
    expect(buildUserContentWithImage("hello", null, "openai")).toBe("hello");
    expect(buildUserContentWithImage("hello", "", "openai")).toBe("hello");
  });

  it("buildUserContentWithImage openai 返回 content array", () => {
    const out = buildUserContentWithImage("看图", "data:image/png;base64,abc", "openai");
    expect(Array.isArray(out)).toBe(true);
    const arr = out as Array<{ type: string }>;
    expect(arr[0]).toEqual({ type: "text", text: "看图" });
    expect(arr[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,abc" },
    });
  });

  it("buildUserContentWithImage anthropic 返回 base64 image", () => {
    const out = buildUserContentWithImage("看图", "data:image/png;base64,abc", "anthropic");
    const arr = out as Array<{ type: string; source?: { media_type: string; data: string } }>;
    expect(arr[0]).toEqual({ type: "text", text: "看图" });
    expect(arr[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "abc" },
    });
  });

  it("providerSupportsImage 只对 openai/anthropic 为 true", () => {
    expect(providerSupportsImage("openai")).toBe(true);
    expect(providerSupportsImage("anthropic")).toBe(true);
    expect(providerSupportsImage("deepseek")).toBe(false);
    expect(providerSupportsImage("minimax")).toBe(false);
  });
});
