/**
 * tests/renderer/ithome-news-article-row.test.jsx
 *
 * NewsArticleRow 文案行为：AI 总结按钮在 excerpt 短时要分两段反馈
 * (抓取正文中 → 总结中)，excerpt/body 已够长则只显示"总结中"。
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/preact";

const { mockSummarize, mockSummaries, mockFavorites } = vi.hoisted(() => ({
  mockSummarize: vi.fn(),
  mockSummaries: { value: {} },
  mockFavorites: { value: {} },
}));

vi.mock("../../src/renderer/ithome/store.js", () => ({
  ithomeSummaries: mockSummaries,
  ithomeFavorites: mockFavorites,
  summarizeIthomeArticle: mockSummarize,
  toggleIthomeFavorite: vi.fn(),
}));

vi.mock("../../src/renderer/store.js", () => ({
  refreshAIReadyStatus: () => Promise.resolve(true),
}));

import { NewsArticleRow } from "../../src/renderer/ithome/NewsArticleRow.jsx";

const RE_FETCHING = /\u6293\u53d6\u6b63\u6587\u4e2d/;
const RE_SUMMARIZING = /\u603b\u7ed3\u4e2d/;

function makeArticle({ excerpt = "", body = "" } = {}) {
  return {
    id: "https://www.ithome.com/0/1/1.htm",
    title: "测试标题",
    link: "https://www.ithome.com/0/1/1.htm",
    pubDate: "2026-06-12T10:00:00+08:00",
    excerpt,
    body,
    dateKey: "2026-06-12",
  };
}

describe("NewsArticleRow AI 总结按钮", () => {
  beforeEach(() => {
    mockSummarize.mockReset();
  });
  afterEach(() => cleanup());

  it("excerpt 短：点 AI 总结后按钮立即显示 抓取正文中", async () => {
    let resolveSummarize;
    mockSummarize.mockImplementation(
      () => new Promise((resolve) => { resolveSummarize = () => resolve({ ok: true, text: "摘要" }); }),
    );
    const article = makeArticle({ excerpt: "短" });
    const { getByText, queryByText } = render(<NewsArticleRow article={article} />);

    await act(async () => {
      fireEvent.click(getByText(/AI \u603b\u7ed3/));
    });
    expect(queryByText(RE_FETCHING)).not.toBeNull();
    expect(queryByText(RE_SUMMARIZING)).toBeNull();

    await act(async () => {
      resolveSummarize();
    });
  });

  it("excerpt 已够长：点 AI 总结后按钮直接显示 总结中", async () => {
    let resolveSummarize;
    mockSummarize.mockImplementation(
      () => new Promise((resolve) => { resolveSummarize = () => resolve({ ok: true, text: "摘要" }); }),
    );
    const longExcerpt = "x".repeat(500);
    const article = makeArticle({ excerpt: longExcerpt });
    const { queryByText, getByText } = render(<NewsArticleRow article={article} />);

    await act(async () => {
      fireEvent.click(getByText(/AI \u603b\u7ed3/));
    });
    expect(queryByText(RE_FETCHING)).toBeNull();
    expect(queryByText(RE_SUMMARIZING)).not.toBeNull();

    await act(async () => {
      resolveSummarize();
    });
  });

  it("已存在 body：点 AI 总结后按钮直接显示 总结中", async () => {
    let resolveSummarize;
    mockSummarize.mockImplementation(
      () => new Promise((resolve) => { resolveSummarize = () => resolve({ ok: true, text: "摘要" }); }),
    );
    const longBody = "x".repeat(500);
    const article = makeArticle({ excerpt: "短", body: longBody });
    const { queryByText, getByText } = render(<NewsArticleRow article={article} />);

    await act(async () => {
      fireEvent.click(getByText(/AI \u603b\u7ed3/));
    });
    expect(queryByText(RE_FETCHING)).toBeNull();
    expect(queryByText(RE_SUMMARIZING)).not.toBeNull();

    await act(async () => {
      resolveSummarize();
    });
  });
});
