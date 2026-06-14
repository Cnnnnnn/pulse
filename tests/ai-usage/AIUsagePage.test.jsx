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
let mockLastError = null;
let mockFetching = false;
let mockFromCache = true;
const fetchCalls = [];

vi.mock("../../src/renderer/store/ai-usage-store.js", () => ({
  get aiUsageSnapshot() {
    return { get value() { return mockSnapshot; } };
  },
  get aiUsageLastError() {
    return { get value() { return mockLastError; } };
  },
  get aiUsageFetching() {
    return { get value() { return mockFetching; } };
  },
  get aiUsageFromCache() {
    return { get value() { return mockFromCache; } };
  },
  fetchAiUsage: (...args) => {
    fetchCalls.push(args);
    return Promise.resolve({ ok: true });
  },
}));

const { AIUsagePage } = await import(
  "../../src/renderer/components/AIUsagePage.jsx"
);

const FAKE_SNAPSHOT = {
  provider: "minimax",
  region: "cn",
  fetchedAt: Date.now() - 60_000,
  endpoint: "https://www.minimaxi.com/v1/token_plan/remains",
  windows: {
    "5h": {
      total: 6000,
      remaining: 4200,
      used: 1800,
      usedPercent: 30,
      resetAt: Date.now() + 3600_000,
      resetInSec: 3600,
      endTime: Date.now() + 3600_000,
      label: "5 小时滚动窗口",
      status: 1,
    },
    weekly: {
      total: 50000,
      remaining: 12000,
      used: 38000,
      usedPercent: 76,
      resetAt: Date.now() + 5 * 86400_000,
      resetInSec: 5 * 86400,
      endTime: Date.now() + 5 * 86400_000,
      label: "周窗口",
      status: 1,
    },
    video: {
      total: 3,
      remaining: 0,
      used: 3,
      usedPercent: 100,
      resetInSec: 5 * 86400,
      endTime: Date.now() + 5 * 86400_000,
      label: "视频赠送",
      modelName: "video",
      status: 1,
    },
  },
  credits: null,
};

beforeEach(() => {
  mockSnapshot = null;
  mockLastError = null;
  mockFetching = false;
  mockFromCache = true;
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

  test("刷新按钮 click → 调 fetchAiUsage", async () => {
    mockSnapshot = FAKE_SNAPSHOT;
    const { container } = render(<AIUsagePage />);
    const btn = container.querySelector(".ai-usage-refresh-btn");
    await fireEvent.click(btn);
    expect(fetchCalls).toEqual([[]]);
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
});
