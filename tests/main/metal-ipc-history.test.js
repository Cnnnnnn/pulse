/**
 * tests/main/metal-ipc-history.test.js
 *
 * Task 4: historyMap / lastBackfillAt persistence + triggerBackfill 1h cooldown.
 */
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const electronStub = {
  ipcMain: { handle: () => {} },
  webContents: { getAllWebContents: () => [] },
};
const electronPath = require.resolve("electron");
const metalIpcPath = require.resolve("../../src/main/metal-ipc.js");
const stateStorePath = require.resolve("../../src/main/state-store.js");

let tmpDir;
let statePath;

function stubElectron() {
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electronStub,
  };
}

function loadMetalIpc() {
  delete require.cache[metalIpcPath];
  stubElectron();
  return require(metalIpcPath);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-ipc-history-"));
  statePath = path.join(tmpDir, "state.json");
  fs.writeFileSync(statePath, "{}");
  delete require.cache[stateStorePath];
  const stateStore = require(stateStorePath);
  stateStore._setStatePathForTest(statePath);
});

describe("metal-ipc history IPC handlers", () => {
  it("loadConfig() has historyMap {} and lastBackfillAt 0 by default", () => {
    const { loadConfig } = loadMetalIpc();
    const cfg = loadConfig();
    expect(cfg.historyMap).toEqual({});
    expect(cfg.lastBackfillAt).toBe(0);
  });

  it("existing historyMap in state.json is passed through", () => {
    const stateStore = require(stateStorePath);
    stateStore.patchState((next) => {
      next.metals = {
        watchedIds: ["XAU"],
        holdings: {},
        historyMap: { XAU: [{ date: "2026-06-01", close: 100 }] },
        lastBackfillAt: 1700000000000,
      };
    });
    const { loadConfig } = loadMetalIpc();
    const cfg = loadConfig();
    expect(cfg.historyMap.XAU.length).toBe(1);
    expect(cfg.lastBackfillAt).toBe(1700000000000);
  });
});

describe("metal-ipc backfill 1h cooldown", () => {
  it("triggerBackfill: second call within 1h → skips (httpGet not called)", () => {
    const { triggerBackfill } = loadMetalIpc();
    const stateStore = require(stateStorePath);
    stateStore.patchState((next) => {
      next.metals = { lastBackfillAt: Date.now() };
    });
    let called = false;
    const httpGet = async () => {
      called = true;
      return "{}";
    };
    triggerBackfill({ httpGet, now: () => Date.now() });
    expect(called).toBe(false);
  });

  it("triggerBackfill: lastBackfillAt > 1h ago → triggers (httpGet called)", async () => {
    const { triggerBackfill } = loadMetalIpc();
    const stateStore = require(stateStorePath);
    stateStore.patchState((next) => {
      next.metals = {
        watchedIds: ["XAU"],
        holdings: {},
        historyMap: {},
        lastBackfillAt: Date.now() - 2 * 3600 * 1000,
      };
    });
    let called = false;
    const httpGet = async () => {
      called = true;
      return '{"rc":100,"data":null}';
    };
    await triggerBackfill({ httpGet, now: () => Date.now() });
    expect(called).toBe(true);
  });

  it("triggerBackfill({ force: true }) → 跳过 1h 冷却, httpGet 立即被调", async () => {
    const { triggerBackfill } = loadMetalIpc();
    const stateStore = require(stateStorePath);
    stateStore.patchState((next) => {
      next.metals = {
        watchedIds: ["XAU"],
        holdings: {},
        historyMap: {},
        lastBackfillAt: Date.now(), // 刚刚 backfill 过 (冷却内)
      };
    });
    let called = false;
    const httpGet = async () => {
      called = true;
      return '{"rc":100,"data":null}';
    };
    await triggerBackfill({ httpGet, force: true, now: () => Date.now() });
    expect(called).toBe(true);
  });

  it("triggerBackfill 并发: 多个调用方共享同一次 fetch (防 eastmoney 限流)", async () => {
    const { triggerBackfill } = loadMetalIpc();
    const stateStore = require(stateStorePath);
    stateStore.patchState((next) => {
      next.metals = {
        watchedIds: ["XAU"],
        holdings: {},
        historyMap: {},
        lastBackfillAt: 0, // 强制走 backfill 路径
      };
    });
    let httpCallCount = 0;
    const httpGet = async () => {
      httpCallCount++;
      // 模拟 eastmoney 慢响应 (200ms) — 并发的两个调用应该都拿同一个 in-flight
      await new Promise((r) => setTimeout(r, 50));
      return '{"rc":0,"data":{"klines":["2026-06-01,100,101,102,99,10,1000,0.5"]}}';
    };
    // 同时调 2 次 (fire-and-forget 那个 + IPC handler force:true 那个)
    const p1 = triggerBackfill({ httpGet, now: () => Date.now(), skipInflightGate: false });
    const p2 = triggerBackfill({ httpGet, force: true, now: () => Date.now(), skipInflightGate: false });
    const [r1, r2] = await Promise.all([p1, p2]);
    // 关键: httpGet 只被调 METALS.length 次 (并发合并). 修 "冷启动首次 + refresh
    // 同时跑 backfill, 都失败" — 合并前会是 2×METALS=8, 合并后是 METALS=4.
    expect(httpCallCount).toBe(4); // METALS=4 (XAU/XAG/AU9999/AG9999)
    expect(r1).toEqual(r2);
  });
});
