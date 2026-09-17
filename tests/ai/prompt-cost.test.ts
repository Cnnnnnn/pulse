/**
 * tests/ai/prompt-cost.test.ts
 *
 * Prompt 请求侧成本测量 — 估算启发式 / 部件分解 / ring buffer / 接入点埋点。
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPromptCostRecords,
  estimateTokens,
  formatPromptCost,
  getPromptCostRecords,
  measurePromptParts,
  PROMPT_COST_MAX,
  recordPromptCost,
} from "../../src/ai/prompt-cost.ts";
import { buildAssistantSystemPrompt } from "../../src/ai/assistant-prompt.ts";
import { resolvePrompt } from "../../src/ai/prompt-registry.ts";

beforeEach(() => {
  clearPromptCostRecords();
});

describe("estimateTokens — 启发式估算", () => {
  it("空串与纯空白为 0 或极小", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("ab")).toBeGreaterThan(0);
  });

  it("纯 CJK 按 1 token/字计", () => {
    // 8 个汉字 + 2 个 ASCII 字母 → 8 + ceil(2/4)
    expect(estimateTokens("你好世界测试文本AB")).toBe(8 + Math.ceil(2 / 4));
    expect(estimateTokens("一二三四五")).toBe(5);
  });

  it("纯 ASCII 按 4 字符/token 向上取整", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abcdefghi")).toBe(3);
  });

  it("全角标点按宽字计", () => {
    expect(estimateTokens("，，")).toBe(2);
  });

  it("混合文本介于纯中文与纯英文之间", () => {
    const mixed = estimateTokens("中文内容 with english words 混排");
    expect(mixed).toBeGreaterThan(0);
    expect(mixed).toBeLessThan(40);
  });
});

describe("measurePromptParts / formatPromptCost", () => {
  it("丢弃空部件并计算占比", () => {
    const b = measurePromptParts([
      { label: "empty", text: "" },
      { label: "a", text: "一二三四五六七八九十" }, // 10 tok
      { label: "b", text: "abcdefgh" }, // 2 tok
    ]);
    expect(b.parts.map((p) => p.label)).toEqual(["a", "b"]);
    expect(b.totalTokens).toBe(12);
    expect(b.totalChars).toBe(10 + 8);
    const a = b.parts.find((p) => p.label === "a")!;
    const bb = b.parts.find((p) => p.label === "b")!;
    expect(a.pct).toBe(83);
    expect(bb.pct).toBe(17);
  });

  it("全空输入返回零总量（无除零）", () => {
    const b = measurePromptParts([{ label: "x", text: "" }]);
    expect(b.totalTokens).toBe(0);
    expect(b.parts).toEqual([]);
    expect(formatPromptCost(b)).toContain("0tok");
  });

  it("formatPromptCost 输出头部与逐部件占比", () => {
    const s = formatPromptCost(
      measurePromptParts([
        { label: "sys", text: "一二三四五六七八" }, // 8 tok
        { label: "few", text: "abcdefgh" }, // 2 tok
      ]),
    );
    expect(s).toMatch(/^prompt≈10tok\//);
    expect(s).toContain("sys 8(80%)");
    expect(s).toContain("few 2(20%)");
  });
});

describe("ring buffer", () => {
  it("record/get/clear 基本语义", () => {
    recordPromptCost("scene_a", measurePromptParts([{ label: "x", text: "test" }]), 111);
    recordPromptCost("scene_b", measurePromptParts([{ label: "y", text: "测试" }]), 222);
    const all = getPromptCostRecords();
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ ts: 111, scene: "scene_a" });
    expect(all[1].breakdown.totalTokens).toBe(2);
    // 返回副本，外部改不动内部状态
    all.pop();
    expect(getPromptCostRecords()).toHaveLength(2);
    clearPromptCostRecords();
    expect(getPromptCostRecords()).toHaveLength(0);
  });

  it("超过上限丢弃最旧记录", () => {
    for (let i = 0; i < PROMPT_COST_MAX + 10; i++) {
      recordPromptCost(`s${i}`, measurePromptParts([]), i);
    }
    const all = getPromptCostRecords();
    expect(all).toHaveLength(PROMPT_COST_MAX);
    expect(all[0].scene).toBe("s10");
    expect(all[all.length - 1].scene).toBe(`s${PROMPT_COST_MAX + 9}`);
  });
});

describe("接入点 — buildAssistantSystemPrompt 埋点", () => {
  it("FC 与 XML 两种场景各自落一条记录，含 scaffold/fewshot/ctx 三段", () => {
    buildAssistantSystemPrompt({
      useFunctionCalling: true,
      now: new Date(2026, 8, 16, 12, 0, 0),
    });
    buildAssistantSystemPrompt({
      useFunctionCalling: false,
      memory: "用户偏好：深色模式",
      now: new Date(2026, 8, 16, 12, 0, 0),
    });

    const all = getPromptCostRecords();
    expect(all.map((r) => r.scene)).toEqual(["assistant_fc", "assistant_xml"]);
    const fc = all[0].breakdown;
    expect(fc.parts.map((p) => p.label)).toEqual(["scaffold", "fewshot", "ctx"]);
    expect(fc.totalTokens).toBeGreaterThan(100); // 系统骨架本身就有体积
    // ctx 含记忆注入时体积应显著大于裸时间行
    const xmlCtx = all[1].breakdown.parts.find((p) => p.label === "ctx")!;
    expect(xmlCtx.estTokens).toBeGreaterThan(10);
    // 分解的总量与整段 prompt 同量级（±15% 内）
    const full = estimateTokens(
      buildAssistantSystemPrompt({
        useFunctionCalling: true,
        now: new Date(2026, 8, 16, 12, 0, 0),
      }),
    );
    expect(Math.abs(fc.totalTokens - full) / full).toBeLessThan(0.15);
  });

  it("prompt 内容本身不受埋点影响", () => {
    const a = buildAssistantSystemPrompt({ now: new Date(2026, 8, 16) });
    const b = buildAssistantSystemPrompt({ now: new Date(2026, 8, 16) });
    expect(a).toBe(b);
  });
});

describe("接入点 — resolvePrompt 埋点", () => {
  it("按 prompt key 记 scene；空 fewShot 被丢弃，非空时三段齐全", () => {
    resolvePrompt("ithome_summary");
    const ithome = getPromptCostRecords().find(
      (r) => r.scene === "ithome_summary",
    );
    expect(ithome).toBeDefined();
    // ithome_summary 默认 fewShot 为空串 → 丢弃，只剩 system/rules
    expect(ithome!.breakdown.parts.map((p) => p.label)).toEqual([
      "system",
      "rules",
    ]);
    expect(ithome!.breakdown.totalTokens).toBeGreaterThan(50);

    resolvePrompt("upgrade_advice");
    const advice = getPromptCostRecords().find(
      (r) => r.scene === "upgrade_advice",
    );
    expect(advice!.breakdown.parts.map((p) => p.label)).toEqual([
      "system",
      "rules",
      "fewShot",
    ]);
  });

  it("未知 key 仍抛错且不记录", () => {
    expect(() => resolvePrompt("nope")).toThrow(/unknown prompt key/);
    expect(getPromptCostRecords()).toHaveLength(0);
  });
});
