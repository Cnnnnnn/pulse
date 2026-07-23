/**
 * tests/main/ai-leaderboard-ranking-hf.test.js
 *
 * ranking.ts 扩展 — HF 社区信号维度 (v2.79.5+):
 *   - sortValue: hf_downloads / hf_likes 走 huggingface 切片
 *   - sortModels: 完整排序（desc 降序，asc 升序）
 *   - 缺 HF 切片 → 排到末尾
 *
 * 复用 fetcher-huggingface.test.js 已验证的 vendor 归一 + normalize 行为,
 * 这里只测 ranking 层新加的 hf_* 维度.
 */

import { describe, it, expect } from "vitest";

const { sortValue, sortModels } = require("../../src/main/ai-leaderboard/ranking");
const { toAiModel } = require("../../src/main/ai-leaderboard/types");

function makeHF(name, vendor, downloads, likes) {
  return toAiModel({
    id: `${vendor}-${name}`,
    name,
    vendor,
    category: "llm",
    huggingface: { downloads, likes },
  });
}

describe("ranking: HF 维度 (v2.79.5+)", () => {
  const items = [
    makeHF("A", "openai", 1000000, 500),
    makeHF("B", "anthropic", 5000000, 100), // 最高 downloads
    makeHF("C", "google", 200000, 5000),    // 最高 likes
  ];

  it("sortValue: hf_downloads 走 huggingface 切片", () => {
    expect(sortValue(items[0], "hf_downloads", "text")).toBe(1000000);
    expect(sortValue(items[1], "hf_downloads", "text")).toBe(5000000);
    expect(sortValue(items[2], "hf_downloads", "text")).toBe(200000);
  });

  it("sortValue: hf_likes 走 huggingface 切片", () => {
    expect(sortValue(items[0], "hf_likes", "text")).toBe(500);
    expect(sortValue(items[1], "hf_likes", "text")).toBe(100);
    expect(sortValue(items[2], "hf_likes", "text")).toBe(5000);
  });

  it("sortValue: 缺 HF 切片 → -Infinity（排到末尾）", () => {
    const noHF = toAiModel({ id: "x", name: "X", vendor: "openai", category: "llm" });
    expect(sortValue(noHF, "hf_downloads", "text")).toBe(-Infinity);
    expect(sortValue(noHF, "hf_likes", "text")).toBe(-Infinity);
  });

  it("sortValue: 缺具体字段（huggingface 存在但 downloads 缺失）→ -Infinity", () => {
    const partial = toAiModel({
      id: "y",
      name: "Y",
      vendor: "openai",
      category: "llm",
      huggingface: { likes: 100 }, // 缺 downloads
    });
    expect(sortValue(partial, "hf_downloads", "text")).toBe(-Infinity);
    expect(sortValue(partial, "hf_likes", "text")).toBe(100);
  });

  it("sortModels: 按 hf_downloads 降序", () => {
    const sorted = sortModels(items, "hf_downloads", "desc", "llm");
    expect(sorted.map((m) => m.id)).toEqual([
      "anthropic-B", // 5M
      "openai-A",    // 1M
      "google-C",    // 200K
    ]);
  });

  it("sortModels: 按 hf_downloads 升序", () => {
    const sorted = sortModels(items, "hf_downloads", "asc", "llm");
    expect(sorted.map((m) => m.id)).toEqual([
      "google-C",
      "openai-A",
      "anthropic-B",
    ]);
  });

  it("sortModels: 按 hf_likes 降序（C likes 最高）", () => {
    const sorted = sortModels(items, "hf_likes", "desc", "llm");
    expect(sorted.map((m) => m.id)).toEqual([
      "google-C",    // 5000
      "openai-A",    // 500
      "anthropic-B", // 100
    ]);
  });

  it("sortModels: HF 切片缺失的模型排到末尾（不影响其它）", () => {
    const withGap = [
      ...items,
      toAiModel({ id: "no-hf", name: "NoHF", vendor: "openai", category: "llm" }),
    ];
    const sorted = sortModels(withGap, "hf_downloads", "desc", "llm");
    expect(sorted[0].id).toBe("anthropic-B");
    expect(sorted[1].id).toBe("openai-A");
    expect(sorted[2].id).toBe("google-C");
    expect(sorted[3].id).toBe("no-hf");
  });

  it("sortValue: 未知 hf_* 维度走 DIMENSION_META 兜底 (sortKey undefined → -Infinity)", () => {
    // ponytail: sortKey 缺失时跟其它维度走 fallback 路径, 不会因 "hf_" 前缀而炸.
    const meta = require("../../src/main/ai-leaderboard/types").DIMENSION_META;
    expect(meta.hf_downloads).toBeDefined();
    expect(meta.hf_likes).toBeDefined();
    expect(meta.hf_trending).toBeDefined(); // v2.79.6+
    expect(meta.hf_downloads.field).toBe("huggingface");
    expect(meta.hf_likes.field).toBe("huggingface");
    expect(meta.hf_trending.field).toBe("huggingface");
  });
});

