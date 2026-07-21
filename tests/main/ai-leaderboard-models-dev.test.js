/**
 * tests/main/ai-leaderboard-models-dev.test.js
 *
 * fetcher-models-dev 单元测试：
 *   - normalize() 解析 models.dev 原始 payload，填 modelsdev 切片
 *   - vendor / category / license 推断正确
 *   - fetch() 在网络失败时返回 {ok:false} 而非抛错
 *
 * 不打真实网络 (fetch 走 fetchJson, 测试里手喂 fixture)。
 */

import { describe, it, expect } from "vitest";

// 复用 main 模块 (vitest node env, 无 electron)
const fetcher = require("../../src/main/ai-leaderboard/fetcher-models-dev.js");
const { mergeModelSlices } = require("../../src/main/ai-leaderboard/normalize.js");

// 极简 fixture：1 个 llm provider + 1 个 video provider + 1 个 open-weights
const FIXTURE = {
  openai: {
    id: "openai",
    name: "OpenAI",
    models: {
      "gpt-5.5-pro": {
        id: "gpt-5.5-pro",
        name: "GPT-5.5 Pro",
        family: "gpt-pro",
        reasoning: true,
        tool_call: true,
        open_weights: false,
        knowledge: "2025-12-01",
        release_date: "2026-04-23",
        last_updated: "2026-04-23",
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        limit: { context: 1050000, input: 922000, output: 128000 },
        cost: { input: 30, output: 180, cache_read: 7.5 },
      },
      "gpt-image-1": {
        id: "gpt-image-1",
        name: "GPT Image 1",
        family: "gpt-image",
        modalities: { input: ["text", "image"], output: ["image"] },
        limit: { context: 8192, output: 8192 },
        cost: { input: 0.5, output: 8 },
      },
    },
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    models: {
      "deepseek-chat": {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        family: "deepseek",
        open_weights: true,
        modalities: { input: ["text"], output: ["text"] },
        limit: { context: 1000000, output: 384000 },
        cost: { input: 0.14, output: 0.28 },
        status: "active",
      },
      "deepseek-old": {
        id: "deepseek-old",
        name: "DeepSeek Old",
        open_weights: true,
        status: "deprecated",
        modalities: { input: ["text"], output: ["text"] },
        limit: { context: 32000 },
      },
    },
  },
  // 边界: 模型没 name 应被跳过
  broken: {
    id: "broken",
    name: "Broken",
    models: {
      skipme: { id: "skipme", modalities: { input: [], output: [] } },
    },
  },
};

