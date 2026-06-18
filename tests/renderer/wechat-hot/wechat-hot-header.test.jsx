/**
 * tests/renderer/wechat-hot/wechat-hot-header.test.jsx
 *
 * WechatHotHeader: 标题 + 副标题 + 刷新按钮 (含 15s 冷却) + 搜索框 + 错误 banner.
 * 与 src/renderer/ithome/NewsHeader.jsx 结构对齐, 冷却倒计时通过 store 中
 * wechatHotLastRefreshAt 信号 + 1s tick 实现.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/preact";

const { mockRefresh, mockWechatHotSignals } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockWechatHotSignals: {
    wechatHotError: { value: null },
    wechatHotLastRefreshAt: { value: 0 },
    wechatHotLoading: { value: false },
  },
}));

vi.mock("../../../src/renderer/wechat-hot/store.js", () => ({
  refreshWechatHot: mockRefresh,
  wechatHotError: mockWechatHotSignals.wechatHotError,
  wechatHotLastRefreshAt: mockWechatHotSignals.wechatHotLastRefreshAt,
  wechatHotLoading: mockWechatHotSignals.wechatHotLoading,
}));

import { WechatHotHeader } from "../../../src/renderer/wechat-hot/components/WechatHotHeader.jsx";

beforeEach(() => {
  cleanup();
  mockRefresh.mockReset();
  mockWechatHotSignals.wechatHotError.value = null;
  mockWechatHotSignals.wechatHotLastRefreshAt.value = 0;
  mockWechatHotSignals.wechatHotLoading.value = false;
});

afterEach(() => {
  vi.useRealTimers();
});

const baseProps = {
  itemCount: 30,
  source: "tenhot",
  lastFetched: 1700000000000,
  query: "",
  onQueryChange: vi.fn(),
};

describe("WechatHotHeader", () => {
  it("renders title + subtitle (count, source, time)", () => {
    const { container } = render(<WechatHotHeader {...baseProps} />);
    expect(container.textContent).toContain("微信热搜");
    expect(container.textContent).toContain("30 条");
    expect(container.textContent).toContain("tenhot");
  });

  it("search input change calls onQueryChange", () => {
    const onQueryChange = vi.fn();
    const { container } = render(<WechatHotHeader {...baseProps} onQueryChange={onQueryChange} />);
    const input = container.querySelector("#wechat-hot-search-input");
    fireEvent.input(input, { target: { value: "苹果" } });
    expect(onQueryChange).toHaveBeenCalledWith("苹果");
  });

  it("refresh button click calls refreshWechatHot", async () => {
    mockRefresh.mockResolvedValueOnce(true);
    const { container } = render(<WechatHotHeader {...baseProps} />);
    const btn = container.querySelector(".wechat-hot-header-refresh");
    await fireEvent.click(btn);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows error banner when wechatHotError is set", () => {
    mockWechatHotSignals.wechatHotError.value = "拉取失败";
    const { container } = render(<WechatHotHeader {...baseProps} />);
    expect(container.textContent).toContain("拉取失败");
    expect(container.querySelector(".wechat-hot-header-error")).toBeTruthy();
  });

  it("during 15s cooldown, refresh button is disabled and shows '冷却 Ns'", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    mockWechatHotSignals.wechatHotLastRefreshAt.value = 1_000_000_000_000;
    const { container } = render(<WechatHotHeader {...baseProps} />);
    const btn = container.querySelector(".wechat-hot-header-refresh");
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/冷却\s*\d+s/);
  });
});