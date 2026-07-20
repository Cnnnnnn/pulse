/**
 * tests/renderer/tray-config-store.test.js
 *
 * trayConfigStore — prefs signal + apply 函数.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  trayConfigOpen,
  trayMenuPrefs,
  openTrayConfig,
  closeTrayConfig,
  applyTrayPrefsFromMain,
} from "../../src/renderer/store/trayConfigStore.js";

const PREFS_ALL_ON = {
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

describe("trayConfigStore", () => {
  beforeEach(() => {
    trayConfigOpen.value = false;
    trayMenuPrefs.value = PREFS_ALL_ON;
  });

  it("trayConfigOpen 默认 false", () => {
    expect(trayConfigOpen.value).toBe(false);
  });

  it("openTrayConfig → true; closeTrayConfig → false", () => {
    openTrayConfig();
    expect(trayConfigOpen.value).toBe(true);
    closeTrayConfig();
    expect(trayConfigOpen.value).toBe(false);
  });

  it("applyTrayPrefsFromMain 合法 prefs → 更新 signal", () => {
    applyTrayPrefsFromMain({
      version: 1,
      segments: { ...PREFS_ALL_ON.segments, updates: false },
    });
    expect(trayMenuPrefs.value.segments.updates).toBe(false);
  });

  it("applyTrayPrefsFromMain 非法 (null / 非对象 / 缺 segments) → 不动 signal", () => {
    const before = trayMenuPrefs.value;
    applyTrayPrefsFromMain(null);
    expect(trayMenuPrefs.value).toBe(before);
    applyTrayPrefsFromMain({});
    expect(trayMenuPrefs.value).toBe(before);
    applyTrayPrefsFromMain({ segments: null });
    expect(trayMenuPrefs.value).toBe(before);
  });
});
