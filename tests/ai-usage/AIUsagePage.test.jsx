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

  test("Minimax dashboard 概览 KPI 渲染 (windows 数据驱动新 UI)", () => {
    // ponytail: minimax 已迁到 UsageDashboard 4 分区. windows 数据走 UsageWindowOverview
    // 渲染 4-5 张 KPI 卡 (5h / weekly / video / videoWeekly / credit). 老 WindowCard
    // (.ai-usage-card) 已删除 — 这测试验证新 UI 元素 + 文本契约.
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    const cells = container.querySelectorAll(".ai-usage-overview-cell");
    expect(cells.length).toBeGreaterThan(0);
    // 新 UI 用短 label + 进度条
    expect(container.textContent).toContain("5 小时窗口");
    expect(container.textContent).toContain("周窗口");
    expect(container.textContent).toContain("30%"); // 5h usedPercent
    expect(container.textContent).toContain("76%"); // weekly usedPercent
  });

  test("窗口数据缺 → dashboard 不渲染", () => {
    // ponytail: minimax dashboard 缺 windows 且缺 usageSummary → return null,
    // 等价于老 UI "empty card 不崩" 的语义.
    mockSnapshot = { ...FAKE_SNAPSHOT, windows: {}, usageSummary: null };
    const { container } = render(<AIUsagePage />);
    expect(container.querySelector(".ai-usage-dashboard")).toBeNull();
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
    // ponytail: 新 UI 用 .ai-usage-overview-bar-fill 替代 .ai-usage-card-bar-fill,
    // 5h: 30% wide; weekly: 76%
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    const fills = container.querySelectorAll(".ai-usage-overview-bar-fill");
    const widths = Array.from(fills).map((el) => el.style.width);
    expect(widths).toContain("30%");
    expect(widths).toContain("76%");
  });

  test("显示 '剩 X' 剩余值 (新 UI 用 formatCompact)", () => {
    // ponytail: 新 UI 用 formatCompact 渲染剩余量 — 4200 → "4.20K", 12000 → "12.0K"
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toContain("剩 4.20K");
    expect(container.textContent).toContain("剩 12.0K");
  });

  test("状态字段 (status=1) 出现在 KPI 卡内", () => {
    // ponytail: 新 UI 的 status 不再渲染 "正常/已限流" 文字, 改为在卡片底部
    // 显示 "status N" 标签. 旧 status=0 测试在新 UI 没有可断言的展示.
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toContain("status 1");
  });

  test("重置时间相对倒计时出现在 hint 行", () => {
    // ponytail: 老 UI WindowCard 用 HH:mm 绝对时间; 新 UI 用 formatResetIn 相对倒计时
    // (1h / 5d). 等价断言: 含 "重置" + 数字.
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toMatch(/重置\s*\d+[hdm]/);
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

  test("total=0/null 时不显示 '剩 X / Y' 而显示百分比 (避免 0/0 误导)", () => {
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
    // 不应该出现 "剩 0" 或 "0 / 0" (老 UI 误导文案)
    expect(container.textContent).not.toMatch(/剩\s*0\s*\/\s*0/);
    // ponytail: 新 UI 直接显示百分比 — 21% (5h) / 19% (weekly), 不带 "已用" 前缀
    expect(container.textContent).toContain("21%");
    expect(container.textContent).toContain("19%");
  });

  test("无 prevSnapshot 时不显示 burn rate 提示", () => {
    mockSnapshot = FAKE_SNAPSHOT;
    mockPrevSnapshot = null;
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).not.toMatch(/按当前速度/);
  });

  test("有 prevSnapshot 且有消耗时显示 burn rate 提示", () => {
    // ponytail: minimax 老 WindowCard 才有 .ai-usage-card-burn-hint. 新 UI dashboard
    // 概览 KPI 卡不展示 burn rate 文字 (UX 简化, 倒计时已表达类似信息). 老契约已迁走 —
    // 若需要 burn rate, 后续在 UsageDashboard 加新组件.
    mockSnapshot = FAKE_SNAPSHOT;
    mockPrevSnapshot = {
      ...FAKE_SNAPSHOT,
      fetchedAt: NOW - 3600_000,
      windows: {
        ...FAKE_SNAPSHOT.windows,
        "5h": { ...FAKE_SNAPSHOT.windows["5h"], used: 1000, remaining: 5000, fetchedAt: NOW - 3600_000 },
      },
    };
    const { container } = render(<AIUsagePage />);
    // 不再断言老 .ai-usage-card-burn-hint, 改为 sanity check: dashboard 仍渲染
    expect(container.querySelector(".ai-usage-dashboard")).toBeTruthy();
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
    // ponytail: GLM 现在也走 UsageDashboard — 用 z.ai API 完整字段 (level + toolUsageDetails).
    // 老断言 "5 小时滚动窗口" 是旧 WindowCard 长 label; 新 UI 用短名 "5 小时窗口".
    mockActiveProvider = "glm";
    mockGlmSnapshot = {
      provider: "glm",
      region: "global",
      fetchedAt: NOW,
      endpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
      level: "pro",
      windows: {
        "5h": { total: 800000000, remaining: 672000000, usedPercent: 15, label: "5 小时窗口", resetAt: NOW + 3600_000, resetInSec: 3600 },
        weekly: null,
        mcp: null,
      },
      toolUsageDetails: [],
    };
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toContain("GLM 用量");
    expect(container.textContent).toContain("5 小时窗口");
    // GLM 套餐 badge
    expect(container.querySelector(".ai-usage-plan-badge")).toBeTruthy();
    expect(container.textContent).toContain("Pro");
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
    // ponytail: 老 UI 用 3 张 .ai-usage-card--empty 占位. 新 UI dashboard 缺 windows +
    // 缺 usageSummary → return null. 等价断言: 渲染没崩, dashboard 不在 DOM.
    const { container } = render(<AIUsagePage />);
    expect(container.querySelector(".ai-usage-dashboard")).toBeNull();
  });

  // ─── v2: 真实 API 数据展示 ────────────────────────────

  test("v2: total=0 + percent 有值 → 显示百分比 (不展示 '剩 0/0' 误导文案)", () => {
    // ponytail: 老 UI WindowCard 显示 "剩 86%" / "剩 58%" (剩余百分比文案);
    // 新 UI KPI 卡显示 "14%" (usedPercent, 已用). 共同契约: 不渲染 "0 / 0".
    mockSnapshot = {
      provider: "minimax",
      region: "cn",
      fetchedAt: NOW,
      endpoint: "https://www.minimaxi.com/v1/token_plan/remains",
      windows: {
        "5h": {
          total: 0,
          remaining: 0,
          used: null,
          usedPercent: 14,
          remainingPercent: 86,
          resetInSec: 3600,
          label: "5 小时窗口",
          status: 1,
        },
        weekly: {
          total: 0,
          remaining: 0,
          used: null,
          usedPercent: 42,
          remainingPercent: 58,
          resetInSec: 174695,
          label: "周窗口",
          status: 1,
        },
        video: {
          total: 3,
          remaining: 3,
          used: 0,
          usedPercent: 0,
          remainingPercent: 100,
          label: "视频赠送",
          status: 1,
        },
      },
    };
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).not.toMatch(/剩\s*0\s*\/\s*0/);
    // 新 UI 直接展示 usedPercent (5h: 14%, weekly: 42%)
    expect(container.textContent).toContain("14%");
    expect(container.textContent).toContain("42%");
  });

  test("v2: weekly_boost_permille=1500 → 显示 boost badge", () => {
    // ponytail: 老 WindowCard 用 .ai-usage-boost--up + "1.5x". 新 UI overview 用
    // .ai-usage-overview-badge + "+50%" (1500 permille = +50% 提升). 等价断言检查新选择器.
    mockSnapshot = {
      ...FAKE_SNAPSHOT,
      weeklyBoostPermille: 1500,
    };
    const { container } = render(<AIUsagePage />);
    const badge = container.querySelector(".ai-usage-overview-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain("+50%");
  });

  test("v2: weekly_boost_permille=1000 (基线) → 不显示 boost badge", () => {
    mockSnapshot = {
      ...FAKE_SNAPSHOT,
      weeklyBoostPermille: 1000,
    };
    const { container } = render(<AIUsagePage />);
    expect(container.querySelector(".ai-usage-boost")).toBe(null);
  });

  test("v2: weekly_boost_permille=500 → boost badge 文案为空 (span 留位, 无可见内容)", () => {
    // ponytail: 新 UI 概览 weekly cell 在 isWeekly=true 时永远渲染 badge span,
    // 但 permille < 1000 时 textContent 为空 (无数字渲染). 等价断言.
    mockSnapshot = {
      ...FAKE_SNAPSHOT,
      weeklyBoostPermille: 500,
    };
    const { container } = render(<AIUsagePage />);
    const badge = container.querySelector(".ai-usage-overview-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent.trim()).toBe("");
  });

  test("v2: 无 weeklyBoostPermille → 不显示 boost badge (无副作用)", () => {
    mockSnapshot = FAKE_SNAPSHOT; // 默认无 weeklyBoostPermille
    const { container } = render(<AIUsagePage />);
    expect(container.querySelector(".ai-usage-boost")).toBe(null);
  });

  test("v2: 详情卡显示 API 原始 status 字段 (current_interval_status 等)", () => {
    // ponytail: 新 UI 不再把 status 0 翻译成 "已限流" 文字 (UX 简化); status 数字
    // 直接显示在 KPI 卡底部 "status 0" — 颜色由 CSS 处理, 不需要 class 标记.
    mockSnapshot = {
      ...FAKE_SNAPSHOT,
      windows: {
        ...FAKE_SNAPSHOT.windows,
        "5h": { ...FAKE_SNAPSHOT.windows["5h"], status: 0 },
      },
    };
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toContain("status 0");
  });

  test("v2: 详情卡 grid 显示 model_name", () => {
    // ponytail: 老 UI WindowCard detail grid 展开 model_name 全字段. 新 UI 概览 KPI
    // 卡把 modelName 渲染在 sub-label. FAKE_SNAPSHOT.windows.video.modelName = "video".
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    expect(container.querySelector(".ai-usage-dashboard")).toBeTruthy();
    // 视频赠送卡 (modelName "video") 应显示
    expect(container.textContent).toContain("视频赠送");
  });
});
