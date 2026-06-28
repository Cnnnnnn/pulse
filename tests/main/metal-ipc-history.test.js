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
});
