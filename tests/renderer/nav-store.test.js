/**
 * tests/renderer/nav-store.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  activeNav,
  investPrimary,
  goInvest,
  setInvestPrimary,
  setActiveNav,
} from "../../src/renderer/worldcup/navStore.js";

describe("navStore", () => {
  beforeEach(() => {
    activeNav.value = "versions";
    investPrimary.value = "funds";
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

  it("legacy funds/metals/stocks alias to 'invest' (投资 nav 合并)", () => {
    setActiveNav("funds");
    expect(activeNav.value).toBe("invest");
    setActiveNav("metals");
    expect(activeNav.value).toBe("invest");
    setActiveNav("stocks");
    expect(activeNav.value).toBe("invest");
  });
});

describe("invest nav merge", () => {
  beforeEach(() => {
    activeNav.value = "home";
    investPrimary.value = "funds";
  });

  it("goInvest sets primary + active", () => {
    goInvest("metals");
    expect(activeNav.value).toBe("invest");
    expect(investPrimary.value).toBe("metals");
  });

  it("goInvest default to funds when no arg", () => {
    goInvest();
    expect(activeNav.value).toBe("invest");
    expect(investPrimary.value).toBe("funds");
  });

  it("setInvestPrimary accepts funds/metals/stocks", () => {
    setInvestPrimary("metals");
    expect(investPrimary.value).toBe("metals");
    setInvestPrimary("stocks");
    expect(investPrimary.value).toBe("stocks");
    setInvestPrimary("funds");
    expect(investPrimary.value).toBe("funds");
  });

  it("setInvestPrimary ignores unknown keys", () => {
    setInvestPrimary("news");
    expect(investPrimary.value).toBe("funds");
    setInvestPrimary("nope");
    expect(investPrimary.value).toBe("funds");
  });
});
