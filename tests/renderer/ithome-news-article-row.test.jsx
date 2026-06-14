/**
 * tests/renderer/ithome-news-article-row.test.jsx
 *
 * NewsArticleRow 文案行为：AI 总结按钮在 excerpt 短时要分两段反馈
 * (抓取正文中 → 总结中)，excerpt/body 已够长则只显示"总结中"。
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/preact";

const { mockSummarize, mockSummaries, mockFavorites, mockReadIds, mockNewIds, mockMarkRead } = vi.hoisted(() => ({
  mockSummarize: vi.fn(),
  mockSummaries: { value: {} },
  mockFavorites: { value: {} },
  mockReadIds: { value: {} },
  mockNewIds: { value: {} },
  mockMarkRead: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../../src/renderer/ithome/store.js", () => ({
  ithomeSummaries: mockSummaries,
  ithomeFavorites: mockFavorites,
  ithomeReadIds: mockReadIds,
  ithomeNewIds: mockNewIds,
  summarizeIthomeArticle: mockSummarize,
  toggleIthomeFavorite: vi.fn(),
  markIthomeRead: mockMarkRead,
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

describe("NewsArticleRow 已读/新 视觉", () => {
  const ARTICLE_ID = "https://www.ithome.com/0/1/1.htm";
  beforeEach(() => {
    mockReadIds.value = {};
    mockNewIds.value = {};
  });
  afterEach(() => cleanup());

  it("已读: 加 is-read class + meta 行有 已读 tag", () => {
    mockReadIds.value = { [ARTICLE_ID]: Date.now() };
    const article = makeArticle({ excerpt: "x".repeat(500) });
    const { container, getByText } = render(<NewsArticleRow article={article} />);
    expect(container.querySelector(".ithome-row").classList.contains("is-read")).toBe(true);
    expect(getByText("已读")).toBeTruthy();
  });

  it("新文章: 加 is-new class + meta 行有 新 tag", () => {
    mockNewIds.value = { [ARTICLE_ID]: 1 };
    const article = makeArticle({ excerpt: "x".repeat(500) });
    const { container, getByText } = render(<NewsArticleRow article={article} />);
    expect(container.querySelector(".ithome-row").classList.contains("is-new")).toBe(true);
    expect(getByText("新")).toBeTruthy();
  });

  it("点标题时调用 markIthomeRead", async () => {
    const article = makeArticle({ excerpt: "x".repeat(500) });
    const { getByText } = render(<NewsArticleRow article={article} />);
    await act(async () => {
      fireEvent.click(getByText("测试标题"));
    });
    expect(mockMarkRead).toHaveBeenCalledWith(ARTICLE_ID);
  });
});
