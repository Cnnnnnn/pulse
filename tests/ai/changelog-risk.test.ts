/**
 * tests/ai/changelog-risk.test.ts
 *
 * 更新风险标签：解析 LLM JSON、score clamp、cache key。
 */
import { describe, it, expect } from "vitest";
const { requireAi } = require("../_setup/require-main.cjs");

const {
  parseRiskResponse,
  riskCacheKey,
  changelogExcerpt,
  RISK_SCORE_DEFAULT,
  RISK_LABEL,
} = requireAi("changelog-risk");

describe("parseRiskResponse", () => {
  it("解析合法 JSON（含 markdown fence 包裹）", () => {
    const text = '```json\n{"risk":"security","score":92,"tags":["安全修复","XSS"],"oneLiner":"含关键安全修复"}\n```';
    const r = parseRiskResponse(text);
    expect(r).toBeTruthy();
    expect(r!.risk).toBe("security");
    expect(r!.score).toBe(92);
    expect(r!.tags).toEqual(["安全修复", "XSS"]);
    expect(r!.oneLiner).toBe("含关键安全修复");
  });

  it("未知 risk → unknown + 默认 score", () => {
    const r = parseRiskResponse('{"risk":"wtf","score":null}');
    expect(r!.risk).toBe("unknown");
    expect(r!.score).toBe(RISK_SCORE_DEFAULT.unknown);
  });

  it("score 越界 clamp 到 0-100", () => {
    expect(parseRiskResponse('{"risk":"bugfix","score":999}')!.score).toBe(100);
    expect(parseRiskResponse('{"risk":"bugfix","score":-5}')!.score).toBe(0);
  });

  it("tags 过滤非字符串并截到 4 条", () => {
    const r = parseRiskResponse(
      JSON.stringify({
        risk: "feature",
        score: 50,
        tags: ["a", 1, null, "b", "c", "d", "e"],
        oneLiner: "x",
      }),
    );
    expect(r!.tags).toEqual(["a", "b", "c", "d"]);
  });

  it("非 JSON / 空 → null", () => {
    expect(parseRiskResponse("")).toBeNull();
    expect(parseRiskResponse("not json")).toBeNull();
    expect(parseRiskResponse(null as any)).toBeNull();
  });
});

describe("helpers", () => {
  it("riskCacheKey = app::version", () => {
    expect(riskCacheKey("Cursor", "1.2.3")).toBe("Cursor::1.2.3");
    expect(riskCacheKey("Cursor", null)).toBe("Cursor::");
  });

  it("changelogExcerpt 去 HTML 并截断", () => {
    expect(changelogExcerpt("<p>Hello <b>World</b></p>")).toBe("Hello World");
    expect(changelogExcerpt("x".repeat(50), 10)).toHaveLength(11); // 10 + …
    expect(changelogExcerpt(null)).toBe("(无 release notes)");
  });

  it("RISK_LABEL 覆盖全部 level", () => {
    for (const k of Object.keys(RISK_SCORE_DEFAULT)) {
      expect(RISK_LABEL[k as keyof typeof RISK_LABEL]).toBeTruthy();
    }
  });
});
