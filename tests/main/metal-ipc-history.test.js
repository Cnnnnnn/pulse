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
const stateStorePath = require.resolve("../../src/main/state-store.ts");

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
    const p1 = triggerBackfill({
      httpGet,
      now: () => Date.now(),
      skipInflightGate: false,
    });
    const p2 = triggerBackfill({
      httpGet,
      force: true,
      now: () => Date.now(),
      skipInflightGate: false,
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    // 关键: httpGet 只被调 METALS.length 次 (并发合并). 修 "冷启动首次 + refresh
    // 同时跑 backfill, 都失败" — 合并前会是 2×METALS=8, 合并后是 METALS=4.
    expect(httpCallCount).toBe(4); // METALS=4 (XAU/XAG/AU9999/AG9999)
    expect(r1).toEqual(r2);
  });
});

/**
 * Regression: 用户报告 "30 天加载中, 30 天走势还在加载中" 即首次进 tab historyMap 不显示.
 * 真 root cause 是 state-store.patchState 的执行顺序 bug: 旧实现 updater 先跑, 之后才
 * preserveExtraFields, 导致 saveHistoryMap 写的 metals.historyMap 在后续 markBackfilled
 * 调 patchState 时被丢 (updater 看到的 next.metals 是 undefined, 走 `{}` 起点, 把
 * historyMap 覆盖成只剩 lastBackfillAt). 修法: 1) 把 metals 加到 PRESERVE_FIELDS
 * (允许 patchState 自动从 existing 复制 metals); 2) patchState 顺序改成 preserve-first,
 * 3) updater 改成 spread `{ ...next.metals, x: y }` 兜底.
 *
 * 这个测试模拟用户首次进 tab 完整路径: historyMap 空 → 调 triggerBackfill → 完后
 * loadConfig().historyMap 必须 4 个 metal 都有 30 天数据, 且 state.json 持久化正确.
 */
describe("regression: cold-start historyMap 持久化", () => {
  it("triggerBackfill 完 → state.json 持久化 4 个 metal 30 天数据 (修 '首次进 tab historyMap 空' bug)", async () => {
    const { triggerBackfill, loadConfig } = loadMetalIpc();
    const stateStore = require(stateStorePath);

    // 模拟用户首次进 tab: state.json 有 schema 但 metals 没 historyMap
    stateStore.patchState((next) => {
      next.metals = {
        watchedIds: ["XAU", "XAG", "AU9999", "AG9999"],
        holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
        historyMap: {},
        lastBackfillAt: 0,
      };
    });

    // 模拟 eastmoney kline 接口返 30 天数据
    const httpGet = async () => {
      const lines = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(2026, 5, 1 - i);
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        lines.push(`${date},100,101,102,99,1000,100000,0.5`);
      }
      return JSON.stringify({ rc: 0, data: { klines: lines } });
    };

    const r = await triggerBackfill({
      httpGet,
      force: true,
      now: () => Date.now(),
    });
    expect(r.ok).toBe(true);
    expect(r.backfilled).toBe(4);

    // 关键断言: loadConfig() 出来 historyMap 4 个 metal 都有 30 条 — 不再是 []
    const cfg = loadConfig();
    expect(Object.keys(cfg.historyMap).sort()).toEqual([
      "AG9999",
      "AU9999",
      "XAG",
      "XAU",
    ]);
    expect(cfg.historyMap.XAU.length).toBe(30);
    expect(cfg.historyMap.XAG.length).toBe(30);
    expect(cfg.historyMap.AU9999.length).toBe(30);
    expect(cfg.historyMap.AG9999.length).toBe(30);
    expect(cfg.lastBackfillAt).toBeGreaterThan(0);

    // 持久化到 state.json 也要对 (跨进程读)
    const persisted = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(persisted.metals.historyMap.XAU.length).toBe(30);
    expect(persisted.metals.lastBackfillAt).toBeGreaterThan(0);
  });

  it("连续多次 backfill: historyMap 累积而非覆盖 (lastBackfillAt 不丢 historyMap)", async () => {
    const { triggerBackfill, loadConfig } = loadMetalIpc();
    const stateStore = require(stateStorePath);
    stateStore.patchState((next) => {
      next.metals = { historyMap: {}, lastBackfillAt: 0 };
    });
    const httpGet = async () => {
      const lines = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(2026, 5, 1 - i);
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        lines.push(`${date},100,101,102,99,1000,100000,0.5`);
      }
      return JSON.stringify({ rc: 0, data: { klines: lines } });
    };
    // 第一次 backfill
    await triggerBackfill({ httpGet, force: true, now: () => Date.now() });
    const after1 = loadConfig();
    expect(after1.historyMap.XAU.length).toBe(30);
    // 模拟 1h 后再 backfill (lastBackfillAt 是 past)
    const t2 = Date.now() - 2 * 3600 * 1000;
    stateStore.patchState((next) => {
      next.metals = { ...(next.metals || {}), lastBackfillAt: t2 };
    });
    await triggerBackfill({ httpGet, now: () => Date.now() });
    const after2 = loadConfig();
    // 第二次跑后 historyMap 仍然有 30 条 (累积而非丢)
    expect(after2.historyMap.XAU.length).toBe(30);
    expect(after2.lastBackfillAt).toBeGreaterThan(t2);
  });
});
