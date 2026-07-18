// @vitest-environment happy-dom
/**
 * tests/renderer/games-p1a.test.js
 *
 * P1a 批次测试：A 稀有度（数据层 + 界面层）+ E 本地埋点。
 * 覆盖：normalizeEntry 加 rarity、档位 CRUD 持久化、setEntryRarity/batch、rarityTiers 纯函数、
 *       metrics 纯函数、9 处 action 埋点钩子、RarityPicker / UsageMetricsPanel 组件。
 *
 * 纯本地：no network；localStorage 用 happy-dom 环境自带。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as store from "../../src/renderer/games/gamesStore.js";
import { normalizeEntry } from "../../src/renderer/games/types.js";
import {
  DEFAULT_RARITY_TIERS,
  sortByWeight,
  tierColorOf,
} from "../../src/renderer/games/rarityTiers.js";
import {
  EMPTY_METRICS,
  bumpMetric,
  mergeMetrics,
} from "../../src/renderer/games/metrics.js";
import { h } from "preact";
import { render, cleanup, fireEvent } from "@testing-library/preact";
import { RarityPicker } from "../../src/renderer/games/RarityPicker.jsx";
import { UsageMetricsPanel } from "../../src/renderer/games/UsageMetricsPanel.jsx";

function resetAll() {
  store.wishlist.value = [];
  store.folders.value = [];
  store.tags.value = [];
  store.metrics.value = {};
  store.rarityTiers.value = [];
  store.noteRatingTarget.value = null;
  store.mergeCandidateKeys.value = [];
  store.expandedMergeKey.value = null;
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
}

/** 向 wishlist 直接塞一条规整条目（避免触发随机 key 相关逻辑）。 */
function addEntry(key) {
  const [platform, id] = key.split(":");
  store.wishlist.value = [
    ...store.wishlist.value,
    normalizeEntry({
      key,
      platform,
      id,
      title: key,
      addedPrice: 0,
      currency: "USD",
    }),
  ];
}

beforeEach(() => {
  resetAll();
  // 默认档位就绪，便于排序 / 分布 / 选择器测试
  store.rarityTiers.value = DEFAULT_RARITY_TIERS.map((t) => ({ ...t }));
});
afterEach(() => {
  cleanup();
  resetAll();
});

describe("normalizeEntry — 稀有度字段（向后兼容）", () => {
  it("旧条目缺 rarity 补 null，不报错不丢数据", () => {
    const e = normalizeEntry({
      key: "steam:1",
      platform: "steam",
      id: "1",
      title: "Old",
      addedPrice: 5,
      currency: "USD",
    });
    expect(e.rarity).toBeNull();
  });

  it("合法 string rarity 保留，非法（数字/对象/缺失）归 null", () => {
    expect(normalizeEntry({ rarity: "legendary" }).rarity).toBe("legendary");
    expect(normalizeEntry({ rarity: 5 }).rarity).toBeNull();
    expect(normalizeEntry({ rarity: { a: 1 } }).rarity).toBeNull();
    expect(normalizeEntry({}).rarity).toBeNull();
  });
});

