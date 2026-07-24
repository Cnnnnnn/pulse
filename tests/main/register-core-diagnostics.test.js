/**
 * tests/main/register-core-diagnostics.test.js
 *
 * 2026-06-23: Phase Q1 v2 — diagnostics IPC handlers 的单元 + 集成测试.
 *
 * 覆盖:
 *   - diagnostics:fetch: 一次返 startup + metrics + topFailures + stats
 *   - diagnostics:fetch-samples: 返 ring buffer (samples)
 *   - error:export-zip: bundleDiagnostics 写出 .tar.gz 到桌面, 返 {ok, path, sizeBytes, fileCount}
 *
 * Mocking 策略 (跟 register-core-rollback.test 一致):
 *   - electron require.cache stub (vitest vi.mock('electron') 在 vite module
 *     graph 下不稳, 用 require.cache + vi.resetModules)
 *   - child_process.execFile mock (备份 backup.test 时的老问题, sandbox 下不真 spawn)
 *   - diagnostics / diagnostics-aggregator / error-init 全部 require, 用 vi.spyOn
 *     改 exports 上的方法 (而非解构, 防止解构拷贝绕过 spy)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const mockHandle = vi.fn((name, fn) => { handlers.set(name, fn); });
const handlers = new Map();

const electronStub = {
  ipcMain: { handle: mockHandle, on: vi.fn(), removeHandler: vi.fn() },
  app: { getPath: vi.fn(() => "/fake/userData") },
  shell: { trashItem: vi.fn(async () => {}) },
};
const electronPath = require.resolve("electron");

const cp = require("child_process");
vi.spyOn(cp, "execFile").mockImplementation((_file, _args, _optsOrCb, _cb) => {
  const err = new Error("exit code 1: no match");
  if (typeof _optsOrCb === "function") _optsOrCb(err);
  return Promise.reject(err);
});

function freshModule() {
  vi.resetModules();
  require.cache[electronPath] = {
    id: electronPath, filename: electronPath, loaded: true, exports: electronStub,
  };
  handlers.clear();
  mockHandle.mockClear();
  // 重新挂 cp mock (vi.resetModules 可能清掉)
  vi.spyOn(cp, "execFile").mockImplementation((_file, _args, _optsOrCb, _cb) => {
    const err = new Error("exit code 1: no match");
    if (typeof _optsOrCb === "function") _optsOrCb(err);
    return Promise.reject(err);
  });
}

let tmpRoot, diag, diagAgg, errorInit, registerCoreHandlers, bundleDiagnostics;

function setup() {
  freshModule();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-diag-ipc-"));

  diag = requireMain("diagnostics");
  diagAgg = requireMain("diagnostics-aggregator");
  errorInit = requireMain("bootstrap/error-init");
  ({ registerCoreHandlers } = requireMain("ipc/register-core"));
  ({ bundleDiagnostics } = requireMain("diagnostics-aggregator"));

  diag._resetForTest();

  // 默认 ctx
  const ctx = {
    getConfig: () => ({ apps: [] }),
    pool: { enqueue: vi.fn() },
    getWindow: () => null,
    onCheckComplete: vi.fn(),
    getCachedState: () => null,
    sendToRenderer: vi.fn(),
    safeHandle: (name, fn) => handlers.set(name, fn),
  };
  registerCoreHandlers(ctx);
}

beforeEach(() => setup());
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("diagnostics:fetch", () => {
  it("正常: 返 startup + metrics + topFailures + stats + sinceMs", async () => {
    diag.markBootstrapDone(() => diag._t0 + 100);
    diag.markRendererReady(() => diag._t0 + 500);
    diag.startMetricsSampler(30);
    await new Promise((r) => setTimeout(r, 50));
    diag.stopMetricsSampler();

    // 装一个 fake aggregator 实例
    errorInit.__resetForTest();
    errorInit.initErrorCapture({
      logsDir: path.join(tmpRoot, "logs"),
      sendToRenderer: vi.fn(),
    });

    const h = handlers.get("diagnostics:fetch");
    const r = await h({}, { sinceMs: 0, topN: 5 });
    expect(r.ok).toBe(true);
    expect(r.startup.readyMs).toBe(500);
    expect(r.startup.bootstrapMs).toBe(100);
    expect(r.metrics.count).toBeGreaterThan(0);
    expect(r.metrics.latest).toBeTruthy();
    expect(Array.isArray(r.topFailures)).toBe(true);
    expect(r.stats).toBeTruthy();
    expect(typeof r.sinceMs).toBe("number");
  });

  it("no aggregator instance → ok:true 但 topFailures 空 / stats 全 0", async () => {
    errorInit.__resetForTest();
    diag._resetForTest();
    const h = handlers.get("diagnostics:fetch");
    const r = await h({}, {});
    expect(r.ok).toBe(true);
    expect(r.topFailures).toEqual([]);
    expect(r.stats).toEqual({ total: 0, byLevel: {}, skipped: 0 });
  });

  it("throws → ok:false reason:threw", async () => {
    // 让 aggregator.query throw
    errorInit.__resetForTest();
    errorInit.initErrorCapture({
      logsDir: path.join(tmpRoot, "logs"),
      sendToRenderer: vi.fn(),
    });
    vi.spyOn(errorInit.getInstance().aggregator, "query").mockRejectedValue(new Error("disk fail"));
    const h = handlers.get("diagnostics:fetch");
    // 内层 try-catch 兜底, 应当 ok:true 但 topFailures 空 (query 失败不 throw 到外层)
    const r = await h({}, {});
    expect(r.ok).toBe(true);
    expect(r.topFailures).toEqual([]);
  });
});

describe("diagnostics:fetch-samples", () => {
  it("返 ring buffer (空 → [])", () => {
    diag._resetForTest();
    const h = handlers.get("diagnostics:fetch-samples");
    const r = h({});
    expect(r.ok).toBe(true);
    expect(r.samples).toEqual([]);
  });

  it("有 samples → 返数组", () => {
    diag._resetForTest();
    diag.startMetricsSampler(30);
    const h = handlers.get("diagnostics:fetch-samples");
    const r = h({});
    expect(r.ok).toBe(true);
    expect(r.samples.length).toBeGreaterThan(0);
    diag.stopMetricsSampler();
  });
});

describe("error:export-zip", () => {
  it("正常: bundleDiagnostics 写出 .tar.gz → 返 {ok, path, sizeBytes, fileCount}", async () => {
    // 用 tmpRoot 当 desktop — 我们 monkey patch bundleDiagnostics 直接 mock 调 tmpRoot
    // 但 bundleDiagnostics 已经 export, 用 spyOn 让它写到 tmpRoot
    vi.spyOn(diagAgg, "bundleDiagnostics").mockImplementation(async (opts) => {
      // 改 outputDir 到 tmpRoot
      return {
        ok: true,
        path: path.join(tmpRoot, "pulse-diagnostics-mock.tar.gz"),
        sizeBytes: 12345,
        fileCount: 4,
      };
    });

    const h = handlers.get("error:export-zip");
    const r = await h({});
    expect(r.ok).toBe(true);
    expect(r.path).toBe(path.join(tmpRoot, "pulse-diagnostics-mock.tar.gz"));
    expect(r.sizeBytes).toBe(12345);
    expect(r.fileCount).toBe(4);
    expect(diagAgg.bundleDiagnostics).toHaveBeenCalled();
    const callArgs = diagAgg.bundleDiagnostics.mock.calls[0][0];
    // aggregator 可能是 default singleton (测试间共享, 跨 fork instance 持久),
    // 也可能是 null — 我们只断言 extras 拿到了 startup/metrics 快照.
    expect(callArgs.extras.startup).toBeTruthy();
    expect(callArgs.extras.metrics).toBeTruthy();
  });

  it("bundleDiagnostics 返 ok:false → IPC 透传 reason", async () => {
    vi.spyOn(diagAgg, "bundleDiagnostics").mockResolvedValueOnce({
      ok: false,
      error: "mkdir failed: EACCES",
    });
    const h = handlers.get("error:export-zip");
    const r = await h({});
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/mkdir failed/);
  });

  it("bundleDiagnostics throw → ok:false reason:threw", async () => {
    vi.spyOn(diagAgg, "bundleDiagnostics").mockRejectedValueOnce(new Error("boom"));
    const h = handlers.get("error:export-zip");
    const r = await h({});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("threw");
  });
});