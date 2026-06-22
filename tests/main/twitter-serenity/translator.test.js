/**
 * tests/main/twitter-serenity/translator.test.js
 *
 * Task 7: translator LLM + 内存 LRU 200.
 * 用依赖注入 (deps.sharedLlm) 注入 mock, 避免 CommonJS 模块 mock.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createTranslator,
  TWITTER_TRANSLATE_PROMPT,
  LRU_LIMIT,
} from "../../../src/main/twitter-serenity/translator.js";

function makeMockLlm(resolvedValue = "中文译文") {
  return { translate: vi.fn().mockResolvedValue(resolvedValue) };
}

describe("translator", () => {
  it("translateTweet 未命中 LRU 调 sharedLlm.translate 传 prompt + text", async () => {
    const llm = makeMockLlm();
    const t = createTranslator({ sharedLlm: llm });
    const out = await t.translateTweet({ id: "1", text: "hello" });
    expect(llm.translate).toHaveBeenCalled();
    expect(llm.translate.mock.calls[0][0]).toBe("hello");
    expect(llm.translate.mock.calls[0][1].prompt).toMatch(/中文财经翻译/);
    expect(out).toBe("中文译文");
  });

  it("translateTweet 命中 LRU 不调 LLM (第二次直接返回缓存)", async () => {
    const llm = makeMockLlm();
    const t = createTranslator({ sharedLlm: llm });
    await t.translateTweet({ id: "1", text: "hello" });
    llm.translate.mockClear();
    const out2 = await t.translateTweet({ id: "1", text: "hello" });
    expect(llm.translate).not.toHaveBeenCalled();
    expect(out2).toBe("中文译文");
  });

  it("translateTweet LRU 超 200 淘汰最旧", async () => {
    const llm = { translate: vi.fn().mockResolvedValue("zh") };
    const t = createTranslator({ sharedLlm: llm });
    for (let i = 0; i < 201; i++) {
      await t.translateTweet({ id: String(i), text: `t${i}` });
    }
    // 第 0 条应已淘汰 → 再翻译会调 LLM
    llm.translate.mockClear();
    await t.translateTweet({ id: "0", text: "t0" });
    expect(llm.translate).toHaveBeenCalled();
  });

  it("translateTweet LLM 失败抛 error (LRU 不缓存失败)", async () => {
    const llm = { translate: vi.fn().mockRejectedValueOnce(new Error("quota")) };
    const t = createTranslator({ sharedLlm: llm });
    await expect(t.translateTweet({ id: "1", text: "hi" })).rejects.toThrow(
      "quota",
    );
  });

  it("translateTweet 空 text 返回空串不调 LLM", async () => {
    const llm = makeMockLlm();
    const t = createTranslator({ sharedLlm: llm });
    const out = await t.translateTweet({ id: "1", text: "" });
    expect(out).toBe("");
    expect(llm.translate).not.toHaveBeenCalled();
  });

  it("translateTweet null tweet 容错返回空串", async () => {
    const llm = makeMockLlm();
    const t = createTranslator({ sharedLlm: llm });
    expect(await t.translateTweet(null)).toBe("");
    expect(await t.translateTweet({ id: "1" })).toBe("");
  });

  it("TWITTER_TRANSLATE_PROMPT 是非空中文 prompt", () => {
    expect(typeof TWITTER_TRANSLATE_PROMPT).toBe("string");
    expect(TWITTER_TRANSLATE_PROMPT.length).toBeGreaterThan(20);
    expect(TWITTER_TRANSLATE_PROMPT).toMatch(/翻译|财经|股票/);
  });

  it("LRU_LIMIT = 200", () => {
    expect(LRU_LIMIT).toBe(200);
  });
});
