/**
 * tests/main/tray-quicklook.test.ts
 *
 * Tray Quick Look：buildQuickLookSnapshot 纯函数。
 */
import { describe, it, expect } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");

const { buildQuickLookSnapshot } = requireMain("tray-quicklook");

describe("buildQuickLookSnapshot", () => {
  const results = [
    { name: "Cursor", has_update: true, installed_version: "1.0", latest_version: "2.0", status: "update_available" },
    { name: "iTerm2", has_update: false, installed_version: "3.4", latest_version: "3.4", status: "up_to_date" },
    { name: "Broken", has_update: false, status: "error" },
  ];

  it("统计 updatable / total / upToDate / error + updates 列表", () => {
    const snap = buildQuickLookSnapshot(results, 1700000000000);
    expect(snap.total).toBe(3);
    expect(snap.updatable).toBe(1);
    expect(snap.upToDateCount).toBe(1);
    expect(snap.errorCount).toBe(1);
    expect(snap.updates).toEqual([
      { name: "Cursor", installed: "1.0", latest: "2.0" },
    ]);
    expect(snap.lastCheckAt).toBe(1700000000000);
    expect(snap.hasChecked).toBe(true);
  });

  it("空 results → hasChecked false", () => {
    const snap = buildQuickLookSnapshot([], null);
    expect(snap.total).toBe(0);
    expect(snap.hasChecked).toBe(false);
    expect(snap.lastCheckAt).toBeNull();
  });

  it("非数组 / null → 安全空快照", () => {
    const snap = buildQuickLookSnapshot(null as any);
    expect(snap.total).toBe(0);
    expect(snap.updates).toEqual([]);
  });
});
