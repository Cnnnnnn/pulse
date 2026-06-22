/**
 * tests/renderer/twitter-serenity/nav-wiring.test.jsx
 *
 * Task 12: 验证 SideNav 含 serenity 项 + navStore NAV_KEYS 含 'serenity' + store signals 可用.
 */

// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Task 12 nav wiring", () => {
  it("navStore.js NAV_KEYS 含 'serenity'", () => {
    const code = fs.readFileSync(
      path.resolve("src/renderer/worldcup/navStore.js"),
      "utf8",
    );
    expect(code).toMatch(/"serenity"/);
  });

  it("navStore setActiveNav('serenity') 不被 guard 拦", async () => {
    // navStore.js 是 ESM, 用 dynamic import
    const { activeNav, setActiveNav } = await import(
      "../../../src/renderer/worldcup/navStore.js"
    );
    const prev = activeNav.value;
    setActiveNav("serenity");
    expect(activeNav.value).toBe("serenity");
    setActiveNav(prev);
  });

  it("SideNav.jsx NAV_ITEMS 含 serenity 项 (ai-usage 之后, versions 之前)", () => {
    const code = fs.readFileSync(
      path.resolve("src/renderer/components/SideNav.jsx"),
      "utf8",
    );
    expect(code).toMatch(/key: 'serenity'/);
    expect(code).toMatch(/icon: '🐦'/);
    // 顺序: serenity 在 ai-usage 之后
    const aiIdx = code.indexOf("key: 'ai-usage'");
    const serIdx = code.indexOf("key: 'serenity'");
    const verIdx = code.indexOf("key: 'versions'");
    expect(aiIdx).toBeGreaterThan(-1);
    expect(serIdx).toBeGreaterThan(aiIdx);
    expect(verIdx).toBeGreaterThan(serIdx);
  });

  it("store.js 导出 6 个 signal + resetSerenityStore", async () => {
    const store = await import("../../../src/renderer/twitter-serenity/store.js");
    expect(store.serenityTweets).toBeTruthy();
    expect(store.serenityLoading).toBeTruthy();
    expect(store.serenityError).toBeTruthy();
    expect(store.serenityLastFetchedAt).toBeTruthy();
    expect(store.serenityDegraded).toBeTruthy();
    expect(store.serenitySources).toBeTruthy();
    expect(typeof store.resetSerenityStore).toBe("function");
    // reset 不抛
    expect(() => store.resetSerenityStore()).not.toThrow();
  });
});
