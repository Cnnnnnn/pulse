/**
 * tests/renderer/ai-leaderboard-text-categories.test.tsx
 *
 * 文本榜 category 子榜切换（v2.8x）行为测试（vitest + happy-dom，纯本地）。
 * 覆盖：默认 overall 排序、切 coding 重排+过滤无 coding 的模型、columnValue 读选中 category。
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/renderer/api.ts", () => ({
  api: {
    getLeaderboard: vi.fn(async () => ({ ok: true, items: [], sources: {}, attribution: [], stale: false, fromCache: false, fetchedAt: null, count: 0 })),
    refreshLeaderboard: vi.fn(async () => ({ ok: true, items: [], sources: {}, attribution: [], stale: false, fromCache: false, fetchedAt: null, count: 0 })),
  },
}));

import * as store from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.ts";
import { TEXT_CATEGORIES, TEXT_CATEGORY_DEFAULT } from "../../src/renderer/ai-leaderboard/types.ts";

/** 构造带 categories map 的 text 模型。 */
function mkText(id: string, name: string, overall: number, coding?: number) {
  const categories: Record<string, any> = { overall: { rank: 1, score: overall, ci: 5, votes: 1000 } };
  if (coding != null) categories.coding = { rank: 1, score: coding, ci: 6, votes: 500 };
  return {
    id, name, vendor: "other", vendorRaw: null, category: "llm", license: null,
    arena: { text: { rank: 1, score: overall, ci: 5, votes: 1000, categories } },
    aa: null, openrouter: null, livebench: null, modelsdev: null, huggingface: null,
    sources: { arena: "live", aa: "none", openrouter: "none" }, isSample: false, fetchedAt: null,
  };
}

const A = mkText("a", "Alpha", 1500, 1560); // overall 1500, coding 1560
const B = mkText("b", "Beta", 1520);        // overall 1520, 无 coding

beforeEach(() => {
  localStorage.clear();
  store.activeView.value = "arena";
  store.activeBoard.value = "text";
  store.activeTextCat.value = TEXT_CATEGORY_DEFAULT;
  store.sortDir.value = "desc";
  store.sortKey.value = null;
  store.activeVendor.value = "all";
  store.licenseFilter.value = "all";
  store.searchQuery.value = "";
  store.items.value = [];
});

describe("文本榜 category 子榜切换", () => {
  it("默认按 overall 排序（B 1520 > A 1500）", () => {
    store.items.value = [A, B];
    const rows = store.getDisplayed();
    expect(rows.map((r: any) => r.id)).toEqual(["b", "a"]);
  });

  it("切到 coding 后按 coding 排序，且过滤掉无 coding 的模型", () => {
    store.items.value = [A, B];
    store.setTextCat("coding");
    expect(store.activeTextCat.value).toBe("coding");
    const rows = store.getDisplayed();
    // B 无 coding → 被过滤；只剩 A
    expect(rows.map((r: any) => r.id)).toEqual(["a"]);
  });

  it("columnValue elo 在 text board 下随选中 category 变化", () => {
    expect(store.columnValue(A, "arena", "elo")).toBe(1500); // overall
    store.activeTextCat.value = "coding";
    expect(store.columnValue(A, "arena", "elo")).toBe(1560); // coding
    expect(store.columnValue(B, "arena", "elo")).toBe(null);  // B 无 coding
  });

  it("columnValue votes 在 text board 下读选中 category 的 votes", () => {
    store.activeTextCat.value = "overall";
    expect(store.columnValue(A, "arena", "votes")).toBe(1000);
    store.activeTextCat.value = "coding";
    expect(store.columnValue(A, "arena", "votes")).toBe(500);
  });

  it("TEXT_CATEGORIES 含 6 个 category，默认 overall", () => {
    expect(TEXT_CATEGORIES.map((c: any) => c.key)).toEqual([
      "overall", "coding", "math", "hard", "instruction_following", "non_english",
    ]);
    expect(TEXT_CATEGORY_DEFAULT).toBe("overall");
  });
});
