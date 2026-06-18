/**
 * tests/main/ithome-share-card-renderer.test.js
 *
 * 测 createShareCardPng 的三个关键路径:
 *   1. happy path: 渲染端通过 ipcMain 'share-card:ready' 通知 → capturePage → 返回 Buffer
 *   2. timeout:    渲染端不发 ready → 抛 render_timeout,窗口 destroy
 *   3. empty:      capturePage 返回 null → 抛 capture_empty,窗口 destroy
 *
 * electron 包在 vite module graph 下用静态 vi.mock('electron') 拦不住 CJS
 * require (interop 问题), 跟 tests/main/metal-ipc.test.js / tray-debounce.test.js
 * 同样的套路: require.cache 注入 stub electron + vi.resetModules。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockDestroy = vi.fn();
const mockLoadFile = vi.fn();
const mockSend = vi.fn();
const mockCapturePage = vi.fn();
const mockExecuteJavaScript = vi.fn();

const mockOn = vi.fn();
const mockIpcMainOn = vi.fn();
const mockIpcMainRemoveAllListeners = vi.fn();

const mockWebContents = {
  send: mockSend,
  executeJavaScript: mockExecuteJavaScript,
  capturePage: mockCapturePage,
  on: mockOn,
};

const mockWindow = {
  webContents: mockWebContents,
  destroy: mockDestroy,
  loadFile: mockLoadFile,
  isDestroyed: () => false,
};

const mockBrowserWindowCtor = vi.fn(() => mockWindow);

const electronStub = {
  BrowserWindow: mockBrowserWindowCtor,
  app: { getAppPath: () => "/tmp/pulse" },
  ipcMain: {
    on: mockIpcMainOn,
    removeAllListeners: mockIpcMainRemoveAllListeners,
  },
};

const electronPath = require.resolve("electron");
const modulePath =
  require.resolve("../../src/main/ithome/share-card-renderer.js");

let createShareCardPng;

function freshModule() {
  vi.resetModules();
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electronStub,
  };
  delete require.cache[modulePath];
  ({ createShareCardPng } = require(modulePath));
}

// 模拟渲染端发 IPC ready — 找到 ipcMain.on 注册的 'share-card:ready' handler 并调用
function triggerRendererReady() {
  const call = mockIpcMainOn.mock.calls.find(
    ([channel]) => channel === "share-card:ready",
  );
  if (!call) throw new Error("share-card:ready handler not registered");
  const handler = call[1];
  // ipcMain.on 注册的 handler 签名是 (event, ...args)
  handler({});
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadFile.mockResolvedValue(undefined);
  mockWindow.destroy = mockDestroy;
  mockBrowserWindowCtor.mockImplementation(() => mockWindow);
  freshModule();
});

afterEach(() => {
  delete require.cache[electronPath];
  delete require.cache[modulePath];
  vi.useRealTimers();
});

describe("createShareCardPng", () => {
  it("returns PNG buffer when renderer signals ready via IPC", async () => {
    const fakeImage = { toPNG: () => Buffer.from("png-bytes") };
    mockCapturePage.mockResolvedValue(fakeImage);

    // 等 loadFile 完成(微任务)后,主进程已经注册好 ipcMain.on 并 send 出 share-data
    const pending = createShareCardPng({
      article: { id: "a1", title: "t" },
      summary: { text: "s" },
    });
    // 让 ipcMain.on 注册完成(loadFile → 主进程继续同步走到注册)
    await new Promise((r) => setImmediate(r));
    // 模拟渲染端主动发 ready IPC
    triggerRendererReady();
    const buf = await pending;

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString()).toBe("png-bytes");
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("throws render_timeout when renderer never sends ready", async () => {
    await expect(
      createShareCardPng(
        { article: { id: "a1" }, summary: { text: "s" } },
        { timeoutMs: 100 },
      ),
    ).rejects.toThrow("render_timeout");
    expect(mockDestroy).toHaveBeenCalled();
  });

  it("throws when capturePage returns empty", async () => {
    mockCapturePage.mockResolvedValue(null);

    const pending = createShareCardPng(
      { article: { id: "a1" }, summary: { text: "s" } },
      { timeoutMs: 1000 },
    );
    await new Promise((r) => setImmediate(r));
    triggerRendererReady();
    await expect(pending).rejects.toThrow("capture_empty");
    expect(mockDestroy).toHaveBeenCalled();
  });
});
