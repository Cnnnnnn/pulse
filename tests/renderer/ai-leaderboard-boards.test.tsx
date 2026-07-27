/**
 * tests/renderer/ai-leaderboard-boards.test.tsx
 *
 * 其余 5 个新 arena（document / search / image-edit / image-to-video / video-edit）
 * 作为可点选 tab 暴露（v2.8x follow-up）。它们用 flat score，复用 text 排序路径。
 * 纯本地（mock api），验证：ARENA_BOARDS 注册、getDisplayed 按 board 切片过滤、列值读取。
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
import { ARENA_BOARDS, ARENA_BOARD_KEYS, ARENA_CATEGORIES, boardsOfCategory, categoryOfBoard, uiCategoryOfBoard, toIpcParams } from "../../src/renderer/ai-leaderboard/types.ts";

function mk(id: string, arenaSlice: Record<string, any>) {
  return {
    id, name: id, vendor: "other", vendorRaw: null, category: "llm", license: null,
    arena: arenaSlice, aa: null, openrouter: null, livebench: null, modelsdev: null, huggingface: null,
    sources: { arena: "live", aa: "none", openrouter: "none" }, isSample: false, fetchedAt: null,
  };
}

beforeEach(() => {
  localStorage.clear();
  store.activeView.value = "arena";
  store.activeBoard.value = "text";
  store.activeAgentDim.value = "Net Improvement";
  store.sortDir.value = "desc";
  store.sortKey.value = null;
  store.activeVendor.value = "all";
  store.licenseFilter.value = "all";
  store.searchQuery.value = "";
  store.items.value = [];
});

describe("ARENA_BOARDS 注册（5 个新 arena）", () => {
  it("document/search/image-edit/image-to-video/video-edit 均已注册且 key 与 fetcher board 名一致", () => {
    expect(ARENA_BOARDS.document).toEqual({ key: "document", label: "Document", category: "llm" });
    expect(ARENA_BOARDS.search).toEqual({ key: "search", label: "Search", category: "llm" });
    expect(ARENA_BOARDS["image-edit"]).toEqual({ key: "image-edit", label: "Image Edit", category: "image" });
    expect(ARENA_BOARDS["image-to-video"]).toEqual({ key: "image-to-video", label: "Image-to-Video", category: "video" });
    expect(ARENA_BOARDS["video-edit"]).toEqual({ key: "video-edit", label: "Video Edit", category: "video" });
  });

  it("ARENA_BOARD_KEYS 共 11 个，agent 在首位，image 在 code 之后", () => {
    expect(ARENA_BOARD_KEYS.length).toBe(11);
    expect(ARENA_BOARD_KEYS.indexOf("agent")).toBe(0);
    expect(ARENA_BOARD_KEYS.indexOf("image")).toBeGreaterThan(ARENA_BOARD_KEYS.indexOf("code"));
  });

  it("toIpcParams 对新 board 返回正确 IPC category（llm/image/video 复用 text 通道）", () => {
    expect(toIpcParams("arena", "document")).toEqual({ category: "llm", dimension: "elo" });
    expect(toIpcParams("arena", "image-edit")).toEqual({ category: "image", dimension: "elo" });
    expect(toIpcParams("arena", "video-edit")).toEqual({ category: "video", dimension: "elo" });
  });
});

describe("新 board 按切片过滤 + flat 列值", () => {
  it("getDisplayed 对 document board 仅保留有 arena.document.score 的模型", () => {
    const withDoc = mk("d1", { document: { rank: 1, score: 1200, ci: 4, votes: 300 } });
    const onlyText = mk("t1", { text: { rank: 1, score: 1400, ci: 5, votes: 900 } });
    store.items.value = [withDoc, onlyText];
    store.activeBoard.value = "document";
    const rows = store.getDisplayed();
    expect(rows.map((r: any) => r.id)).toEqual(["d1"]);
  });

  it("columnValue 对 flat board 返回 score / ci / votes", () => {
    store.activeBoard.value = "document";
    const m = mk("d1", { document: { rank: 1, score: 1200, ci: 4, votes: 300 } });
    expect(store.columnValue(m, "arena", "elo")).toBe(1200);
    expect(store.columnValue(m, "arena", "ci")).toBe(4);
    expect(store.columnValue(m, "arena", "votes")).toBe(300);
  });

  it("切到 video-edit 后按 arena.video-edit.score 降序排序", () => {
    const a = mk("a", { "video-edit": { rank: 1, score: 1100, ci: 3, votes: 50 } });
    const b = mk("b", { "video-edit": { rank: 2, score: 1300, ci: 3, votes: 80 } });
    store.items.value = [a, b];
    store.activeBoard.value = "video-edit";
    const rows = store.getDisplayed();
    expect(rows.map((r: any) => r.id)).toEqual(["b", "a"]);
  });
});

describe("5 大类分组（对齐 arena.ai 官网：Agent / Chat / Code / Image / Video）", () => {
  it("ARENA_CATEGORIES 共 5 个，key 为 agent/chat/code/image/video", () => {
    expect(ARENA_CATEGORIES.map((c: any) => c.key)).toEqual(["agent", "chat", "code", "image", "video"]);
  });

  it("boardsOfCategory 返回各类的二级榜（Chat 含 Text+Search+Vision+Document）", () => {
    expect(boardsOfCategory("agent")).toEqual(["agent"]);
    expect(boardsOfCategory("chat")).toEqual(["text", "search", "vision", "document"]);
    expect(boardsOfCategory("code")).toEqual(["code"]);
    expect(boardsOfCategory("image")).toEqual(["image", "image-edit"]);
    expect(boardsOfCategory("video")).toEqual(["video", "image-to-video", "video-edit"]);
  });

  it("boardsOfCategory 对非法 key 回退到首个大类", () => {
    expect(boardsOfCategory("nope")).toEqual(boardsOfCategory("agent"));
  });

  it("uiCategoryOfBoard 返回 board 所属 UI 大类（与 IPC category 独立）", () => {
    expect(uiCategoryOfBoard("text")).toBe("chat");
    expect(uiCategoryOfBoard("vision")).toBe("chat");
    expect(uiCategoryOfBoard("agent")).toBe("agent");
    expect(uiCategoryOfBoard("image-edit")).toBe("image");
    expect(uiCategoryOfBoard("video-edit")).toBe("video");
  });

  it("categoryOfBoard 返回 IPC category（用于 toIpcParams，与 UI 大类独立）", () => {
    expect(categoryOfBoard("image-edit")).toBe("image");
    expect(categoryOfBoard("video-edit")).toBe("video");
    expect(categoryOfBoard("agent")).toBe("llm");
    expect(categoryOfBoard("vision")).toBe("multimodal");
  });

  it("setCategory 切到该类默认 board；切到已含当前 board 的类是 no-op", () => {
    store.activeBoard.value = "text"; // chat
    store.setCategory("image");
    expect(store.activeBoard.value).toBe("image"); // image 类首 board
    // 切到 image-edit 后再切 image 类 → 已在该类，不强制回 image
    store.activeBoard.value = "image-edit";
    store.setCategory("image");
    expect(store.activeBoard.value).toBe("image-edit");
    expect(store.activeCategory()).toBe("image");
  });
});
