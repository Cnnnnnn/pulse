/**
 * tests/main/metal-ipc.test.js
 *
 * v2.22 Task D1-refactor: 拆分 registerMetalIpc() 和 startMetalScheduler().
 * 拆分前 registerMetalIpc 内部隐式启 scheduler, 跟调度生命周期混淆. 拆分后:
 *   - registerMetalIpc() 只注册 IPC handlers (6 channels)
 *   - startMetalScheduler({onUpdateTray}) 独立启 scheduler
 *
 * 沿用 tests/main/tray-debounce.test.js + ai-usage-refresh-scheduler.test.js 的
 * require.cache stub 模式 — 静态 vi.mock('electron') 在 vite module graph 下对
 * CJS require 路径不稳, 用 require.cache + vi.resetModules 才是 work 的.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockIpcMainHandle = vi.fn();
const mockWebContents = { getAllWebContents: vi.fn(() => []) };
const electronStub = {
  ipcMain: { handle: mockIpcMainHandle },
  webContents: mockWebContents,
};

const mockScheduler = {
  start: vi.fn(),
  stop: vi.fn(),
  fetchNow: vi.fn(async () => ({ ok: true })),
  getState: vi.fn(() => ({ status: "idle", lastFetch: null, nextFetch: null })),
  snapshotDailyClose: vi.fn(),
  detectHistoryGap: vi.fn(() => ({ need: [] })),
};
const MockMetalSchedulerCtor = vi.fn(function () { return mockScheduler; });
const metalSchedulerModuleExports = {
  MetalScheduler: MockMetalSchedulerCtor,
};

const electronPath = require.resolve("electron");
const metalSchedulerPath = require.resolve("../../src/metals/metal-scheduler.js");
const metalIpcPath = require.resolve("../../src/main/metal-ipc.js");

let metalIpc;

function freshModule() {
  vi.resetModules();
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electronStub,
  };
  require.cache[metalSchedulerPath] = {
    id: metalSchedulerPath,
    filename: metalSchedulerPath,
    loaded: true,
    exports: metalSchedulerModuleExports,
  };
  metalIpc = require(metalIpcPath);
}

function clearStubs() {
  mockIpcMainHandle.mockReset();
  MockMetalSchedulerCtor.mockClear();
  mockScheduler.start.mockClear();
  mockScheduler.stop.mockClear();
  mockScheduler.fetchNow.mockClear();
  mockScheduler.getState.mockClear();
  mockScheduler.snapshotDailyClose.mockClear();
  mockScheduler.detectHistoryGap.mockClear();
  mockScheduler.detectHistoryGap.mockImplementation(() => ({ need: [] }));
  mockScheduler.getState.mockImplementation(() => ({
    status: "idle",
    lastFetch: null,
    nextFetch: null,
  }));
  mockWebContents.getAllWebContents.mockImplementation(() => []);
}

describe("metal-ipc — D1 refactor: register/start 拆分 (Task D1-refactor)", () => {
  beforeEach(() => {
    freshModule();
    clearStubs();
  });

  afterEach(() => {
    try { metalIpc.stopMetalScheduler(); } catch { /* noop */ }
    delete require.cache[electronPath];
    delete require.cache[metalSchedulerPath];
    delete require.cache[metalIpcPath];
  });

  it("registerMetalIpc() 不接受 opts, 只注册 IPC handlers 不启 scheduler", () => {
    metalIpc.registerMetalIpc();  // 注意: 不传任何参数
    expect(mockIpcMainHandle).toHaveBeenCalled();
    expect(MockMetalSchedulerCtor).not.toHaveBeenCalled();
  });

  it("registerMetalIpc() 注册了所有 6 个 IPC channels", () => {
    metalIpc.registerMetalIpc();
    const channels = mockIpcMainHandle.mock.calls.map((c) => c[0]);
    expect(channels).toContain("metals:list");
    expect(channels).toContain("metals:config:update");
    expect(channels).toContain("metals:holding:upsert");
    expect(channels).toContain("metals:holding:remove");
    expect(channels).toContain("metals:quote:fetch");
    expect(channels).toContain("metals:quote:state");
  });

  it("startMetalScheduler({onUpdateTray}) 实例化 scheduler + 调 onUpdateTray on update", () => {
    let trayCalled = null;
    metalIpc.startMetalScheduler({
      onUpdateTray: (snap) => { trayCalled = snap; },
    });
    expect(MockMetalSchedulerCtor).toHaveBeenCalledTimes(1);
    expect(mockScheduler.start).toHaveBeenCalledTimes(1);

    // Simulate scheduler.onUpdate firing
    const ctorCall = MockMetalSchedulerCtor.mock.calls[0][0];
    expect(typeof ctorCall.onUpdate).toBe("function");
    ctorCall.onUpdate({
      quotes: { XAU: { price: 100 } },
      fx: { CNY_PER_USD: { rate: 7.0 } },
      fetchedAt: Date.now(),
      errors: {},
    });
    expect(trayCalled).toBeDefined();
    expect(trayCalled.quotes).toBeDefined();
    expect(trayCalled.quotes.XAU).toEqual({ price: 100 });
  });

  it("startMetalScheduler() 无 opts → 不抛, onUpdate 仍 fire 但 tray 不被推", () => {
    metalIpc.startMetalScheduler();
    expect(MockMetalSchedulerCtor).toHaveBeenCalledTimes(1);
    const ctorCall = MockMetalSchedulerCtor.mock.calls[0][0];
    expect(() => ctorCall.onUpdate({
      quotes: { XAU: { price: 100 } },
      fetchedAt: Date.now(),
    })).not.toThrow();
  });

  it("stopMetalScheduler() 调 scheduler.stop + 清引用", () => {
    metalIpc.startMetalScheduler();
    expect(MockMetalSchedulerCtor).toHaveBeenCalledTimes(1);
    metalIpc.stopMetalScheduler();
    expect(mockScheduler.stop).toHaveBeenCalledTimes(1);
    // 再 start 应该是新实例
    MockMetalSchedulerCtor.mockClear();
    metalIpc.startMetalScheduler();
    expect(MockMetalSchedulerCtor).toHaveBeenCalledTimes(1);
  });
});
