/**
 * tests/renderer/twitter-serenity/SerenityTweetDetail.test.jsx
 *
 * Task 13: SerenityTweetDetail 渲染 + 翻译按钮交互.
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";

// mock api.js — 用 vi.hoisted 避免 hoisting 引用未初始化变量
const { twitterTranslate } = vi.hoisted(() => ({
  twitterTranslate: vi.fn(),
}));
vi.mock("../../../src/renderer/api.js", () => ({
  api: { twitterTranslate },
}));

import { SerenityTweetDetail } from "../../../src/renderer/twitter-serenity/SerenityTweetDetail.jsx";

beforeEach(() => {
  vi.clearAllMocks();
});

const baseTweet = {
  id: "1",
  text: "hello $NVDA",
  url: "https://x.com/h/status/1",
  author: { handle: "h", displayName: "Serenity" },
  publishedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
  fetchedAt: new Date().toISOString(),
  metrics: { likes: 5, retweets: 2, replies: 1 },
};

describe("SerenityTweetDetail", () => {
  it("渲染作者/时间/metrics/原文链接", () => {
    const { getByText } = render(<SerenityTweetDetail tweet={baseTweet} />);
    expect(getByText("Serenity")).toBeTruthy();
    expect(getByText(/原文/)).toBeTruthy();
    expect(getByText(/❤️\s*5/)).toBeTruthy();
  });

  it("无译文时显示翻译按钮, 点击调 api.twitterTranslate", async () => {
    twitterTranslate.mockResolvedValue({ ok: true, id: "1", zh: "你好" });
    const onTranslated = vi.fn();
    const { container } = render(
      <SerenityTweetDetail tweet={baseTweet} onTranslated={onTranslated} />,
    );
    const btn = container.querySelector(".serenity-translate-btn");
    fireEvent.click(btn);
    await waitFor(() => expect(twitterTranslate).toHaveBeenCalled());
    await waitFor(() => expect(onTranslated).toHaveBeenCalledWith("1", "你好"));
  });

  it("有译文时默认显示译文 + AI 译文标签", () => {
    const { getByText, container } = render(
      <SerenityTweetDetail
        tweet={baseTweet}
        translatedZh="你好"
        onTranslated={() => {}}
      />,
    );
    expect(getByText(/你好/)).toBeTruthy();
    expect(getByText(/AI 译文/)).toBeTruthy();
    // 翻译按钮不出现 (已有译文)
    expect(container.querySelector(".serenity-translate-btn")).toBeFalsy();
    // 看原文按钮出现
    expect(getByText("看原文")).toBeTruthy();
  });

  it("看原文/看译文切换", () => {
    const { container } = render(
      <SerenityTweetDetail
        tweet={baseTweet}
        translatedZh="你好"
        onTranslated={() => {}}
      />,
    );
    const textEl = () => container.querySelector(".serenity-tweet-text");
    fireEvent.click(container.querySelector(".serenity-toggle-original"));
    expect(textEl().textContent).toMatch(/hello \$NVDA/);
    fireEvent.click(container.querySelector(".serenity-toggle-original"));
    expect(textEl().textContent).toMatch(/你好/);
  });

  it("translate 失败显示错误提示", async () => {
    twitterTranslate.mockResolvedValue({ ok: false, error: "quota" });
    const { container, getByText } = render(
      <SerenityTweetDetail tweet={baseTweet} onTranslated={() => {}} />,
    );
    fireEvent.click(container.querySelector(".serenity-translate-btn"));
    await waitFor(() =>
      expect(getByText("翻译失败,点击重试")).toBeTruthy(),
    );
  });

  it("author 缺失时显示 unknown 不崩", () => {
    const t = { ...baseTweet, author: {} };
    const { getByText } = render(<SerenityTweetDetail tweet={t} />);
    expect(getByText("unknown")).toBeTruthy();
  });
});
