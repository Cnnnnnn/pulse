/**
 * tests/renderer/nav-store-prefs.test.js
 *
 * Phase v1: navStore effect — 当前 activeNav 被 prefs 关掉时切到第一个可见 nav.
 *
 * 覆盖:
 *  - 默认 prefs 全开: activeNav 不变
 *  - 关 activeNav 对应 segment: 自动切到第一个可见 nav
 *  - activeNav 是固定 nav (ithome/funds/wechat-hot): 不动
 *  - 多个动态 nav 全关: 切到第一个固定 nav (ithome)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { signal } from "@preact/signals";
import {
  activeNav,
  setActiveNav,
  installNavWatch,
} from "../../src/renderer/worldcup/navStore.js";

// 直接 import trayConfigStore 控制其 signal (vitest 允许跨模块)
let trayMenuPrefsRef = null;
async function getTrayMenuPrefs() {
  if (!trayMenuPrefsRef) {
    const mod = await import("../../src/renderer/trayConfigStore.js");
    trayMenuPrefsRef = mod.trayMenuPrefs;
  }
  return trayMenuPrefsRef;
}

const ALL_ON = {
  version: 1,
  segments: {
    updates: true,
    ai_usage: true,
    worldcup: true,
    metals: true,
    check_action: true,
    config_action: true,
  },
};

const ALL_OFF = {
  version: 1,
  segments: {
    updates: false,
    ai_usage: false,
    worldcup: false,
    metals: false,
    check_action: false,
    config_action: false,
  },
};

async function applyPrefs(prefs) {
  const sig = await getTrayMenuPrefs();
  sig.value = prefs;
}

describe("navStore — tray menu prefs effect (Phase v1)", () => {
  beforeEach(async () => {
    activeNav.value = "versions";
    await applyPrefs(ALL_ON);
    installNavWatch(); // 幂等
  });

  it("全开 prefs → activeNav 不变", async () => {
    activeNav.value = "versions";
    // 给 effect 一个 microtask 让 signal 触发
    await new Promise((r) => setTimeout(r, 0));
    expect(activeNav.value).toBe("versions");
  });

  it("关 activeNav (versions) → 自动切到第一个可见 nav (ithome)", async () => {
    activeNav.value = "versions";
    await new Promise((r) => setTimeout(r, 0));
    await applyPrefs({
      ...ALL_ON,
      segments: { ...ALL_ON.segments, updates: false },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(activeNav.value).toBe("ithome");
  });

  it("关 ai-usage → 当前是 ai-usage 时切到第一个可见 nav", async () => {
    activeNav.value = "ai-usage";
    await new Promise((r) => setTimeout(r, 0));
    await applyPrefs({
      ...ALL_ON,
      segments: { ...ALL_ON.segments, ai_usage: false },
    });
    await new Promise((r) => setTimeout(r, 0));
    // 第一个可见的是 ithome (固定 nav)
    expect(activeNav.value).toBe("ithome");
  });

  it("activeNav 是固定 nav (funds) → 关任何动态 prefs 都不动", async () => {
    activeNav.value = "funds";
    await new Promise((r) => setTimeout(r, 0));
    await applyPrefs({
      ...ALL_ON,
      segments: { ...ALL_ON.segments, updates: false, ai_usage: false },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(activeNav.value).toBe("funds");
  });

  it("4 个动态全关,activeNav=versions → 切到 ithome", async () => {
    activeNav.value = "versions";
    await new Promise((r) => setTimeout(r, 0));
    await applyPrefs(ALL_OFF);
    await new Promise((r) => setTimeout(r, 0));
    expect(activeNav.value).toBe("ithome");
  });

  it("手动 setActiveNav 到一个被关的 nav 也会被 effect 弹回", async () => {
    await applyPrefs({
      ...ALL_ON,
      segments: { ...ALL_ON.segments, worldcup: false },
    });
    activeNav.value = "worldcup"; // 直接设,跳过 setActiveNav 校验
    await new Promise((r) => setTimeout(r, 0));
    expect(activeNav.value).not.toBe("worldcup");
  });
});
