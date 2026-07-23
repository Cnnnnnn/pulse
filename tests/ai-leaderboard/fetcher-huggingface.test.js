/**
 * tests/ai-leaderboard/fetcher-huggingface.test.js
 *
 * fetcher-huggingface 纯函数单测（不需网络）：
 *   1) num — 安全取数字
 *   2) categoryFromPipelineTag — pipeline_tag → category 兜底
 *   3) summarizeTags — license / base_model / arxiv 提取
 *   4) normalize — HF API payload → AiModel[]，覆盖:
 *      - 标准 model (author/model, downloads, likes, tags)
 *      - vendor 归一: google-bert → google, meta-llama → meta, Qwen → qwen
 *      - 缺 id / 缺 author / 缺 model 段 → 跳过
 *      - 切片形状: huggingface 6 字段, sources 6 字段
 *   5) mergeModelSlices — HF 切片跟其它源合并
 */

import { describe, it, expect } from "vitest";

const {
  num,
  categoryFromPipelineTag,
  summarizeTags,
  normalize,
  HF_API,
  HF_PAGE_SIZE,
  HF_TOP_N,
} = require("../../src/main/ai-leaderboard/fetcher-huggingface");
const { SOURCE, toAiModel } = require("../../src/main/ai-leaderboard/types");
const { mergeModelSlices } = require("../../src/main/ai-leaderboard/normalize");

describe("fetcher-huggingface: 纯工具函数", () => {
  it("num — 安全取数字（null / 字符串 / NaN 走 default）", () => {
    expect(num(123)).toBe(123);
    expect(num(0)).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("not a number")).toBe(0);
    expect(num(NaN)).toBe(0);
    expect(num(null, 42)).toBe(42);
    expect(num("3.14")).toBe(3.14);
  });

  it("categoryFromPipelineTag — pipeline_tag → CATEGORY_META 兜底映射", () => {
    expect(categoryFromPipelineTag("text-generation")).toBe("llm");
    expect(categoryFromPipelineTag("conversational")).toBe("llm");
    expect(categoryFromPipelineTag("fill-mask")).toBe("llm");
    expect(categoryFromPipelineTag("text-to-image")).toBe("image");
    expect(categoryFromPipelineTag("image-classification")).toBe("image");
    expect(categoryFromPipelineTag("text-to-video")).toBe("video");
    expect(categoryFromPipelineTag("video-classification")).toBe("video");
    // ponytail: 终极兜底 — 无 pipeline_tag 无 tags → multimodal (不静默归 llm 错)
    expect(categoryFromPipelineTag(null)).toBe("multimodal");
    expect(categoryFromPipelineTag("")).toBe("multimodal");
    // ponytail: reinforcement-learning 走 multimodal (跟之前一致, 是兜底类)
    expect(categoryFromPipelineTag("reinforcement-learning")).toBe("multimodal");
  });

  it("categoryFromPipelineTag — tags 兜底: (none) pipeline_tag 但 tags 有信息时正确归类 (v2.79.5+ fix)", () => {
    // ponytail: HF top 200 有 19 条 (none) pipeline_tag, 之前全归 llm 错. 现在按 tags 推断.
    // 图像: stable-diffusion / diffusion-single-file / comfyui
    expect(categoryFromPipelineTag(null, ["transformers", "stable-diffusion"])).toBe("image");
    expect(categoryFromPipelineTag(null, ["comfyui", "diffusion-single-file"])).toBe("image");
    // 视频: diffusion-single-file + video 信号
    expect(categoryFromPipelineTag(null, ["diffusion-single-file", "wan", "video"])).toBe("video");
    // 音频: tts / wav2vec2 / pyannote / vocos / wespeaker / whisper
    expect(categoryFromPipelineTag(null, ["transformers", "wav2vec2", "speech"])).toBe("multimodal");
    expect(categoryFromPipelineTag(null, ["pyannote-audio", "pyannote", "audio"])).toBe("multimodal");
    expect(categoryFromPipelineTag(null, ["transformers", "vocos", "mel"])).toBe("multimodal");
    // 视觉: ultralytics (yolo) / depth / object-detection
    expect(categoryFromPipelineTag(null, ["ultralytics", "pytorch", "object-detection"])).toBe("multimodal");
    expect(categoryFromPipelineTag(null, ["transformers", "depth-estimation", "monocular"])).toBe("multimodal");
    // 嵌入/LLM: text2text-generation / colbert / electra / t5 / bert
    expect(categoryFromPipelineTag(null, ["transformers", "t5", "text2text-generation"])).toBe("llm");
    expect(categoryFromPipelineTag(null, ["transformers", "electra", "pretraining"])).toBe("llm");
    expect(categoryFromPipelineTag(null, ["transformers", "bert", "ColBERT"])).toBe("llm");
    // 默认有 transformers tag 但上面没命中 — 大概率 LLM
    expect(categoryFromPipelineTag(null, ["transformers", "pytorch"])).toBe("llm");
  });

  it("summarizeTags — license / base_model / arxiv 提取", () => {
    const tags = [
      "transformers",
      "pytorch",
      "license:apache-2.0",
      "license:cc-by-4.0",
      "base_model:meta-llama/Llama-2-7b-hf",
      "base_model:quantized:meta-llama/Llama-2-7b-hf",
      "arxiv:2102.07033",
      "arxiv:1810.04805",
      "en",
    ];
    const out = summarizeTags(tags);
    expect(out.license).toBe("apache-2.0");
    expect(out.baseModel).toBe("meta-llama/Llama-2-7b-hf");
    expect(out.arxivIds).toEqual(["2102.07033", "1810.04805"]);
    expect(out.quantized).toBe(true);
  });

  it("summarizeTags — 空 / 非数组 → 全 null", () => {
    expect(summarizeTags(null)).toEqual({ license: null, baseModel: null, arxivIds: [], quantized: false });
    expect(summarizeTags([])).toEqual({ license: null, baseModel: null, arxivIds: [], quantized: false });
    expect(summarizeTags("string")).toEqual({ license: null, baseModel: null, arxivIds: [], quantized: false });
  });

  it("HF_API / HF_PAGE_SIZE / HF_TOP_N 常量稳定（避免被改坏）", () => {
    expect(HF_API).toBe("https://huggingface.co/api/models");
    expect(HF_PAGE_SIZE).toBe(1000);
    expect(HF_TOP_N).toBe(5000);
  });
});