describe("rarityTiers 纯函数", () => {
  it("DEFAULT_RARITY_TIERS 为 4 档且含所需字段", () => {
    expect(DEFAULT_RARITY_TIERS).toHaveLength(4);
    for (const t of DEFAULT_RARITY_TIERS) {
      expect(typeof t.id).toBe("string");
      expect(typeof t.name).toBe("string");
      expect(typeof t.weight).toBe("number");
      expect(t.color).toMatch(/^var\(/); // 禁止裸 hex
    }
  });

  it("sortByWeight 按 weight 降序（legendary 最前，common 最后）", () => {
    const sorted = sortByWeight(DEFAULT_RARITY_TIERS);
    expect(sorted.map((t) => t.id)).toEqual([
      "legendary",
      "epic",
      "rare",
      "common",
    ]);
  });

  it("tierColorOf：已知返回其色；未知/null 返回中性色", () => {
    expect(tierColorOf(DEFAULT_RARITY_TIERS, "epic")).toBe("var(--color-info)");
    expect(tierColorOf(DEFAULT_RARITY_TIERS, "nope")).toBe("var(--text-secondary)");
    expect(tierColorOf(DEFAULT_RARITY_TIERS, null)).toBe("var(--text-secondary)");
  });
});

describe("metrics 纯函数", () => {
  it("bumpMetric 首次 firstSeen === lastSeen；累加后 count+1、firstSeen 不变、lastSeen 更新", () => {
    const m1 = bumpMetric(EMPTY_METRICS, "x");
    expect(m1.x.count).toBe(1);
    expect(m1.x.firstSeen).toBe(m1.x.lastSeen);

    const m2 = bumpMetric(m1, "x");
    expect(m2.x.count).toBe(2);
    expect(m2.x.firstSeen).toBe(m1.x.firstSeen); // 不变
    expect(m2.x.lastSeen >= m1.x.lastSeen).toBe(true); // 更新

    // 不同事件互不影响
    const m3 = bumpMetric(m2, "y");
    expect(m3.y.count).toBe(1);
    expect(m3.x.count).toBe(2);
  });

  it("mergeMetrics：count 累加，firstSeen 取早，lastSeen 取晚", () => {
    const a = {
      ev: { count: 1, firstSeen: "2020-01-01T00:00:00.000Z", lastSeen: "2020-06-01T00:00:00.000Z" },
    };
    const b = {
      ev: { count: 2, firstSeen: "2019-01-01T00:00:00.000Z", lastSeen: "2021-06-01T00:00:00.000Z" },
      other: { count: 5, firstSeen: "2022-01-01T00:00:00.000Z", lastSeen: "2022-01-01T00:00:00.000Z" },
    };
    const merged = mergeMetrics(a, b);
    expect(merged.ev.count).toBe(3);
    expect(merged.ev.firstSeen).toBe("2019-01-01T00:00:00.000Z");
    expect(merged.ev.lastSeen).toBe("2021-06-01T00:00:00.000Z");
    expect(merged.other.count).toBe(5);
  });
});

describe("稀有度·数据层 store（T-A1）", () => {
  it("loadRarityTiers 缺失时写入默认 4 档并落盘", () => {
    localStorage.clear();
    store.loadRarityTiers();
    expect(store.rarityTiers.value).toHaveLength(4);
    const stored = JSON.parse(localStorage.getItem("pulse.games.rarity.tiers.v1"));
    expect(stored).toHaveLength(4);
  });

  it("档位 CRUD 经 loadRarityTiers 持久化（add/rename/delete）", () => {
    localStorage.clear();
    store.loadRarityTiers();
    const id = store.addRarityTier("神话");
    expect(store.rarityTiers.value).toHaveLength(5);
    store.renameRarityTier(id, "神话级");
    expect(store.rarityTiers.value.find((t) => t.id === id).name).toBe("神话级");
    store.deleteRarityTier(id);
    expect(store.rarityTiers.value).toHaveLength(4);

    // 损坏数据静默回退默认 4 档
    localStorage.setItem("pulse.games.rarity.tiers.v1", "{bad");
    store.loadRarityTiers();
    expect(store.rarityTiers.value).toHaveLength(4);
  });

  it("setEntryRarity 覆盖式单选与清空（null = unranked）", () => {
    addEntry("steam:1");
    store.setEntryRarity("steam:1", "epic");
    expect(store.wishlist.value[0].rarity).toBe("epic");
    store.setEntryRarity("steam:1", null);
    expect(store.wishlist.value[0].rarity).toBeNull();
  });

  it("batchSetCommonRarity 批量设 common", () => {
    addEntry("steam:1");
    addEntry("steam:2");
    store.batchSetCommonRarity(["steam:1", "steam:2"]);
    expect(store.wishlist.value.every((e) => e.rarity === "common")).toBe(true);
  });

  it("setEntryRarity 落盘后重读仍保留", () => {
    addEntry("steam:1");
    store.setEntryRarity("steam:1", "legendary");
    const persisted = JSON.parse(localStorage.getItem("pulse.games.wishlist.v1"));
    expect(persisted[0].rarity).toBe("legendary");
  });
});

describe("本地埋点·9 处 action 钩子（T-E1）", () => {
  it("addToWishlist → wishlist.add count+1", () => {
    store.addToWishlist({ platform: "steam", id: "a1", title: "A", salePrice: 10, currency: "USD" });
    expect(store.metrics.value["wishlist.add"].count).toBe(1);
  });

  it("removeFromWishlist → wishlist.remove count+1", () => {
    addEntry("steam:1");
    store.removeFromWishlist("steam:1");
    expect(store.metrics.value["wishlist.remove"].count).toBe(1);
  });

  it("setEntryTags → tag.set count+1", () => {
    addEntry("steam:1");
    store.setEntryTags("steam:1", ["x"]);
    expect(store.metrics.value["tag.set"].count).toBe(1);
  });

  it("createFolder → folder.create count+1", () => {
    store.createFolder("F");
    expect(store.metrics.value["folder.create"].count).toBe(1);
  });

  it("mergeEntries → merge count+1", () => {
    addEntry("steam:1");
    addEntry("steam:2");
    store.mergeEntries(["steam:1", "steam:2"]);
    expect(store.metrics.value["merge"].count).toBe(1);
  });

  it("splitEntry → split count+1", () => {
    addEntry("steam:1");
    addEntry("steam:2");
    store.mergeEntries(["steam:1", "steam:2"]);
    store.splitEntry("steam:1");
    expect(store.metrics.value["split"].count).toBe(1);
  });

  it("setRating → rating.set count+1", () => {
    addEntry("steam:1");
    store.setRating("steam:1", 5);
    expect(store.metrics.value["rating.set"].count).toBe(1);
  });

  it("setNote → note.set count+1", () => {
    addEntry("steam:1");
    store.setNote("steam:1", "hi");
    expect(store.metrics.value["note.set"].count).toBe(1);
  });

  it("setEntryRarity → rarity.set count+1", () => {
    addEntry("steam:1");
    store.setEntryRarity("steam:1", "rare");
    expect(store.metrics.value["rarity.set"].count).toBe(1);
  });

  it("多次相同 action 累加（count 单调 +1）", () => {
    addEntry("steam:1");
    store.setRating("steam:1", 4);
    store.setRating("steam:1", 5);
    expect(store.metrics.value["rating.set"].count).toBe(2);
  });
});

describe("组件：RarityPicker（P1a · A）", () => {
  it("渲染 未分级 + 4 档；点击档位触发 onSelect(id)", () => {
    const onSelect = vi.fn();
    const { container } = render(
      h(RarityPicker, { value: null, tiers: DEFAULT_RARITY_TIERS, onSelect }),
    );
    const chips = [...container.querySelectorAll(".rarity-picker__chip")];
    // 未分级 + 4 档（无 onAddTier → 无「＋ 自定义」）
    expect(chips).toHaveLength(5);
    const legendary = chips.find((b) => b.textContent.trim() === "传说");
    expect(legendary).toBeTruthy();
    legendary.click();
    expect(onSelect).toHaveBeenCalledWith("legendary");
  });

  it("当前选中的档位 is-on；点击未分级触发 onSelect(null)", () => {
    const onSelect = vi.fn();
    const { container } = render(
      h(RarityPicker, { value: "rare", tiers: DEFAULT_RARITY_TIERS, onSelect }),
    );
    const chips = [...container.querySelectorAll(".rarity-picker__chip")];
    const rare = chips.find((b) => b.textContent.trim() === "稀有");
    expect(rare.className).toContain("is-on");
    const none = chips.find((b) => b.textContent.trim() === "未分级");
    none.click();
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("提供 onAddTier 时显示「＋ 自定义」并可新增", () => {
    const onAddTier = vi.fn();
    const { container } = render(
      h(RarityPicker, { value: null, tiers: DEFAULT_RARITY_TIERS, onSelect: () => {}, onAddTier }),
    );
    const addBtn = [...container.querySelectorAll(".rarity-picker__chip")].find(
      (b) => b.textContent.trim() === "＋ 自定义",
    );
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn);
    const input = container.querySelector(".rarity-picker__input");
    expect(input).toBeTruthy();
    fireEvent.input(input, { target: { value: "神话" } });
    fireEvent.click(container.querySelector(".rarity-picker__add-btn"));
    expect(onAddTier).toHaveBeenCalledWith("神话");
  });
});

describe("组件：UsageMetricsPanel（P1a · E）", () => {
  it("渲染各事件计数与「仅本地」标注", () => {
    store.metrics.value = {
      "wishlist.add": {
        count: 3,
        firstSeen: "2026-01-01T00:00:00.000Z",
        lastSeen: "2026-02-01T00:00:00.000Z",
      },
    };
    const { container } = render(h(UsageMetricsPanel, {}));
    expect(container.textContent).toContain("加入收藏");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("仅本地");
    // 数值 tabular-nums
    expect(container.querySelector(".usage-metrics__count").className).toContain(
      "usage-metrics__count",
    );
  });

  it("空数据时显示暂无记录", () => {
    store.metrics.value = {};
    const { container } = render(h(UsageMetricsPanel, {}));
    expect(container.textContent).toContain("暂无记录");
  });
});
