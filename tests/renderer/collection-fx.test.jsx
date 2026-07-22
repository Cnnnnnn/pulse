// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { h } from "preact";
import { render, cleanup, fireEvent } from "@testing-library/preact";

import {
  wishlist,
  rarityTiers,
  activeCollectionFilter,
  searchQuery,
  activeCollectionType,
  collectionView,
  collectionSkin,
  collectionLoading,
  collectionSidebarOpen,
  unlockHistoryOpen,
  unlockHistory,
  unlockToasts,
  milestoneFx,
  noteRatingTarget,
  detectNewUnlocks,
  initCollectionEngines,
} from "../../src/renderer/games/gamesStore.js";
import { CollectionView } from "../../src/renderer/games/CollectionView.jsx";
import { CollectibleCard } from "../../src/renderer/games/CollectibleCard.jsx";
import { CollectionHeader } from "../../src/renderer/games/CollectionHeader.jsx";
import { UnlockHistoryPanel } from "../../src/renderer/games/UnlockHistoryPanel.jsx";
import { DEFAULT_RARITY_TIERS } from "../../src/renderer/games/rarityTiers.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

function mkEntry(key, platform = "steam", rarity = "common", title = "G") {
  return {
    key,
    platform,
    id: key,
    title,
    rarity,
    tags: [],
    rating: 0,
    addedPrice: 10,
    currency: "USD",
    currentPrice: 8,
    currentCurrency: "USD",
  };
}
function mkN(n, rarity = "common", platform = "steam") {
  return Array.from({ length: n }, (_, i) => mkEntry(`e:${i}`, platform, rarity, `G${i}`));
}

function resetAll() {
  wishlist.value = [];
  rarityTiers.value = DEFAULT_RARITY_TIERS.map((t) => ({ ...t }));
  activeCollectionFilter.value = { type: null, id: null };
  searchQuery.value = "";
  activeCollectionType.value = "all";
  collectionView.value = "grid";
  collectionSkin.value = "minimal";
  collectionLoading.value = false;
  collectionSidebarOpen.value = false;
  unlockHistoryOpen.value = false;
  unlockHistory.value = [];
  unlockToasts.value = [];
  milestoneFx.value = null;
  noteRatingTarget.value = null;
  localStorage.clear();
}

beforeEach(() => resetAll());
afterEach(() => {
  cleanup();
  resetAll();
});

describe("detectNewUnlocks（纯函数）", () => {
  it("10 款 → 解锁「初露锋芒」徽章", () => {
    const { newOnes } = detectNewUnlocks(new Set(), mkN(10));
    expect(newOnes.some((u) => u.kind === "badge" && u.title === "初露锋芒")).toBe(true);
  });
  it("已含基线的同集合 → 无新解锁", () => {
    const { set } = detectNewUnlocks(new Set(), mkN(10));
    const { newOnes } = detectNewUnlocks(set, mkN(10));
    expect(newOnes).toHaveLength(0);
  });
  it("10 个 steam → 解锁「Steam 十连」成就", () => {
    const { newOnes } = detectNewUnlocks(new Set(), mkN(10, "common", "steam"));
    expect(newOnes.some((u) => u.kind === "ach" && u.title === "Steam 十连")).toBe(true);
  });
});

describe("引擎 effect（解锁 toast / 里程碑）", () => {
  it("收藏数越过 10 → 推解锁 toast", async () => {
    const stop = initCollectionEngines();
    wishlist.value = mkN(9);
    await tick();
    unlockToasts.value = [];
    wishlist.value = mkN(10);
    await tick();
    expect(
      unlockToasts.value.some((t) => t.kind === "badge" && t.title === "初露锋芒"),
    ).toBe(true);
    stop();
    unlockToasts.value = [];
  });

  it("稀有度覆盖越过 25% → 触发里程碑粒子（pct=0.25）", async () => {
    const stop = initCollectionEngines();
    // 5 款其中 1 款分级 → pct 0.2（<25%）
    wishlist.value = [...mkN(1, "common"), ...mkN(4, null)];
    await tick();
    // 6 款其中 2 款分级 → pct 0.333（越过 25%）
    wishlist.value = [...mkN(2, "common"), ...mkN(4, null)];
    await tick();
    expect(milestoneFx.value).toBeTruthy();
    expect(Math.round((milestoneFx.value?.pct ?? 0) * 100)).toBe(25);
    stop();
    milestoneFx.value = null;
  });
});

