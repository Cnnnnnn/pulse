// @vitest-environment happy-dom
/**
 * tests/renderer/nav-status.test.ts
 *
 * Phase 9 收尾补测 — nav-status.ts 抽自 HomeGrid.tsx (行 177-296),
 * 是 IconRail / NavDrawer / Dashboard 3 个新组件共享的"未读 + 状态摘要"真源.
 *
 * 纯函数 + ctx 注入, 不依赖 signal, 易测.
 * 覆盖:
 *   - getBadge: 3 个有 badge 语义的 nav (news/invest/ai-usage) + null 兜底
 *   - sectionBadge: 3 个 section 聚合
 *   - getStatus: 8 个 nav 关键路径 (空/有数据/未知)
 */
import { describe, it, expect } from "vitest";
import {
  getBadge,
  getStatus,
  sectionBadge,
  type NavStatusCtx,
} from "../../src/renderer/components/nav-status.ts";

// 空 ctx 基线 — 所有数字 0, 数组空, Map 空, signal null
const emptyCtx: NavStatusCtx = {
  ithomeUnread: 0,
  wechatHotUnread: 0,
  fundUnread: 0,
  aiUsageNavBadge: 0,
  ithomeDayStats: null,
  ithomeArticles: null,
  wechatHotItems: null,
  holdings: null,
  totalMetrics: null,
  quoteCache: null,
  comparePoolCount: 0,
  stocksResults: null,
  aiUsageActiveProvider: null,
  aiUsageSnapshot: null,
  checkResults: null,
  checkApps: null,
  githubProjects: null,
};

describe("getBadge — 3 个有 badge 语义的 nav + null 兜底", () => {
  it("news = ithomeUnread + wechatHotUnread 之和", () => {
    expect(
      getBadge("news", { ...emptyCtx, ithomeUnread: 3, wechatHotUnread: 5 })
    ).toBe(8);
  });
  it("news: 0+0 → null (不渲染角标)", () => {
    expect(getBadge("news", emptyCtx)).toBeNull();
  });
  it("invest = fundUnread (投资 nav 合并后)", () => {
    expect(getBadge("invest", { ...emptyCtx, fundUnread: 2 })).toBe(2);
    expect(getBadge("invest", emptyCtx)).toBeNull();
  });
  it("ai-usage = navBadge", () => {
    expect(getBadge("ai-usage", { ...emptyCtx, aiUsageNavBadge: 5 })).toBe(5);
    expect(getBadge("ai-usage", emptyCtx)).toBeNull();
  });
  it("未注册 badge 的 nav → null (versions/github/ai-leaderboard)", () => {
    expect(getBadge("versions", emptyCtx)).toBeNull();
    expect(getBadge("github", emptyCtx)).toBeNull();
    expect(getBadge("ai-leaderboard", emptyCtx)).toBeNull();
  });
});

describe("sectionBadge — IconRail section 图标聚合", () => {
  it("news section = news 未读总数", () => {
    expect(
      sectionBadge("news", { ...emptyCtx, ithomeUnread: 3, wechatHotUnread: 5 })
    ).toBe(8);
  });
  it("holdings section = invest + ai-usage", () => {
    expect(
      sectionBadge("holdings", { ...emptyCtx, fundUnread: 2, aiUsageNavBadge: 5 })
    ).toBe(7);
  });
  it("system section 固定为 0 (versions 无 badge 语义)", () => {
    expect(sectionBadge("system", emptyCtx)).toBe(0);
  });
  it("未知 section 兜底 0", () => {
    expect(sectionBadge("unknown", emptyCtx)).toBe(0);
  });
});

describe("getStatus — 8 个 nav 关键路径", () => {
  it("news: 0+0 → '—' (空态)", () => {
    expect(getStatus("news", emptyCtx)).toBe("—");
  });
  it("news: 有热搜时显示 N 热搜", () => {
    expect(
      getStatus("news", { ...emptyCtx, wechatHotItems: [{ id: 1 }, { id: 2 }] })
    ).toContain("2 热搜");
  });
  it("worldcup nav 已下线 → null (v2.80)", () => {
    expect(getStatus("worldcup", emptyCtx)).toBeNull();
  });
  it("invest: 0 → '—'", () => {
    expect(getStatus("invest", emptyCtx)).toBe("—");
  });
  it("invest: 持仓 + 今日盈亏 → '基金 今日 +¥X.XX · 对比池 N'", () => {
    expect(
      getStatus("invest", {
        ...emptyCtx,
        holdings: [{ code: "000001" }],
        totalMetrics: { todayProfit: 100 },
        comparePoolCount: 3,
      })
    ).toContain("+¥100.00");
  });
  it("ai-usage: 无 snapshot → '—'", () => {
    expect(getStatus("ai-usage", emptyCtx)).toBe("—");
  });
  it("versions: 0+0 → '未配置应用'", () => {
    expect(getStatus("versions", emptyCtx)).toBe("未配置应用");
  });
  it("versions: N/M 可更新", () => {
    const m = new Map();
    m.set("a", { has_update: true });
    m.set("b", { has_update: false });
    expect(
      getStatus("versions", { ...emptyCtx, checkResults: m, checkApps: [{}, {}] })
    ).toBe("1/2 可更新");
  });
  it("github: 0 → '尚未收录', N → '已收录 N 个'", () => {
    expect(getStatus("github", emptyCtx)).toBe("尚未收录");
    expect(
      getStatus("github", { ...emptyCtx, githubProjects: [{ id: 1 }, { id: 2 }] })
    ).toBe("已收录 2 个");
  });
  it("未知 key 兜底 null", () => {
    expect(getStatus("unknown", emptyCtx)).toBeNull();
  });
});
