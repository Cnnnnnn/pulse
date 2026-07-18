// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  // 信号
  wishlist,
  folders,
  tags,
  activeCollectionFilter,
  noteRatingTarget,
  mergeCandidateKeys,
  expandedMergeKey,
  // 加载 / 持久化
  loadWishlist,
  loadFolders,
  loadTags,
  loadCollectionFilter,
  setCollectionFilter,
  // 标签
  addTag,
  renameTag,
  deleteTag,
  // 文件夹
  createFolder,
  renameFolder,
  setFolderTarget,
  deleteFolder,
  // 条目标注
  setEntryTags,
  setEntryFolder,
  setNote,
  setRating,
  // 快捷收集
  addToWishlist,
  toggleFavorite,
  // 去重
  findMergeCandidates,
  mergeEntries,
  splitEntry,
  areCandidatesKnown,
  // 选择器
  currentPriceOf,
  savedOf,
  collectionStats,
  // 弹窗信号
  openNoteRating,
  closeNoteRating,
  openMerge,
  closeMerge,
  toggleExpandMerge,
} from "../../src/renderer/games/gamesStore.js";
import { normalizeEntry } from "../../src/renderer/games/types.js";
import { areSameGame, findMergeCandidates as staticCandidates } from "../../src/renderer/games/gameIdMap.js";
import { h } from "preact";
import { render, screen, cleanup } from "@testing-library/preact";
import { ProgressBar } from "../../src/renderer/games/ProgressBar.jsx";
import { CollectionSidebar } from "../../src/renderer/games/CollectionSidebar.jsx";

function resetAll() {
  wishlist.value = [];
  folders.value = [];
  tags.value = [];
  activeCollectionFilter.value = { type: null, id: null };
  noteRatingTarget.value = null;
  mergeCandidateKeys.value = [];
  expandedMergeKey.value = null;
  localStorage.clear();
}

/** 构造一条规整的收藏条目（用于统计/合并测试）。 */
function mkEntry(key, addedPrice, currentPrice) {
  const [platform, id] = key.split(":");
  return normalizeEntry({
    key,
    platform,
    id,
    title: key,
    addedPrice,
    currency: "USD",
    currentPrice,
  });
}

beforeEach(() => {
  resetAll();
});
afterEach(() => {
  cleanup();
  resetAll();
});

