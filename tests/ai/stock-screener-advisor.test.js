/**
 * tests/ai/stock-screener-advisor.test.js
 *
 * ponytail: vitest 1.6 的 vi.mock 只 hook ESM import, 不 hook CJS require
 * (vitest-dev/vitest#5359). advisor.js 是 CJS, 内部用 require(...).
 * 改用 require.cache 注入模式 (见 tests/detectors/circuit-breaker-storage.test.js).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const stateStorePath = require.resolve("../../src/main/state-store.ts");
const promptRegistryPath = require.resolve("../../src/ai/prompt-registry.js");
const sharedLlmPath = require.resolve("../../src/ai/shared-llm.js");
const advisorPath = require.resolve("../../src/ai/stock-screener-advisor.js");

const mockChat = vi.fn();
const _mockState = { aiStockAdviseCache: {}, stockScreener: {}, apps: {} };

function reloadAdvisor() {
  delete require.cache[advisorPath];
  require.cache[sharedLlmPath] = {
    id: sharedLlmPath,
    filename: sharedLlmPath,
    loaded: true,
    exports: { chatCompletion: (...args) => mockChat(...args) },
  };
  require.cache[promptRegistryPath] = {
    id: promptRegistryPath,
    filename: promptRegistryPath,
    loaded: true,
    exports: {
      resolvePrompt: (key) => ({
        system: `MOCK-SYSTEM-${key}`,
        rules: `MOCK-RULES-${key}`,
        fewShot: "",
      }),
    },
  };
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: {
      load: () => _mockState,
      patchState: (fn) => fn(_mockState),
    },
  };
  return require(advisorPath);
}

let advisor = reloadAdvisor();

beforeEach(() => {
  mockChat.mockReset();
  _mockState.aiStockAdviseCache = {};
  _mockState.stockScreener = {};
  _mockState.apps = {};
});

const mkOverview = (over = {}) => ({
  total: 100,
  date: "2026-06-26",
  peMedian: 28,
  peP30: 12,
  peP70: 46,
  roeMedian: 8.2,
  changePctMedian: 0.6,
  turnoverMedian: 1.8,
  hash: "abc123",
  ...over,
});

const mkIntentChip = (over = {}) => ({ id: "low_value", label: "低估值修复", ...over });

// ─────────────────────────────────────────────────────────────
// adviseCacheKey
// ─────────────────────────────────────────────────────────────

describe("adviseCacheKey", () => {
  it("returns null when intentChip missing", () => {
    expect(advisor.adviseCacheKey({ marketOverviewHash: "abc" })).toBe(null);
  });
  it("returns null when marketOverviewHash missing", () => {
    expect(advisor.adviseCacheKey({ intentChip: { id: "x" } })).toBe(null);
  });
  it("stable for same input", () => {
    const k1 = advisor.adviseCacheKey({ intentChip: { id: "a" }, freeText: "x", marketOverviewHash: "h" });
    const k2 = advisor.adviseCacheKey({ intentChip: { id: "a" }, freeText: "x", marketOverviewHash: "h" });
    expect(k1).toBe(k2);
  });
  it("differs when freeText changes", () => {
    const k1 = advisor.adviseCacheKey({ intentChip: { id: "a" }, freeText: "x", marketOverviewHash: "h" });
    const k2 = advisor.adviseCacheKey({ intentChip: { id: "a" }, freeText: "y", marketOverviewHash: "h" });
    expect(k1).not.toBe(k2);
  });
  it("differs when overviewHash changes (date changes)", () => {
    const k1 = advisor.adviseCacheKey({ intentChip: { id: "a" }, marketOverviewHash: "h1" });
    const k2 = advisor.adviseCacheKey({ intentChip: { id: "a" }, marketOverviewHash: "h2" });
    expect(k1).not.toBe(k2);
  });
});

// ─────────────────────────────────────────────────────────────
// buildAdviseMessages
// ─────────────────────────────────────────────────────────────

describe("buildAdviseMessages", () => {
  it("throws on missing intentChip.id", () => {
    expect(() => advisor.buildAdviseMessages({ marketOverview: mkOverview() })).toThrow();
  });
  it("throws on missing marketOverview.hash", () => {
    expect(() => advisor.buildAdviseMessages({ intentChip: mkIntentChip(), marketOverview: {} })).toThrow();
  });
  it("returns system + user messages", () => {
    const msgs = advisor.buildAdviseMessages({
      intentChip: mkIntentChip(),
      marketOverview: mkOverview(),
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    expect(msgs[0].content).toContain("MOCK-SYSTEM-stock_screener_advise");
  });
  it("user message includes intentChip id+label", () => {
    const msgs = advisor.buildAdviseMessages({
      intentChip: mkIntentChip(),
      marketOverview: mkOverview(),
    });
    expect(msgs[1].content).toContain("低估值修复");
    expect(msgs[1].content).toContain("low_value");
  });
  it("user message includes freeText when present", () => {
    const msgs = advisor.buildAdviseMessages({
      intentChip: mkIntentChip(),
      freeText: "我偏银行地产",
      marketOverview: mkOverview(),
    });
    expect(msgs[1].content).toContain("我偏银行地产");
  });
  it("user message does NOT include freeText when empty", () => {
    const msgs = advisor.buildAdviseMessages({
      intentChip: mkIntentChip(),
      freeText: "",
      marketOverview: mkOverview(),
    });
    expect(msgs[1].content).not.toContain("补充说明");
  });
  it("user message includes marketOverview numbers", () => {
    const msgs = advisor.buildAdviseMessages({
      intentChip: mkIntentChip(),
      marketOverview: mkOverview({ peMedian: 25, total: 1234 }),
    });
    expect(msgs[1].content).toContain("1234");
    expect(msgs[1].content).toContain("25");
  });
  it("user message includes currentCriteria when provided", () => {
    const msgs = advisor.buildAdviseMessages({
      intentChip: mkIntentChip(),
      marketOverview: mkOverview(),
      currentCriteria: { peMin: 0, peMax: 20 },
    });
    expect(msgs[1].content).toContain("peMin");
    expect(msgs[1].content).toContain("peMax");
  });
  it("does NOT leak userId / watchlist / search history (PII safety)", () => {
    const msgs = advisor.buildAdviseMessages({
      intentChip: mkIntentChip(),
      freeText: "我偏银行地产",
      marketOverview: mkOverview(),
      currentCriteria: { peMin: 0 },
    });
    const allContent = msgs.map((m) => m.content).join("\n");
    expect(allContent).not.toMatch(/userId/i);
    expect(allContent).not.toMatch(/watchlist/i);
    expect(allContent).not.toMatch(/searchHistory|search_history/i);
    expect(allContent).not.toMatch(/selfSelect|self_select/i);
  });
});

// ─────────────────────────────────────────────────────────────
// parseAndValidateAdvise
// ─────────────────────────────────────────────────────────────

describe("parseAndValidateAdvise", () => {
  it("returns null on empty input", () => {
    expect(advisor.parseAndValidateAdvise("")).toBe(null);
    expect(advisor.parseAndValidateAdvise(null)).toBe(null);
    expect(advisor.parseAndValidateAdvise("   ")).toBe(null);
  });
  it("returns null on completely broken JSON", () => {
    expect(advisor.parseAndValidateAdvise("not json at all")).toBe(null);
  });
  it("returns null when no JSON object found", () => {
    expect(advisor.parseAndValidateAdvise("hello world")).toBe(null);
  });
  it("parses clean JSON", () => {
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({
        criteria: { peMin: 0, peMax: 15, roeMin: 12 },
        sortConfig: { key: "roe", dir: "desc" },
        summary: "市场偏防御",
      }),
    );
    expect(out.criteria.peMax).toBe(15);
    expect(out.sortConfig.key).toBe("roe");
    expect(out.summary).toBe("市场偏防御");
  });
  it("extracts JSON from text-wrapped output", () => {
    const out = advisor.parseAndValidateAdvise(
      '好的，根据你的意图:\n{"criteria":{"peMax":15},"sortConfig":null,"summary":"x"}\n请参考。',
    );
    expect(out.criteria.peMax).toBe(15);
    expect(out.sortConfig).toBe(null);
  });
  it("drops unknown criteria fields", () => {
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({ criteria: { peMax: 15, fooBar: 999, baz: "x" }, sortConfig: null, summary: "ok" }),
    );
    expect(out.criteria.peMax).toBe(15);
    expect(out.criteria.fooBar).toBeUndefined();
    expect(out.criteria.baz).toBeUndefined();
  });
  it("drops criteria fields with wrong type", () => {
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({ criteria: { peMin: "not number", roeMin: 12 }, sortConfig: null, summary: "ok" }),
    );
    expect(out.criteria.peMin).toBe(null);
    expect(out.criteria.roeMin).toBe(12);
  });
  it("drops invalid marketCapTier", () => {
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({ criteria: { marketCapTier: "huge" }, sortConfig: null, summary: "ok" }),
    );
    expect(out.criteria.marketCapTier).toBe("all");
  });
  it("accepts valid marketCapTier", () => {
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({ criteria: { marketCapTier: "large" }, sortConfig: null, summary: "ok" }),
    );
    expect(out.criteria.marketCapTier).toBe("large");
  });
  it("filters non-string industries", () => {
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({ criteria: { industries: ["银行", null, 42, "地产"] }, sortConfig: null, summary: "ok" }),
    );
    expect(out.criteria.industries).toEqual(["银行", "地产"]);
  });
  it("drops invalid sortConfig.key", () => {
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({ criteria: {}, sortConfig: { key: "magicNumber", dir: "desc" }, summary: "ok" }),
    );
    expect(out.sortConfig).toBe(null);
  });
  it("normalizes sortConfig.dir to asc or desc", () => {
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({ criteria: {}, sortConfig: { key: "pe", dir: "sideways" }, summary: "ok" }),
    );
    expect(out.sortConfig.dir).toBe("desc");
  });
  it("truncates summary > 120 chars", () => {
    const long = "x".repeat(200);
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({ criteria: {}, sortConfig: null, summary: long }),
    );
    expect(out.summary.length).toBeLessThanOrEqual(120);
    expect(out.summary.endsWith("…")).toBe(true);
  });
  it("rewrites forbidden summary keywords", () => {
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({ criteria: {}, sortConfig: null, summary: "强烈推荐买入银行股" }),
    );
    expect(out.summary).not.toMatch(/强烈推荐|买入/);
    expect(out.summary).toContain("当前市场呈现");
  });
  it("uses fallback summary when missing", () => {
    const out = advisor.parseAndValidateAdvise(JSON.stringify({ criteria: {}, sortConfig: null }));
    expect(typeof out.summary).toBe("string");
    expect(out.summary.length).toBeGreaterThan(0);
  });
  it("returns merged criteria with defaults (no undefined industries)", () => {
    const out = advisor.parseAndValidateAdvise(
      JSON.stringify({ criteria: { peMin: 5 }, sortConfig: null, summary: "x" }),
    );
    expect(Array.isArray(out.criteria.industries)).toBe(true);
    expect(out.criteria.marketCapTier).toBe("all");
  });
});

// ─────────────────────────────────────────────────────────────
// aiStockAdvise — main entry
// ─────────────────────────────────────────────────────────────

describe("aiStockAdvise", () => {
  it("returns invalid_args when intentChip missing", async () => {
    const r = await advisor.aiStockAdvise({ marketOverview: mkOverview() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
    expect(mockChat).not.toHaveBeenCalled();
  });
  it("returns missing_market_overview when overview.hash missing", async () => {
    const r = await advisor.aiStockAdvise({ intentChip: mkIntentChip(), marketOverview: {} });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_market_overview");
  });
  it("cache hit: does not call chatCompletion, returns fromCache=true", async () => {
    _mockState.aiStockAdviseCache = {
      [advisor.adviseCacheKey({ intentChip: mkIntentChip(), marketOverviewHash: mkOverview().hash })]: {
        result: { criteria: { peMax: 12 }, sortConfig: null, summary: "cached" },
        fetchedAt: Date.now(),
      },
    };
    const r = await advisor.aiStockAdvise({ intentChip: mkIntentChip(), marketOverview: mkOverview() });
    expect(r.ok).toBe(true);
    expect(r.fromCache).toBe(true);
    expect(r.result.summary).toBe("cached");
    expect(mockChat).not.toHaveBeenCalled();
  });
  it("cache miss + LLM success → calls chatCompletion, writes cache, returns fromCache=false", async () => {
    mockChat.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        criteria: { peMin: 0, peMax: 15, roeMin: 12 },
        sortConfig: { key: "roe", dir: "desc" },
        summary: "市场中性偏低",
      }),
    });
    const r = await advisor.aiStockAdvise({
      intentChip: mkIntentChip(),
      marketOverview: mkOverview(),
      freeText: "偏银行",
    });
    expect(r.ok).toBe(true);
    expect(r.fromCache).toBe(false);
    expect(r.result.criteria.peMax).toBe(15);
    expect(r.result.sortConfig.key).toBe("roe");
    expect(mockChat).toHaveBeenCalledTimes(1);
    const cacheKeys = Object.keys(_mockState.aiStockAdviseCache);
    expect(cacheKeys.length).toBe(1);
  });
  it("LLM failure: returns reason from chatCompletion", async () => {
    mockChat.mockResolvedValue({ ok: false, reason: "budget_exceeded" });
    const r = await advisor.aiStockAdvise({ intentChip: mkIntentChip(), marketOverview: mkOverview() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("budget_exceeded");
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
  it("LLM returns broken JSON: returns parse_failed, does NOT write cache", async () => {
    mockChat.mockResolvedValue({ ok: true, text: "not json" });
    const r = await advisor.aiStockAdvise({ intentChip: mkIntentChip(), marketOverview: mkOverview() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
    expect(Object.keys(_mockState.aiStockAdviseCache)).toHaveLength(0);
  });
  it("expired cache (> 24h) → re-fetches", async () => {
    _mockState.aiStockAdviseCache = {
      [advisor.adviseCacheKey({ intentChip: mkIntentChip(), marketOverviewHash: mkOverview().hash })]: {
        result: { criteria: {}, sortConfig: null, summary: "stale" },
        fetchedAt: Date.now() - advisor.CACHE_TTL_MS - 1000,
      },
    };
    mockChat.mockResolvedValue({ ok: true, text: JSON.stringify({ criteria: {}, sortConfig: null, summary: "fresh" }) });
    const r = await advisor.aiStockAdvise({ intentChip: mkIntentChip(), marketOverview: mkOverview() });
    expect(r.ok).toBe(true);
    expect(r.fromCache).toBe(false);
    expect(r.result.summary).toBe("fresh");
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});