/**
 * tests/renderer/upgrade-actions.test.js
 *
 * v2.22 Task A4: 验证 requestUpgrade 调用了 bulk-upgrade 真实流 (非 stub).
 * 1) 有效 appName → openBulkUpgrade([item]) + window.api.bulkUpgradeStart([item]) 都被调
 * 2) 空 appName → 都不调
 */

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock store-bulk-upgrade — 只关心 openBulkUpgrade 是否被调
vi.mock("../../src/renderer/store-bulk-upgrade.js", () => ({
  openBulkUpgrade: vi.fn(),
}));

import { openBulkUpgrade } from "../../src/renderer/store-bulk-upgrade.js";
import { results, resetCheck } from "../../src/renderer/store.js";
import { requestUpgrade } from "../../src/renderer/upgrade-actions.js";

function makeResult(name) {
  return {
    name,
    bundle: name.toLowerCase() + ".app",
    brew_cask: name.toLowerCase(),
    installed_version: "1.0.0",
    latest_version: "2.0.0",
    has_update: true,
    status: "update_available",
    source: "brew_formulae",
    note: "",
  };
}

beforeEach(() => {
  resetCheck();
  results.value = new Map();
  vi.clearAllMocks();
  // 默认 window.api.bulkUpgradeStart = vi.fn()
  globalThis.window = globalThis.window || {};
  window.api = { bulkUpgradeStart: vi.fn().mockResolvedValue(undefined) };
});

afterEach(() => {
  delete window.api;
});

describe("upgrade-actions.requestUpgrade", () => {
  it("有效 appName → 调 openBulkUpgrade + bulkUpgradeStart", async () => {
    results.value = new Map([["Codex", makeResult("Codex")]]);
    await requestUpgrade("Codex");

    expect(openBulkUpgrade).toHaveBeenCalledTimes(1);
    const opened = openBulkUpgrade.mock.calls[0][0];
    expect(Array.isArray(opened)).toBe(true);
    expect(opened.length).toBe(1);
    expect(opened[0].id).toBe("Codex");
    expect(opened[0].current).toBe("1.0.0");
    expect(opened[0].latest).toBe("2.0.0");

    expect(window.api.bulkUpgradeStart).toHaveBeenCalledTimes(1);
    const started = window.api.bulkUpgradeStart.mock.calls[0][0];
    expect(started.length).toBe(1);
    expect(started[0].name).toBe("Codex");
  });

  it("空 appName → 不调 openBulkUpgrade / bulkUpgradeStart", async () => {
    results.value = new Map([["Codex", makeResult("Codex")]]);
    await requestUpgrade("");

    expect(openBulkUpgrade).not.toHaveBeenCalled();
    expect(window.api.bulkUpgradeStart).not.toHaveBeenCalled();
  });
});
