/**
 * tests/main/ipc/register-open-url.test.js
 *
 * IPC contract for register-open-url.js:
 *   - registers open-url:open channel via ctx.safeHandle
 *   - opens valid http/https URLs through shell.openExternal → { ok: true }
 *   - rejects unsafe / malformed URLs → { ok: false, reason: "unsafe_url" }
 *   - reports shell failures → { ok: false, reason: "shell_failed" }
 *   - no-ops when ctx.safeHandle is missing
 *
 * 沿用 tests/main/metal-ipc.test.js 的 require.cache stub 模式 —
 * 静态 vi.mock('electron') 在 vite module graph 下对 CJS require 路径不稳,
 * 用 require.cache + vi.resetModules 才是 work 的.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockShellOpenExternal = vi.fn();
const electronStub = {
  shell: { openExternal: mockShellOpenExternal },
};

const mainLogWarn = vi.fn();
const mainLogInfo = vi.fn();
const mainLogError = vi.fn();
const mainLogDebug = vi.fn();
const mainLogEvent = vi.fn();

const electronPath = require.resolve("electron");
const logPath = require.resolve("../../../src/main/log.js");
const registerPath = require.resolve("../../../src/main/ipc/register-open-url.js");

let registerMod;

function freshModule() {
  vi.resetModules();
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electronStub,
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
        info: mainLogInfo,
        error: mainLogError,
        debug: mainLogDebug,
        event: mainLogEvent,
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
  registerMod = require(registerPath);
}

function clearStubs() {
  mockShellOpenExternal.mockReset();
  mainLogWarn.mockReset();
  mainLogInfo.mockReset();
  mainLogError.mockReset();
  mainLogDebug.mockReset();
  mainLogEvent.mockReset();
}

describe("open-url:open IPC", () => {
  beforeEach(() => {
    freshModule();
    clearStubs();
  });

  afterEach(() => {
    delete require.cache[electronPath];
    delete require.cache[logPath];
    delete require.cache[registerPath];
  });

  it("registers open-url:open channel via safeHandle", () => {
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => { handlers[channel] = fn; });

    registerMod.registerOpenUrlHandlers({ safeHandle });

    expect(safeHandle).toHaveBeenCalledWith("open-url:open", expect.any(Function));
    expect(handlers["open-url:open"]).toBeDefined();
  });

  it("opens http URL via shell.openExternal and returns ok: true", async () => {
    mockShellOpenExternal.mockResolvedValueOnce();
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => { handlers[channel] = fn; });

    registerMod.registerOpenUrlHandlers({ safeHandle });

    const r = await handlers["open-url:open"]({}, "http://example.com/foo");
    expect(mockShellOpenExternal).toHaveBeenCalledWith("http://example.com/foo");
    expect(r).toEqual({ ok: true });
    expect(mainLogWarn).not.toHaveBeenCalled();
  });

  it("opens https URL via shell.openExternal and returns ok: true", async () => {
    mockShellOpenExternal.mockResolvedValueOnce();
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => { handlers[channel] = fn; });

    registerMod.registerOpenUrlHandlers({ safeHandle });

    const r = await handlers["open-url:open"]({}, "https://example.com/foo?x=1");
    expect(mockShellOpenExternal).toHaveBeenCalledWith("https://example.com/foo?x=1");
    expect(r).toEqual({ ok: true });
  });

  it("rejects non-http(s) URL (file://) as unsafe_url", async () => {
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => { handlers[channel] = fn; });

    registerMod.registerOpenUrlHandlers({ safeHandle });

    const r = await handlers["open-url:open"]({}, "file:///etc/passwd");
    expect(mockShellOpenExternal).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, reason: "unsafe_url" });
    expect(mainLogWarn).toHaveBeenCalledWith(expect.stringContaining("unsafe url"));
  });

  it("rejects non-http(s) URL (javascript:) as unsafe_url", async () => {
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => { handlers[channel] = fn; });

    registerMod.registerOpenUrlHandlers({ safeHandle });

    const r = await handlers["open-url:open"]({}, "javascript:alert(1)");
    expect(mockShellOpenExternal).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, reason: "unsafe_url" });
  });

  it("rejects malformed URL as unsafe_url", async () => {
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => { handlers[channel] = fn; });

    registerMod.registerOpenUrlHandlers({ safeHandle });

    const r = await handlers["open-url:open"]({}, "not a url");
    expect(mockShellOpenExternal).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, reason: "unsafe_url" });
  });

  it("rejects empty string as unsafe_url", async () => {
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => { handlers[channel] = fn; });

    registerMod.registerOpenUrlHandlers({ safeHandle });

    const r = await handlers["open-url:open"]({}, "");
    expect(mockShellOpenExternal).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, reason: "unsafe_url" });
  });

  it("rejects non-string payload as unsafe_url", async () => {
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => { handlers[channel] = fn; });

    registerMod.registerOpenUrlHandlers({ safeHandle });

    const r = await handlers["open-url:open"]({}, { not: "a url" });
    expect(mockShellOpenExternal).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, reason: "unsafe_url" });
  });

  it("returns ok: false / reason: shell_failed when shell.openExternal throws", async () => {
    mockShellOpenExternal.mockRejectedValueOnce(new Error("boom"));
    const handlers = {};
    const safeHandle = vi.fn((channel, fn) => { handlers[channel] = fn; });

    registerMod.registerOpenUrlHandlers({ safeHandle });

    const r = await handlers["open-url:open"]({}, "https://example.com");
    expect(mockShellOpenExternal).toHaveBeenCalledWith("https://example.com");
    expect(r).toEqual({ ok: false, reason: "shell_failed" });
    expect(mainLogWarn).toHaveBeenCalledWith(expect.stringContaining("open-url:open failed"));
  });

  it("early-returns if safeHandle is not a function", () => {
    expect(() => registerMod.registerOpenUrlHandlers({ safeHandle: undefined })).not.toThrow();
    expect(() => registerMod.registerOpenUrlHandlers({})).not.toThrow();
    expect(mockShellOpenExternal).not.toHaveBeenCalled();
  });
});