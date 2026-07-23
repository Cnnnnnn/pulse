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

// ponytail 2026-07-07: search 接口补价 fallback — _cache.rows 缺时走 push2 ulist.np
// 拉全 push2 secids 拿价, 让从搜索进诊断的对比池也能拿到现价/涨跌. 默认返空数组
// (测 enrich 阶段没缺价时不会触发), 测缺价 fallback 时 stub opts.fetchStocksByCodesStub.
const mockFetchStocksByCodes = vi.fn(async () => ({
  rows: [],
  fetchedAt: Date.now(),
}));

function stubModules(opts = {}) {
  vi.resetModules();
  // require 缓存里替换三个依赖模块的 exports
  require.cache[fetcherPath] = {
    id: fetcherPath,
    filename: fetcherPath,
    loaded: true,
    exports: {
      fetchStocks: mockFetchStocks,
      fetchStocksByCodes: opts.fetchStocksByCodesStub || mockFetchStocksByCodes,
    },
  };
  require.cache[searchPath] = {
    id: searchPath,
    filename: searchPath,
    loaded: true,
    exports: { searchStocks: mockSearch },
  };
  // HttpClient / chromium-http-client 都得 stub — register-stocks 会按需 require.
  const httpPath = require.resolve("../../src/main/http-client.ts");
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
    mockFetchStocksByCodes.mockClear();
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

  it("stocks:screen 切 sort 不重打 IPC (P-4 修)", async () => {
    // ponytail 2026-07-08 P-4: 切列头排序时, 前端 stockStore.setSort 走 sortStocks 本地重排.
    // 主进程 cache key 只用 criteria, sort 变化不会让 cache miss → 不重打 30-40s.
    const handlers = loadHandlers();
    await handlers["stocks:screen"](
      {},
      {
        criteria: { marketCapTier: "all", industries: [] },
        sort: { key: "roe", dir: "desc" },
      },
    );
    expect(mockFetchStocks).toHaveBeenCalledTimes(1);
    // 切列头到 price desc — 同一份 cache 应命中, 不重打
    const r2 = await handlers["stocks:screen"](
      {},
      {
        criteria: { marketCapTier: "all", industries: [] },
        sort: { key: "price", dir: "desc" },
      },
    );
    expect(r2.fromCache).toBe(true);
    expect(mockFetchStocks).toHaveBeenCalledTimes(1); // 仍然只 1 次
  });

  it("stocks:screen P-1: numeric desc sortKey 传 minResults 给 fetchStocks", async () => {
    // ponytail 2026-07-08 P-1: ROE/PE/增速 desc → 高命中截断 (1500 条 ≈ 9s vs 30-40s).
    const handlers = loadHandlers();
    await handlers["stocks:screen"](
      {},
      {
        criteria: { marketCapTier: "all", industries: [] },
        sort: { key: "roe", dir: "desc" },
      },
    );
    expect(mockFetchStocks).toHaveBeenCalledTimes(1);
    const opts = mockFetchStocks.mock.calls[0][1];
    expect(opts.minResults).toBe(1500);
    expect(opts.maxPages).toBe(25);
  });

  it("stocks:screen P-1: 字符串列 / 升序 / 未传 sort → 不截断, minResults 不传", async () => {
    // name 列必须翻全量, asc 排序也需全量 (后期票可能在后 4000 名).
    const handlers = loadHandlers();
    await handlers["stocks:screen"](
      {},
      {
        criteria: { marketCapTier: "all", industries: [] },
        sort: { key: "roe", dir: "asc" }, // asc 不截断
      },
    );
    const opts = mockFetchStocks.mock.calls[0][1];
    expect(opts.minResults).toBeUndefined();
    expect(opts.maxPages).toBeUndefined();
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

  it("enrichSearchResults fills price / changePct / industry from rows cache", async () => {
    // ponytail: 搜索建议接口不带价格/涨跌/行业, 用 _cache.rows (上次 stocks:screen 全市场)
    // 反查补 — 让从搜索进诊断的对比池 entry 也能展示现价/涨跌.
    const { enrichSearchResults } = require(registerPath);
    const entries = [
      { code: "600519", name: "贵州茅台", industry: "" },
      { code: "999999", name: "未知股", industry: "" }, // 不在 cache 里
      { code: "600036", name: "招商银行", industry: "银行" }, // 已有 industry
    ];
    const rows = [
      {
        code: "600519",
        name: "贵州茅台",
        price: 1685,
        changePct: 1.2,
        industry: "食品饮料",
      },
      {
        code: "600036",
        name: "招商银行",
        price: 35,
        changePct: -0.4,
        industry: "银行",
      },
    ];
    const out = enrichSearchResults(entries, rows);
    expect(out[0]).toMatchObject({
      code: "600519",
      price: 1685,
      changePct: 1.2,
      industry: "食品饮料",
    });
    expect(out[1]).toEqual({ code: "999999", name: "未知股", industry: "" }); // 原样返回
    expect(out[2].industry).toBe("银行"); // 已有 industry 不被空覆盖
    expect(out[2]).toMatchObject({
      code: "600036",
      price: 35,
      changePct: -0.4,
    });
  });

  it("enrichSearchResults noop when rows absent", async () => {
    const { enrichSearchResults } = require(registerPath);
    const entries = [{ code: "600519", name: "贵州茅台", industry: "" }];
    expect(enrichSearchResults(entries, null)).toBe(entries);
    expect(enrichSearchResults(entries, [])).toBe(entries);
  });

  it("stocks:search enriches results from _cache.rows (integration)", async () => {
    // ponytail: 集成测试 — 先调 stocks:screen 把 rows 写进 _cache, 再调 stocks:search
    // 验证结果被 enrich (带价格). 用户从搜索进诊断的对比池才有现价.
    stubModules();
    const handlers = loadHandlers();
    await handlers["stocks:screen"](
      {},
      { criteria: { marketCapTier: "all", industries: [] }, sort: null },
    );
    const r = await handlers["stocks:search"]({}, "600519");
    expect(r.results[0].code).toBe("600519");
    expect(r.results[0].price).toBe(1685);
    expect(r.results[0].changePct).toBe(1.2);
    expect(r.results[0].industry).toBe("食品饮料");
  });

  it("stocks:search 返回 results 顺序和 raw 一致 (enrich 不重排)", async () => {
    // ponytail: enrichSearchResults 用 Map 查表, O(N+M). 保持 raw 顺序, 渲染端按 api 顺序.
    const { enrichSearchResults } = require(registerPath);
    const entries = [
      { code: "A", name: "甲", industry: "" },
      { code: "B", name: "乙", industry: "" },
      { code: "C", name: "丙", industry: "" },
    ];
    const rows = [
      { code: "C", price: 3 },
      { code: "A", price: 1 },
      { code: "B", price: 2 },
    ];
    const out = enrichSearchResults(entries, rows);
    expect(out.map((e) => e.code)).toEqual(["A", "B", "C"]);
    expect(out[0].price).toBe(1);
    expect(out[1].price).toBe(2);
    expect(out[2].price).toBe(3);
  });

  it("stocks:search falls back to fetchStocksByCodes when _cache.rows 缺价", async () => {
    // ponytail 2026-07-07: 用户从搜索进诊断 (没先点过筛选) → _cache.rows 为空 →
    // enrichSearchResults 跳过补价. 这时 search 接口主动按 code list 调
    // fetchStocksByCodes 拉 push2 实时价, 让从搜索加的对比池 entry 也能展示现价.
    const stub = vi.fn(async (codes) => ({
      rows: codes.map((c) => ({
        code: c,
        price: 99.9,
        changePct: 0.5,
        industry: "",
      })),
      fetchedAt: Date.now(),
    }));
    stubModules({ fetchStocksByCodesStub: stub });
    const handlers = loadHandlers();
    // 不调 stocks:screen → _cache.rows 永为空
    const r = await handlers["stocks:search"]({}, "600519");
    expect(r.ok).toBe(true);
    expect(r.results[0].code).toBe("600519");
    expect(r.results[0].price).toBe(99.9);
    expect(r.results[0].changePct).toBe(0.5);
    expect(stub).toHaveBeenCalledTimes(1);
    expect(stub.mock.calls[0][0]).toEqual(["600519"]);
  });

  it("stocks:search 跳过 fetchStocksByCodes fallback when _cache.rows 已覆盖", async () => {
    // ponytail: _cache.rows 命中率高 (用户先点过筛选) → 不必再调 push2, 避免重复打接口.
    stubModules();
    const handlers = loadHandlers();
    await handlers["stocks:screen"](
      {},
      { criteria: { marketCapTier: "all", industries: [] }, sort: null },
    );
    await handlers["stocks:search"]({}, "600519");
    expect(mockFetchStocksByCodes).not.toHaveBeenCalled();
  });

  it("stocks:search fetchStocksByCodes 失败时静默退化为原 results", async () => {
    // ponytail: 行情拉失败不阻塞搜索, 仍返原 searchStocks 结果 (price/changePct=null),
    // 渲染端 pool entry 走 "—" 显示.
    const stub = vi.fn(async () => ({
      rows: [],
      fetchedAt: Date.now(),
      error: "network",
    }));
    stubModules({ fetchStocksByCodesStub: stub });
    const handlers = loadHandlers();
    const r = await handlers["stocks:search"]({}, "600519");
    expect(r.ok).toBe(true);
    expect(r.results[0].code).toBe("600519");
    // ponytail: searchStocks 原始 entry 不带 price 字段 (undefined), 渲染时跟 null
    // 走同一分支 (== null) → "—". 这里只断言 "没补上价", 不强求 null.
    expect(r.results[0].price == null).toBe(true);
  });

  it("stocks:search cache 命中但有缺价 entry → 走两层 fallback 重 enrich", async () => {
    // ponytail 2026-07-07: 5min 缓存里的 entry 可能是历史上 enrich 失败 (当时 _cache.rows
    // 缺 + fetchStocksByCodes 也失败) 留下的 null. 现在 _cache.rows 有了, 重跑一次 enrich
    // 补上价再返, 不再调 searchStocks. 补上的结果同时写回缓存.
    const stub = vi.fn();
    // 第一次: 走 searchStocks 路径, fetchStocksByCodes 失败 (price 进 null 进 cache)
    stub.mockResolvedValueOnce({
      rows: [],
      fetchedAt: Date.now(),
      error: "timeout",
    });
    // 第二次: cache 命中 + 有缺价, 走 reEnrich, _cache.rows 命中直接补上价
    // (不需要调 fetchStocksByCodes)
    stubModules({ fetchStocksByCodesStub: stub });
    const handlers = loadHandlers();
    // 改 mockSearch 让 002463 进 cache
    mockSearch.mockImplementationOnce(async (q) => [
      { code: "002463", name: "沪电股份", industry: "" },
    ]);
    // 第一次: 没缓存, 走 searchStocks → fetchStocksByCodes timeout → price null → 入 cache
    const r1 = await handlers["stocks:search"]({}, "002463");
    expect(r1.results[0].code).toBe("002463");
    expect(r1.results[0].price == null).toBe(true); // 第一次 enrich 失败
    expect(stub).toHaveBeenCalledTimes(1);
    // 第二次: 调 screen 让 _cache.rows 有 002463, 然后搜同 code
    await handlers["stocks:screen"](
      {},
      { criteria: { marketCapTier: "all", industries: [] }, sort: null },
    );
    // ponytail: mockFetchStocks 默认 rows 包含 600519 + 600036, 不含 002463.
    // 但我们想测 _cache.rows 命中补价 → 加一个 mock 让 screen 后 _cache.rows 有 002463.
    // 简化: 直接 stub 第二个 mockFetchStocks 调用返含 002463 的 rows.
    mockFetchStocks.mockImplementationOnce(async () => ({
      rows: [
        {
          code: "002463",
          name: "沪电股份",
          price: 129.72,
          changePct: 0.69,
          industry: "元件",
        },
      ],
      total: 1,
      fetchedAt: Date.now(),
    }));
    // 触发 screen 重新拉 (把 _cache.rows 重置成含 002463)
    await handlers["stocks:screen"](
      {},
      {
        criteria: { peMax: 999, marketCapTier: "all", industries: [] },
        sort: null,
      },
    );
    // 第三次: cache 命中 + 有缺价, 走 reEnrich, _cache.rows 命中补上价
    const r3 = await handlers["stocks:search"]({}, "002463");
    expect(r3.fromCache).toBe(true);
    expect(r3.results[0].price).toBe(129.72); // _cache.rows 命中, 补上价
    expect(r3.results[0].changePct).toBe(0.69);
    // fetchStocksByCodes 第二次没被调 (因为 _cache.rows 已经命中)
    expect(stub).toHaveBeenCalledTimes(1);
  });
});