describe("fetcher-huggingface: normalize", () => {
  it("标准 model → AiModel 形状: huggingface 切片填好, sources 6 字段含 huggingface=LIVE", () => {
    const raw = {
      data: [
        {
          id: "sentence-transformers/all-MiniLM-L6-v2",
          author: "sentence-transformers",
          downloads: 254761864,
          likes: 5112,
          lastModified: "2026-06-01T06:29:13.000Z",
          pipeline_tag: "sentence-similarity",
          library_name: "sentence-transformers",
          createdAt: "2022-03-02T23:29:05.000Z",
          gated: false,
          private: false,
          tags: [
            "transformers",
            "license:apache-2.0",
            "base_model:nreimers/MiniLM-L6-H384-uncased",
            "arxiv:1904.06472",
          ],
        },
      ],
    };
    const out = normalize(raw);
    expect(out).toHaveLength(1);
    const m = out[0];
    expect(m.id).toBe("other-all-minilm-l6-v2"); // sentence-transformers 走 alias 归到 other
    expect(m.name).toBe("all-MiniLM-L6-v2");
    expect(m.vendorRaw).toBe("sentence-transformers");
    expect(m.vendor).toBe("other"); // 不在厂商白名单 → other
    expect(m.category).toBe("llm");
    // 切片
    expect(m.huggingface.downloads).toBe(254761864);
    expect(m.huggingface.likes).toBe(5112);
    expect(m.huggingface.pipelineTag).toBe("sentence-similarity");
    expect(m.huggingface.libraryName).toBe("sentence-transformers");
    expect(m.huggingface.license).toBe("apache-2.0");
    expect(m.huggingface.baseModel).toBe("nreimers/MiniLM-L6-H384-uncased");
    expect(m.huggingface.arxivIds).toEqual(["1904.06472"]);
    expect(m.huggingface.quantized).toBe(false);
    expect(m.huggingface.repoUrl).toBe(
      "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2",
    );
    // sources 形状: 5 字段 (toAiModel 默认兜底, 保护现有 toEqual 断言不破);
    // 顶层 BoardResult.sources.huggingface 由 aggregator 独立算 (看 hfModels.length).
    expect(m.sources).toEqual({
      arena: "none",
      aa: "none",
      openrouter: "none",
      livebench: "none",
      modelsdev: "none",
    });
    // 数据 slice 已写入
    expect(m.huggingface).not.toBeNull();
    expect(m.huggingface.downloads).toBe(254761864);
  });

  it("vendor 归一: google-bert → google, meta-llama → meta, Qwen → qwen, mistralai → mistral", () => {
    const raw = {
      data: [
        { id: "google-bert/bert-base-uncased", author: "google-bert", downloads: 1, likes: 0, tags: [], pipeline_tag: "fill-mask" },
        { id: "meta-llama/Llama-2-7b-hf", author: "meta-llama", downloads: 1, likes: 0, tags: [], pipeline_tag: "text-generation" },
        { id: "Qwen/Qwen2.5-7B", author: "Qwen", downloads: 1, likes: 0, tags: [], pipeline_tag: "text-generation" },
        { id: "mistralai/Mistral-7B-v0.1", author: "mistralai", downloads: 1, likes: 0, tags: [], pipeline_tag: "text-generation" },
      ],
    };
    const out = normalize(raw);
    expect(out.map((m) => m.vendor)).toEqual([
      "google",
      "meta",
      "qwen",
      "mistral",
    ]);
    // id 用归一后 vendor 拼
    expect(out[0].id).toBe("google-bert-base-uncased");
    expect(out[1].id).toBe("meta-llama-2-7b-hf");
    expect(out[2].id).toBe("qwen-qwen2-5-7b");
    expect(out[3].id).toBe("mistral-mistral-7b-v0-1");
  });

  it("categoryFromPipelineTag: text-to-image → image, text-to-video → video", () => {
    const raw = {
      data: [
        { id: "stabilityai/sdxl", author: "stabilityai", downloads: 1, likes: 0, tags: [], pipeline_tag: "text-to-image" },
        { id: "org/svd", author: "org", downloads: 1, likes: 0, tags: [], pipeline_tag: "text-to-video" },
      ],
    };
    const out = normalize(raw);
    expect(out[0].category).toBe("image");
    expect(out[1].category).toBe("video");
  });

  it("跳过畸形条目: 缺 id / 缺 author / 缺 model 段", () => {
    const raw = {
      data: [
        null,
        {},
        { id: "noSlash" }, // 无 author/model 分隔
        { id: "/leadingSlash" }, // model 段为空
        { id: "author/" }, // model 段为空
        { id: "valid/ok", author: "valid", downloads: 1, likes: 0, tags: [] },
      ],
    };
    const out = normalize(raw);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("other-ok");
  });

  it("tags 截断到 50 条 (防止异常大 tags 列表撑爆主进程)", () => {
    const bigTags = Array.from({ length: 200 }, (_, i) => `tag-${i}`);
    const raw = {
      data: [
        { id: "org/model", author: "org", downloads: 1, likes: 0, tags: bigTags, pipeline_tag: "text-generation" },
      ],
    };
    const out = normalize(raw);
    expect(out[0].huggingface.tags).toHaveLength(50);
  });

  it("空 data / 缺 data → 空数组（不抛）", () => {
    expect(normalize({})).toEqual([]);
    expect(normalize({ data: [] })).toEqual([]);
    expect(normalize(null)).toEqual([]);
    expect(normalize("not an object")).toEqual([]);
  });

  it("兼容 raw 是裸数组（非 wrapper 形态）— 单源调试时方便", () => {
    const raw = [
      { id: "org/m", author: "org", downloads: 5, likes: 1, tags: [], pipeline_tag: "text-generation" },
    ];
    const out = normalize(raw);
    expect(out).toHaveLength(1);
    expect(out[0].huggingface.downloads).toBe(5);
  });
});

