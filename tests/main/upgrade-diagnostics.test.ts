/**
 * tests/main/upgrade-diagnostics.test.ts
 *
 * v3.0 alpha: 升级路径诊断 — 派生 + 环形缓冲.
 *
 * 覆盖:
 *   - getStats 空 state → 全 0
 *   - getStats 1 app 可升级 + 1 自动路径 + 1 失败 30 天内 → 数字正确
 *   - getRows 排序: failed 优先 + 时间倒序
 *   - appendAttempt 环形缓冲: 200 上限
 *   - appendAttempt output 截断 500 字符
 *   - PRESERVE_FIELDS 互通: 写 upgrade_diagnostics 不破坏 apps
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
const { requireMain } = require("../_setup/require-main.cjs");

let tmpFile;
beforeEach(() => {
  tmpFile = path.join(
    os.tmpdir(),
    `pulse-ud-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
});
afterEach(() => {
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    /* noop */
  }
});

const {
  appendAttempt,
  getStats,
  getRows,
} = requireMain("upgrade-diagnostics");
const { _setStatePathForTest } = requireMain("state-store");

function now() {
  return 1_730_000_000_000;
}

describe("upgrade-diagnostics — getStats", () => {
  it("空 state → 全 0", () => {
    const s = {};
    const stats = getStats(s, now());
    expect(stats).toEqual({
      upgradable: 0,
      autoPathable: 0,
      success30d: 0,
      failed30d: 0,
    });
  });

  it("3 个 app, 2 个可升级, 2 个有自动路径, 1 个 30 天内失败", () => {
    const s = {
      apps: {
        Cursor: {
          name: "Cursor",
          has_update: true,
          installed_version: "0.42",
          latest_version: "0.43",
          source: "brew_formulae",
          cask: "cursor",
        },
        SparkleApp: {
          name: "SparkleApp",
          has_update: true,
          installed_version: "1.0",
          latest_version: "1.1",
          source: "sparkle_appcast",
          bundle: "SparkleApp",
        },
        UpToDate: {
          name: "UpToDate",
          has_update: false,
        },
      },
      upgrade_diagnostics: {
        SparkleApp: [
          {
            id: "SparkleApp",
            ts: now() - 86400_000,
            result: "failed",
            action: "open",
            error: "boom",
          },
        ],
      },
    };
    const stats = getStats(s, now());
    expect(stats.upgradable).toBe(2);
    expect(stats.autoPathable).toBe(2); // Cursor (brew) + SparkleApp (open via bundle)
    expect(stats.failed30d).toBe(1);
    expect(stats.success30d).toBe(0);
  });

  it("redirect_filename 源 → none, 不算 autoPathable", () => {
    const s = {
      apps: {
        Redirected: {
          name: "Redirected",
          has_update: true,
          installed_version: "1.0",
          latest_version: "1.1",
          source: "redirect_filename",
        },
      },
    };
    const stats = getStats(s, now());
    expect(stats.upgradable).toBe(1);
    expect(stats.autoPathable).toBe(0);
  });
});

describe("upgrade-diagnostics — getRows", () => {
  it("failed 行排在前", () => {
    const s = {
      apps: {
        A: {
          name: "A",
          has_update: true,
          installed_version: "1",
          latest_version: "2",
          source: "brew_formulae",
          cask: "a",
        },
        B: {
          name: "B",
          has_update: true,
          installed_version: "1",
          latest_version: "2",
          source: "sparkle_appcast",
          bundle: "B",
        },
      },
      upgrade_diagnostics: {
        B: [
          { id: "B", ts: now() - 1000, result: "success", action: "open" },
        ],
        A: [
          { id: "A", ts: now() - 500, result: "failed", action: "brew", error: "x" },
        ],
      },
    };
    const rows = getRows(s, now());
    expect(rows[0].id).toBe("A");
    expect(rows[0].pathKind).toBe("brew");
    expect(rows[0].lastResult).toBe("failed");
    expect(rows[1].id).toBe("B");
  });

  it("pathKind='none' 时 pathReason 暴露 getActionForApp.reason", () => {
    const s = {
      apps: {
        Mystery: {
          name: "Mystery",
          has_update: true,
          installed_version: "1",
          latest_version: "2",
          source: "redirect_filename",
        },
      },
    };
    const rows = getRows(s, now());
    expect(rows[0].pathKind).toBe("none");
    expect(rows[0].pathReason).toMatch(/no auto-upgrade/i);
  });
});

describe("upgrade-diagnostics — appendAttempt (ring buffer + 写盘)", () => {
  beforeEach(() => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ v: 1, apps: { Foo: { name: "Foo" } }, mutes: {} }),
    );
    _setStatePathForTest(tmpFile);
  });

  it("append 1 条 → 写盘可读出", () => {
    appendAttempt({
      id: "Foo",
      ts: now(),
      result: "success",
      action: "brew",
      durationMs: 1234,
    });
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.upgrade_diagnostics.Foo).toHaveLength(1);
    expect(after.upgrade_diagnostics.Foo[0].result).toBe("success");
    expect(after.upgrade_diagnostics.Foo[0].durationMs).toBe(1234);
    // apps 保留
    expect(after.apps.Foo.name).toBe("Foo");
  });

  it("环形缓冲: 超过 200 只留最新 200 条", () => {
    for (let i = 0; i < 250; i++) {
      appendAttempt({
        id: "Foo",
        ts: now() + i,
        result: "success",
        action: "brew",
      });
    }
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.upgrade_diagnostics.Foo).toHaveLength(200);
    // 最新 200 条: ts 50..249 (offset 50 因前 50 被踢)
    expect(after.upgrade_diagnostics.Foo[0].ts).toBe(now() + 249);
    expect(after.upgrade_diagnostics.Foo[199].ts).toBe(now() + 50);
  });

  it("output 截断 500 字符", () => {
    const big = "x".repeat(800);
    appendAttempt({
      id: "Foo",
      ts: now(),
      result: "failed",
      action: "brew",
      output: big,
      error: "boom",
    });
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.upgrade_diagnostics.Foo[0].output.length).toBe(501); // 500 + '…'
    expect(after.upgrade_diagnostics.Foo[0].output.endsWith("…")).toBe(true);
  });
});
