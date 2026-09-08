import { describe, expect, it } from "vitest";
import {
  parseDataUrl,
  buildUserContentWithImage,
  providerSupportsImage,
  textContentOf,
  normalizeMultimodalHistory,
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

  it("textContentOf 从 string / content 数组提取纯文本", () => {
    expect(textContentOf("hello")).toBe("hello");
    expect(
      textContentOf([
        { type: "text", text: "看图 " },
        { type: "image_url", image_url: { url: "data:..." } },
        { type: "text", text: "说" },
      ]),
    ).toBe("看图 说");
    expect(textContentOf(null)).toBe("");
    expect(textContentOf([{ type: "image_url", image_url: { url: "x" } }])).toBe("");
  });

  it("normalizeMultimodalHistory: 末条带图消息按协议转数组, 其余轮次降为文本", () => {
    const img = "data:image/png;base64,abc";
    const messages = [
      { role: "user", content: "第一轮", attachments: [{ dataUrl: img }] },
      { role: "assistant", content: "回复" },
      { role: "user", content: "这一张呢?", attachments: [{ dataUrl: img }] },
    ];
    const out = normalizeMultimodalHistory(messages as any, "openai");
    // 末条带图 → openai content 数组
    const last: any = out[2];
    expect(Array.isArray(last.content)).toBe(true);
    expect(last.content[0]).toEqual({ type: "text", text: "这一张呢?" });
    expect(last.content[1].type).toBe("image_url");
    // 更早的图片轮次 → 文本占位
    expect(out[0].content).toBe("第一轮\n(该轮附加过截图, 已省略)");
    expect(out[1].content).toBe("回复");
  });

  it("normalizeMultimodalHistory: 无协议时带图消息也降为文本", () => {
    const img = "data:image/png;base64,abc";
    const out = normalizeMultimodalHistory(
      [{ role: "user", content: "看", attachments: [{ dataUrl: img }] }] as any,
      null,
    );
    expect(out[0].content).toBe("看\n(该轮附加过截图, 已省略)");
  });

  it("normalizeMultimodalHistory: 无附件消息归一为纯文本", () => {
    const out = normalizeMultimodalHistory(
      [
        { role: "user", content: "plain" },
        { role: "assistant", content: "ok" },
      ] as any,
      "openai",
    );
    expect(out).toEqual([
      { role: "user", content: "plain" },
      { role: "assistant", content: "ok" },
    ]);
  });
});
