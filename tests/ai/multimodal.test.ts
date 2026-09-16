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

  it("normalizeMultimodalHistory: 保留最近 N 轮带图，更早的轮次降为文本", () => {
    const img = "data:image/png;base64,abc";
    const messages = [
      { role: "user", content: "第一轮", attachments: [{ dataUrl: img }] },
      { role: "assistant", content: "回复" },
      { role: "user", content: "第二张", attachments: [{ dataUrl: img }] },
      { role: "assistant", content: "回复2" },
      { role: "user", content: "这一张呢?", attachments: [{ dataUrl: img }] },
    ];
    const out = normalizeMultimodalHistory(messages as any, "openai");
    // 最早那轮超出默认 2 轮保留窗口 → 文本占位
    expect(out[0].content).toBe("第一轮\n(该轮附加过 1 张截图, 已省略)");
    // 最近两轮 → openai content 数组
    expect(Array.isArray(out[2].content)).toBe(true);
    const last: any = out[4];
    expect(Array.isArray(last.content)).toBe(true);
    expect(last.content[0]).toEqual({ type: "text", text: "这一张呢?" });
    expect(last.content[1].type).toBe("image_url");
    expect((out[1] as any).content).toBe("回复");
  });

  it("normalizeMultimodalHistory: 单轮多张图全部送出（此前只发第一张）", () => {
    const a = "data:image/png;base64,aaa";
    const b = "data:image/png;base64,bbb";
    const out = normalizeMultimodalHistory(
      [
        {
          role: "user",
          content: "两张",
          attachments: [{ dataUrl: a }, { dataUrl: b }],
        },
      ] as any,
      "openai",
    );
    const content = (out[0] as any).content;
    expect(content).toHaveLength(3); // text + 2 images
    expect(content[1].image_url.url).toBe(a);
    expect(content[2].image_url.url).toBe(b);
  });

  it("normalizeMultimodalHistory: 单轮图片数受 maxImagesPerRound 限制", () => {
    const mk = (i: number) => ({ dataUrl: `data:image/png;base64,img${i}` });
    const out = normalizeMultimodalHistory(
      [{ role: "user", content: "五张", attachments: [1, 2, 3, 4, 5].map(mk) }] as any,
      "openai",
      { maxImagesPerRound: 2 },
    );
    const content = (out[0] as any).content;
    expect(content).toHaveLength(3); // text + 2 images（第 3~5 张被裁）
  });

  it("normalizeMultimodalHistory: maxImageRounds=1 可恢复 v1 行为", () => {
    const img = "data:image/png;base64,abc";
    const out = normalizeMultimodalHistory(
      [
        { role: "user", content: "旧", attachments: [{ dataUrl: img }] },
        { role: "user", content: "新", attachments: [{ dataUrl: img }] },
      ] as any,
      "openai",
      { maxImageRounds: 1 },
    );
    expect(out[0].content).toBe("旧\n(该轮附加过 1 张截图, 已省略)");
    expect(Array.isArray(out[1].content)).toBe(true);
  });

  it("normalizeMultimodalHistory: anthropic 协议多图转 base64", () => {
    const out = normalizeMultimodalHistory(
      [
        {
          role: "user",
          content: "两张",
          attachments: [
            { dataUrl: "data:image/png;base64,aaa" },
            { dataUrl: "data:image/jpeg;base64,bbb" },
          ],
        },
      ] as any,
      "anthropic",
    );
    const content = (out[0] as any).content;
    expect(content[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "aaa" },
    });
    expect(content[2]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "bbb" },
    });
  });

  it("normalizeMultimodalHistory: 无协议时带图消息也降为文本", () => {
    const img = "data:image/png;base64,abc";
    const out = normalizeMultimodalHistory(
      [{ role: "user", content: "看", attachments: [{ dataUrl: img }] }] as any,
      null,
    );
    expect(out[0].content).toBe("看\n(该轮附加过 1 张截图, 已省略)");
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
