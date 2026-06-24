/**
 * tests/ai-usage/AIUsagePage.test.jsx
 *
 * 单测 AIUsagePage.jsx 的关键渲染分支.
 * 不测倒计时秒级行为 (用 fake timer 也麻烦), 测结构性 / 数据驱动的部分.
 */

// @vitest-environment happy-dom

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";

let mockSnapshot = null;
let mockPrevSnapshot = null;
let mockHistory = { days: [] };
let mockLastError = null;
let mockFetching = false;
let mockFromCache = true;
let mockActiveProvider = "minimax";
const fetchCalls = [];
// GLM 槽 (默认无数据, 除非测试显式设)
let mockGlmSnapshot = null;

vi.mock("../../src/renderer/store/ai-usage-store.js", () => ({
  AI_USAGE_PROVIDERS: ["minimax", "glm"],
  get aiUsageSnapshot() {
    return { get value() { return { minimax: mockSnapshot, glm: mockGlmSnapshot }; } };
  },
  get aiUsagePrevSnapshot() {
    return { get value() { return { minimax: mockPrevSnapshot, glm: null }; } };
  },
  get aiUsageHistory() {
    return { get value() { return { minimax: mockHistory, glm: { days: [] } }; } };
  },
  get aiUsageLastError() {
    return { get value() { return { minimax: mockLastError, glm: null }; } };
  },
  get aiUsageFetching() {
    return { get value() { return { minimax: mockFetching, glm: false }; } };
  },
  get aiUsageFromCache() {
    return { get value() { return { minimax: mockFromCache, glm: true }; } };
  },
  get aiUsageActiveProvider() {
    return { get value() { return mockActiveProvider; }, set value(v) { mockActiveProvider = v; } };
  },
  get aiUsageAlertPrefs() {
    return {
      get value() {
        return {
          enabled: true,
          absMinPct: 55,
          spikeRatio: 1.5,
          reAlertStepPct: 5,
          lastNotified: {},
        };
      },
    };
  },
  fetchAiUsage: (...args) => {
    fetchCalls.push(args);
    return Promise.resolve({ ok: true });
  },
  setActiveProvider: (pid) => { mockActiveProvider = pid; },
  openAiUsageAlertModal: vi.fn(),
}));

const { AIUsagePage } = await import(
  "../../src/renderer/components/AIUsagePage.jsx"
);

const NOW = Date.now();
const FAKE_SNAPSHOT = {
  provider: "minimax",
  region: "cn",
  fetchedAt: NOW,
  endpoint: "https://www.minimaxi.com/v1/token_plan/remains",
  windows: {
    "5h": {
      total: 6000,
      remaining: 4200,
      used: 1800,
      usedPercent: 30,
      resetAt: NOW + 3600_000,
      resetInSec: 3600,
      endTime: NOW + 3600_000,
      fetchedAt: NOW,
      label: "5 小时滚动窗口",
      status: 1,
    },
    weekly: {
      total: 50000,
      remaining: 12000,
      used: 38000,
      usedPercent: 76,
      resetAt: NOW + 5 * 86400_000,
      resetInSec: 5 * 86400,
      endTime: NOW + 5 * 86400_000,
      fetchedAt: NOW,
      label: "周窗口",
      status: 1,
    },
    video: {
      total: 3,
      remaining: 0,
      used: 3,
      usedPercent: 100,
      resetInSec: 5 * 86400,
      endTime: NOW + 5 * 86400_000,
      fetchedAt: NOW,
      label: "视频赠送",
      modelName: "video",
      status: 1,
    },
  },
  credits: null,
};

beforeEach(() => {
  mockSnapshot = null;
  mockPrevSnapshot = null;
  mockHistory = { days: [] };
  mockLastError = null;
  mockFetching = false;
  mockFromCache = true;
  mockActiveProvider = "minimax";
  mockGlmSnapshot = null;
  fetchCalls.length = 0;
  cleanup();
});

