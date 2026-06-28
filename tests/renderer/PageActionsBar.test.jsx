// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { PageActionsBar } from "../../src/renderer/components/PageActionsBar.jsx";
import { closePalette } from "../../src/renderer/command-palette-store.js";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    detectResultsExport: vi.fn(async () => ({ ok: true })),
    openUrl: vi.fn(),
    versionsRunCheck: vi.fn(async () => ({ started: true })),
    releaseNotesGetCurrent: vi.fn(async () => null),
  },
}));

vi.mock("../../src/renderer/route-store.js", () => ({
  navigateTo: vi.fn(),
}));

vi.mock("../../src/renderer/store/ai-store.js", () => ({
  toggleDigestDrawer: () => {},
}));
vi.mock("../../src/renderer/watchlist/watchlist-store.js", () => ({
  toggleWatchlistDrawer: () => {},
}));
vi.mock("../../src/renderer/diagnostics/diagnostics-store.js", () => ({
  toggleDiagnosticsDrawer: () => {},
}));
vi.mock("../../src/renderer/reminders/remindersStore.js", () => ({
  toggleRemindersOpen: () => {},
}));
vi.mock("../../src/renderer/recent/recentStore.js", () => ({
  toggleRecentOpen: () => {},
}));
vi.mock("../../src/renderer/release-notes-store.js", () => ({
  openReleaseNotes: () => {},
}));

beforeEach(() => {
  cleanup();
  closePalette();
  document.body.querySelectorAll(".page-action-menu-portal").forEach((el) => el.remove());
});

describe("PageActionsBar", () => {
  it("渲染 AI button", () => {
    const { container } = render(<PageActionsBar />);
    expect(container.querySelector('[aria-label="AI 任务"]')).toBeTruthy();
  });

  // 2026-06-28: AI 任务 icon 从 IconSparkles 换成 IconBot.
  // Sparkle 太花哨不严肃, Bot 更稳重适合常驻入口.
  it("AI 任务 button 用 IconBot (不是 sparkle)", () => {
    const { container } = render(<PageActionsBar />);
    const btn = container.querySelector('[data-testid="page-action-ai-tasks"]');
    expect(btn).toBeTruthy();
    // IconBot path: rect (3,8) + circle cx=9 + circle cx=15 (两只眼睛)
    // Sparkle 4 个尖角菱形. 我们断言存在 <rect> 元素 + 两个 <circle> 眼睛
    // (Sparkle 只有 <path>, 没有 rect/circle) — 区分两种 icon.
    expect(btn.querySelector("rect")).toBeTruthy();
    expect(btn.querySelectorAll("circle").length).toBeGreaterThanOrEqual(2);
  });

  // 2026-06-28: 守护 .page-action-icon-btn className 一致性 — Phase 32 重构后
  // 这个 class 没 stylesheet 定义, 导致浏览器 default <button> border 露出
  // 灰边框 + 无 hover 反馈. 这里只验证 className 在按钮上, CSS 是否被命中
  // 靠肉眼 + build. 加这个测试避免有人误删 className 让 CSS 脱钩.
  it("AI 任务 + overflow 触发器 都带 .page-action-icon-btn className (CSS 钩子)", () => {
    const { container } = render(<PageActionsBar />);
    const ai = container.querySelector('[data-testid="page-action-ai-tasks"]');
    const overflow = container.querySelector('[data-testid="page-action-overflow-toggle"]');
    expect(ai.classList.contains("page-action-icon-btn")).toBe(true);
    expect(overflow.classList.contains("page-action-icon-btn")).toBe(true);
  });
});