describe("normalizeEntry 向后兼容（缺字段补默认）", () => {
  it("旧 wishlist 条目补齐全新字段，不报错不丢数据", () => {
    const e = normalizeEntry({
      key: "steam:1",
      platform: "steam",
      id: "1",
      title: "Old Game",
      addedPrice: 10,
      currency: "USD",
      addedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(e.tags).toEqual([]);
    expect(e.folderId).toBeNull();
    expect(e.note).toBe("");
    expect(e.rating).toBe(0);
    expect(e.currentPrice).toBeNull();
    expect(e.mergedIds).toEqual([]);
    expect(e.mergedMembers).toBeNull();
    expect(e.title).toBe("Old Game");
    expect(e.addedPrice).toBe(10);
  });

  it("rating 越界被 clamp 到 0–5", () => {
    expect(normalizeEntry({ rating: 9 }).rating).toBe(5);
    expect(normalizeEntry({ rating: -3 }).rating).toBe(0);
    expect(normalizeEntry({ rating: "x" }).rating).toBe(0);
  });

  it("非对象返回安全空条目", () => {
    const e = normalizeEntry(null);
    expect(e.key).toBe("");
    expect(e.tags).toEqual([]);
  });
});

describe("文件夹 / 标签 持久化与 CRUD", () => {
  it("loadFolders / loadTags 往返（损坏数据回退空）", () => {
    localStorage.setItem(
      "pulse.games.folders.v1",
      JSON.stringify([{ id: "f1", name: "Roguelike", target: 5, createdAt: "", order: 0 }]),
    );
    localStorage.setItem(
      "pulse.games.tags.v1",
      JSON.stringify([{ id: "t1", name: "待玩", createdAt: "" }]),
    );
    loadFolders();
    loadTags();
    expect(folders.value[0].name).toBe("Roguelike");
    expect(folders.value[0].target).toBe(5);
    expect(tags.value[0].name).toBe("待玩");

    localStorage.setItem("pulse.games.folders.v1", "{bad");
    loadFolders();
    expect(folders.value).toEqual([]);
  });

  it("addTag 按名去重；renameTag 同步关联条目", () => {
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    addTag("待玩");
    setEntryTags("steam:s1", ["待玩"]);
    expect(tags.value.map((t) => t.name)).toContain("待玩");
    expect(wishlist.value[0].tags).toEqual(["待玩"]);

    renameTag("待玩", "想玩");
    expect(tags.value.map((t) => t.name)).toContain("想玩");
    expect(tags.value.map((t) => t.name)).not.toContain("待玩");
    expect(wishlist.value[0].tags).toEqual(["想玩"]);
  });

  it("deleteTag 默认剥离标签、保留条目", () => {
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    setEntryTags("steam:s1", ["待玩"]);
    deleteTag("待玩");
    expect(tags.value.find((t) => t.name === "待玩")).toBeUndefined();
    expect(wishlist.value[0].tags).toEqual([]);
    expect(wishlist.value).toHaveLength(1);
  });

  it("createFolder/renameFolder/setFolderTarget(n<=0→null)/deleteFolder", () => {
    const fid = createFolder("Roguelike");
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    expect(folders.value[0].name).toBe("Roguelike");
    renameFolder(fid, "Roguelike2");
    expect(folders.value[0].name).toBe("Roguelike2");
    setFolderTarget(fid, 10);
    expect(folders.value[0].target).toBe(10);
    setFolderTarget(fid, 0);
    expect(folders.value[0].target).toBeNull();

    // 放入条目后删除：keep 保留条目、置 folderId=null
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    setEntryFolder("steam:s1", fid);
    deleteFolder(fid, { mode: "keep" });
    expect(folders.value.find((f) => f.id === fid)).toBeUndefined();
    expect(wishlist.value[0].folderId).toBeNull();
    expect(wishlist.value).toHaveLength(1);
  });

  it("deleteFolder mode=remove 一并移除条目", () => {
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    const fid = createFolder("X");
    setEntryFolder("steam:s1", fid);
    deleteFolder(fid, { mode: "remove" });
    expect(wishlist.value).toHaveLength(0);
  });
});

describe("条目标注", () => {
  beforeEach(() => {
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
  });

  it("setEntryTags 去空去重并赋值（标签元数据需先 addTag 建立）", () => {
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    addTag("新标签");
    setEntryTags("steam:s1", ["新标签"]);
    expect(tags.value.map((t) => t.name)).toContain("新标签");
    expect(wishlist.value[0].tags).toEqual(["新标签"]);
  });

  it("setNote / setRating（clamp）", () => {
    setNote("steam:s1", "等史低");
    expect(wishlist.value[0].note).toBe("等史低");
    setRating("steam:s1", 4);
    expect(wishlist.value[0].rating).toBe(4);
    setRating("steam:s1", 99);
    expect(wishlist.value[0].rating).toBe(5);
    setRating("steam:s1", -1);
    expect(wishlist.value[0].rating).toBe(0);
  });
});

describe("快捷收集 toggleFavorite", () => {
  const g = { platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" };
  it("未收藏→收藏返回 true；再点→移除返回 false；同 key 不重复", () => {
    expect(toggleFavorite(g)).toBe(true);
    expect(wishlist.value).toHaveLength(1);
    expect(toggleFavorite(g)).toBe(false);
    expect(wishlist.value).toHaveLength(0);
    // 再次收藏：同 key 去重，仍为 1 条（不重复）
    expect(toggleFavorite(g)).toBe(true);
    expect(wishlist.value).toHaveLength(1);
  });
});

describe("跨平台去重 / 合并 / 拆分", () => {
  it("areSameGame 基于静态映射判定", () => {
    expect(areSameGame("steam:steam-367520", "switch:hollow-knight")).toBe(true);
    expect(areSameGame("steam:steam-367520", "steam:steam-413150")).toBe(false);
  });

  it("findMergeCandidates 仅返回当前 wishlist 中存在的候选", () => {
    addToWishlist({ platform: "steam", id: "steam-367520", title: "HK", salePrice: 20, currency: "USD" });
    addToWishlist({ platform: "switch", id: "hollow-knight", title: "HK Switch", salePrice: 25, currency: "USD" });
    const cands = findMergeCandidates("steam:steam-367520");
    expect(cands).toContain("switch:hollow-knight");
    // 静态表其余候选（epic/gog）当前不在 wishlist → 不返回
    expect(cands).not.toContain("epic:epic-hollowknight");
  });

  it("mergeEntries → mergedIds 含两条、总条数 −1、mergedMembers 全量快照", () => {
    addToWishlist({ platform: "steam", id: "steam-367520", title: "HK", salePrice: 20, currency: "USD" });
    addToWishlist({ platform: "switch", id: "hollow-knight", title: "HK Switch", salePrice: 25, currency: "USD" });
    const ok = mergeEntries(["steam:steam-367520", "switch:hollow-knight"]);
    expect(ok).toBe("steam:steam-367520"); // 返回主记录 key
    expect(wishlist.value).toHaveLength(1);
    const primary = wishlist.value[0];
    expect(primary.mergedIds).toEqual(["steam:steam-367520", "switch:hollow-knight"]);
    expect(primary.mergedMembers).toHaveLength(2);
    expect(primary.mergedMembers.find((m) => m.isPrimary).key).toBe("steam:steam-367520");
    expect(primary.title).toBe("HK"); // 主记录沿用首个 key 的标题
  });

  it("splitEntry → 恢复两条、总条数 +1、mergedMembers 清空", () => {
    addToWishlist({ platform: "steam", id: "steam-367520", title: "HK", salePrice: 20, currency: "USD" });
    addToWishlist({ platform: "switch", id: "hollow-knight", title: "HK Switch", salePrice: 25, currency: "USD" });
    mergeEntries(["steam:steam-367520", "switch:hollow-knight"]);
    expect(wishlist.value).toHaveLength(1);
    const split = splitEntry("steam:steam-367520");
    expect(split).toBe(true);
    expect(wishlist.value).toHaveLength(2);
    expect(wishlist.value[0].mergedMembers).toBeNull();
    expect(wishlist.value[0].mergedIds).toEqual([]);
  });

  it("合并/拆分 round-trip 落盘重启保持", () => {
    addToWishlist({ platform: "steam", id: "steam-367520", title: "HK", salePrice: 20, currency: "USD" });
    addToWishlist({ platform: "switch", id: "hollow-knight", title: "HK Switch", salePrice: 25, currency: "USD" });
    mergeEntries(["steam:steam-367520", "switch:hollow-knight"]);
    const persisted = JSON.parse(localStorage.getItem("pulse.games.wishlist.v1"));
    expect(persisted).toHaveLength(1);
    expect(persisted[0].mergedIds).toHaveLength(2);

    // 模拟重启：重新 loadWishlist
    wishlist.value = [];
    loadWishlist();
    expect(wishlist.value).toHaveLength(1);
    expect(wishlist.value[0].mergedMembers).toHaveLength(2);
    splitEntry("steam:steam-367520");
    expect(wishlist.value).toHaveLength(2);
  });

  it("areCandidatesKnown：全命中静态映射为已知；否则未知", () => {
    expect(areCandidatesKnown(["steam:steam-367520", "switch:hollow-knight"])).toBe(true);
    expect(areCandidatesKnown(["steam:steam-367520", "steam:steam-413150"])).toBe(false);
  });
});

describe("统计（P0-5）", () => {
  it("加入价 100/60/30 当前 80/60/20 → 总数3、总值160、省30", () => {
    wishlist.value = [
      mkEntry("steam:a", 100, 80),
      mkEntry("steam:b", 60, 60),
      mkEntry("steam:c", 30, 20),
    ];
    const s = collectionStats();
    expect(s.total).toBe(3);
    expect(s.totalValue).toBeCloseTo(160);
    expect(s.totalSaved).toBeCloseTo(30);
  });

  it("无当前价时按 addedPrice 计，节省为 0", () => {
    wishlist.value = [mkEntry("steam:a", 100, null)];
    const s = collectionStats();
    expect(s.totalValue).toBe(100);
    expect(s.totalSaved).toBe(0);
  });

  it("合并条目按 mergedMembers 展开累加", () => {
    const a = mkEntry("steam:steam-367520", 20, 15);
    const b = mkEntry("switch:hollow-knight", 25, 18);
    b.mergedIds = ["steam:steam-367520", "switch:hollow-knight"];
    b.mergedMembers = [
      { key: "steam:steam-367520", platform: "steam", id: "steam-367520", title: "HK", thumb: null, addedPrice: 20, currency: "USD", currentPrice: 15, currentCurrency: "USD", isPrimary: true },
      { key: "switch:hollow-knight", platform: "switch", id: "hollow-knight", title: "HK Switch", thumb: null, addedPrice: 25, currency: "USD", currentPrice: 18, currentCurrency: "USD", isPrimary: false },
    ];
    wishlist.value = [a, b];
    const s = collectionStats();
    expect(s.total).toBe(3); // 1 普通 + 合并展开 2 成员
    expect(s.totalValue).toBeCloseTo(15 + 15 + 18);
  });
});

describe("选择器 currentPriceOf / savedOf", () => {
  it("currentPrice 优先，缺省回退 addedPrice", () => {
    expect(currentPriceOf(mkEntry("s:a", 10, 8))).toBe(8);
    expect(currentPriceOf(mkEntry("s:a", 10, null))).toBe(10);
  });
  it("savedOf = max(0, 加入价 − 当前价)", () => {
    expect(savedOf(mkEntry("s:a", 100, 80))).toBe(20);
    expect(savedOf(mkEntry("s:a", 100, 120))).toBe(0);
  });
});

describe("弹窗 / 展开 信号动作", () => {
  it("openNoteRating / closeNoteRating", () => {
    openNoteRating("steam:s1");
    expect(noteRatingTarget.value).toBe("steam:s1");
    closeNoteRating();
    expect(noteRatingTarget.value).toBeNull();
  });
  it("openMerge / closeMerge / toggleExpandMerge", () => {
    openMerge(["steam:s1", "switch:s1"]);
    expect(mergeCandidateKeys.value).toEqual(["steam:s1", "switch:s1"]);
    closeMerge();
    expect(mergeCandidateKeys.value).toEqual([]);
    toggleExpandMerge("steam:s1");
    expect(expandedMergeKey.value).toBe("steam:s1");
    toggleExpandMerge("steam:s1");
    expect(expandedMergeKey.value).toBeNull();
  });
});

describe("收藏筛选持久化", () => {
  it("setCollectionFilter 落盘，loadCollectionFilter 还原并归一化", () => {
    setCollectionFilter({ type: "folder", id: "f1" });
    expect(JSON.parse(localStorage.getItem("pulse.games.collectionFilter.v1"))).toEqual({
      type: "folder",
      id: "f1",
    });
    // 损坏数据回退不过滤
    localStorage.setItem("pulse.games.collectionFilter.v1", "{bad");
    loadCollectionFilter();
    expect(activeCollectionFilter.value).toEqual({ type: null, id: null });
  });
});

describe("ProgressBar（P0-1 进度可视化）", () => {
  it("percent=40 → aria-valuenow=40 且填充宽 40%（=容器×0.4）", () => {
    const { container } = render(h(ProgressBar, { percent: 40, label: "4 / 10" }));
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    const fill = container.querySelector(".collection-progress__fill");
    expect(fill.style.width).toBe("40%");
  });

  it("未设目标（percent 为 null）→ 无 aria-valuenow、填充宽 0%", () => {
    const { container } = render(h(ProgressBar, { label: "4 款" }));
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    const fill = container.querySelector(".collection-progress__fill");
    expect(fill.style.width).toBe("0%");
  });

  it("percent 越界被裁剪到 [0,100]", () => {
    const { container } = render(h(ProgressBar, { percent: 140 }));
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    const fill = container.querySelector(".collection-progress__fill");
    expect(fill.style.width).toBe("100%");
  });
});

describe("CollectionSidebar（P0-1 进度% / P0-2 侧栏计数）", () => {
  it("文件夹目标 N=10 且含 4 款 → 显 4/10 且进度条 40%", () => {
    const fid = createFolder("Roguelike");
    setFolderTarget(fid, 10);
    for (let i = 0; i < 4; i++) {
      addToWishlist({ platform: "steam", id: `s${i}`, title: `A${i}`, salePrice: 10, currency: "USD" });
      setEntryFolder(`steam:s${i}`, fid);
    }
    const { container } = render(h(CollectionSidebar, {}));
    expect(screen.getByText("4/10")).toBeTruthy();
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    const fill = container.querySelector(".collection-progress__fill");
    expect(fill.style.width).toBe("40%");
  });

  it("标签侧栏显「标签名·已收数」：3 款打「待玩」→ 计 3", () => {
    addTag("待玩");
    for (let i = 0; i < 3; i++) {
      addToWishlist({ platform: "steam", id: `s${i}`, title: `A${i}`, salePrice: 10, currency: "USD" });
      setEntryTags(`steam:s${i}`, ["待玩"]);
    }
    render(h(CollectionSidebar, {}));
    const nameSpan = document.querySelector(".collection-tag__name");
    expect(nameSpan && nameSpan.textContent).toBe("#待玩");
    const countSpan = document.querySelector(".collection-tag__count");
    expect(countSpan && countSpan.textContent).toBe("3");
  });
});
