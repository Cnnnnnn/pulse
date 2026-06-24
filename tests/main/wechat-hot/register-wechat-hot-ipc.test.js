/**
 * tests/main/wechat-hot/register-wechat-hot-ipc.test.js
 *
 * IPC boundary contract: 验证 registerWechatHotHandlers 调用 ctx.safeHandle 注册
 * 了 2 个 channel, 验证 onUpdate 钩子会推到 ctx.sendToRenderer,
 * 验证 refresh 失败时 mainLog.warn 被调用.
 *
 * 沿用 tests/main/metal-ipc.test.js 的 require.cache stub 模式 —
 * 静态 vi.mock 在 vite module graph 下对 CJS require 路径不稳,
 * 用 require.cache + vi.resetModules 才是 work 的.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const httpClientPath = require.resolve("../../../src/main/http-client.js");
const fetcherPath = require.resolve("../../../src/main/wechat-hot/fetcher.js");
const registerPath =
  require.resolve("../../../src/main/ipc/register-wechat-hot.js");
const logPath = require.resolve("../../../src/main/log.js");
const readStorePath = require.resolve("../../../src/main/wechat-hot/read-store.js");

const mockHttpClientInstance = { get: vi.fn() };
const HttpClientCtor = vi.fn(function () {
  return mockHttpClientInstance;
});
const fetchWechatHot = vi.fn();
const mainLogWarn = vi.fn();
const loadReadIds = vi.fn(() => ({}));
const markItemRead = vi.fn(() => ({ ok: true }));

function stubModules() {
  vi.resetModules();
  require.cache[httpClientPath] = {
    id: httpClientPath,
    filename: httpClientPath,
    loaded: true,
    exports: { HttpClient: HttpClientCtor },
  };
  require.cache[fetcherPath] = {
    id: fetcherPath,
    filename: fetcherPath,
    loaded: true,
    exports: { fetchWechatHot },
  };
  require.cache[logPath] = {
    id: logPath,
    filename: logPath,
    loaded: true,
    exports: {
      createLogger: () => ({}),
      resolveLogDir: () => "/tmp",
      isDebug: () => false,
      mainLog: {
        warn: mainLogWarn,
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        event: vi.fn(),
      },
      detectLog: {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        event: vi.fn(),
      },
    },
  };
  require.cache[readStorePath] = {
    id: readStorePath,
    filename: readStorePath,
    loaded: true,
    exports: { loadReadIds, markItemRead },
  };
}

function clearStubs() {
  HttpClientCtor.mockClear();
  mockHttpClientInstance.get.mockReset();
  fetchWechatHot.mockReset();
  mainLogWarn.mockReset();
  loadReadIds.mockReset();
  markItemRead.mockReset();
  loadReadIds.mockReturnValue({});
  markItemRead.mockReturnValue({ ok: true });
  // Default: successful fetch returns one item
  fetchWechatHot.mockResolvedValue({
    items: [{ rank: 1, title: "X", url: "https://x" }],
    fetchedAt: 1700000000000,
    source: "xxapi",
  });
}

let registerMod;

function freshModule() {
  registerMod = require(registerPath);
}

describe("wechat-hot IPC handlers", () => {
  beforeEach(() => {
    stubModules();
    clearStubs();
    freshModule();
  });

  afterEach(() => {
    delete require.cache[httpClientPath];
    delete require.cache[fetcherPath];
    delete require.cache[logPath];
    delete require.cache[readStorePath];
    delete require.cache[registerPath];
  });

  it("registers wechat-hot:load and wechat-hot:refresh via safeHandle", () => {
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => {
      handlers[channel] = fn;
    });
    const sendToRenderer = vi.fn();

    registerMod.registerWechatHotHandlers({ safeHandle, sendToRenderer });

    expect(safeHandle).toHaveBeenCalledWith(
      "wechat-hot:load",
      expect.any(Function),
    );
    expect(safeHandle).toHaveBeenCalledWith(
      "wechat-hot:refresh",
      expect.any(Function),
    );
    expect(handlers["wechat-hot:load"]).toBeDefined();
    expect(handlers["wechat-hot:refresh"]).toBeDefined();
    // HttpClient was instantiated with timeout (same pattern as metal-ipc)
    expect(HttpClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("wechat-hot:load handler returns initial empty cache (no network)", async () => {
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => {
      handlers[channel] = fn;
    });
    const sendToRenderer = vi.fn();

    registerMod.registerWechatHotHandlers({ safeHandle, sendToRenderer });

    const r = await handlers["wechat-hot:load"]();
    expect(r).toEqual({ items: [], fetchedAt: 0, source: "xxapi" });
    expect(fetchWechatHot).not.toHaveBeenCalled();
    expect(sendToRenderer).not.toHaveBeenCalled();
  });

  it("wechat-hot:refresh success path: calls fetchWechatHot and broadcasts to sendToRenderer", async () => {
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => {
      handlers[channel] = fn;
    });
    const sendToRenderer = vi.fn();

    registerMod.registerWechatHotHandlers({ safeHandle, sendToRenderer });

    const r = await handlers["wechat-hot:refresh"]();
    expect(fetchWechatHot).toHaveBeenCalledTimes(1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].title).toBe("X");
    // onUpdate should fire sendToRenderer with UPDATED_CHANNEL
    expect(sendToRenderer).toHaveBeenCalledWith(
      registerMod.UPDATED_CHANNEL,
      expect.objectContaining({
        items: expect.any(Array),
        source: "xxapi",
      }),
    );
  });

  it("wechat-hot:refresh failure path: returns { ok: false, reason } and logs warning", async () => {
    fetchWechatHot.mockReset();
    fetchWechatHot.mockRejectedValueOnce(
      Object.assign(new Error("upstream down"), { reason: "fetch_failed" }),
    );
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => {
      handlers[channel] = fn;
    });
    const sendToRenderer = vi.fn();

    registerMod.registerWechatHotHandlers({ safeHandle, sendToRenderer });

    const r = await handlers["wechat-hot:refresh"]();
    expect(r).toEqual({ ok: false, reason: "fetch_failed" });
    expect(mainLogWarn).toHaveBeenCalledWith(
      expect.stringContaining("wechat-hot:refresh"),
    );
    expect(mainLogWarn).toHaveBeenCalledWith(
      expect.stringContaining("fetch_failed"),
    );
    expect(sendToRenderer).not.toHaveBeenCalled();
  });

  it("early-returns if safeHandle is not a function", () => {
    const sendToRenderer = vi.fn();
    // No safeHandle at all
    expect(() =>
      registerMod.registerWechatHotHandlers({ sendToRenderer }),
    ).not.toThrow();
    expect(HttpClientCtor).not.toHaveBeenCalled();
  });
});

describe("wechat-hot IPC: mark-read / load-read (I6 v2)", () => {
  beforeEach(() => {
    stubModules();
    clearStubs();
    freshModule();
  });

  afterEach(() => {
    delete require.cache[httpClientPath];
    delete require.cache[fetcherPath];
    delete require.cache[logPath];
    delete require.cache[readStorePath];
    delete require.cache[registerPath];
  });

  function getHandlers() {
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => {
      handlers[channel] = fn;
    });
    registerMod.registerWechatHotHandlers({ safeHandle, sendToRenderer: vi.fn() });
    return handlers;
  }

  it("注册 wechat-hot:load-read channel", () => {
    const handlers = getHandlers();
    expect(typeof handlers["wechat-hot:load-read"]).toBe("function");
  });

  it("注册 wechat-hot:mark-read channel", () => {
    const handlers = getHandlers();
    expect(typeof handlers["wechat-hot:mark-read"]).toBe("function");
  });

  it("wechat-hot:load-read 调 readStore.loadReadIds 并返回结果", async () => {
    loadReadIds.mockReturnValueOnce({ "词": 1 });
    const handlers = getHandlers();
    const r = await handlers["wechat-hot:load-read"]();
    expect(loadReadIds).toHaveBeenCalled();
    expect(r).toEqual({ "词": 1 });
  });

  it("wechat-hot:mark-read 调 readStore.markItemRead(title)", async () => {
    markItemRead.mockReturnValueOnce({ ok: true });
    const handlers = getHandlers();
    const r = await handlers["wechat-hot:mark-read"]({}, "热搜词");
    expect(markItemRead).toHaveBeenCalledWith("热搜词");
    expect(r.ok).toBe(true);
  });

  it("wechat-hot:mark-read 无效 title → invalid_args", async () => {
    const handlers = getHandlers();
    const r = await handlers["wechat-hot:mark-read"]({}, "");
    expect(r).toEqual({ ok: false, reason: "invalid_args" });
    expect(markItemRead).not.toHaveBeenCalled();
  });
});