describe("CollectionView（Phase 2.5 体验）", () => {
  it("collectionLoading + 空 → 渲染骨架（8 张）", () => {
    wishlist.value = [];
    collectionLoading.value = true;
    const { container } = render(h(CollectionView, {}));
    expect(container.querySelectorAll(".collectible-card.is-skeleton").length).toBe(8);
  });

  it("collectionSkin=neon → 根节点 data-skin=neon", () => {
    collectionSkin.value = "neon";
    const { container } = render(h(CollectionView, {}));
    expect(container.querySelector(".collection-view").getAttribute("data-skin")).toBe("neon");
  });

  it("collectionSkin 非法值 → 回退 minimal", () => {
    collectionSkin.value = "rainbow";
    const { container } = render(h(CollectionView, {}));
    expect(container.querySelector(".collection-view").getAttribute("data-skin")).toBe("minimal");
  });
});

describe("CollectibleCard 缩略图接入", () => {
  it("有 thumb → 渲染 img", () => {
    const { container } = render(
      h(CollectibleCard, {
        entry: { ...mkEntry("s:1", "steam", "common", "HK"), thumb: "https://x/y.png" },
      }),
    );
    expect(container.querySelector(".collectible-card__img")).toBeTruthy();
  });

  it("thumb 加载失败 → 回退 emoji 占位（不破版）", () => {
    const { container } = render(
      h(CollectibleCard, {
        entry: { ...mkEntry("s:1", "steam", "common", "HK"), thumb: "https://x/broken.png" },
      }),
    );
    const img = container.querySelector(".collectible-card__img");
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(container.querySelector(".collectible-card__emoji")).toBeTruthy();
    expect(container.querySelector(".collectible-card__img")).toBeFalsy();
  });
});

describe("解锁历史（Phase 2.6）", () => {
  it("引擎 effect 新解锁 → 推入 unlockHistory（含标题/类别，最新在前）", async () => {
    const stop = initCollectionEngines();
    wishlist.value = mkN(9);
    await tick();
    unlockHistory.value = []; // 清掉基线可能写入
    wishlist.value = mkN(10);
    await tick();
    expect(unlockHistory.value.length).toBeGreaterThan(0);
    expect(unlockHistory.value[0].title).toBe("初露锋芒");
    expect(unlockHistory.value[0].kind).toBe("badge");
    stop();
    unlockHistory.value = [];
  });

  it("UnlockHistoryPanel 空 → 空态；有记录 → 渲染列表项", () => {
    unlockHistoryOpen.value = true;
    unlockHistory.value = [];
    const { container, rerender } = render(h(UnlockHistoryPanel, {}));
    expect(container.textContent).toContain("还没有解锁记录");

    unlockHistory.value = [
      { id: "h1", kind: "badge", title: "初露锋芒", desc: "收藏 10 款", at: Date.now() },
    ];
    rerender(h(UnlockHistoryPanel, {}));
    expect(container.querySelector(".unlock-history__item")).toBeTruthy();
    expect(container.textContent).toContain("初露锋芒");

    unlockHistoryOpen.value = false;
  });

  it("面板关闭态 → 不渲染（返回 null）", () => {
    unlockHistoryOpen.value = false;
    const { container } = render(h(UnlockHistoryPanel, {}));
    expect(container.querySelector(".unlock-history")).toBeFalsy();
  });
});

describe("CollectionHeader 皮肤切换 + 历史按钮", () => {
  it("渲染 3 个皮肤按钮（极简/霓虹/复古）+ 历史按钮", () => {
    const { container } = render(h(CollectionHeader, {}));
    // 3 皮肤 + 1 历史（复用 skin-toggle__btn 外观）= 4
    expect(container.querySelectorAll(".skin-toggle__btn").length).toBe(4);
    expect(container.querySelector(".collection-history-btn")).toBeTruthy();
    expect(container.textContent).toContain("极简");
    expect(container.textContent).toContain("霓虹");
    expect(container.textContent).toContain("复古");
  });
});
