/**
 * tests/renderer/wechat-hot/wechat-hot-layout.test.jsx
 *
 * WechatHotLayout: 顶层容器.
 * - mount 时调用 bootstrapWechatHotTab + subscribeWechatHotUpdates.
 * - unmount 时调用 cleanupWechatHotUpdates.
 * - 渲染 WechatHotHeader + WechatHotList (wrapper 为 .wechat-hot-body, 与 List 内部的
 *   .wechat-hot-list 区分, 避免 class 冲突).
 * - 持有 search 状态: input 改变后 List 只渲染匹配的项.
 * - 根据 store signals 推算 reason: loading / error / empty / no-match.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";

const { mockBootstrap, mockSubscribe, mockCleanup, mockRefresh, signals } = vi.hoisted(() => ({
  mockBootstrap: vi.fn(),
  mockSubscribe: vi.fn(),
  mockCleanup: vi.fn(),
  mockRefresh: vi.fn(),
  signals: {
    wechatHotItems: { value: [] },
    wechatHotLoaded: { value: false },
    wechatHotLoading: { value: false },
    wechatHotError: { value: null },
    wechatHotLastFetched: { value: 0 },
    wechatHotLastRefreshAt: { value: 0 },
  },
}));

vi.mock("../../../src/renderer/wechat-hot/store.js", () => ({
  bootstrapWechatHotTab: mockBootstrap,
  subscribeWechatHotUpdates: mockSubscribe,
  cleanupWechatHotUpdates: mockCleanup,
  refreshWechatHot: mockRefresh,
  wechatHotItems: signals.wechatHotItems,
  wechatHotLoaded: signals.wechatHotLoaded,
  wechatHotLoading: signals.wechatHotLoading,
  wechatHotError: signals.wechatHotError,
  wechatHotLastFetched: signals.wechatHotLastFetched,
  wechatHotLastRefreshAt: signals.wechatHotLastRefreshAt,
}));

import { WechatHotLayout } from "../../../src/renderer/wechat-hot/components/WechatHotLayout.jsx";

beforeEach(() => {
  cleanup();
  mockBootstrap.mockReset();
  mockSubscribe.mockReset();
  mockCleanup.mockReset();
  mockRefresh.mockReset();
  signals.wechatHotItems.value = [];
  signals.wechatHotLoaded.value = false;
  signals.wechatHotLoading.value = false;
  signals.wechatHotError.value = null;
  signals.wechatHotLastFetched.value = 0;
  signals.wechatHotLastRefreshAt.value = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WechatHotLayout", () => {
  it("on mount: calls bootstrap + subscribe", () => {
    mockBootstrap.mockResolvedValueOnce(undefined);
    mockSubscribe.mockReturnValueOnce(() => {});
    render(<WechatHotLayout />);
    expect(mockBootstrap).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });

  it("on unmount: calls cleanupWechatHotUpdates", () => {
    mockBootstrap.mockResolvedValueOnce(undefined);
    mockSubscribe.mockReturnValueOnce(() => {});
    const { unmount } = render(<WechatHotLayout />);
    unmount();
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it("renders Header + List body wrapper", () => {
    mockBootstrap.mockResolvedValueOnce(undefined);
    mockSubscribe.mockReturnValueOnce(() => {});
    const { container } = render(<WechatHotLayout />);
    expect(container.querySelector(".wechat-hot-header")).toBeTruthy();
    expect(container.querySelector(".wechat-hot-body")).toBeTruthy();
  });

  it("typing in search input narrows the list (integration)", () => {
    mockBootstrap.mockResolvedValueOnce(undefined);
    mockSubscribe.mockReturnValueOnce(() => {});
    signals.wechatHotItems.value = [
      { rank: 1, title: "苹果发布会", url: "https://a" },
      { rank: 2, title: "腾讯收购暴雪", url: "https://b" },
    ];
    const { container } = render(<WechatHotLayout />);
    const input = container.querySelector("#wechat-hot-search-input");
    fireEvent.input(input, { target: { value: "苹果" } });
    const rows = container.querySelectorAll(".wechat-hot-list-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("苹果");
  });

  it("renders with reason=loading when loading=true and items empty", () => {
    mockBootstrap.mockResolvedValueOnce(undefined);
    mockSubscribe.mockReturnValueOnce(() => {});
    signals.wechatHotLoading.value = true;
    signals.wechatHotItems.value = [];
    const { container } = render(<WechatHotLayout />);
    expect(container.textContent).toMatch(/正在拉取热搜/);
  });

  it("renders with reason=no-match when items exist but search matches none", () => {
    mockBootstrap.mockResolvedValueOnce(undefined);
    mockSubscribe.mockReturnValueOnce(() => {});
    signals.wechatHotItems.value = [
      { rank: 1, title: "苹果发布会", url: "https://a" },
    ];
    const { container } = render(<WechatHotLayout />);
    const input = container.querySelector("#wechat-hot-search-input");
    fireEvent.input(input, { target: { value: "完全不存在的内容" } });
    expect(container.textContent).toMatch(/未找到「完全不存在的内容」/);
    expect(container.querySelectorAll(".wechat-hot-list-row")).toHaveLength(0);
  });
});