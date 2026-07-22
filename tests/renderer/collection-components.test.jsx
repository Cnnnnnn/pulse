// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { render, screen, cleanup, fireEvent } from "@testing-library/preact";

import { CompletionRing } from "../../src/renderer/games/CompletionRing.jsx";
import { CollectibleCard } from "../../src/renderer/games/CollectibleCard.jsx";
import { CollectionView } from "../../src/renderer/games/CollectionView.jsx";
import { CollectionSidebar } from "../../src/renderer/games/CollectionSidebar.jsx";
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
  toggleFavorite,
  openNoteRating,
} from "../../src/renderer/games/gamesStore.js";
import { DEFAULT_RARITY_TIERS } from "../../src/renderer/games/rarityTiers.js";

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

// 构造一条规整的收藏条目
function mkEntry(key, platform, rarity, title) {
  return { key, platform, id: key, title, rarity, tags: [], rating: 0, addedPrice: 10, currency: "USD", currentPrice: 8, currentCurrency: "USD" };
}

beforeEach(() => resetAll());
afterEach(() => {
  cleanup();
  resetAll();
});

describe("CompletionRing", () => {
  it("pct=0.5 → aria-label 含 50% 且填充环 dashoffset 已设置", () => {
    const { container } = render(h(CompletionRing, { pct: 0.5, label: "50%", sublabel: "已分级 1 / 2" }));
    const ring = container.querySelector('[role="img"]');
    expect(ring.getAttribute("aria-label")).toContain("50%");
    const fill = container.querySelector(".completion-ring__fill");
    expect(fill).toBeTruthy();
    expect(Number(fill.getAttribute("stroke-dashoffset"))).toBeGreaterThan(0);
  });
  it("pct 越界被裁剪到 [0,1]", () => {
    const { container } = render(h(CompletionRing, { pct: 1.4 }));
    const ring = container.querySelector('[role="img"]');
    expect(ring.getAttribute("aria-label")).toContain("100%");
  });
});

describe("CollectibleCard", () => {
  it("已分级 → is-ranked + 档位角标；未分级 → is-unranked + 待分级角标", () => {
    const { container, rerender } = render(
      h(CollectibleCard, { entry: mkEntry("steam:1", "steam", "legendary", "HK"), tiers: rarityTiers.value }),
    );
    expect(container.querySelector(".collectible-card.is-ranked")).toBeTruthy();
    expect(container.textContent).toContain("传说");

    rerender(h(CollectibleCard, { entry: mkEntry("steam:2", "steam", null, "无名"), tiers: rarityTiers.value }));
    expect(container.querySelector(".collectible-card.is-unranked")).toBeTruthy();
    expect(container.textContent).toContain("待分级");
  });

  it("点击收集按钮 → 调 onToggle(entry)", () => {
    const onToggle = vi.fn();
    const entry = mkEntry("steam:1", "steam", "common", "HK");
    const { container } = render(h(CollectibleCard, { entry, onToggle }));
    const btn = container.querySelector(".collectible-card__collect");
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(entry);
  });

  it("点击 ⋯ → 调 onOpen(entry.key)", () => {
    const onOpen = vi.fn();
    const entry = mkEntry("steam:1", "steam", "common", "HK");
    const { container } = render(h(CollectibleCard, { entry, onOpen }));
    const btn = container.querySelector(".collectible-card__menu");
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith("steam:1");
  });
});

describe("CollectionView（Phase 2 集成）", () => {
  beforeEach(() => {
    wishlist.value = [
      mkEntry("steam:1", "steam", "common", "游戏A"),
      mkEntry("steam:2", "steam", "legendary", "游戏B"),
      mkEntry("epic:1", "epic", null, "游戏C"),
    ];
  });

  it("渲染类型切换 + 完成度环 + 卡片（数量=wishlist）", () => {
    const { container } = render(h(CollectionView, {}));
    // 类型切换按钮（注册表驱动）
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(container.querySelectorAll(".collection-type-switch__btn").length).toBeGreaterThan(3);
    // 完成度环
    expect(container.querySelector(".completion-ring")).toBeTruthy();
    // 卡片：3 款（含 1 未分级）
    expect(container.querySelectorAll(".collectible-card").length).toBe(3);
    expect(container.querySelectorAll(".collectible-card.is-unranked").length).toBe(1);
  });

  it("点击类型切换 → activeCollectionType 改变", () => {
    const { container } = render(h(CollectionView, {}));
    const steamBtn = Array.from(container.querySelectorAll(".collection-type-switch__btn")).find(
      (b) => b.textContent.includes("Steam"),
    );
    fireEvent.click(steamBtn);
    expect(activeCollectionType.value).toBe("steam");
    // Steam 平台仅 2 款
    expect(container.querySelectorAll(".collectible-card").length).toBe(2);
  });

  it("视图切换 grid→list → 容器 class 变 collection-list", () => {
    const { container } = render(h(CollectionView, {}));
    expect(container.querySelector(".collection-grid")).toBeTruthy();
    const listBtn = Array.from(container.querySelectorAll(".view-toggle__btn")).find((b) =>
      b.textContent.includes("列表"),
    );
    fireEvent.click(listBtn);
    expect(collectionView.value).toBe("list");
    expect(container.querySelector(".collection-list")).toBeTruthy();
  });

  it("卡片 ⋯ 打开备注弹窗（复用 openNoteRating）", () => {
    const { container } = render(h(CollectionView, {}));
    const menu = container.querySelector(".collectible-card__menu");
    fireEvent.click(menu);
    // 首卡经稀有度降序排在最前（此处为 legendary=steam:2），断言打开的是某张真实卡片的 key
    expect(["steam:1", "steam:2", "epic:1"]).toContain(noteRatingTarget.value);
  });

  it("空收藏 → 显示空态而非卡片", () => {
    wishlist.value = [];
    const { container } = render(h(CollectionView, {}));
    expect(container.querySelectorAll(".collectible-card").length).toBe(0);
    expect(container.textContent).toContain("还没有关注任何游戏");
  });
});

describe("CollectionSidebar（Phase 2.6 抽屉锚点）", () => {
  it("挂载拥有 id=collection-sidebar（供抽屉 aria-controls 锚定）", () => {
    const { container } = render(h(CollectionSidebar, {}));
    expect(container.querySelector("#collection-sidebar")).toBeTruthy();
  });
});
