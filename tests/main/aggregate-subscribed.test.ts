/**
 * tests/main/aggregate-subscribed.test.ts
 *
 * v3.0 alpha: aggregate() 加了 opts.subscribed 过滤参数.
 *
 * ponytail: 边界全测 (空 / 单个 / 全选 / 不存在项),
 *           不重测 aggregate() 的 section 行为 — 已有旧测试覆盖.
 */

import { describe, it, expect, afterEach } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");

const { aggregate, SECTION_ORDER } = requireMain("digest/aggregate");
const lbCache = requireMain("ai-leaderboard/cache");
const { ARENA_CACHE_BOARD } = requireMain("digest/ai-movers");

const NOW = new Date("2026-09-11T08:30:00");

function baseState() {
  return {
    apps: {
      Cursor: { name: "Cursor", has_update: true, installed_version: "0.42", latest_version: "0.43" },
    },
    wechatHot: { items: [{ title: "热搜 1" }] },
    ithome_news: { articles: [{ title: "新闻 1", url: "x" }] },
    funds: { holdings: [{ code: "000001", name: "测试基金", today_change_pct: 2.0 }] },
    ai_usage: { providers: { minimax: { percent: 90 } } },
    github_releases_digest: {
      ts: 1,
      items: [{ name: "vite", owner: "vitejs", repo: "vite", latest_version: "v8.0.0" }],
    },
  };
}

// ai_movers 不走 state — 从 arena 缓存读 (内存模式), 这里 seed 两份快照
function seedMoversCache() {
  lbCache.__resetForTest();
  const mk = (rank: number) => [{ model: "GPT-5", vendor: "openai", rank, score: 1400 - rank }];
  lbCache.__seedForTest(lbCache.cacheKey("arena", ARENA_CACHE_BOARD, "2026-09-09"), { boards: { text: { models: mk(4) } } }, 1);
  lbCache.__seedForTest(lbCache.cacheKey("arena", ARENA_CACHE_BOARD, "2026-09-10"), { boards: { text: { models: mk(1) } } }, 2);
}

afterEach(() => {
  lbCache.__resetForTest();
});

describe("aggregate — v3 subscribed 过滤", () => {
  it("不传 subscribed → 全选 (向后兼容)", () => {
    seedMoversCache();
    const r = aggregate(baseState(), { now: NOW });
    expect(r.sections.map((s: any) => s.kind)).toEqual([...SECTION_ORDER]);
  });

  it("subscribed=['updates'] → 只出 updates", () => {
    const r = aggregate(baseState(), { now: NOW, subscribed: ["updates"] });
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].kind).toBe("updates");
  });

  it("subscribed=[] (空) → 全选 (兜底, 不让用户误把整个早报关空)", () => {
    seedMoversCache();
    const r = aggregate(baseState(), { now: NOW, subscribed: [] });
    expect(r.sections).toHaveLength(SECTION_ORDER.length);
  });

  it("subscribed 含未知 kind → 静默忽略, 只过滤已知", () => {
    const r = aggregate(baseState(), { now: NOW, subscribed: ["updates", "fakemodule"] });
    expect(r.sections.map((s: any) => s.kind)).toEqual(["updates"]);
  });

  it("subscribed=['funds','ai_usage'] → sections 顺序按 SECTION_ORDER, 不是按 subscribed 数组顺序", () => {
    const r = aggregate(baseState(), {
      now: NOW,
      subscribed: ["ai_usage", "funds"], // 故意乱序
    });
    expect(r.sections.map((s: any) => s.kind)).toEqual(["funds", "ai_usage"]);
  });

  it("subscribed=['hot'] 但 state.wechatHot 空 → 空 sections (不强出空 section)", () => {
    const s = baseState();
    s.wechatHot = { items: [] };
    const r = aggregate(s, { now: NOW, subscribed: ["hot"] });
    expect(r.sections).toHaveLength(0);
    expect(r.lines).toHaveLength(0);
  });
});