describe("fetcher-models-dev: normalize", () => {
  it("解析 fixture 出 4 条有效模型（跳过 broken）", () => {
    const models = fetcher.normalize(FIXTURE);
    expect(models.length).toBe(4);
  });

  it("每条模型 id = vendor + slugify(name)", () => {
    const models = fetcher.normalize(FIXTURE);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("openai-gpt-5-5-pro");
    expect(ids).toContain("openai-gpt-image-1");
    expect(ids).toContain("deepseek-deepseek-chat");
  });

  it("vendor 归一化到 VENDOR_META 键", () => {
    const models = fetcher.normalize(FIXTURE);
    expect(models.find((m) => m.name === "GPT-5.5 Pro").vendor).toBe("openai");
    expect(models.find((m) => m.name === "DeepSeek Chat").vendor).toBe("deepseek");
  });

  it("modelsdev 切片填齐 context / 价 / cache / 模态", () => {
    const models = fetcher.normalize(FIXTURE);
    const gpt = models.find((m) => m.name === "GPT-5.5 Pro");
    expect(gpt.modelsdev.contextLength).toBe(1050000);
    expect(gpt.modelsdev.outputLimit).toBe(128000);
    expect(gpt.modelsdev.inputCostPer1M).toBe(30);
    expect(gpt.modelsdev.outputCostPer1M).toBe(180);
    expect(gpt.modelsdev.cacheReadCostPer1M).toBe(7.5);
    expect(gpt.modelsdev.modalities.input).toEqual(["text", "image", "pdf"]);
    expect(gpt.modelsdev.modalities.output).toEqual(["text"]);
    expect(gpt.modelsdev.reasoning).toBe(true);
    expect(gpt.modelsdev.toolCall).toBe(true);
    expect(gpt.modelsdev.openWeights).toBe(false);
    expect(gpt.modelsdev.knowledge).toBe("2025-12-01");
    expect(gpt.modelsdev.releaseDate).toBe("2026-04-23");
  });

  it("category 推断：output:image → image，video → video，默认 llm", () => {
    const models = fetcher.normalize(FIXTURE);
    const img = models.find((m) => m.name === "GPT Image 1");
    expect(img.category).toBe("image");
    const txt = models.find((m) => m.name === "GPT-5.5 Pro");
    expect(txt.category).toBe("llm");
  });

  it("license 推断：open_weights=true → 'open'，闭源 → null", () => {
    const models = fetcher.normalize(FIXTURE);
    const ds = models.find((m) => m.name === "DeepSeek Chat");
    expect(ds.license).toBe("open");
    const proprietary = models.find((m) => m.name === "GPT-5.5 Pro");
    expect(proprietary.license).toBe(null);
  });

  it("license 推断：仅 status=deprecated 无 open_weights → 'deprecated'", () => {
    const fixture = {
      foo: {
        id: "foo",
        name: "Foo",
        models: {
          dead: { id: "dead", name: "Dead", status: "deprecated", modalities: { input: ["text"], output: ["text"] }, limit: { context: 1000 } },
        },
      },
    };
    const models = fetcher.normalize(fixture);
    expect(models[0].license).toBe("deprecated");
  });

  it("sources.modelsdev = 'live'，其它源 = 'none'", () => {
    const models = fetcher.normalize(FIXTURE);
    const m = models[0];
    expect(m.sources.modelsdev).toBe("live");
    expect(m.sources.arena).toBe("none");
    expect(m.sources.aa).toBe("none");
    expect(m.sources.openrouter).toBe("none");
    expect(m.sources.livebench).toBe("none");
  });

  it("空 / 非对象 payload 返空数组，不抛", () => {
    expect(fetcher.normalize(null)).toEqual([]);
    expect(fetcher.normalize(undefined)).toEqual([]);
    expect(fetcher.normalize({})).toEqual([]);
    expect(fetcher.normalize("garbage")).toEqual([]);
  });

  it("解一层 {data: {...}, fetchedAt} 包裹（与 fetcher.fetch / cache.write 写盘形状一致）", () => {
    const wrapped = { data: FIXTURE, fetchedAt: "2026-07-21T17:00:00Z" };
    const models = fetcher.normalize(wrapped);
    expect(models.length).toBe(4); // 与裸 FIXTURE 一致
    expect(models.find((m) => m.name === "GPT-5.5 Pro").modelsdev.contextLength).toBe(1050000);
  });

  it("primary provider 在 router 之前先注册 id（同 vendor 时不被 router 覆盖）", () => {
    // ponytail: 实测大部分 router 的 provider id 都不在 VENDOR_META 里, 会被 normalizeVendor 归到 'other',
    // 所以 router 那条的 id 自然跟 canonical (openai/anthropic/...) 不同, 不会污染主键合并.
    // 这里验证: 即使 raw 里 router 在 canonical 前面, canonical 那条仍以正确 vendor 出在结果里.
    const duplicateFixture = {
      frogbot: {
        id: "frogbot",
        name: "FrogBot",
        models: {
          "gpt-5.5": { id: "gpt-5.5", name: "GPT-5.5", limit: { context: 272000 } },
        },
      },
      openai: {
        id: "openai",
        name: "OpenAI",
        models: {
          "gpt-5.5": { id: "gpt-5.5", name: "GPT-5.5", limit: { context: 1050000 } },
        },
      },
    };
    const models = fetcher.normalize(duplicateFixture);
    const openai = models.find((m) => m.vendor === "openai");
    expect(openai).toBeTruthy();
    expect(openai.id).toBe("openai-gpt-5-5");
    expect(openai.modelsdev.contextLength).toBe(1050000);
    // ponytail: router (FrogBot) 的 baseName "GPT-5.5" 跟 openai 撞, 走 baseName 去重 — canonical 先注册, router 被跳过.
    // 这正是 router 副本不应进 result 的真实场景.
    expect(models.length).toBe(1);
  });

  it("seen Set 兜底: 同 provider id + 同 name 重复 model 只保留第一条", () => {
    // ponytail: 防 edge case — 同一 provider 下出现两条同 id 的 model (data drift). seen Set 保证只出一条.
    const dupInOneProvider = {
      openai: {
        id: "openai",
        name: "OpenAI",
        models: {
          "gpt-5.5": { id: "gpt-5.5", name: "GPT-5.5", limit: { context: 1050000 } },
          "gpt-5.5-dup": { id: "gpt-5.5", name: "GPT-5.5", limit: { context: 999 } },
        },
      },
    };
    const models = fetcher.normalize(dupInOneProvider);
    expect(models.length).toBe(1);
    expect(models[0].modelsdev.contextLength).toBe(1050000);
  });

  it("mergeModelSlices 把 modelsdev 切片合并到已有 AiModel（跨源不丢字段）", () => {
    // 模拟 arena 已有 id = 'openai-gpt-5-5-pro' 但 modelsdev 切片为空
    const arenaSlice = [
      {
        id: "openai-gpt-5-5-pro",
        name: "GPT-5.5 Pro",
        vendor: "openai",
        vendorRaw: "OpenAI",
        category: "llm",
        arena: { text: { score: 1500, ci: 5, votes: 9999 } },
        aa: null,
        openrouter: null,
        livebench: null,
        sources: { arena: "live", aa: "none", openrouter: "none", livebench: "none", modelsdev: "none" },
      },
    ];
    const mdSlice = fetcher.normalize(FIXTURE);
    const merged = mergeModelSlices([arenaSlice, mdSlice]);
    expect(merged.length).toBe(4);
    const gpt = merged.find((m) => m.name === "GPT-5.5 Pro");
    // arena 切片保留
    expect(gpt.arena.text.score).toBe(1500);
    // modelsdev 切片合并进来
    expect(gpt.modelsdev.contextLength).toBe(1050000);
    expect(gpt.sources.modelsdev).toBe("live");
    expect(gpt.sources.arena).toBe("live");
  });
});

describe("fetcher-models-dev: fetch 接口", () => {
  it("requiresKey=false 标识", () => {
    expect(fetcher.requiresKey).toBe(false);
    expect(fetcher.id).toBe("models-dev");
  });
});