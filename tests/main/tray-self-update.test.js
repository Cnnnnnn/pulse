/**
 * tests/main/tray-self-update.test.js
 *
 * P52: tray 菜单 self-update 条件行 + setSelfUpdateState 触发 rebuild.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const trayPath = require.resolve("../../src/main/tray.js");
const {
  createTrayManager,
  _internal,
} = require(trayPath);
const { buildMenu } = _internal;

describe("tray self-update 行", () => {
  it("无 selfUpdateState → 不出现 'Pulse 有新版' 行", () => {
    const menu = buildMenu({
      results: [],
      getConfig: () => ({ apps: [] }),
      getConfigPath: () => "",
    });
    const labels = menu.map((it) => it && it.label).filter(Boolean);
    expect(labels.find((l) => l.includes("Pulse 有新版"))).toBeUndefined();
  });

  it("selfUpdateState.available=false → 不出现 'Pulse 有新版' 行", () => {
    const menu = buildMenu({
      results: [],
      selfUpdateState: {
        available: false,
        version: "2.47.0",
        status: "idle",
      },
      getConfig: () => ({ apps: [] }),
    });
    const labels = menu.map((it) => it && it.label).filter(Boolean);
    expect(labels.find((l) => l.includes("Pulse 有新版"))).toBeUndefined();
  });

  it("available=true → 显示 'Pulse 有新版 vX.Y.Z' 行, 点击触发 onOpenPanel", () => {
    const onOpenPanel = vi.fn();
    const menu = buildMenu({
      results: [],
      selfUpdateState: {
        available: true,
        version: "2.47.0",
        status: "available",
      },
      getConfig: () => ({ apps: [] }),
      getConfigPath: () => "",
      onOpenPanel,
    });
    const row = menu.find(
      (it) => it && it.label && it.label.includes("Pulse 有新版 v2.47.0"),
    );
    expect(row).toBeDefined();
    expect(typeof row.click).toBe("function");
    row.click();
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
  });

  it("行在 stale 行之前 (Pulse 有新版 比 '7 天没新结果' 更靠前)", () => {
    const menu = buildMenu({
      results: [],
      selfUpdateState: { available: true, version: "9.9.9", status: "available" },
      staleNames: ["Slack"],
      getConfig: () => ({ apps: [] }),
      getConfigPath: () => "",
    });
    const labels = menu.map((it) => it && it.label).filter(Boolean);
    const idxSelf = labels.findIndex((l) => l.includes("Pulse 有新版"));
    const idxStale = labels.findIndex((l) => l.includes("7 天没新结果"));
    expect(idxSelf).toBeGreaterThanOrEqual(0);
    expect(idxStale).toBeGreaterThanOrEqual(0);
    expect(idxSelf).toBeLessThan(idxStale);
  });
});

describe("createTrayManager.setSelfUpdateState", () => {
  it("createTrayManager 暴露 setSelfUpdateState 方法", () => {
    // 不实际 install (需要完整 electron stub). 只验证 API surface.
    const tray = createTrayManager({
      getConfig: () => ({ apps: [] }),
      getConfigPath: () => "",
    });
    expect(typeof tray.setSelfUpdateState).toBe("function");
    // 调用一次不抛
    expect(() =>
      tray.setSelfUpdateState({
        available: true,
        version: "3.0.0",
        status: "available",
      }),
    ).not.toThrow();
  });
});
