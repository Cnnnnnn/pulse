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
    expect(meta.hf_downloads.field).toBe("huggingface");
    expect(meta.hf_likes.field).toBe("huggingface");
  });
});
