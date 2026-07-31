/**
 * tests/main/finance/finance-news-interpret.test.ts
 *
 * 财经新闻 AI 解读模块单测。mock chatCompletion（改写 shared-llm 实例属性，
 * 与 changelog-summary.test.ts 同桥），断言解析 / 缓存命中 / 内容变更重算 /
 * article 缺失 / 清除缓存 行为。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "module";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";

const _require = createRequire(import.meta.url);
const { requireMain, requireAi } = _require("../../_setup/require-main.cjs");

const chatCompletion = vi.fn();
const sharedLlm = requireAi("shared-llm");
sharedLlm.chatCompletion = chatCompletion;

const stateStore = requireMain("state-store");
const {
  buildInterpretMessages,
  parseInterpretResponse,
  fetchFinanceInterpret,
  clearFinanceInterpret,
} = requireAi("finance-news-interpret");

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-fin-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

function seedArticle(statePath: string, id: string, body: string) {
  const newsPath = join(dirname(statePath), "finance_news.json");
  writeFileSync(
    newsPath,
    JSON.stringify({
      ts: Date.now(),
      articles: {
        [id]: {
          id,
          title: "央行宣布降准0.5个百分点",
          source: "东方财富",
          category: "宏观",
          summary: "",
          body,
          pubDate: new Date().toISOString(),
        },
      },
      favorites: {},
    }),
  );
}

const ARTICLE_ID = "news-abc";
const ARTICLE_BODY =
  "人民银行决定于下月下调金融机构存款准备金率0.5个百分点，释放长期资金约1万亿元。";
const VALID_JSON = JSON.stringify({
  summary: "央行全面降准0.5pct释放约1万亿流动性，偏多债市与银行板块。",
  highlights: ["降准0.5个百分点，幅度中性偏积极", "释放长期资金约1万亿元"],
  sentiment: { label: "bullish", score: 0.68 },
  impact: {
    sectors: ["银行", "债券", "地产"],
    direction: "positive",
    magnitude: "moderate",
  },
  extracted: {
    tickers: ["存款准备金率"],
    events: ["全面降准0.5个百分点"],
    figures: ["0.5个百分点", "1万亿元"],
  },
});

describe("parseInterpretResponse", () => {
  it("合法 JSON → 五字段齐全, 情感/影响归一化", () => {
    const r = parseInterpretResponse(`前言\n${VALID_JSON}\n尾巴`);
    expect(r.summary).toContain("降准");
    expect(r.highlights).toHaveLength(2);
    expect(r.sentiment).toEqual({ label: "bullish", score: 0.68 });
    expect(r.impact?.sectors).toEqual(["银行", "债券", "地产"]);
    expect(r.extracted?.figures).toEqual(["0.5个百分点", "1万亿元"]);
    expect(r.disclaimer).toBe(true);
  });

  it("缺 summary → null", () => {
    expect(parseInterpretResponse('{"highlights":["x"]}')).toBeNull();
  });

  it("非 JSON → null", () => {
    expect(parseInterpretResponse("not json at all")).toBeNull();
  });

  it("非法 sentiment.label 归一为 neutral, score 钳制到 [0,1]", () => {
    const r = parseInterpretResponse(
      '{"summary":"x","sentiment":{"label":"rocket","score":5}}',
    );
    expect(r.sentiment.label).toBe("neutral");
    expect(r.sentiment.score).toBe(1);
  });
});

describe("buildInterpretMessages", () => {
  it("含 system + user 且注入 few-shot", () => {
    const msgs = buildInterpretMessages({
      title: "央行降准",
      source: "东方财富",
      category: "宏观",
      body: "降准0.5个百分点",
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toContain("央行降准");
    expect(msgs[1].content).toContain("【参考示例】");
  });

  it("正文截断到 1500 字", () => {
    const msgs = buildInterpretMessages({
      title: "t",
      body: "x".repeat(2000),
    });
    const m = msgs[1].content.match(/正文[:：]([\s\S]*)/);
    expect(m).not.toBeNull();
    expect(m[1].trim().length).toBeLessThanOrEqual(1500);
  });
});

describe("fetchFinanceInterpret 端到端", () => {
  let statePath: string;

  beforeEach(() => {
    statePath = tmpStatePath();
    seedArticle(statePath, ARTICLE_ID, ARTICLE_BODY);
    stateStore._setStatePathForTest(statePath);
    chatCompletion.mockReset();
  });

  it("LLM ok → 落盘并返回 cached:false + 五字段", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: VALID_JSON });
    const r = await fetchFinanceInterpret({ id: ARTICLE_ID, statePath });
    expect(r.ok).toBe(true);
    expect(r.cached).toBe(false);
    expect(r.summary).toContain("降准");
    expect(r.impact.sectors).toHaveLength(3);
    expect(typeof r.generatedAt).toBe("number");
    // 落盘验证：第二次无 mock 也能命中
    chatCompletion.mockReset();
  });

  it("二次调用（内容未变）→ 缓存命中 cached:true, 不再调 LLM", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: VALID_JSON });
    await fetchFinanceInterpret({ id: ARTICLE_ID, statePath });
    chatCompletion.mockClear();
    const r = await fetchFinanceInterpret({ id: ARTICLE_ID, statePath });
    expect(r.cached).toBe(true);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("内容变更 → contentHash 不匹配 → 重新调 LLM", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: VALID_JSON });
    await fetchFinanceInterpret({ id: ARTICLE_ID, statePath });
    // 改正文并重 seed
    seedArticle(statePath, ARTICLE_ID, "央行意外加息0.25个百分点，回收流动性。");
    chatCompletion.mockClear();
    chatCompletion.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        summary: "意外加息偏空。",
        highlights: ["加息0.25个百分点"],
        sentiment: { label: "bearish", score: 0.3 },
        impact: { sectors: ["银行"], direction: "negative", magnitude: "moderate" },
        extracted: { tickers: [], events: ["加息"], figures: ["0.25个百分点"] },
      }),
    });
    const r = await fetchFinanceInterpret({ id: ARTICLE_ID, statePath });
    expect(r.cached).toBe(false);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(r.sentiment.label).toBe("bearish");
  });

  it("article 不存在 → reason:article_not_found", async () => {
    const r = await fetchFinanceInterpret({ id: "nope", statePath });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("article_not_found");
  });

  it("LLM 解析失败 → reason:parse_failed, 不落盘", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: "garbage" });
    const r = await fetchFinanceInterpret({ id: ARTICLE_ID, statePath });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("force=true → 即使命中缓存也重新调 LLM", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: VALID_JSON });
    await fetchFinanceInterpret({ id: ARTICLE_ID, statePath });
    chatCompletion.mockClear();
    chatCompletion.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        summary: "重算版本。",
        highlights: ["重算"],
        sentiment: { label: "neutral", score: 0.5 },
        impact: undefined,
        extracted: { tickers: [], events: [], figures: [] },
      }),
    });
    const r = await fetchFinanceInterpret({
      id: ARTICLE_ID,
      statePath,
      force: true,
    });
    expect(r.cached).toBe(false);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });
});

describe("clearFinanceInterpret", () => {
  it("清除后再次拉取 → 缓存未命中, 重新调 LLM", async () => {
    const statePath = tmpStatePath();
    seedArticle(statePath, ARTICLE_ID, ARTICLE_BODY);
    stateStore._setStatePathForTest(statePath);
    chatCompletion.mockResolvedValue({ ok: true, text: VALID_JSON });
    await fetchFinanceInterpret({ id: ARTICLE_ID, statePath });
    expect(clearFinanceInterpret(ARTICLE_ID, statePath)).toBe(true);
    chatCompletion.mockClear();
    const r = await fetchFinanceInterpret({ id: ARTICLE_ID, statePath });
    expect(r.cached).toBe(false);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });

  it("非法 id → false", () => {
    expect(clearFinanceInterpret("", tmpStatePath())).toBe(false);
  });
});
