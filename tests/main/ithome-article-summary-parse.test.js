import { describe, it, expect } from "vitest";

const {
  parseArticleSummary,
  enrichSummaryEntry,
  splitKeywords,
} = require("../../src/main/ithome/article-summary-parse");

describe("ithome article-summary-parse", () => {
  it("parseArticleSummary extracts four structured fields", () => {
    const text = [
      "摘要：苹果发布新款芯片，性能提升明显。",
      "关键词：苹果、芯片、性能",
      "所属领域：消费电子",
      "影响方面：可能影响高端笔记本与手机竞品格局。",
    ].join("\n");

    expect(parseArticleSummary(text)).toEqual({
      abstract: "苹果发布新款芯片，性能提升明显。",
      keywords: ["苹果", "芯片", "性能"],
      domain: "消费电子",
      impact: "可能影响高端笔记本与手机竞品格局。",
    });
  });

  it("splitKeywords handles mixed separators", () => {
    expect(splitKeywords("AI,大模型、云计算;开源")).toEqual([
      "AI",
      "大模型",
      "云计算",
      "开源",
    ]);
  });

  it("enrichSummaryEntry prefers stored structured fields", () => {
    const entry = {
      text: "旧文本",
      abstract: "已存摘要",
      keywords: ["测试"],
      domain: "软件",
      impact: "开发者",
    };
    expect(enrichSummaryEntry(entry)).toEqual({
      abstract: "已存摘要",
      keywords: ["测试"],
      domain: "软件",
      impact: "开发者",
    });
  });

  it("parseArticleSummary falls back to full text when labels missing", () => {
    expect(parseArticleSummary("这是一段未按格式输出的摘要。")).toEqual({
      abstract: "这是一段未按格式输出的摘要。",
      keywords: [],
      domain: "",
      impact: "",
    });
  });
});
