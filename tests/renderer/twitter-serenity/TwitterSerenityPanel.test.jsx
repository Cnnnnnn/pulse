/**
 * tests/renderer/twitter-serenity/TwitterSerenityPanel.test.jsx
 *
 * Task 15: 面板挂载调 twitterList, 渲染 tweets; degraded 横幅; 强制刷新调 twitterFetch.
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/preact";

const {
  twitterList,
  twitterFetch,
  twitterTranslate,
  twitterManualPaste,
} = vi.hoisted(() => ({
  twitterList: vi.fn(),
  twitterFetch: vi.fn(),
  twitterTranslate: vi.fn(),
  twitterManualPaste: vi.fn(),
}));

vi.mock("../../../src/renderer/api.js", () => ({
  api: {
    twitterList,
    twitterFetch,
    twitterTranslate,
    twitterSourcesList: vi.fn().mockResolvedValue([]),
    twitterSourcesAdd: vi.fn(),
    twitterSourcesRemove: vi.fn(),
    twitterSourcesTest: vi.fn(),
    twitterManualPaste,
  },
}));

import { TwitterSerenityPanel } from "../../../src/renderer/twitter-serenity/TwitterSerenityPanel.jsx";
import { resetSerenityStore } from "../../../src/renderer/twitter-serenity/store.js";

beforeEach(() => {
  vi.clearAllMocks();
  resetSerenityStore();
  twitterList.mockResolvedValue({
    tweets: [
      {
        id: "1",
        text: "hello $NVDA",
        author: { handle: "h", displayName: "Serenity" },
        publishedAt: new Date().toISOString(),
        metrics: { likes: 1 },
        url: "https://x.com/h/status/1",
      },
    ],
    lastFetchedAt: new Date().toISOString(),
    degraded: false,
  });
});

afterEach(() => {
  cleanup();
});

describe("TwitterSerenityPanel", () => {
  it("挂载后调 twitterList 并渲染 tweets", async () => {
    const { container, getByText } = render(<TwitterSerenityPanel />);
    await waitFor(() => expect(twitterList).toHaveBeenCalled());
    // tweets 出现在 list 里 (SerenityTweetDetail 渲染作者名)
    await waitFor(() => expect(getByText("Serenity")).toBeTruthy());
    expect(container.querySelector(".serenity-tweet")).toBeTruthy();
  });

  it("degraded=true 时显示降级横幅 + 手动粘贴按钮", async () => {
    twitterList.mockResolvedValueOnce({
      tweets: [],
      lastFetchedAt: null,
      degraded: true,
    });
    const { getByText } = render(<TwitterSerenityPanel />);
    await waitFor(() => expect(getByText("镜像源不可用")).toBeTruthy());
    expect(getByText("点击手动粘贴")).toBeTruthy();
  });

  it("点强制刷新调 twitterFetch", async () => {
    twitterFetch.mockResolvedValue({ tweets: [] });
    const { getByText } = render(<TwitterSerenityPanel />);
    await waitFor(() => expect(twitterList).toHaveBeenCalled());
    fireEvent.click(getByText("强制刷新"));
    await waitFor(() => expect(twitterFetch).toHaveBeenCalled());
  });

  it("twitterList 抛错时显示错误条", async () => {
    twitterList.mockRejectedValueOnce(new Error("network down"));
    const { getByText } = render(<TwitterSerenityPanel />);
    await waitFor(() => expect(getByText(/加载失败/)).toBeTruthy());
  });

  it("点手动粘贴提交调 twitterManualPaste", async () => {
    twitterList.mockResolvedValueOnce({
      tweets: [],
      lastFetchedAt: null,
      degraded: true,
    });
    twitterManualPaste.mockResolvedValue({
      ok: true,
      results: [{ id: "1", author: { handle: "h" } }],
      errors: [],
    });
    const { getByText, container } = render(<TwitterSerenityPanel />);
    await waitFor(() => expect(getByText("镜像源不可用")).toBeTruthy());
    fireEvent.click(getByText("点击手动粘贴"));
    const textarea = container.querySelector(".serenity-paste-box textarea");
    expect(textarea).toBeTruthy();
    fireEvent.input(textarea, {
      target: { value: "https://x.com/h/status/9" },
    });
    fireEvent.click(getByText("提交"));
    await waitFor(() => expect(twitterManualPaste).toHaveBeenCalled());
  });
});
