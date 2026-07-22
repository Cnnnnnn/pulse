// 统一游戏收藏（Phase 2）— collectionRegistry 纯函数单测（node 环境，无 DOM 依赖）
import { describe, it, expect } from "vitest";
import {
  getCollectionType,
  listCollectionTypes,
  catalogOf,
  progressOf,
  rarityDistribution,
  rarityCoverage,
  targetCoverage,
  crossedMilestones,
  clampPct,
  isRanked,
  DEFAULT_COLLECTION_TYPES,
} from "../../src/renderer/games/collectionRegistry.js";

const E = (platform, rarity) => ({ key: `${platform}:${rarity}`, platform, rarity });

describe("registry 基础", () => {
  it("默认含 all / 平台 / 待分级 / 传说 类型", () => {
    expect(getCollectionType("all")).toBeTruthy();
    expect(getCollectionType("steam")).toBeTruthy();
    expect(getCollectionType("unranked")).toBeTruthy();
    expect(getCollectionType("legendary")).toBeTruthy();
    expect(listCollectionTypes().length).toBeGreaterThanOrEqual(8);
  });
  it("未知类型返回 null", () => {
    expect(getCollectionType("nope")).toBeNull();
  });
  it("每个类型 catalog/progress 均为函数", () => {
    for (const t of Object.values(DEFAULT_COLLECTION_TYPES)) {
      expect(typeof t.catalog).toBe("function");
      expect(typeof t.progress).toBe("function");
    }
  });
});

describe("catalogOf 视图派生（无 master catalog，仅过滤已收藏）", () => {
  const entries = [
    E("steam", "common"),
    E("steam", "legendary"),
    E("epic", "rare"),
    E("switch", null),
  ];
  it("all → 全部", () => {
    expect(catalogOf("all", entries)).toHaveLength(4);
  });
  it("steam → 仅 steam 平台", () => {
    expect(catalogOf("steam", entries).map((e) => e.platform)).toEqual(["steam", "steam"]);
  });
  it("unranked → 仅 rarity 为空", () => {
    const r = catalogOf("unranked", entries);
    expect(r).toHaveLength(1);
    expect(r[0].platform).toBe("switch");
  });
  it("legendary → 仅 legendary 档位", () => {
    const r = catalogOf("legendary", entries);
    expect(r).toHaveLength(1);
    expect(r[0].rarity).toBe("legendary");
  });
});

describe("rarityCoverage / isRanked", () => {
  it("空 → 0/0/pct=0", () => {
    const c = rarityCoverage([]);
    expect(c).toMatchObject({ collected: 0, total: 0, pct: 0 });
  });
  it("3 条其中 2 条分级 → collected2/total3/pct≈0.667", () => {
    const c = rarityCoverage([E("s", "common"), E("s", "rare"), E("s", null)]);
    expect(c.collected).toBe(2);
    expect(c.total).toBe(3);
    expect(c.pct).toBeCloseTo(2 / 3);
  });
  it("isRanked 仅识别非空字符串 rarity", () => {
    expect(isRanked({ rarity: "common" })).toBe(true);
    expect(isRanked({ rarity: null })).toBe(false);
    expect(isRanked({})).toBe(false);
  });
});

describe("targetCoverage（文件夹目标）", () => {
  it("无 target → caption 为计数，pct=1 当有条目", () => {
    const c = targetCoverage(4, null);
    expect(c.total).toBe(4);
    expect(c.caption).toBe("4 款");
  });
  it("有 target=10 且 4 款 → 4/10/pct=0.4", () => {
    const c = targetCoverage(4, 10);
    expect(c).toMatchObject({ collected: 4, total: 10, pct: 0.4 });
    expect(c.caption).toBe("4 / 10");
  });
});

describe("progressOf 经类型", () => {
  const entries = [E("s", "common"), E("s", null), E("s", "rare")];
  it("all 类型 → 稀有度分级覆盖", () => {
    const p = progressOf("all", entries);
    expect(p.collected).toBe(2);
    expect(p.total).toBe(3);
  });
});

describe("rarityDistribution", () => {
  const tiers = [
    { id: "common", name: "普通", weight: 1, color: "var(--x)" },
    { id: "rare", name: "稀有", weight: 2, color: "var(--x)" },
    { id: "legendary", name: "传说", weight: 4, color: "var(--x)" },
  ];
  it("按档位计 + 含 unranked 桶 + weight 降序", () => {
    const d = rarityDistribution(
      [E("s", "common"), E("s", "rare"), E("s", "rare"), E("s", null)],
      tiers,
    );
    const byId = Object.fromEntries(d.map((x) => [x.id, x.count]));
    expect(byId.common).toBe(1);
    expect(byId.rare).toBe(2);
    expect(byId.unranked).toBe(1);
    // 首个应为 weight 最大的 legendary（count 0 仍在）
    expect(d[0].id).toBe("legendary");
  });
});

describe("crossedMilestones / clampPct", () => {
  it("0 → 0.5 越过 0.25/0.5", () => {
    expect(crossedMilestones(0, 0.5)).toEqual([0.25, 0.5]);
  });
  it("0.8 → 0.4（下降）也报告越过的阈值", () => {
    expect(crossedMilestones(0.8, 0.4)).toEqual([0.5, 0.75]);
  });
  it("clampPct 裁剪到 [0,1]", () => {
    expect(clampPct(1.5)).toBe(1);
    expect(clampPct(-0.2)).toBe(0);
    expect(clampPct(0.6)).toBe(0.6);
  });
});