describe("AIUsagePage", () => {
  test("空态: 没有 snapshot, 没有 error", () => {
    const { container } = render(<AIUsagePage />);
    expect(container.querySelector(".ai-usage-empty")).toBeTruthy();
    expect(container.textContent).toContain("还没有配额数据");
  });

  test("渲染三个窗口卡 (5h + weekly + video)", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    const cards = container.querySelectorAll(".ai-usage-card");
    expect(cards).toHaveLength(3);
    expect(container.textContent).toContain("5 小时滚动窗口");
    expect(container.textContent).toContain("周窗口");
    expect(container.textContent).toContain("4200");
    expect(container.textContent).toContain("12000");
  });

  test("窗口数据缺 → empty card, 不崩", () => {
    mockSnapshot = { ...FAKE_SNAPSHOT, windows: { "5h": null, weekly: null, video: null } };
    const { container } = render(<AIUsagePage />);
    const empties = container.querySelectorAll(".ai-usage-card--empty");
    expect(empties).toHaveLength(3);
  });

  test("lastError + snapshot → warn banner", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    mockLastError = "rate_limited";
    const { container } = render(<AIUsagePage />);
    const banner = container.querySelector(".ai-usage-banner--warn");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain("rate_limited");
  });

  test("lastError + 无 snapshot → error banner", () => {
    mockLastError = "api_key_missing";
    const { container } = render(<AIUsagePage />);
    const banner = container.querySelector(".ai-usage-banner--error");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain("api_key_missing");
  });

  test("fromCache=true 时 subtitle 标注 (从缓存恢复)", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    mockFromCache = true;
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toContain("从缓存恢复");
  });

  test("刷新按钮 click → 调 fetchAiUsage({provider:'minimax'})", async () => {
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    const btn = container.querySelector(".ai-usage-refresh-btn");
    await fireEvent.click(btn);
    expect(fetchCalls).toEqual([[{ provider: "minimax" }]]);
  });

  test("fetching=true → button disabled + 显示 刷新中", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    mockFetching = true;
    const { container } = render(<AIUsagePage />);
    const btn = container.querySelector(".ai-usage-refresh-btn");
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain("刷新中");
  });

  test("进度条宽度 = 已用% (整数)", () => {
    mockSnapshot = FAKE_SNAPSHOT; // 5h: 1800/6000 = 30%
    const { container } = render(<AIUsagePage />);
    const fills = container.querySelectorAll(".ai-usage-card-bar-fill");
    // 5h: 30% wide; weekly: 76% (38000/50000)
    const widths = Array.from(fills).map((el) => el.style.width);
    expect(widths).toContain("30%");
    expect(widths).toContain("76%");
  });

  test("显示 '剩 X / Y' 绝对数字", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    // 5h: 剩 4200 / 6000
    expect(container.textContent).toContain("剩 4200");
    expect(container.textContent).toContain("剩 12000");
    // video: 剩 0 / 3
    expect(container.textContent).toContain("剩 0");
  });

  test("状态徽章 (status=1 → 正常, status=0 → 已限流)", () => {
    mockSnapshot = {
      ...FAKE_SNAPSHOT,
      windows: {
        ...FAKE_SNAPSHOT.windows,
        "5h": { ...FAKE_SNAPSHOT.windows["5h"], status: 0 },
      },
    };
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toContain("已限流");
    expect(container.querySelector(".ai-usage-status--throttled")).toBeTruthy();
  });

  test("重置时间绝对值 (HH:mm) 出现在 hint 行", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    // 5h 的 endTime 是 now+3600s, 应该有 HH:mm 格式
    expect(container.textContent).toMatch(/\d{2}:\d{2}/);
  });

  test("'今日已用' 显示在 header 副标题, 5h.used=1800 → '今日已用 1,800 单位'", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    // 1800 应被 toLocaleString 格式化为 "1,800"
    expect(container.textContent).toMatch(/今日已用\s*1,800\s*单位/);
  });

  test("'今日已用' 当 5h.used 缺失但有 percent + total 时, 用 percent × total 估算", () => {
    mockSnapshot = {
      ...FAKE_SNAPSHOT,
      windows: {
        ...FAKE_SNAPSHOT.windows,
        "5h": { ...FAKE_SNAPSHOT.windows["5h"], used: null, total: 1000, remaining: 700, usedPercent: 30 },
      },
    };
    const { container } = render(<AIUsagePage />);
    // 30% × 1000 = 300
    expect(container.textContent).toMatch(/今日已用\s*300\s*单位/);
  });

  test("'今日已用' 当 used/percent/total 全缺失时, 显示百分号或占位", () => {
    mockSnapshot = {
      ...FAKE_SNAPSHOT,
      windows: {
        ...FAKE_SNAPSHOT.windows,
        "5h": { ...FAKE_SNAPSHOT.windows["5h"], used: null, total: null, remaining: null, usedPercent: 42 },
      },
    };
    const { container } = render(<AIUsagePage />);
    // 走 percent 分支: "今日已用 42%"
    expect(container.textContent).toMatch(/今日已用\s*42\s*%/);
  });

  test("total=0/null 时不显示 '剩 X / Y' 而显示 '已用 X%' (避免 0/0 误导)", () => {
    // 模拟 API 返 0 当 total 时的场景 (被 normalize 修成 null)
    mockSnapshot = {
      ...FAKE_SNAPSHOT,
      windows: {
        ...FAKE_SNAPSHOT.windows,
        "5h": { ...FAKE_SNAPSHOT.windows["5h"], total: null, remaining: 0, usedPercent: 21 },
        weekly: { ...FAKE_SNAPSHOT.windows.weekly, total: null, remaining: 0, usedPercent: 19 },
      },
    };
    const { container } = render(<AIUsagePage />);
    // 不应该出现 "剩 0" 或 "0 / 0"
    expect(container.textContent).not.toMatch(/剩\s*0\s*\/\s*0/);
    // 应显示百分比
    expect(container.textContent).toMatch(/已用\s*21\s*%/);
    expect(container.textContent).toMatch(/已用\s*19\s*%/);
  });

  test("无 prevSnapshot 时不显示 burn rate 提示", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    mockPrevSnapshot = null;
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).not.toMatch(/按当前速度/);
  });

  test("有 prevSnapshot 且有消耗时显示 burn rate 提示", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    // 1 小时前 snapshot, 5h 窗口 used 从 1000 → 1800 (+800)
    mockPrevSnapshot = {
      ...FAKE_SNAPSHOT,
      fetchedAt: NOW - 3600_000,
      windows: {
        ...FAKE_SNAPSHOT.windows,
        "5h": { ...FAKE_SNAPSHOT.windows["5h"], used: 1000, remaining: 5000, fetchedAt: NOW - 3600_000 },
      },
    };
    const { container } = render(<AIUsagePage />);
    // 800/h, remaining 4200, blowUpAt = 4200/800=5.25h (在 24h 内) → 应显示
    const burnHints = container.querySelectorAll(".ai-usage-card-burn-hint");
    if (burnHints.length === 0) {
      // debug: 看 weekly 卡的输入
      console.log("debug cards HTML:", container.innerHTML);
    }
    expect(burnHints.length).toBeGreaterThan(0);
    expect(burnHints[0].textContent).toMatch(/按当前速度.*5\s*小时后/);
  });

  test("prev 窗口的 used 减少 (重置) 不显示 burn rate", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    mockPrevSnapshot = {
      ...FAKE_SNAPSHOT,
      fetchedAt: NOW - 3600_000,
      windows: {
        ...FAKE_SNAPSHOT.windows,
        "5h": { ...FAKE_SNAPSHOT.windows["5h"], used: 5000, remaining: 1000, fetchedAt: NOW - 3600_000 },
      },
    };
    const { container } = render(<AIUsagePage />);
    // used 减少 → derive 返 null → 不显示
    expect(container.textContent).not.toMatch(/按当前速度/);
  });

  // ─── v2 多 provider + 崩溃回归 ───────────────────────────────

  test("GLM tab: 切换后渲染 GLM 标题 + 数据", () => {
    mockActiveProvider = "glm";
    mockGlmSnapshot = {
      provider: "glm",
      region: "global",
      fetchedAt: NOW,
      endpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
      windows: {
        "5h": { total: 800000000, remaining: 672000000, usedPercent: 15, label: "5 小时滚动窗口" },
        weekly: null,
        mcp: null,
      },
    };
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toContain("GLM 用量");
    expect(container.textContent).toContain("5 小时滚动窗口");
  });

  test("Tab 切换按钮存在 (Minimax + GLM)", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    const tabs = container.querySelectorAll(".ai-usage-tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toContain("Minimax");
    expect(tabs[1].textContent).toContain("GLM");
  });

  test("点击 GLM tab → 切换 active provider", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    const glmTab = Array.from(container.querySelectorAll(".ai-usage-tab"))
      .find((t) => t.textContent.includes("GLM"));
    fireEvent.click(glmTab);
    expect(mockActiveProvider).toBe("glm");
  });

  test("回归: snapshot 有值但 windows 为 undefined 不崩 (v2 脏数据场景)", () => {
    // 模拟 main 返回 {schema_version, providers} 但某 provider 快照缺 windows
    mockSnapshot = { provider: "minimax", fetchedAt: NOW, endpoint: null };
    // 不应抛错
    const { container } = render(<AIUsagePage />);
    // 三张卡都应是 empty card (windows 各项 ?? null)
    const empties = container.querySelectorAll(".ai-usage-card--empty");
    expect(empties.length).toBe(3);
  });
});
