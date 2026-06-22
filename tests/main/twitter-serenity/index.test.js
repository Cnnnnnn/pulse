/**
 * tests/main/twitter-serenity/index.test.js
 *
 * Task 11 集成测试: 验证 startTwitterSerenity 组装 + IPC handler 注册 + buildSources 映射.
 * 不跑真实网络 (httpClient mock), 不依赖 electron runtime.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tmpDir;
let statePath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-tw-idx-"));
  statePath = path.join(tmpDir, "state.json");
  // state-store 用 defaultPath(), 测试通过改 process.env 或直接 seed 默认路径不可行;
  // 这里改为让 index.js 的 stateStore 引用同一个 require 缓存, seed 一个临时路径.
  // 更简单: 直接 seed 用户级默认路径会被测试污染, 所以我们 mock stateStore 的方法.
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("twitter-serenity index.js", () => {
  it("buildSources 按 type 映射到对应 factory", () => {
    const { buildSources } = require("../../../src/main/twitter-serenity/index.js");
    const httpClient = { get: vi.fn() };
    const sources = buildSources(
      [
        { id: "n1", type: "nitter", url: "http://n", priority: 1 },
        { id: "r1", type: "rsshub", url: "http://r", priority: 2 },
        { id: "d1", type: "rss", url: "http://d", priority: 3 },
        { id: "x1", type: "unknown", url: "http://x", priority: 4 },
      ],
      httpClient,
    );
    expect(sources).toHaveLength(4);
    expect(sources[0].type).toBe("nitter");
    expect(sources[1].type).toBe("rsshub");
    expect(sources[2].type).toBe("rss");
    expect(sources[3].type).toBe("rss"); // unknown → fallback direct-rss
  });

  it("startTwitterSerenity 注册所有 IPC handlers", () => {
    const {
      startTwitterSerenity,
      stopTwitterSerenity,
    } = require("../../../src/main/twitter-serenity/index.js");
    const handlers = {};
    const ipcMain = {
      handle: vi.fn((channel, fn) => {
        handlers[channel] = fn;
      }),
    };
    const httpClient = { get: vi.fn().mockResolvedValue({ status: 200, body: "" }) };
    startTwitterSerenity({
      ipcMain,
      httpClient,
      logger: { info() {}, warn() {}, error() {} },
      sendEvent: () => {},
    });
    const expected = [
      "twitter:list",
      "twitter:fetch",
      "twitter:translate",
      "twitter:sources:list",
      "twitter:sources:add",
      "twitter:sources:remove",
      "twitter:sources:test",
      "twitter:manual-paste",
    ];
    for (const ch of expected) {
      expect(handlers[ch], `handler ${ch} should be registered`).toBeTruthy();
    }
    stopTwitterSerenity();
  });

  it("twitter:list handler 返回 cache 结构", async () => {
    const {
      startTwitterSerenity,
      stopTwitterSerenity,
    } = require("../../../src/main/twitter-serenity/index.js");
    const handlers = {};
    const ipcMain = {
      handle: vi.fn((channel, fn) => {
        handlers[channel] = fn;
      }),
    };
    startTwitterSerenity({
      ipcMain,
      httpClient: { get: vi.fn() },
      logger: { info() {}, warn() {}, error() {} },
    });
    const result = await handlers["twitter:list"]();
    expect(result).toHaveProperty("tweets");
    expect(result).toHaveProperty("lastFetchedAt");
    expect(result).toHaveProperty("degraded");
    stopTwitterSerenity();
  });

  it("twitter:manual-paste handler 解析 + 写 cache", async () => {
    const {
      startTwitterSerenity,
      stopTwitterSerenity,
    } = require("../../../src/main/twitter-serenity/index.js");
    const handlers = {};
    const ipcMain = {
      handle: vi.fn((channel, fn) => {
        handlers[channel] = fn;
      }),
    };
    startTwitterSerenity({
      ipcMain,
      httpClient: { get: vi.fn() },
      logger: { info() {}, warn() {}, error() {} },
    });
    const parsed = await handlers["twitter:manual-paste"](
      {},
      "https://x.com/h/status/123",
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].id).toBe("123");
    stopTwitterSerenity();
  });

  it("stopTwitterSerenity 后再 start 可重启 (idempotent)", () => {
    const {
      startTwitterSerenity,
      stopTwitterSerenity,
    } = require("../../../src/main/twitter-serenity/index.js");
    const ipcMain = { handle: vi.fn() };
    startTwitterSerenity({
      ipcMain,
      httpClient: { get: vi.fn() },
      logger: { info() {}, warn() {}, error() {} },
    });
    stopTwitterSerenity();
    // 再启动不应抛
    startTwitterSerenity({
      ipcMain,
      httpClient: { get: vi.fn() },
      logger: { info() {}, warn() {}, error() {} },
    });
    stopTwitterSerenity();
  });
});
