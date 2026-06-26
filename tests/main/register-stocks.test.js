/**
 * tests/main/register-stocks.test.js
 *
 * 股票筛选器 6 个 IPC handler 测试.
 * 走 cache-stub 模式 (跟 register-config-portability.test.js 一致):
 *   - mock stock-fetcher (避免真打东财)
 *   - mock stock-search
 *   - mock stock-store (内存数组)
 *   - safeHandle 直接捕获 fn, 测试直接 invoke
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const fetcherPath = require.resolve("../../src/stocks/stock-fetcher.js");
const searchPath = require.resolve("../../src/stocks/stock-search.js");
const storePath = require.resolve("../../src/main/stock-store.js");
const registerPath = require.resolve("../../src/main/ipc/register-stocks.js");

// 内存自选股 (替代 state.json)
let watchlist = [];
const httpClient = { get: async () => ({ status: 200, body: "{}", error: null }) };

const mockFetchStocks = vi.fn(async () => ({
  rows: [
    { code: "600519", name: "贵州茅台", price: 1685, changePct: 1.2, turnover: 0.5, pe: 18, pb: 6.8, roe: 28, industry: "食品饮料", marketCap: 2e12 },
    { code: "600036", name: "招商银行", price: 35, changePct: -0.4, turnover: 1.2, pe: 5, pb: 0.9, roe: 17, industry: "银行", marketCap: 8e11 },
  ],
  total: 2,
  fetchedAt: Date.now(),
}));
const mockSearch = vi.fn(async (q) => [
  { code: "600519", name: "贵州茅台", industry: "食品饮料" },
].filter((x) => x.code.includes(q) || x.name.includes(q)));

function stubModules() {
  vi.resetModules();
  // require 缓存里替换三个依赖模块的 exports
  require.cache[fetcherPath] = {
    id: fetcherPath, filename: fetcherPath, loaded: true,
    exports: { fetchStocks: mockFetchStocks },
  };
  require.cache[searchPath] = {
    id: searchPath, filename: searchPath, loaded: true,
    exports: { searchStocks: mockSearch },
  };
  require.cache[storePath] = {
    id: storePath, filename: storePath, loaded: true,
    exports: {
      loadStockWatchlist: () => watchlist,
      addStock: (input) => {
        if (watchlist.some((w) => w.code === input.code)) return watchlist;
        watchlist = [...watchlist, { addedAt: Date.now(), ...input }];
        return watchlist;
      },
      removeStock: (code) => {
        watchlist = watchlist.filter((w) => w.code !== code);
        return watchlist;
      },
    },
  };
  // HttpClient 也得 stub — register-stocks require("../http-client").
  const httpPath = require.resolve("../../src/main/http-client.js");
  require.cache[httpPath] = {
    id: httpPath, filename: httpPath, loaded: true,
    exports: { HttpClient: function () { return httpClient; } },
  };
  delete require.cache[registerPath];
}

function loadHandlers() {
  const { registerStocksHandlers } = require(registerPath);
  const handlers = {};
  const safeHandle = (ch, fn, opts = {}) => {
    // 包一层: 模拟 safeHandle 的 try/catch (errors → threwResponse)
    handlers[ch] = async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        const onError = opts.onError;
        if (onError) return onError(e, ...args);
        return { ok: false, reason: "threw", error: e && e.message };
      }
    };
  };
  const threwResponse = (err) => ({ ok: false, error: err && err.message });
  registerStocksHandlers({ safeHandle, threwResponse });
  return handlers;
}

describe("register-stocks IPC", () => {
  beforeEach(() => {
    watchlist = [];
    mockFetchStocks.mockClear();
    mockSearch.mockClear();
    stubModules();
  });

  it("stocks:screen filters + sorts via applyScreen", async () => {
    const handlers = loadHandlers();
    const r = await handlers["stocks:screen"]({}, {
      criteria: { peMax: 20, marketCapTier: "all", industries: [] },
      sort: { key: "roe", dir: "desc" },
    });
    expect(r.ok).toBe(true);
    expect(r.results.length).toBe(2);
    expect(r.results[0].code).toBe("600519"); // roe 28 > 17
    expect(r.total).toBe(2);
    expect(r.fromCache).toBe(false);
  });

  it("stocks:screen 60s cache: second call hits cache", async () => {
    const handlers = loadHandlers();
    await handlers["stocks:screen"]({}, { criteria: { marketCapTier: "all", industries: [] }, sort: null });
    const r2 = await handlers["stocks:screen"]({}, { criteria: { marketCapTier: "all", industries: [] }, sort: null });
    expect(r2.fromCache).toBe(true);
    expect(mockFetchStocks).toHaveBeenCalledTimes(1); // 只真拉一次
  });

  it("stocks:search returns results", async () => {
    const handlers = loadHandlers();
    const r = await handlers["stocks:search"]({}, "600519");
    expect(r.ok).toBe(true);
    expect(r.results[0].code).toBe("600519");
  });

  it("stocks:watchlist:add then :list round-trip", async () => {
    const handlers = loadHandlers();
    const added = await handlers["stocks:watchlist:add"]({}, { code: "600519" });
    expect(added.ok).toBe(true);
    expect(added.items).toHaveLength(1);
    const list = await handlers["stocks:watchlist:list"]();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].name).toBe("贵州茅台"); // 反查 name
  });

  it("stocks:watchlist:add dedupes", async () => {
    const handlers = loadHandlers();
    await handlers["stocks:watchlist:add"]({}, { code: "600519" });
    const again = await handlers["stocks:watchlist:add"]({}, { code: "600519" });
    expect(again.items).toHaveLength(1);
  });

  it("stocks:watchlist:remove", async () => {
    const handlers = loadHandlers();
    await handlers["stocks:watchlist:add"]({}, { code: "600519" });
    const after = await handlers["stocks:watchlist:remove"]({}, { code: "600519" });
    expect(after.ok).toBe(true);
    expect(after.items).toHaveLength(0);
  });

  it("stocks:watchlist:quotes returns only watchlist codes", async () => {
    const handlers = loadHandlers();
    await handlers["stocks:watchlist:add"]({}, { code: "600519" });
    const r = await handlers["stocks:watchlist:quotes"]();
    expect(r.ok).toBe(true);
    expect(Object.keys(r.quotes)).toEqual(["600519"]);
    expect(r.quotes["600519"].roe).toBe(28);
  });

  it("stocks:watchlist:quotes empty watchlist → empty quotes", async () => {
    const handlers = loadHandlers();
    const r = await handlers["stocks:watchlist:quotes"]();
    expect(r.ok).toBe(true);
    expect(r.quotes).toEqual({});
    expect(mockFetchStocks).not.toHaveBeenCalled(); // 空自选不打接口
  });
});
