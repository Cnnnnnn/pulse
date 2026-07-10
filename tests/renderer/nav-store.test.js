/**
 * tests/renderer/nav-store.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  activeNav,
  setActiveNav,
} from "../../src/renderer/worldcup/navStore.js";

describe("navStore", () => {
  beforeEach(() => {
    activeNav.value = "versions";
  });

  it("setActiveNav accepts news (P-N 合并 ithome + wechat-hot)", () => {
    setActiveNav("news");
    expect(activeNav.value).toBe("news");
  });

  it("setActiveNav aliases wechat-hot → news (向后兼容)", () => {
    setActiveNav("wechat-hot");
    expect(activeNav.value).toBe("news");
  });

  it("setActiveNav aliases ithome → news (向后兼容)", () => {
    setActiveNav("ithome");
    expect(activeNav.value).toBe("news");
  });

  it("setActiveNav ignores unknown keys", () => {
    setActiveNav("unknown");
    expect(activeNav.value).toBe("versions");
  });
});
