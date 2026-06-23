/**
 * tests/main/backup.test.js
 *
 * 2026-06-14: App rollback · backup module (cap-based pruning).
 *
 * 覆盖:
 *   - getBackupDir: 路径拼接
 *   - backupBundleVersion: 复制 / 返回 sizeBytes / 源缺失 / target 已存在时 rm 再 cp
 *   - pruneOldBackups: keep=N 保留最近 N 个, 删最旧 (按字典序)
 *   - deleteBackup: 删指定版本返 freed / 不存在返 0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  getBackupDir,
  backupBundleVersion,
  pruneOldBackups,
  deleteBackup,
} from "../../src/main/backup.js";

let tmpRoot;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-backup-test-"));
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// electron.createLogger 在 vitest 没 app context 时也可能工作 — log module 自己兜底.
// 不需要 mock, log 失败不抛.

describe("getBackupDir", () => {
  it("基于 userData 返回 backups/<bundle>", () => {
    expect(getBackupDir("Cursor.app", { userDataDir: tmpRoot })).toBe(
      path.join(tmpRoot, "backups", "Cursor.app"),
    );
  });
});

describe("backupBundleVersion", () => {
  it("复制源 .app → backups/<bundle>/<version>.app/", async () => {
    const src = path.join(tmpRoot, "Source.app");
    fs.mkdirSync(path.join(src, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(src, "Contents", "Info.plist"), "x");
    const r = await backupBundleVersion("Source.app", "1.0.0", {
      userDataDir: tmpRoot,
      sourceAppPath: src,
    });
    expect(r.ok).toBe(true);
    expect(r.backupPath).toBe(
      path.join(tmpRoot, "backups", "Source.app", "1.0.0.app"),
    );
    expect(fs.existsSync(r.backupPath)).toBe(true);
    expect(fs.statSync(r.backupPath).isDirectory()).toBe(true);
  });

  it("返回 sizeBytes > 0", async () => {
    const src = path.join(tmpRoot, "Source.app");
    fs.mkdirSync(path.join(src, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(src, "Contents", "Info.plist"), "hello");
    const r = await backupBundleVersion("Source.app", "1.0.0", {
      userDataDir: tmpRoot,
      sourceAppPath: src,
    });
    expect(r.ok).toBe(true);
    expect(r.sizeBytes).toBeGreaterThan(0);
  });

  it("dirSize 准确 (嵌套文件 size 累加) — 通过 backupBundleVersion.sizeBytes 验证", async () => {
    const src = path.join(tmpRoot, "Size.app");
    fs.mkdirSync(path.join(src, "sub"), { recursive: true });
    fs.writeFileSync(path.join(src, "a.txt"), "12345");
    fs.writeFileSync(path.join(src, "sub", "b.txt"), "678");
    const r = await backupBundleVersion("Size.app", "1.0.0", {
      userDataDir: tmpRoot,
      sourceAppPath: src,
    });
    expect(r.ok).toBe(true);
    expect(r.sizeBytes).toBe(5 + 3);
  });

  it("dirSize 不 spawn 子进程 (不 import child_process)", async () => {
    // 静态检查: backup.js 源代码不能 require child_process, 否则 sandbox 下 du / sh
    // 可能 hang 导致整个 vitest worker 卡死, 牵连宿主进程 (历史 bug).
    const src = fs.readFileSync(
      new URL("../../src/main/backup.js", import.meta.url),
      "utf-8",
    );
    expect(src).not.toMatch(/require\(['"]child_process['"]\)/);
    expect(src).not.toMatch(/\bexecFile\b/);
  });

  it("源不存在 → ok:false reason:source_missing, 不 throw", async () => {
    const r = await backupBundleVersion("Missing.app", "1.0.0", {
      userDataDir: tmpRoot,
      sourceAppPath: path.join(tmpRoot, "Missing.app"),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("source_missing");
  });

  it("target 已存在 (旧备份残留) → 先删再 cp, 旧文件不残留 (I-1 修复)", async () => {
    // 第一次备份 1.0.0
    const src = path.join(tmpRoot, "Source.app", "Contents");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "Info.plist"), "v1");
    await backupBundleVersion("Source.app", "1.0.0", {
      userDataDir: tmpRoot,
      sourceAppPath: path.join(tmpRoot, "Source.app"),
    });

    // 改造 source (模拟版本内容变化)
    fs.writeFileSync(path.join(src, "Info.plist"), "v2");
    fs.writeFileSync(path.join(src, "NewFile.txt"), "new");

    // 第二次备份同 version 1.0.0 (cp 前应 rm)
    const r = await backupBundleVersion("Source.app", "1.0.0", {
      userDataDir: tmpRoot,
      sourceAppPath: path.join(tmpRoot, "Source.app"),
    });
    expect(r.ok).toBe(true);

    // 验证 target 内容是 v2 的 (不是 v1 + v2 残留)
    const targetPlist = fs.readFileSync(
      path.join(r.backupPath, "Contents", "Info.plist"),
      "utf-8",
    );
    expect(targetPlist).toBe("v2");
  });

  it("cap=2: pruneOldBackups keep=2, 超过的删最旧", () => {
    for (const v of ["1.0.0", "1.1.0", "1.2.0"]) {
      const p = path.join(tmpRoot, "backups", "Source.app", `${v}.app`);
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, "marker"), v);
    }
    pruneOldBackups("Source.app", { userDataDir: tmpRoot, keep: 2 });
    const dir = path.join(tmpRoot, "backups", "Source.app");
    expect(fs.readdirSync(dir).sort()).toEqual(["1.1.0.app", "1.2.0.app"]);
  });

  it("cap=1: keep=1 只留最新", () => {
    for (const v of ["1.0.0", "1.1.0", "1.2.0"]) {
      const p = path.join(tmpRoot, "backups", "Source.app", `${v}.app`);
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, "marker"), v);
    }
    pruneOldBackups("Source.app", { userDataDir: tmpRoot, keep: 1 });
    const dir = path.join(tmpRoot, "backups", "Source.app");
    expect(fs.readdirSync(dir)).toEqual(["1.2.0.app"]);
  });

  it("backups 目录不存在 → pruneOldBackups 不 throw, noop", () => {
    expect(() =>
      pruneOldBackups("Ghost.app", { userDataDir: tmpRoot, keep: 2 }),
    ).not.toThrow();
  });
});

describe("deleteBackup", () => {
  it("删指定版本 + 返回 size 释放字节数", () => {
    const p = path.join(tmpRoot, "backups", "Source.app", "1.0.0.app");
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, "x"), "hello world");
    const freed = deleteBackup("Source.app", "1.0.0", { userDataDir: tmpRoot });
    expect(freed).toBeGreaterThan(0);
    expect(fs.existsSync(p)).toBe(false);
  });

  it("不存在 → 返回 0, 不 throw", () => {
    const freed = deleteBackup("Source.app", "9.9.9", { userDataDir: tmpRoot });
    expect(freed).toBe(0);
  });

  it("递归目录 (含 nested) → 全删 + size 累加", () => {
    const root = path.join(tmpRoot, "backups", "Source.app", "1.0.0.app");
    fs.mkdirSync(path.join(root, "Contents", "MacOS"), { recursive: true });
    fs.writeFileSync(path.join(root, "Contents", "Info.plist"), "plist");
    fs.writeFileSync(path.join(root, "Contents", "MacOS", "bin"), "binary");
    const freed = deleteBackup("Source.app", "1.0.0", { userDataDir: tmpRoot });
    expect(freed).toBeGreaterThan(0);
    expect(fs.existsSync(root)).toBe(false);
  });
});