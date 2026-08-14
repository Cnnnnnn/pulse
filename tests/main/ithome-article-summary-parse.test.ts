import { describe, it, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const {
  parseArticleSummary,
  enrichSummaryEntry,
  splitKeywords,
} = requireMain("ithome/article-summary-parse");

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

  it("parses optional analysis fields without changing the old four-field contract", () => {
    expect(parseArticleSummary([
      "摘要：苹果重新设计智能手表产品线。",
      "为什么重要：这可能改变成熟产品线的形态方向。",
      "影响方面：智能穿戴用户与配件厂商。",
      "风险与不确定性：仍处于研究阶段；发布时间未确定。",
      "后续关注：秋季发布会；健康 App 的 AI 功能。",
      "原文依据：报道明确称尚未确定最终方向；短期仍按现有路线更新。",
      "关键词：苹果、Apple Watch",
      "所属领域：消费电子",
      "信息完整度：中",
    ].join("\n"))).toEqual({
      abstract: "苹果重新设计智能手表产品线。",
      keywords: ["苹果", "Apple Watch"],
      domain: "消费电子",
      impact: "智能穿戴用户与配件厂商。",
      whyImportant: "这可能改变成熟产品线的形态方向。",
      risks: ["仍处于研究阶段", "发布时间未确定。"],
      followUps: ["秋季发布会", "健康 App 的 AI 功能。"],
      evidence: ["报道明确称尚未确定最终方向", "短期仍按现有路线更新。"],
      completeness: "medium",
    });
  });
});
