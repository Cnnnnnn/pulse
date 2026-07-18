/**
 * tests/renderer/games-store.test.js
 *
 * 游戏收集模块（阶段1）store 行为测试。
 * 覆盖：normalizeEntry 默认值 / 快捷收集 / 标签 / 文件夹 / 备注评分 /
 *       跨平台合并 round-trip / 统计 / 向后兼容。
 *
 * 纯本地：localStorage 用内存 mock，无网络。
 */

// @vitest-environment node

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";

// 内存版 localStorage（store 的 readStorage/writeStorage 走 globalThis.localStorage）
class MemStorage {
  constructor() {
    this.m = new Map();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

// 仅在本文件生命周期内挂载内存 localStorage，afterAll 还原 globalThis.localStorage
// 原值，避免污染同 worker 内后续测试文件（尤其是 happy-dom 环境的用例）。
const _origLocalStorage = globalThis.localStorage;
const _mem = new MemStorage();
beforeAll(() => {
  globalThis.localStorage = _mem;
});
afterAll(() => {
  globalThis.localStorage = _origLocalStorage;
});

import * as store from "../../src/renderer/games/gamesStore.js";
import { normalizeEntry, computeCollectionStats } from "../../src/renderer/games/types.js";

beforeEach(() => {
  globalThis.localStorage.clear();
  store.wishlist.value = [];
  store.folders.value = [];
  store.tags.value = [];
  store.activeCollectionFilter.value = { type: null, id: null };
  store.noteRatingTarget.value = null;
  store.mergeCandidateKeys.value = [];
  store.mergeIsUnknown.value = false;
  store.expandedMergeKey.value = null;
});

function entry(over = {}) {
  return normalizeEntry({
    key: over.key || "steam:1",
    platform: over.platform || "steam",
    id: over.id || "1",
    title: over.title || "Game",
    addedPrice: over.addedPrice ?? 0,
    currency: over.currency || "USD",
    currentPrice: over.currentPrice != null ? over.currentPrice : null,
    ...over,
  });
}

describe("normalizeEntry — 默认值单一真源", () => {
  it("旧条目缺字段补默认，不报错不丢数据", () => {
    const e = normalizeEntry({ key: "steam:9", platform: "steam", id: "9", title: "旧游戏", addedPrice: 10, currency: "USD" });
    expect(e.tags).toEqual([]);
    expect(e.folderId).toBeNull();
    expect(e.note).toBe("");
    expect(e.rating).toBe(0);
    expect(e.currentPrice).toBeNull();
    expect(e.mergedIds).toEqual([]);
    expect(e.mergedMembers).toBeNull();
    expect(e.addedPrice).toBe(10);
  });

  it("rating 越界被裁剪到 0–5", () => {
    expect(normalizeEntry({ rating: 9 }).rating).toBe(5);
    expect(normalizeEntry({ rating: -3 }).rating).toBe(0);
    expect(normalizeEntry({ rating: 3.6 }).rating).toBe(4);
    expect(normalizeEntry({}).rating).toBe(0);
  });
});

describe("快捷收集 (P0-3)", () => {
  it("toggleFavorite 写入并返回 true，再点移除返回 false（同 key 去重）", () => {
    const game = { platform: "steam", id: "x", title: "X", salePrice: 59.9, currency: "USD", thumb: null };
    expect(store.toggleFavorite(game)).toBe(true);
    expect(store.isInWishlist("steam:x")).toBe(true);
    expect(store.wishlist.value.length).toBe(1);
    expect(store.toggleFavorite(game)).toBe(false);
    expect(store.wishlist.value.length).toBe(0);
  });

  it("addToWishlist 写入 currentPrice = salePrice 与扩展字段", () => {
    store.addToWishlist({ platform: "epic", id: "e1", title: "E", salePrice: 12.5, currency: "USD" });
    const e = store.wishlist.value[0];
    expect(e.key).toBe("epic:e1");
    expect(e.currentPrice).toBe(12.5);
    expect(e.currentCurrency).toBe("USD");
    expect(e.tags).toEqual([]);
    expect(e.rating).toBe(0);
  });
});

describe("标签 (P0-2)", () => {
  it("addTag 去重返回同一 id", () => {
    const id1 = store.addTag("待玩");
    const id2 = store.addTag("待玩");
    expect(id1).toBe(id2);
    expect(store.tags.value.length).toBe(1);
  });

  it("renameTag 同步所有条目（旧标签消失）", () => {
    const id = store.addTag("待玩");
    store.wishlist.value = [entry({ key: "steam:1", tags: ["待玩"] })];
    store.renameTag("待玩", "想玩");
    expect(store.tags.value[0].name).toBe("想玩");
    expect(store.wishlist.value[0].tags).toEqual(["想玩"]);
    expect(store.wishlist.value[0].tags).not.toContain("待玩");
    expect(id).toBe(store.tags.value[0].id);
  });

  it("deleteTag 默认保留条目，仅移除标签", () => {
    store.addTag("tagA");
    store.wishlist.value = [entry({ key: "steam:1", tags: ["tagA"] })];
    store.deleteTag("tagA");
    expect(store.tags.value.length).toBe(0);
    expect(store.wishlist.value.length).toBe(1);
    expect(store.wishlist.value[0].tags).toEqual([]);
  });

  it("setEntryTags 去空去重", () => {
    store.wishlist.value = [entry({ key: "steam:1" })];
    store.setEntryTags("steam:1", ["a", "a", " ", "b"]);
    expect(store.wishlist.value[0].tags).toEqual(["a", "b"]);
  });
});

describe("文件夹 (P0-2)", () => {
  it("createFolder / renameFolder / setFolderTarget", () => {
    const id = store.createFolder("Roguelike");
    expect(store.folders.value[0].name).toBe("Roguelike");
    store.renameFolder(id, "Roguelike2");
    expect(store.folders.value[0].name).toBe("Roguelike2");
    store.setFolderTarget(id, 10);
    expect(store.folders.value[0].target).toBe(10);
    store.setFolderTarget(id, 0);
    expect(store.folders.value[0].target).toBeNull();
    store.setFolderTarget(id, -5);
    expect(store.folders.value[0].target).toBeNull();
  });

  it("setEntryFolder 移动；deleteFolder keep 清除 folderId 保留条目", () => {
    const id = store.createFolder("F");
    store.wishlist.value = [entry({ key: "steam:1" }), entry({ key: "steam:2" })];
    store.setEntryFolder("steam:1", id);
    expect(store.wishlist.value[0].folderId).toBe(id);
    store.deleteFolder(id, { mode: "keep" });
    expect(store.folders.value.length).toBe(0);
    expect(store.wishlist.value.length).toBe(2);
    expect(store.wishlist.value[0].folderId).toBeNull();
  });

  it("deleteFolder remove 一并移除条目", () => {
    const id = store.createFolder("F");
    store.wishlist.value = [entry({ key: "steam:1" }), entry({ key: "steam:2" })];
    store.setEntryFolder("steam:1", id);
    store.deleteFolder(id, { mode: "remove" });
    expect(store.wishlist.value.length).toBe(1);
    expect(store.wishlist.value[0].key).toBe("steam:2");
  });
});

describe("备注 / 评分 (P0-4)", () => {
  it("setNote / setRating（clamp 0–5）", () => {
    store.wishlist.value = [entry({ key: "steam:1" })];
    store.setNote("steam:1", "等史低");
    store.setRating("steam:1", 9);
    expect(store.wishlist.value[0].note).toBe("等史低");
    expect(store.wishlist.value[0].rating).toBe(5);
    store.setRating("steam:1", -2);
    expect(store.wishlist.value[0].rating).toBe(0);
  });
});

describe("统计 (P0-5)", () => {
  it("加入价 100/60/30 当前 80/60/20 → 总数3 总值160 省30", () => {
    store.wishlist.value = [
      entry({ key: "a", addedPrice: 100, currentPrice: 80 }),
      entry({ key: "b", addedPrice: 60, currentPrice: 60 }),
      entry({ key: "c", addedPrice: 30, currentPrice: 20 }),
    ];
    const s = store.collectionStats();
    expect(s.total).toBe(3);
    expect(s.totalValue).toBe(160);
    expect(s.totalSaved).toBe(30);
  });

  it("无当前价计入 addedPrice 且节省为 0", () => {
    store.wishlist.value = [entry({ key: "a", addedPrice: 50, currentPrice: null })];
    const s = store.collectionStats();
    expect(s.totalValue).toBe(50);
    expect(s.totalSaved).toBe(0);
  });
});

describe("跨平台合并 (P0-6)", () => {
  it("findMergeCandidates 命中映射且候选已存在", () => {
    store.wishlist.value = [
      entry({ key: "steam:steam-367520", platform: "steam", id: "steam-367520" }),
      entry({ key: "gog:1207664663", platform: "gog", id: "1207664663" }),
    ];
    expect(store.findMergeCandidates("steam:steam-367520")).toEqual(["gog:1207664663"]);
  });

  it("合并后条数 −1、mergedIds 含两条、可拆分还原", () => {
    store.wishlist.value = [
      entry({ key: "steam:steam-367520", platform: "steam", id: "steam-367520", addedPrice: 100, currentPrice: 80 }),
      entry({ key: "gog:1207664663", platform: "gog", id: "1207664663", addedPrice: 30, currentPrice: 20 }),
    ];
    const primary = store.mergeEntries(["steam:steam-367520", "gog:1207664663"]);
    expect(primary).toBe("steam:steam-367520");
    expect(store.wishlist.value.length).toBe(1);
    const p = store.wishlist.value[0];
    expect(p.mergedIds).toEqual(["steam:steam-367520", "gog:1207664663"]);
    expect(p.mergedMembers.length).toBe(2);
    // 合并条目统计按成员展开
    const s = store.collectionStats();
    expect(s.total).toBe(2);
    expect(s.totalValue).toBe(100);
    expect(s.totalSaved).toBe(30);

    // 拆分还原
    const ok = store.splitEntry("steam:steam-367520");
    expect(ok).toBe(true);
    expect(store.wishlist.value.length).toBe(2);
    expect(store.wishlist.value[0].mergedMembers).toBeNull();
    expect(store.wishlist.value[0].mergedIds).toEqual([]);
  });

  it("手动合并（未知映射）同样可合并与还原", () => {
    store.wishlist.value = [
      entry({ key: "steam:1", platform: "steam", id: "1" }),
      entry({ key: "epic:1", platform: "epic", id: "1" }),
    ];
    store.openMergeManual("steam:1");
    expect(store.mergeIsUnknown.value).toBe(true);
    expect(store.mergeCandidateKeys.value).toEqual(["steam:1"]);
    const primary = store.mergeEntries(["steam:1", "epic:1"]);
    expect(primary).toBe("steam:1");
    expect(store.wishlist.value.length).toBe(1);
    expect(store.splitEntry("steam:1")).toBe(true);
    expect(store.wishlist.value.length).toBe(2);
  });
});

describe("currentPriceOf / savedOf", () => {
  it("无当前价回退 addedPrice；有当前价算节省", () => {
    expect(store.currentPriceOf({ addedPrice: 50, currentPrice: null })).toBe(50);
    expect(store.savedOf({ addedPrice: 50, currentPrice: null })).toBe(0);
    expect(store.currentPriceOf({ addedPrice: 50, currentPrice: 30 })).toBe(30);
    expect(store.savedOf({ addedPrice: 50, currentPrice: 30 })).toBe(20);
  });
  it("合并成员可独立读取价格/节省", () => {
    const m = { addedPrice: 100, currentPrice: 80 };
    expect(store.currentPriceOf(m)).toBe(80);
    expect(store.savedOf(m)).toBe(20);
  });
});

describe("computeCollectionStats 纯函数", () => {
  it("合并条目按成员展开（无当前价成员回退 addedPrice、节省为 0）", () => {
    const entries = [
      {
        mergedMembers: [
          { addedPrice: 10, currentPrice: 8 },
          { addedPrice: 20, currentPrice: null },
        ],
      },
    ];
    const s = computeCollectionStats(entries);
    expect(s.total).toBe(2);
    expect(s.totalValue).toBe(28); // 8 + 20（null 回退 addedPrice）
    expect(s.totalSaved).toBe(2); // (10-8) + 0
  });
});

describe("持久化 / 向后兼容", () => {
  it("loadWishlist 读取旧数据并归一化，损坏数据回退空", () => {
    globalThis.localStorage.setItem(
      "pulse.games.wishlist.v1",
      JSON.stringify([{ key: "steam:1", platform: "steam", id: "1", title: "Old", addedPrice: 5, currency: "USD" }]),
    );
    store.loadWishlist();
    expect(store.wishlist.value.length).toBe(1);
    expect(store.wishlist.value[0].tags).toEqual([]);
    expect(store.wishlist.value[0].rating).toBe(0);

    globalThis.localStorage.setItem("pulse.games.wishlist.v1", "{not json");
    store.loadWishlist();
    expect(store.wishlist.value).toEqual([]);
  });

  it("collectionFilter 持久化：setCollectionFilter 后 loadCollectionFilter 恢复", () => {
    const id = store.createFolder("F");
    store.setCollectionFilter("folder", id);
    store.loadFolders();
    store.loadCollectionFilter();
    expect(store.activeCollectionFilter.value).toEqual({ type: "folder", id });
  });
});
