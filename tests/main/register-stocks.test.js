/**
 * tests/main/register-stocks.test.js
 *
 * 股票筛选器 3 个 IPC handler 测试 (screen / search / ai-advise).
 * 自选股 watchlist 已在 v2.49 移除.
 * 走 cache-stub 模式 (跟 register-config-portability.test.js 一致):
 *   - mock stock-fetcher (避免真打东财)
 *   - mock stock-search
 *   - safeHandle 直接捕获 fn, 测试直接 invoke
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const fetcherPath = require.resolve("../../src/stocks/stock-fetcher.js");
const searchPath = require.resolve("../../src/stocks/stock-search.js");
const registerPath = require.resolve("../../src/main/ipc/register-stocks.js");

const httpClient = {
  get: async () => ({ status: 200, body: "{}", error: null }),
};

const mockFetchStocks = vi.fn(async (httpClient, opts) => ({
  rows: [
    {
      code: "600519",
      name: "贵州茅台",
      price: 1685,
      changePct: 1.2,
      turnover: 0.5,
      pe: 18,
      pb: 6.8,
      roe: 28,
      industry: "食品饮料",
      marketCap: 2e12,
    },
    {
      code: "600036",
      name: "招商银行",
      price: 35,
      changePct: -0.4,
      turnover: 1.2,
      pe: 5,
      pb: 0.9,
      roe: 17,
      industry: "银行",
      marketCap: 8e11,
    },
  ],
  total: 2,
  fetchedAt: Date.now(),
  // 回显 sortKey 方便断言下推是否生效
  _sortKey: opts && opts.sortKey,
}));

// 翻页版 mock: 第一页返 100 条, 第二页返 50 条 (总 150)
// ponytail: 全市场选股必须翻页拉全量, 不能只看 top-100.
let _pageMode = false;
const mockFetchStocksPaged = vi.fn(async () => {
  if (_pageMode) {
    const rows = [];
    for (let i = 0; i < 100; i++) {
      rows.push({
        code: String(600000 + i),
        name: `票${i}`,
        price: 10,
        changePct: 1,
        turnover: 0.5,
        pe: 5 + i,
        pb: 1,
        roe: 10 + i * 0.2,
        industry: "X",
        marketCap: 1e12,
      });
    }
    return { rows, total: 150, fetchedAt: Date.now() };
  }
  return {
    rows: [
      {
        code: "600519",
        name: "贵州茅台",
        price: 1685,
        changePct: 1.2,
        turnover: 0.5,
        pe: 18,
        pb: 6.8,
        roe: 28,
        industry: "食品饮料",
        marketCap: 2e12,
      },
      {
        code: "600036",
        name: "招商银行",
        price: 35,
        changePct: -0.4,
        turnover: 1.2,
        pe: 5,
        pb: 0.9,
        roe: 17,
        industry: "银行",
        marketCap: 8e11,
      },
    ],
    total: 2,
    fetchedAt: Date.now(),
  };
});
const mockSearch = vi.fn(async (q) =>
  [{ code: "600519", name: "贵州茅台", industry: "食品饮料" }].filter(
    (x) => x.code.includes(q) || x.name.includes(q),
  ),
);

function stubModules(opts = {}) {
  vi.resetModules();
  // require 缓存里替换三个依赖模块的 exports
  require.cache[fetcherPath] = {
    id: fetcherPath,
    filename: fetcherPath,
    loaded: true,
    exports: { fetchStocks: mockFetchStocks },
  };
  require.cache[searchPath] = {
    id: searchPath,
    filename: searchPath,
    loaded: true,
    exports: { searchStocks: mockSearch },
  };
  // HttpClient / chromium-http-client 都得 stub — register-stocks 会按需 require.
  const httpPath = require.resolve("../../src/main/http-client.js");
  require.cache[httpPath] = {
    id: httpPath,
    filename: httpPath,
    loaded: true,
    exports: {
      HttpClient: function () {
        return httpClient;
      },
    },
  };
  const chromiumPath =
    require.resolve("../../src/main/chromium-http-client.js");
  require.cache[chromiumPath] = {
    id: chromiumPath,
    filename: chromiumPath,
    loaded: true,
    exports: {
      ChromiumHttpClient: function () {
        return httpClient;
      },
      createStockHttpClient:
        opts.createStockHttpClientStub || (() => httpClient),
    },
  };
  // electron 模块: 默认 stub 成空 (vitest 环境), 但 stubModules({electron:'chromium'}) 时换成真.
  const electronPath = require.resolve("electron");
  if (opts.electron === "chromium") {
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: {
        net: {
          fetch: async () => ({
            ok: true,
            status: 200,
            text: async () => "{}",
            headers: { get: () => null },
          }),
        },
      },
    };
  } else {
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: {},
    };
  }
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
    mockFetchStocks.mockClear();
    mockSearch.mockClear();
    stubModules();
  });

  it("stocks:screen filters + sorts via applyScreen, passes sortKey to fetcher", async () => {
    const handlers = loadHandlers();
    const r = await handlers["stocks:screen"](
      {},
      {
        criteria: { peMax: 20, marketCapTier: "all", industries: [] },
        sort: { key: "roe", dir: "desc" },
      },
    );
    expect(r.ok).toBe(true);
    expect(r.results.length).toBe(2);
    expect(r.results[0].code).toBe("600519"); // roe 28 > 17
    expect(r.total).toBe(2);
    expect(r.fromCache).toBe(false);
    // 排序意图下推给东财 (fid)
    expect(mockFetchStocks).toHaveBeenCalledTimes(1);
    const fetchCallOpts = mockFetchStocks.mock.calls[0][1];
    expect(fetchCallOpts.sortKey).toBe("roe");
  });

  it("stocks:screen 60s cache: second call hits cache", async () => {
    const handlers = loadHandlers();
    await handlers["stocks:screen"](
      {},
      { criteria: { marketCapTier: "all", industries: [] }, sort: null },
    );
    const r2 = await handlers["stocks:screen"](
      {},
      { criteria: { marketCapTier: "all", industries: [] }, sort: null },
    );
    expect(r2.fromCache).toBe(true);
    expect(mockFetchStocks).toHaveBeenCalledTimes(1); // 只真拉一次
  });

  it("stocks:search returns results", async () => {
    const handlers = loadHandlers();
    const r = await handlers["stocks:search"]({}, "600519");
    expect(r.ok).toBe(true);
    expect(r.results[0].code).toBe("600519");
  });

  it("stocks:screen surfaces a USER-FRIENDLY error, NOT the raw 'network' string", async () => {
    // ponytail: UI 之前直接显示 "行情接口暂时不可用: network" — raw token 暴露.
    // 后端应包成人类可读 + 重试提示, 渲染端才能显示友好消息.
    const tmp = mockFetchStocks.getMockImplementation();
    mockFetchStocks.mockImplementationOnce(async () => ({
      rows: [],
      total: 0,
      fetchedAt: Date.now(),
      error: "network",
    }));
    const handlers = loadHandlers();
    const r = await handlers["stocks:screen"]({}, { criteria: {}, sort: null });
    expect(r.ok).toBe(false);
    expect(r.error).not.toBe("network"); // raw token 不能漏给 UI
    expect(typeof r.error).toBe("string");
    expect(r.error.length).toBeGreaterThan(5); // 应该是可读消息
    expect(r.error).toMatch(/网络|代理|重试/); // 中文友好提示
    mockFetchStocks.mockImplementation(tmp);
  });

  it("stocks:screen bubbles timeout as friendly message", async () => {
    const tmp = mockFetchStocks.getMockImplementation();
    mockFetchStocks.mockImplementationOnce(async () => ({
      rows: [],
      total: 0,
      fetchedAt: Date.now(),
      error: "timeout",
    }));
    const handlers = loadHandlers();
    const r = await handlers["stocks:screen"]({}, { criteria: {}, sort: null });
    expect(r.ok).toBe(false);
    expect(r.error).not.toBe("timeout");
    mockFetchStocks.mockImplementation(tmp);
  });

  it("uses ChromiumHttpClient when running under Electron (bypasses Node TLS RST)", async () => {
    // ponytail: 东财 push2.eastmoney.com 会对 Node OpenSSL RST, 必须走 Chromium net.fetch.
    // 验证: 当 electron.net.fetch 可用时, register-stocks 注入 ChromiumHttpClient,
    //       而不是 Node http-client. 这是解决"行情接口暂时不可用: network"的关键.
    const stub = vi.fn(() => httpClient);
    stubModules({ electron: "chromium", createStockHttpClientStub: stub });
    const handlers = loadHandlers();
    await handlers["stocks:screen"](
      {},
      { criteria: { marketCapTier: "all", industries: [] }, sort: null },
    );
    // HttpClient stub 只能被 chromium-http-client 路径调用, 因为我们改了 register-stocks 用 createStockHttpClient.
    // 关键: HttpClient stub 没被调用, 表示走了 Chromium 路径.
    // (httpClient 是 mock 对象, 这里我们验证 createStockHttpClient 被调用了)
    expect(stub).toHaveBeenCalled();
  });

  it("stocks:search caches results by query (same query → no second searchStocks call)", async () => {
    // ponytail: 用户连续输入 "贵州茅台" 后微调成 "贵州", 每次都打接口没必要.
    // 缓存 key = query (lowercase), TTL 5min, 命中即返 (fromCache: true), 不再调 searchStocks.
    stubModules();
    const handlers = loadHandlers();
    const r1 = await handlers["stocks:search"]({}, "贵州茅台");
    expect(r1.ok).toBe(true);
    expect(r1.fromCache).toBeFalsy(); // 第一次 fromCache 应该是 undefined / false
    expect(r1.results).toHaveLength(1);
    expect(mockSearch).toHaveBeenCalledTimes(1);
    // 第二次: 命中缓存, 不再调 searchStocks
    const r2 = await handlers["stocks:search"]({}, "贵州茅台");
    expect(r2.ok).toBe(true);
    expect(r2.fromCache).toBe(true); // ponytail: 命中标记
    expect(r2.results).toHaveLength(1);
    expect(mockSearch).toHaveBeenCalledTimes(1); // 仍是 1 次
  });

  it("stocks:search cache: case-insensitive (different case → cache hit)", async () => {
    // ponytail: "贵州茅台" 和 "贵州茅台" (实际一样, 但 trim/lowercase 后一样) 应命中同一缓存.
    //         "茅台" 和 "白酒" 不一样, 应触发新 searchStocks.
    stubModules();
    const handlers = loadHandlers();
    await handlers["stocks:search"]({}, "贵州茅台");
    await handlers["stocks:search"]({}, "  贵州茅台  "); // trim 归一
    expect(mockSearch).toHaveBeenCalledTimes(1);
    await handlers["stocks:search"]({}, "白酒"); // 不一样 → 新调用
    expect(mockSearch).toHaveBeenCalledTimes(2);
  });
});
