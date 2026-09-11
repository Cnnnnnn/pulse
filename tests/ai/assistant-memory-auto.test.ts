/**
 * tests/ai/assistant-memory-auto.test.ts
 *
 * 自动记忆沉淀：收集 user 文本 / 解析 JSON / 启发式关键词。
 */
import { describe, it, expect } from "vitest";
const { requireAi } = require("../_setup/require-main.cjs");

const {
  collectRecentUserTexts,
  parseAutoExtractResponse,
  looksLikePreference,
  AUTO_EXTRACT_MAX_FACTS,
} = requireAi("assistant-memory-auto");

describe("collectRecentUserTexts", () => {
  it("只取 user、按时间序、过滤过短", () => {
    const msgs = [
      { role: "user", content: "嗯" },
      { role: "assistant", content: "你好" },
      { role: "user", content: "以后基金都用华夏" },
      { role: "assistant", content: "好的" },
      { role: "user", content: "别再推短剧了" },
    ];
    expect(collectRecentUserTexts(msgs)).toEqual([
      "以后基金都用华夏",
      "别再推短剧了",
    ]);
  });

  it("上限 limit 条", () => {
    const msgs = Array.from({ length: 12 }, (_, i) => ({
      role: "user",
      content: `用户消息内容第 ${i} 条足够长`,
    }));
    expect(collectRecentUserTexts(msgs, 3)).toHaveLength(3);
  });
});

describe("parseAutoExtractResponse", () => {
  it("解析 JSON 与 fence，截到上限", () => {
    const text = '```json\n{"facts":["喜欢深色主题","基金偏好华夏","别再提醒演出","第四条"]}\n```';
    const facts = parseAutoExtractResponse(text);
    expect(facts).toHaveLength(AUTO_EXTRACT_MAX_FACTS);
    expect(facts[0]).toBe("喜欢深色主题");
  });

  it("非 JSON → []", () => {
    expect(parseAutoExtractResponse("没有值得记的")).toEqual([]);
    expect(parseAutoExtractResponse("")).toEqual([]);
  });
});

describe("looksLikePreference", () => {
  it("偏好关键词命中", () => {
    expect(looksLikePreference("以后都用华夏基金")).toBe(true);
    expect(looksLikePreference("我喜欢深色主题")).toBe(true);
    expect(looksLikePreference("今天天气怎么样")).toBe(false);
  });
});