describe("mergeModelSlices: HF 切片与其它源合并", () => {
  it("AA canonical + HF (其它归一) 同 baseName → HF huggingface slice 被接回（_normName 兜底）", () => {
    // ponytail: HF author "Qwen" 通过 VENDOR_ALIASES 归一为 qwen, 同 vendor 同 name
    // → 按 id 合并, HF huggingface 切片被接回 AA 那条
    const aa = [
      {
        id: "qwen-qwen2-5-7b",
        name: "Qwen2.5-7B",
        vendor: "qwen",
        vendorRaw: "Qwen",
        category: "llm",
        aa: { intelligenceIndex: 65 },
        sources: { arena: "none", aa: "live", openrouter: "none", livebench: "none", modelsdev: "none" },
        isSample: false,
      },
    ];
    const hf = [
      {
        id: "qwen-qwen2-5-7b",
        name: "Qwen2.5-7B",
        vendor: "qwen",
        vendorRaw: "Qwen",
        category: "llm",
        huggingface: { downloads: 1000000, likes: 200 },
        sources: { arena: "none", aa: "none", openrouter: "none", livebench: "none", modelsdev: "none", huggingface: "live" },
        isSample: false,
      },
    ];
    const merged = mergeModelSlices([aa, hf]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("qwen-qwen2-5-7b");
    expect(merged[0].aa).toEqual({ intelligenceIndex: 65 });
    expect(merged[0].huggingface).toEqual({ downloads: 1000000, likes: 200 });
  });

  it("AA 与 HF vendor 命名不同 (AA canonical vs HF router) → _normName 兜底合并", () => {
    // ponytail: AA 用 "anthropic" (canonical), HF author "cross-encoder" → other.
    // _normName 把 "Claude 3.5 Haiku" 归一后命中, HF slice 接回 AA 那条.
    const aa = [
      {
        id: "anthropic-claude-3-5-haiku",
        name: "Claude 3.5 Haiku",
        vendor: "anthropic",
        category: "llm",
        aa: { intelligenceIndex: 30 },
        sources: { arena: "none", aa: "live", openrouter: "none", livebench: "none", modelsdev: "none" },
        isSample: false,
      },
    ];
    const hf = [
      {
        id: "other-claude-3-5-haiku",
        name: "Claude 3.5 Haiku",
        vendor: "other",
        vendorRaw: "cross-encoder", // 假设 cross-encoder 挂了个第三方转存
        category: "llm",
        huggingface: { downloads: 50000, likes: 50 },
        sources: { arena: "none", aa: "none", openrouter: "none", livebench: "none", modelsdev: "none", huggingface: "live" },
        isSample: false,
      },
    ];
    const merged = mergeModelSlices([aa, hf]);
    expect(merged).toHaveLength(1);
    expect(merged[0].vendor).toBe("anthropic");
    expect(merged[0].aa).toEqual({ intelligenceIndex: 30 });
    expect(merged[0].huggingface).toEqual({ downloads: 50000, likes: 50 });
  });

  it("HF 切片自带 sources.huggingface=LIVE, 合并到 AA 后, 主条 sources 仍 5 字段（merge 不强制注入）", () => {
    // ponytail: 合并策略只合数据 slice, 不合 sources 形状 (避免破坏现有 toEqual 断言).
    // 主条 (AA) 的 sources 5 字段保留, hf slice 的 huggingface 数据进 m.huggingface.
    const aa = [
      {
        id: "openai-gpt-4o",
        name: "GPT-4o",
        vendor: "openai",
        category: "llm",
        aa: { intelligenceIndex: 78 },
        sources: { arena: "none", aa: "live", openrouter: "none", livebench: "none", modelsdev: "none" },
        isSample: false,
      },
    ];
    const hf = [
      {
        id: "openai-gpt-4o",
        name: "GPT-4o",
        vendor: "openai",
        vendorRaw: "openai",
        category: "llm",
        huggingface: { downloads: 100000000, likes: 5000 },
        sources: { arena: "none", aa: "none", openrouter: "none", livebench: "none", modelsdev: "none", huggingface: "live" },
        isSample: false,
      },
    ];
    const merged = mergeModelSlices([aa, hf]);
    expect(merged).toHaveLength(1);
    // 主条 sources 形状不变 (5 字段), 顶层 sources.huggingface 由 aggregator 独立算
    expect(merged[0].sources).toEqual({
      arena: "none",
      aa: "live",
      openrouter: "none",
      livebench: "none",
      modelsdev: "none",
    });
    // 数据 slice 都合并
    expect(merged[0].aa).toEqual({ intelligenceIndex: 78 });
    expect(merged[0].huggingface).toEqual({ downloads: 100000000, likes: 5000 });
  });

  it("toAiModel 默认 huggingface: null（不传时安全解构）", () => {
    const m = toAiModel({ name: "Foo", vendor: "openai" });
    expect(m.huggingface).toBeNull();
    // sources 默认仍 5 字段（不污染现有断言）
    expect(m.sources).toEqual({
      arena: "none",
      aa: "none",
      openrouter: "none",
      livebench: "none",
      modelsdev: "none",
    });
  });
});
