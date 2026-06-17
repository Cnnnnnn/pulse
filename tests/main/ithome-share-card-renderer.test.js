/**
 * tests/main/ithome-share-card-renderer.test.js
 *
 * 测 createShareCardPng 的三个关键路径:
 *   1. happy path: __renderReady true + capturePage 返回 NativeImage → 返回 Buffer
 *   2. timeout:    __renderReady 始终 false → 抛 render_timeout,窗口 destroy
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

const mockWebContents = {
  send: mockSend,
  executeJavaScript: mockExecuteJavaScript,
  capturePage: mockCapturePage,
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
};

const electronPath = require.resolve("electron");
const modulePath = require.resolve(
  "../../src/main/ithome/share-card-renderer.js",
);

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

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadFile.mockResolvedValue(undefined);
  mockWindow.destroy = mockDestroy;
  // 重置 BrowserWindow 构造返回,避免上一 case 残留
  mockBrowserWindowCtor.mockImplementation(() => mockWindow);
  freshModule();
});

afterEach(() => {
  delete require.cache[electronPath];
  delete require.cache[modulePath];
  vi.useRealTimers();
});

describe("createShareCardPng", () => {
  it("returns PNG buffer on success", async () => {
    const fakeImage = { toPNG: () => Buffer.from("png-bytes") };
    mockExecuteJavaScript.mockResolvedValue(true);
    mockCapturePage.mockResolvedValue(fakeImage);

    const buf = await createShareCardPng({
      article: { id: "a1", title: "t" },
      summary: { text: "s" },
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString()).toBe("png-bytes");
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("throws render_timeout when __renderReady never becomes true", async () => {
    mockExecuteJavaScript.mockResolvedValue(false);

    await expect(
      createShareCardPng(
        { article: { id: "a1" }, summary: { text: "s" } },
        { timeoutMs: 200 },
      ),
    ).rejects.toThrow("render_timeout");
    expect(mockDestroy).toHaveBeenCalled();
  });

  it("throws when capturePage returns empty", async () => {
    mockExecuteJavaScript.mockResolvedValue(true);
    mockCapturePage.mockResolvedValue(null);

    await expect(
      createShareCardPng(
        { article: { id: "a1" }, summary: { text: "s" } },
        { timeoutMs: 200 },
      ),
    ).rejects.toThrow("capture_empty");
    expect(mockDestroy).toHaveBeenCalled();
  });
});
