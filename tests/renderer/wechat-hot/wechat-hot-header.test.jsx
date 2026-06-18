/**
 * tests/renderer/wechat-hot/wechat-hot-header.test.jsx
 *
 * WechatHotHeader: 标题 + 副标题 + 刷新按钮 (含 15s 冷却) + 搜索框 + 错误 banner.
 * 副标题数据 (count, lastFetched) 从 store signals 读取, search 状态由 Layout 通过
 * props 传入. 冷却倒计时通过 wechatHotLastRefreshAt + useNowTick(1000) 实现.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";

const { mockRefresh, mockWechatHotSignals } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockWechatHotSignals: {
    wechatHotError: { value: null },
    wechatHotItems: { value: [] },
    wechatHotLastFetched: { value: 1700000000000 },
    wechatHotLastRefreshAt: { value: 0 },
    wechatHotLoading: { value: false },
  },
}));

vi.mock("../../../src/renderer/wechat-hot/store.js", () => ({
  refreshWechatHot: mockRefresh,
  wechatHotError: mockWechatHotSignals.wechatHotError,
  wechatHotItems: mockWechatHotSignals.wechatHotItems,
  wechatHotLastFetched: mockWechatHotSignals.wechatHotLastFetched,
  wechatHotLastRefreshAt: mockWechatHotSignals.wechatHotLastRefreshAt,
  wechatHotLoading: mockWechatHotSignals.wechatHotLoading,
}));

import { WechatHotHeader } from "../../../src/renderer/wechat-hot/components/WechatHotHeader.jsx";

const baseProps = {
  search: "",
  onSearchChange: vi.fn(),
};

beforeEach(() => {
  cleanup();
  mockRefresh.mockReset();
  mockWechatHotSignals.wechatHotError.value = null;
  mockWechatHotSignals.wechatHotItems.value = [];
  mockWechatHotSignals.wechatHotLastFetched.value = 1700000000000;
  mockWechatHotSignals.wechatHotLastRefreshAt.value = 0;
  mockWechatHotSignals.wechatHotLoading.value = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WechatHotHeader", () => {
  it("renders title + subtitle (count, source, time) from store signals", () => {
    mockWechatHotSignals.wechatHotItems.value = Array.from({ length: 30 }, (_, i) => ({
      rank: i + 1,
      title: `item ${i + 1}`,
      url: `https://a/${i}`,
    }));
    mockWechatHotSignals.wechatHotLastFetched.value = 1700000000000;
    const { container } = render(<WechatHotHeader {...baseProps} />);
    expect(container.textContent).toContain("微博热搜");
    expect(container.textContent).toContain("30 条");
    expect(container.textContent).toContain("xxapi");
  });

  it("search input change calls onSearchChange", () => {
    const onSearchChange = vi.fn();
    const { container } = render(<WechatHotHeader {...baseProps} onSearchChange={onSearchChange} />);
    const input = container.querySelector("#wechat-hot-search-input");
    fireEvent.input(input, { target: { value: "苹果" } });
    expect(onSearchChange).toHaveBeenCalledWith("苹果");
  });

  it("search input has correct id (Cmd+F focus target)", () => {
    const { container } = render(<WechatHotHeader {...baseProps} />);
    const input = container.querySelector("#wechat-hot-search-input");
    expect(input).toBeTruthy();
    expect(input.id).toBe("wechat-hot-search-input");
  });

  it("refresh button click calls refreshWechatHot", () => {
    const { container } = render(<WechatHotHeader {...baseProps} />);
    const btn = container.querySelector(".wechat-hot-header-refresh");
    fireEvent.click(btn);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("refresh button is enabled when not in cooldown", () => {
    const { container } = render(<WechatHotHeader {...baseProps} />);
    const btn = container.querySelector(".wechat-hot-header-refresh");
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain("↻ 刷新");
  });

  it("shows error banner when wechatHotError is set", () => {
    mockWechatHotSignals.wechatHotError.value = "拉取失败";
    const { container } = render(<WechatHotHeader {...baseProps} />);
    expect(container.textContent).toContain("拉取失败");
    expect(container.querySelector(".wechat-hot-header-error")).toBeTruthy();
  });

  it("empty lastFetched (zero) shows '—' in subtitle", () => {
    mockWechatHotSignals.wechatHotLastFetched.value = 0;
    const { container } = render(<WechatHotHeader {...baseProps} />);
    const subtitle = container.querySelector(".wechat-hot-header-subtitle");
    expect(subtitle.textContent).toContain("—");
  });

  it("during 15s cooldown, refresh button is disabled and shows '冷却 Ns'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    mockWechatHotSignals.wechatHotLastRefreshAt.value = 1_000_000_000_000;
    const { container } = render(<WechatHotHeader {...baseProps} />);
    const btn = container.querySelector(".wechat-hot-header-refresh");
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/冷却\s*\d+s/);
  });
});