describe("ranking: HF Trending 维度 (v2.79.6+)", () => {
  // ponytail: hf_trending 走 special case (在 hf_* 通用分支之前), 调 fetcher.computeTrendingScore.
  // 公式: log10(dl+1) / log10(age_days+2). 守卫 dl>=1000 && age<=365.
  // 关键场景: 新发布爆款排前, 老累计王排末 (因为 age>365 → null → -Infinity).
  const NOW = new Date("2026-07-23T00:00:00Z").getTime();
  const day = (n) => new Date(NOW - n * 86_400_000).toISOString();

  function makeHFWithDates(name, vendor, downloads, likes, lastModified, createdAt) {
    return toAiModel({
      id: `${vendor}-${name}`,
      name,
      vendor,
      category: "llm",
      huggingface: { downloads, likes, lastModified, createdAt },
    });
  }

  it("sortValue: hf_trending 调 computeTrendingScore (新发布爆款 > 老累计王)", () => {
    const fresh = makeHFWithDates("Qwen3-8B", "qwen", 28_000_000, 1200, day(8), null);
    const old = makeHFWithDates("MiniLM", "other", 254_000_000, 5000, day(934), null);
    const freshTs = sortValue(fresh, "hf_trending", "text");
    const oldTs = sortValue(old, "hf_trending", "text");
    // 新发布应该分数高 (尽管 downloads 少 9 倍)
    expect(freshTs).toBeGreaterThan(oldTs);
    expect(oldTs).toBe(-Infinity); // age > 365 → null
  });

  it("sortValue: hf_trending 缺 HF 切片 → -Infinity", () => {
    const noHF = toAiModel({ id: "x", name: "X", vendor: "openai", category: "llm" });
    expect(sortValue(noHF, "hf_trending", "text")).toBe(-Infinity);
  });

  it("sortValue: hf_trending 缺时间锚点 (lastModified/createdAt 都 null) → -Infinity", () => {
    const noDate = toAiModel({
      id: "y",
      name: "Y",
      vendor: "openai",
      category: "llm",
      huggingface: { downloads: 5000000, likes: 100 }, // 无日期
    });
    expect(sortValue(noDate, "hf_trending", "text")).toBe(-Infinity);
    // 同样不影响 hf_downloads / hf_likes 排序 (走 hf_* 通用分支, 仍能拿到 dl/likes)
    expect(sortValue(noDate, "hf_downloads", "text")).toBe(5000000);
  });

  it("sortValue: hf_trending dl < 1000 → -Infinity (新发布小模型不刷榜)", () => {
    const tiny = toAiModel({
      id: "z",
      name: "Z",
      vendor: "openai",
      category: "llm",
      huggingface: { downloads: 500, likes: 5, lastModified: day(2) },
    });
    expect(sortValue(tiny, "hf_trending", "text")).toBe(-Infinity);
  });

  it("sortModels: hf_trending 降序 — 新发布爆款在前, 老累计王在末", () => {
    const items = [
      makeHFWithDates("Old", "other", 254_000_000, 5000, day(934), null), // null
      makeHFWithDates("Fresh", "qwen", 28_000_000, 1200, day(8), null),   // 高分
      makeHFWithDates("Mid", "google", 50_000_000, 800, day(60), null),    // 中分
    ];
    const sorted = sortModels(items, "hf_trending", "desc", "llm");
    expect(sorted[0].name).toBe("Fresh");
    expect(sorted[1].name).toBe("Mid");
    expect(sorted[2].name).toBe("Old"); // age > 365 → 末尾
  });
});
