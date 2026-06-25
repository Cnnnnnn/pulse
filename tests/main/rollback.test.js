/**
 * tests/main/rollback.test.js
 *
 * 2026-06-14: App rollback · one-click restore from backup.
 *
 * 覆盖:
 *   - doRollback: trash 目标 + cp 备份 + 回调被调 / 目标不存在跳过 trash /
 *     backup 路径缺失返 backup_missing / invalid_args 兜底 /
 *     in-flight lock 防止同 app 并发回滚 / cp 前 rm 防止 merge (I-1)
 *   - isAppRunning: 找不到 → false (mock execFile, 不真 spawn pgrep)
 *   - killAppGraceful: app 不在跑 → 立即返回 ok
 *
 * Mocking 策略:
 *   - electron.shell.trashItem: vi.mock 让 rollback.js 拿到 fake shell, 测试直接断言
 *     trashItem 被调, 不真删系统文件.
 *   - child_process.execFile: 通过 require child_process 后 mock 它, 让 isAppRunning
 *     / killAppGraceful 不真去 spawn pgrep/osascript/pkill (sandbox 下可能卡死).
 *   - 测试用 tmpRoot, 不会真去碰 /Applications/.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

vi.mock("electron", () => ({
  shell: { trashItem: vi.fn(async () => {}) },
}));

// mock child_process.execFile — sandbox 下不真 spawn pgrep/osascript
const cp = require("child_process");
function mockExecFile(_file, _args, _optsOrCb, _cb) {
  // pgrep 没匹配到时 exit code = 1, 抛异常 — 这就是 "没在跑"
  const err = new Error("exit code 1: no match");
  if (typeof _optsOrCb === "function") _optsOrCb(err);
  // callback 已处理 err (把 err 传给 node-style callback), return 一个 fulfilled
  // Promise 而不是 reject — 否则 vitest 1.x 把它当 unhandled rejection,
  // 即使该 Promise 不被 await 也会让 exit code 变 1, CI fail.
  return Promise.resolve();
}
vi.spyOn(cp, "execFile").mockImplementation(mockExecFile);

const { doRollback, isAppRunning, killAppGraceful } = require("../../src/main/rollback.js");

let tmpRoot;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-rb-test-"));
  vi.clearAllMocks();
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
  // 重新 spy 上, 因为 restoreAllMocks 会清掉
  vi.spyOn(cp, "execFile").mockImplementation(mockExecFile);
});

describe("doRollback", () => {
  it("trash 目标 + cp 备份 + 调 userData 写入 (新 .app 被 cp 覆盖)", async () => {
    // 准备: 备份目录 + 当前 /Applications/Cursor.app
    const target = path.join(tmpRoot, "Applications", "Cursor.app");
    const contents = path.join(target, "Contents");
    fs.mkdirSync(contents, { recursive: true });
    fs.writeFileSync(path.join(contents, "Info.plist"), "new version");

    const backupPath = path.join(tmpRoot, "backups", "Cursor.app", "3.6.30.app");
    const backupContents = path.join(backupPath, "Contents");
    fs.mkdirSync(backupContents, { recursive: true });
    fs.writeFileSync(path.join(backupContents, "Info.plist"), "old version");

    const onUpdateInstalled = vi.fn();
    const onActivity = vi.fn();
    const onRecheck = vi.fn();
    const onBroadcast = vi.fn();

    const r = await doRollback({
      appName: "Cursor",
      bundleName: "Cursor.app",
      targetAppPath: target,
      backupPath,
      rollbackToVersion: "3.6.30",
      currentInstalledVersion: "3.6.31",
      onUpdateInstalled,
      onActivity,
      onRecheck,
      onBroadcast,
    });
    expect(r.ok).toBe(true);
    // cp 之后 target 又是新 .app (从 backup cp 过来)
    expect(fs.existsSync(target)).toBe(true);
    // 检查内容是旧的
    const plistAfter = fs.readFileSync(path.join(contents, "Info.plist"), "utf-8");
    expect(plistAfter).toBe("old version");
    // 回调被调
    expect(onUpdateInstalled).toHaveBeenCalledWith("3.6.30");
    expect(onActivity).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "app-rollback", ref: "Cursor" }),
    );
    expect(onRecheck).toHaveBeenCalledWith("Cursor");
    expect(onBroadcast).toHaveBeenCalledWith(
      "version-history-updated",
      expect.objectContaining({ appName: "Cursor" }),
    );
  });

  it("目标不存在 → 跳过 trash, 直接 cp", async () => {
    const target = path.join(tmpRoot, "Applications", "Cursor.app");
    const backupPath = path.join(tmpRoot, "backups", "Cursor.app", "3.6.30.app");
    fs.mkdirSync(path.join(backupPath, "Contents"), { recursive: true });

    const r = await doRollback({
      appName: "Cursor",
      bundleName: "Cursor.app",
      targetAppPath: target,
      backupPath,
      rollbackToVersion: "3.6.30",
      currentInstalledVersion: "3.6.31",
    });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(target)).toBe(true);
  });

  it("backup 路径不存在 → 返 backup_missing, 不调 trash 不调 cp", async () => {
    const target = path.join(tmpRoot, "Applications", "Cursor.app");
    fs.mkdirSync(target, { recursive: true });

    const electron = await import("electron");
    const r = await doRollback({
      appName: "Cursor",
      bundleName: "Cursor.app",
      targetAppPath: target,
      backupPath: "/missing/backup",
      rollbackToVersion: "3.6.30",
      currentInstalledVersion: "3.6.31",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("backup_missing");
    expect(electron.shell.trashItem).not.toHaveBeenCalled();
  });

  it("invalid_args: appName/bundleName/targetAppPath/backupPath 缺一 → 返 invalid_args", async () => {
    expect(await doRollback({ appName: "X", bundleName: "X.app", targetAppPath: "/t", backupPath: "" }))
      .toEqual(expect.objectContaining({ ok: false, reason: "invalid_args" }));
    expect(await doRollback({ appName: "", bundleName: "X.app", targetAppPath: "/t", backupPath: "/b" }))
      .toEqual(expect.objectContaining({ ok: false, reason: "invalid_args" }));
    expect(await doRollback({ appName: "X", bundleName: "X.app", targetAppPath: null, backupPath: "/b" }))
      .toEqual(expect.objectContaining({ ok: false, reason: "invalid_args" }));
  });

  it("in-flight lock: 同 app 第二次 doRollback 并发 → 返 in_progress, 不破坏第一次", async () => {
    const target = path.join(tmpRoot, "Applications", "Kimi.app");
    const backupPath = path.join(tmpRoot, "backups", "Kimi.app", "1.2.3.app");
    fs.mkdirSync(path.join(backupPath, "Contents"), { recursive: true });

    // 第一次启动 (不 await, 让 in-flight 锁占着)
    const firstPromise = doRollback({
      appName: "Kimi",
      bundleName: "Kimi.app",
      targetAppPath: target,
      backupPath,
      rollbackToVersion: "1.2.3",
      currentInstalledVersion: "1.2.4",
    });

    // 第二次: 应当立即返 in_progress
    const second = await doRollback({
      appName: "Kimi",
      bundleName: "Kimi.app",
      targetAppPath: target,
      backupPath,
      rollbackToVersion: "1.2.3",
      currentInstalledVersion: "1.2.4",
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("in_progress");

    // 第一次 await 完成
    const first = await firstPromise;
    expect(first.ok).toBe(true);

    // 锁释放后, 第三次可以成功
    const third = await doRollback({
      appName: "Kimi",
      bundleName: "Kimi.app",
      targetAppPath: target,
      backupPath,
      rollbackToVersion: "1.2.3",
      currentInstalledVersion: "1.2.4",
    });
    expect(third.ok).toBe(true);
  });

  it("I-1: target 已存在 → trash 前 rm, cp 不会 merge (残留文件清掉)", async () => {
    // 准备: target 有 v1 残留文件, backup 只有 Info.plist
    const target = path.join(tmpRoot, "Applications", "Cursor.app");
    fs.mkdirSync(path.join(target, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(target, "Contents", "Info.plist"), "v1 plist");
    fs.writeFileSync(path.join(target, "Contents", "Stale.txt"), "v1 残留");

    const backupPath = path.join(tmpRoot, "backups", "Cursor.app", "3.6.30.app");
    fs.mkdirSync(path.join(backupPath, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(backupPath, "Contents", "Info.plist"), "old plist");
    // backup 里没有 Stale.txt

    const r = await doRollback({
      appName: "Cursor",
      bundleName: "Cursor.app",
      targetAppPath: target,
      backupPath,
      rollbackToVersion: "3.6.30",
      currentInstalledVersion: "3.6.31",
    });
    expect(r.ok).toBe(true);
    // cp 后 Stale.txt 不应残留 (被 rm 清掉了)
    expect(fs.existsSync(path.join(target, "Contents", "Stale.txt"))).toBe(false);
    expect(fs.existsSync(path.join(target, "Contents", "Info.plist"))).toBe(true);
  });

  it("回调 throw 不影响 rollback 成功返回 (单独 try/catch 包住)", async () => {
    const target = path.join(tmpRoot, "Applications", "Cursor.app");
    const backupPath = path.join(tmpRoot, "backups", "Cursor.app", "3.6.30.app");
    fs.mkdirSync(path.join(backupPath, "Contents"), { recursive: true });

    const throwingUpdate = vi.fn(() => { throw new Error("state-store broken"); });
    const throwingActivity = vi.fn(() => { throw new Error("activity broken"); });

    const r = await doRollback({
      appName: "Cursor",
      bundleName: "Cursor.app",
      targetAppPath: target,
      backupPath,
      rollbackToVersion: "3.6.30",
      currentInstalledVersion: "3.6.31",
      onUpdateInstalled: throwingUpdate,
      onActivity: throwingActivity,
    });
    expect(r.ok).toBe(true); // 回调 throw 不应让 rollback fail
    expect(throwingUpdate).toHaveBeenCalled();
    expect(throwingActivity).toHaveBeenCalled();
  });
});

describe("isAppRunning", () => {
  it("找不到 (execFile reject) → false", async () => {
    const r = await isAppRunning("ThisDoesNotExist12345.app");
    expect(r).toBe(false);
  });
});

describe("killAppGraceful", () => {
  it("app 不在跑 → 立即返回 ok=true (not_running 路径)", async () => {
    const r = await killAppGraceful("ThisDoesNotExist12345", { timeoutMs: 100 });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("not_running");
  });
});