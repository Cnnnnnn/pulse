/**
 * tests/main/bulk-upgrade-with-backup.test.js
 *
 * 2026-06-14: App rollback · backup hook 在 runBulkUpgrade 的接入测试.
 *
 * Mocking 策略 (来自 worktree C3 的经验, 已验证可工作):
 *   - bulk-upgrade / backup / version-history 都是 CJS module. Vitest 1.x 的
 *     `import * as foo from "..."` 会 wrap CJS exports 成 ESM namespace 对象,
 *     `vi.spyOn` 修改的是 wrapper, production code 通过 `require(...)` 拿到的
 *     是另一个对象 — spy 不生效.
 *   - 解法: 用 `createRequire(import.meta.url)` 拿 CJS `require`, 直接 require
 *     三个 CJS 模块, 跟 production code 共享 module instance.
 *   - electron 用 vi.mock (顶层 hoist, 对 require 也生效).
 *   - state-store 通过 CJS require 加载 — 但本测试不直接用 state-store,
 *     走 _setUserDataDirForTest 注入 tmpRoot.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import os from "os";

const require = createRequire(import.meta.url);

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/fake/userData") },
  shell: { trashItem: vi.fn(async () => {}) },
}));

const { runBulkUpgrade, _setUserDataDirForTest } = require("../../src/main/bulk-upgrade.js");
const backup = require("../../src/main/backup.js");
const versionHistory = require("../../src/main/version-history.js");

beforeEach(() => {
  // 清理跨测污染
  if (backup.backupBundleVersion.mockRestore) backup.backupBundleVersion.mockRestore();
  if (backup.pruneOldBackups.mockRestore) backup.pruneOldBackups.mockRestore();
  if (versionHistory.recordUpgrade.mockRestore) versionHistory.recordUpgrade.mockRestore();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-bulk-bk-"));
  _setUserDataDirForTest(tmp);

  // 默认: backup 返成功
  vi.spyOn(backup, "backupBundleVersion").mockResolvedValue({
    ok: true,
    backupPath: "/fake/backup",
    sizeBytes: 100,
  });
  vi.spyOn(backup, "pruneOldBackups").mockImplementation(() => {});
  vi.spyOn(versionHistory, "recordUpgrade").mockImplementation(() => {});
});

describe("runBulkUpgrade + backup hook", () => {
  it("brew action: backup + prune + recordUpgrade 都被调", async () => {
    const items = [
      {
        id: "1",
        name: "Cursor",
        source: "brew_formulae",
        cask: "cursor",
        bundleName: "Cursor.app",
        current: "1.0.0",
        latest: "1.1.0",
      },
    ];
    const summary = await runBulkUpgrade({
      items,
      exec: async () => ({ output: "ok" }),
      onProgress: () => {},
    });

    expect(summary.succeeded).toHaveLength(1);
    expect(backup.backupBundleVersion).toHaveBeenCalledWith(
      "Cursor.app",
      "1.0.0",
      expect.objectContaining({ sourceAppPath: expect.any(String) }),
    );
    expect(backup.pruneOldBackups).toHaveBeenCalledWith(
      "Cursor.app",
      expect.objectContaining({ keep: 2 }),
    );
    expect(versionHistory.recordUpgrade).toHaveBeenCalledWith(
      "Cursor",
      expect.objectContaining({
        from: "1.0.0",
        to: "1.1.0",
        backupPath: "/fake/backup",
        source: "brew_formulae",
        sizeBytes: 100,
      }),
    );
  });

  it("brew_local_cask 源: 同样触发 (action.type === 'brew')", async () => {
    const items = [
      {
        id: "1",
        name: "Kakoune",
        source: "brew_local_cask",
        cask: "kakoune",
        bundleName: "kakoune.app",
        current: "0.1.0",
        latest: "0.2.0",
      },
    ];
    const summary = await runBulkUpgrade({
      items,
      exec: async () => ({ output: "ok" }),
      onProgress: () => {},
    });

    expect(summary.succeeded).toHaveLength(1);
    expect(backup.backupBundleVersion).toHaveBeenCalledTimes(1);
    expect(versionHistory.recordUpgrade).toHaveBeenCalledTimes(1);
  });

  it("非 brew action (mas): 三个函数都不调, succeeded 仍计入", async () => {
    const items = [
      {
        id: "1",
        name: "Things",
        source: "app_store_lookup",
        bundleName: "Things.app",
        current: "3.0",
        latest: "3.1",
        trackId: 12345,
      },
    ];
    const summary = await runBulkUpgrade({
      items,
      exec: async () => ({ output: "ok" }),
      onProgress: () => {},
    });

    expect(summary.succeeded).toHaveLength(1);
    expect(backup.backupBundleVersion).not.toHaveBeenCalled();
    expect(backup.pruneOldBackups).not.toHaveBeenCalled();
    expect(versionHistory.recordUpgrade).not.toHaveBeenCalled();
  });

  it("backup 失败 (ok:false): recordUpgrade 不调, succeeded 仍计入, warning 透出", async () => {
    backup.backupBundleVersion.mockResolvedValueOnce({
      ok: false,
      reason: "source_missing",
    });

    const items = [
      {
        id: "1",
        name: "Cursor",
        source: "brew_formulae",
        cask: "cursor",
        bundleName: "Cursor.app",
        current: "1.0.0",
        latest: "1.1.0",
      },
    ];
    const warnings = [];
    const summary = await runBulkUpgrade({
      items,
      exec: async () => ({ output: "ok" }),
      onProgress: (e) => { if (e.warning) warnings.push(e.warning); },
    });

    expect(summary.succeeded).toHaveLength(1);
    expect(versionHistory.recordUpgrade).not.toHaveBeenCalled();
    expect(warnings).toContain("source_missing");
  });

  it("brew 升级失败 (runOne throw): recordUpgrade 不调, failed 计入", async () => {
    const items = [
      {
        id: "1",
        name: "Cursor",
        source: "brew_formulae",
        cask: "cursor",
        bundleName: "Cursor.app",
        current: "1.0.0",
        latest: "1.1.0",
      },
    ];
    const summary = await runBulkUpgrade({
      items,
      exec: async () => {
        throw new Error("brew exit 1");
      },
      onProgress: () => {},
    });

    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0].error).toBe("brew exit 1");
    expect(versionHistory.recordUpgrade).not.toHaveBeenCalled();
  });

  it("userDataDir 不可用 (override=null): 跳过 backup + recordUpgrade 不调", async () => {
    _setUserDataDirForTest(null);

    const items = [
      {
        id: "1",
        name: "Cursor",
        source: "brew_formulae",
        cask: "cursor",
        bundleName: "Cursor.app",
        current: "1.0.0",
        latest: "1.1.0",
      },
    ];
    const summary = await runBulkUpgrade({
      items,
      exec: async () => ({ output: "ok" }),
      onProgress: () => {},
    });

    expect(summary.succeeded).toHaveLength(1);
    expect(backup.backupBundleVersion).not.toHaveBeenCalled();
    expect(versionHistory.recordUpgrade).not.toHaveBeenCalled();
  });
});