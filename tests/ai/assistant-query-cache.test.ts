/**
 * tests/ai/assistant-query-cache.test.ts
 *
 * 只读查询工具 TTL 缓存：命中 / 过期 / 失败不缓存。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
const { requireAi } = require("../_setup/require-main.cjs");

const {
  getQueryCache,
  setQueryCache,
  queryCacheKey,
  __resetQueryCacheForTest,
  QUERY_CACHE_TTL_MS,
} = requireAi("assistant-query-cache");

beforeEach(() => {
  __resetQueryCacheForTest();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  __resetQueryCacheForTest();
});

describe("assistant-query-cache", () => {
  it("命中后返回缓存结果，过期后 null", () => {
    setQueryCache("query_apps", { tool: "query_apps", ok: true, summary: "s" });
    expect(getQueryCache("query_apps")?.summary).toBe("s");
    vi.advanceTimersByTime(QUERY_CACHE_TTL_MS + 10);
    expect(getQueryCache("query_apps")).toBeNull();
  });

  it("失败结果不入缓存", () => {
    setQueryCache("query_apps", { tool: "query_apps", ok: false, summary: "e" });
    expect(getQueryCache("query_apps")).toBeNull();
  });

  it("queryCacheKey 无参时就是 tool 名", () => {
    expect(queryCacheKey("query_apps")).toBe("query_apps");
    expect(queryCacheKey("search", { q: "a", source: "app" })).toBe(
      "search:q=a&source=app",
    );
  });
});
