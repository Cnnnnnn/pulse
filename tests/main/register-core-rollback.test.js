/**
 * tests/main/register-core-rollback.test.js
 *
 * 2026-06-14: App rollback · 3 个 IPC handler 的单元 + 集成测试.
 *
 * 覆盖:
 *   - get-version-history: 正常返 entries + totalSize / 异常 app → []
 *   - rollback-app: history 找到 entry → doRollback 调 / history 找不到 → history_not_found /
 *                    app 在 config 找不到 → app_not_found / invalid_args 兜底
 *   - delete-backup: 先删 fs (backup.deleteBackup) + 删 state (versionHistory.deleteEntry)
 *
 * Mocking 策略 (跟 metal-ipc.test / tray-debounce.test 一致):
 *   - electron 用 require.cache 注入 stub — vite module graph 下静态 vi.mock('electron')
 *     对 CJS require 路径不稳.
 *   - backup / version-history / rollback 都是 CJS, 用 vi.spyOn 修改 exports 属性;
 *     production code 跟 test 共享同一份 module 实例 (createRequire(import.meta.url)).
 *   - child_process.execFile mock (跟 rollback.test 一致): 防止 sandbox 调 osascript 卡.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ipcMain.handle stub: 收集 handler 闭包
const mockHandle = vi.fn((name, fn) => { handlers.set(name, fn); });
const handlers = new Map();

const electronStub = {
  ipcMain: { handle: mockHandle, on: vi.fn(), removeHandler: vi.fn() },
  app: { getPath: vi.fn(() => "/fake/userData") },
  shell: { trashItem: vi.fn(async () => {}) },
};

const electronPath = require.resolve("electron");

// child_process.execFile mock — sandbox 下不真 spawn
const cp = require("child_process");
vi.spyOn(cp, "execFile").mockImplementation((_file, _args, _optsOrCb, _cb) => {
  const err = new Error("exit code 1: no match");
  if (typeof _optsOrCb === "function") _optsOrCb(err);
  return Promise.reject(err);
});

function freshModule() {
  vi.resetModules();
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electronStub,
  };
  handlers.clear();
  mockHandle.mockClear();
}

let tmpRoot;
let statePath;
let ctx;
let stateStore, backup, versionHistory, rollback, registerCoreHandlers;

function setup() {
  freshModule();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-ipc-rb-"));
  statePath = path.join(tmpRoot, "state.json");

  // 重新挂 cp mock (vi.resetModules 可能清掉)
  vi.spyOn(cp, "execFile").mockImplementation((_file, _args, _optsOrCb, _cb) => {
    const err = new Error("exit code 1: no match");
    if (typeof _optsOrCb === "function") _optsOrCb(err);
    return Promise.reject(err);
  });

  // CJS require 共享 module instance
  stateStore = require("../../src/main/state-store.js");
  backup = require("../../src/main/backup.js");
  versionHistory = require("../../src/main/version-history.js");
  rollback = require("../../src/main/rollback.js");
  ({ registerCoreHandlers } = require("../../src/main/ipc/register-core.js"));

  // state-store 注入 tmpRoot
  stateStore._setStatePathForTest(statePath);

  // spy 副作用模块
  vi.spyOn(backup, "deleteBackup").mockImplementation(() => 12345);
  vi.spyOn(backup, "getBackupDir").mockImplementation((bn) =>
    path.join(tmpRoot, "backups", bn),
  );

  vi.spyOn(versionHistory, "listHistory").mockImplementation((appName) => {
    if (appName === "Cursor") {
      return [
        {
          from: "3.6.31",
          to: "3.6.32",
          at: 1000,
          backupPath: path.join(tmpRoot, "backups", "Cursor.app", "3.6.31.app"),
          source: "brew_formulae",
          sizeBytes: 100,
        },
      ];
    }
    return [];
  });
  vi.spyOn(versionHistory, "getTotalSize").mockReturnValue(100);
  vi.spyOn(versionHistory, "deleteEntry").mockReturnValue(100);

  vi.spyOn(rollback, "doRollback").mockResolvedValue({ ok: true });

  ctx = {
    getConfig: () => ({
      apps: [
        { name: "Cursor", bundle: "Cursor.app", installed_version: "3.6.32" },
        { name: "Things", bundle: "Things.app" },
      ],
    }),
    pool: { enqueue: vi.fn().mockResolvedValue({ ok: true }) },
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

describe("get-version-history", () => {
  it("正常: 返 entries + totalSize", async () => {
    const h = handlers.get("get-version-history");
    const r = await h({}, "Cursor"); // (event, appName)
    expect(r.ok).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].to).toBe("3.6.32");
    expect(r.totalSizeBytes).toBe(100);
  });

  it("appName 空 → bad_name", async () => {
    const h = handlers.get("get-version-history");
    expect(await h({}, "")).toEqual(expect.objectContaining({ ok: false, reason: "bad_name" }));
    expect(await h({}, null)).toEqual(expect.objectContaining({ ok: false, reason: "bad_name" }));
  });

  it("versionHistory.listHistory throw → ok:false reason:threw", async () => {
    versionHistory.listHistory.mockImplementationOnce(() => {
      throw new Error("disk error");
    });
    const h = handlers.get("get-version-history");
    const r = await h({}, "Cursor");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("threw");
  });
});

describe("rollback-app", () => {
  it("正常: history 找到 → doRollback 调", async () => {
    const h = handlers.get("rollback-app");
    const r = await h({}, "Cursor", "3.6.32");
    expect(r.ok).toBe(true);
    expect(rollback.doRollback).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: "Cursor",
        bundleName: "Cursor.app",
        backupPath: expect.stringMatching(/Cursor\.app[\\/]+3\.6\.31\.app/),
        rollbackToVersion: "3.6.32",
      }),
    );
  });

  it("invalid_args: appName/toVersion 缺一", async () => {
    const h = handlers.get("rollback-app");
    expect(await h({}, "", "1.0")).toEqual(expect.objectContaining({ ok: false, reason: "invalid_args" }));
    expect(await h({}, "Cursor", "")).toEqual(expect.objectContaining({ ok: false, reason: "invalid_args" }));
    expect(await h({}, "Cursor", null)).toEqual(expect.objectContaining({ ok: false, reason: "invalid_args" }));
  });

  it("app 在 config 找不到 → app_not_found", async () => {
    ctx.getConfig = () => ({ apps: [] });
    registerCoreHandlers(ctx);
    const h = handlers.get("rollback-app");
    expect(await h({}, "Ghost", "1.0")).toEqual(expect.objectContaining({ ok: false, reason: "app_not_found" }));
  });

  it("history 找不到 entry → history_not_found", async () => {
    const h = handlers.get("rollback-app");
    expect(await h({}, "Cursor", "9.9.9")).toEqual(expect.objectContaining({ ok: false, reason: "history_not_found" }));
  });

  it("doRollback 返 ok:false reason:'backup_missing' → 直接透传", async () => {
    rollback.doRollback.mockResolvedValueOnce({ ok: false, reason: "backup_missing" });
    const h = handlers.get("rollback-app");
    const r = await h({}, "Cursor", "3.6.32");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("backup_missing");
  });

  it("doRollback throw → safeHandle 兜底返 reason:threw", async () => {
    rollback.doRollback.mockRejectedValueOnce(new Error("cp explode"));
    const h = handlers.get("rollback-app");
    const r = await h({}, "Cursor", "3.6.32");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("threw");
  });

  it("onUpdateInstalled callback → stateStore.saveAppInstalledVersion 写盘 (rollback 成功后 state 应有 installed_version)", async () => {
    // 让 doRollback 真调 onUpdateInstalled
    rollback.doRollback.mockImplementation(async (opts) => {
      opts.onUpdateInstalled("3.6.32");
      return { ok: true };
    });
    const h = handlers.get("rollback-app");
    const r = await h({}, "Cursor", "3.6.32");
    expect(r.ok).toBe(true);

    // 验证 state.json 落盘含 installed_version
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.apps.Cursor.installed_version).toBe("3.6.32");
  });
});

describe("delete-backup", () => {
  it("正常: 删 fs (backup.deleteBackup) + 删 state (versionHistory.deleteEntry)", async () => {
    const h = handlers.get("delete-backup");
    const r = await h({}, "Cursor", "3.6.32");
    expect(r.ok).toBe(true);
    expect(r.freedBytes).toBe(12345 + 100);
    expect(backup.deleteBackup).toHaveBeenCalledWith(
      "Cursor.app",
      "3.6.32",
      expect.objectContaining({ userDataDir: "/fake/userData" }),
    );
    expect(versionHistory.deleteEntry).toHaveBeenCalledWith("Cursor", "3.6.32");
  });

  it("invalid_args: appName/version 缺一", async () => {
    const h = handlers.get("delete-backup");
    expect(await h({}, "", "1.0")).toEqual(expect.objectContaining({ ok: false, reason: "invalid_args" }));
    expect(await h({}, "Cursor", "")).toEqual(expect.objectContaining({ ok: false, reason: "invalid_args" }));
  });

  it("app 在 config 没 bundle → 兜底用 appName 当 bundleName", async () => {
    ctx.getConfig = () => ({ apps: [{ name: "Weird", bundle: null }] });
    registerCoreHandlers(ctx);
    const h = handlers.get("delete-backup");
    await h({}, "Weird", "1.0");
    expect(backup.deleteBackup).toHaveBeenCalledWith("Weird", "1.0", expect.any(Object));
  });
});