/**
 * tests/main/finance/finance-news-aggregate.test.ts
 *
 * 财经新闻跨新闻聚合模块单测。mock chatCompletion（改写 shared-llm 实例属性，
 * 与 finance-news-interpret.test.ts 同桥），断言解析 / 缓存命中 / 内容变更重算 /
 * 空池 / force 重聚合 行为。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "module";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";

const _require = createRequire(import.meta.url);
const { requireMain, requireAi } = _require("../../_setup/require-main.cjs");

const chatCompletion = vi.fn();
const sharedLlm = requireAi("shared-llm");
sharedLlm.chatCompletion = chatCompletion;

const stateStore = requireMain("state-store");
const {
  buildAggregateMessages,
  parseAggregateResponse,
  fetchFinanceAggregate,
} = requireAi("finance-news-interpret");

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-fin-agg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

function seedPool(statePath: string, articles: Record<string, any>) {
  const newsPath = join(dirname(statePath), "finance_news.json");
  writeFileSync(
    newsPath,
    JSON.stringify({ ts: Date.now(), articles, favorites: {} }),
  );
}

const POOL: Record<string, any> = {
  a1: {
    id: "a1",
    title: "央行宣布降准0.5个百分点",
    source: "东方财富",
    category: "宏观",
    summary: "",
    body: "人民银行决定于下月下调存款准备金率0.5个百分点，释放长期资金约1万亿元。",
    pubDate: new Date().toISOString(),
  },
  a2: {
    id: "a2",
    title: "市场观望降准落地节奏",
    source: "华尔街见闻",
    category: "宏观",
    summary: "",
    body: "机构对后续降准节奏判断不一，等待更多信号。",
    pubDate: new Date(Date.now() - 1000).toISOString(),
  },
  a3: {
    id: "a3",
    title: "债基迎来配置窗口",
    source: "东方财富",
    category: "基金",
    summary: "",
    body: "流动性宽松预期下，债券基金配置价值提升。",
    pubDate: new Date(Date.now() - 2000).toISOString(),
  },
};

const VALID_AGG_JSON = JSON.stringify({
  summary: "降准释放约1万亿流动性，短期利好债市与银行，但节奏仍有分歧。",
  themes: ["降准放水", "债基配置", "流动性宽松"],
  consensus: ["降准方向偏宽松", "债市短期受益明确"],
  conflicts: ["市场对后续降准节奏判断不一"],
  watchSignals: ["宽货币向宽信用传导效果", "权益是否跟进反弹"],
  affectedSectors: ["银行", "债券", "房地产", "基金"],
  horizon: "short",
});

describe("parseAggregateResponse", () => {
  it("合法 JSON → 七字段齐全, horizon 归一", () => {
    const r = parseAggregateResponse(`前言\n${VALID_AGG_JSON}\n尾巴`);
    expect(r.summary).toContain("降准");
    expect(r.themes).toHaveLength(3);
    expect(r.consensus).toHaveLength(2);
    expect(r.conflicts).toHaveLength(1);
    expect(r.watchSignals).toHaveLength(2);
    expect(r.affectedSectors).toHaveLength(4);
    expect(r.horizon).toBe("short");
    expect(r.disclaimer).toBe(true);
  });

  it("缺 summary → null", () => {
    expect(
      parseAggregateResponse('{"themes":["x"],"horizon":"short"}'),
    ).toBeNull();
  });

  it("非法 horizon → 回退 medium", () => {
    const r = parseAggregateResponse(
      '{"summary":"x","themes":["a"],"horizon":"decade"}',
    );
    expect(r.horizon).toBe("medium");
  });

  it("非 JSON → null", () => {
    expect(parseAggregateResponse("no json")).toBeNull();
  });
});

describe("buildAggregateMessages", () => {
  it("注入多条文摘 + 全部分类作用域", () => {
    const msgs = buildAggregateMessages(
      [
        { source: "东方财富", category: "宏观", title: "降准", body: "降准0.5pct" },
        { source: "见闻", category: "基金", title: "债基", body: "配置窗口" },
      ],
      "all",
    );
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toContain("降准");
    expect(msgs[1].content).toContain("债基");
    expect(msgs[1].content).toContain("全部分类");
  });

  it("单条正文截断到 360 字", () => {
    const msgs = buildAggregateMessages(
      [{ title: "t", body: "x".repeat(800) }],
      "all",
    );
    const m = msgs[1].content.match(/1\.\s*\[未知源\/未分类\]\s*t\n\s*([^\n]*)/);
    expect(m).not.toBeNull();
    expect(m[1].trim().length).toBeLessThanOrEqual(360);
  });
});

describe("fetchFinanceAggregate 端到端", () => {
  let statePath: string;

  beforeEach(() => {
    statePath = tmpStatePath();
    seedPool(statePath, POOL);
    stateStore._setStatePathForTest(statePath);
    chatCompletion.mockReset();
  });

  it("空池 → reason:no_articles", async () => {
    const empty = tmpStatePath();
    seedPool(empty, {});
    stateStore._setStatePathForTest(empty);
    const r = await fetchFinanceAggregate({ category: "all", statePath: empty });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_articles");
  });

  it("LLM ok → 落盘返回 cached:false + 七字段", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: VALID_AGG_JSON });
    const r = await fetchFinanceAggregate({ category: "all", statePath });
    expect(r.ok).toBe(true);
    expect(r.cached).toBe(false);
    expect(r.scope).toBe("all");
    expect(r.summary).toContain("降准");
    expect(r.affectedSectors).toHaveLength(4);
    expect(typeof r.generatedAt).toBe("number");
    chatCompletion.mockReset();
  });

  it("二次调用（池未变）→ 缓存命中 cached:true, 不再调 LLM", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: VALID_AGG_JSON });
    await fetchFinanceAggregate({ category: "all", statePath });
    chatCompletion.mockClear();
    const r = await fetchFinanceAggregate({ category: "all", statePath });
    expect(r.cached).toBe(true);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("池内容变更 → 重新调 LLM", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: VALID_AGG_JSON });
    await fetchFinanceAggregate({ category: "all", statePath });
    seedPool(statePath, {
      ...POOL,
      a1: { ...POOL.a1, body: "央行意外加息0.25个百分点，回收流动性。" },
    });
    chatCompletion.mockClear();
    chatCompletion.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        summary: "意外加息偏空。",
        themes: ["加息"],
        consensus: [],
        conflicts: ["方向判断不一"],
        watchSignals: ["资金面收紧"],
        affectedSectors: ["银行"],
        horizon: "short",
      }),
    });
    const r = await fetchFinanceAggregate({ category: "all", statePath });
    expect(r.cached).toBe(false);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });

  it("force=true → 即使命中缓存也重新调 LLM", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: VALID_AGG_JSON });
    await fetchFinanceAggregate({ category: "all", statePath });
    chatCompletion.mockClear();
    chatCompletion.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        summary: "重算聚合。",
        themes: ["重算"],
        consensus: [],
        conflicts: [],
        watchSignals: [],
        affectedSectors: [],
        horizon: "medium",
      }),
    });
    const r = await fetchFinanceAggregate({
      category: "all",
      statePath,
      force: true,
    });
    expect(r.cached).toBe(false);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });

  it("LLM 解析失败 → reason:parse_failed, 不落盘", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: "garbage" });
    const r = await fetchFinanceAggregate({ category: "all", statePath });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });
});
