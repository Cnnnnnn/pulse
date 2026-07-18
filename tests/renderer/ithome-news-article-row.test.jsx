/**
 * tests/renderer/ithome-news-article-row.test.jsx
 *
 * NewsArticleRow 文案行为：AI 总结按钮在 excerpt 短时要分两段反馈
 * (抓取正文中 → 总结中)，excerpt/body 已够长则只显示"总结中"。
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, act, screen, waitFor } from "@testing-library/preact";

const {
  mockSummarize,
  mockSummaries,
  mockFavorites,
  mockReadIds,
  mockNewIds,
  mockMarkRead,
  mockShareArticle,
  mockSharingIds,
  mockComments,
  mockFetchComments,
} = vi.hoisted(() => ({
  mockSummarize: vi.fn(),
  mockSummaries: { value: {} },
  mockFavorites: { value: {} },
  mockReadIds: { value: {} },
  mockNewIds: { value: {} },
  mockMarkRead: vi.fn().mockResolvedValue({ ok: true }),
  mockShareArticle: vi.fn().mockResolvedValue({ ok: true, bytes: 1234 }),
  mockSharingIds: { value: {} },
  mockComments: { value: {} },
  mockFetchComments: vi.fn(),
}));

vi.mock("../../src/renderer/ithome/store.js", () => ({
  ithomeSummaries: mockSummaries,
  ithomeFavorites: mockFavorites,
  ithomeReadIds: mockReadIds,
  ithomeNewIds: mockNewIds,
  ithomeSharingIds: mockSharingIds,
  ithomeComments: mockComments,
  summarizeIthomeArticle: mockSummarize,
  fetchIthomeComments: mockFetchComments,
  toggleIthomeFavorite: vi.fn(),
  markIthomeRead: mockMarkRead,
  shareIthomeArticle: mockShareArticle,
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

function queueCommentResult(result) {
  mockFetchComments.mockImplementationOnce(async (id) => {
    if (result && result.ok) {
      mockComments.value = {
        ...mockComments.value,
        [id]: Array.isArray(result.comments) ? result.comments : [],
      };
    }
    return result;
  });
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

describe("NewsArticleRow 评论按钮", () => {
  beforeEach(() => {
    mockComments.value = {};
    mockFetchComments.mockReset();
  });
  afterEach(() => cleanup());

  it("点击查看评论后加载并展示热门评论", async () => {
    const article = makeArticle({ excerpt: "摘要" });
    queueCommentResult({
      ok: true,
      comments: [
        {
          id: "1",
          author: "用户 A",
          content: "这是一条热门评论",
          createdAt: "2026-07-18T10:00:00+08:00",
          likes: 8,
        },
      ],
    });
    const { getByRole, getByText } = render(<NewsArticleRow article={article} />);

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /查看评论/ }));
    });

    expect(mockFetchComments).toHaveBeenCalledWith(article.id);
    expect(getByText("用户 A")).toBeTruthy();
    expect(getByText("这是一条热门评论")).toBeTruthy();
    expect(getByText(/支持 8/)).toBeTruthy();
  });

  it("评论失败后显示重试，重试成功后渲染评论", async () => {
    const article = makeArticle({ excerpt: "摘要" });
    queueCommentResult({ ok: false, reason: "fetch_failed" });
    queueCommentResult({
      ok: true,
      comments: [
        { id: "2", author: "用户 B", content: "重试成功", createdAt: "", likes: 0 },
      ],
    });
    const { getByRole, getByText } = render(<NewsArticleRow article={article} />);

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /查看评论/ }));
    });
    expect(getByText("评论暂时无法加载")).toBeTruthy();

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /重试/ }));
    });
    expect(getByText("重试成功")).toBeTruthy();
  });

  it("没有评论时显示明确的空状态", async () => {
    const article = makeArticle({ excerpt: "摘要" });
    queueCommentResult({ ok: true, comments: [] });
    const { getByRole, getByText } = render(<NewsArticleRow article={article} />);
    await act(async () => {
      fireEvent.click(getByRole("button", { name: /查看评论/ }));
    });
    expect(getByText("暂无热门评论")).toBeTruthy();
  });

  it("按钮在加载中显示 评论加载中 文案", async () => {
    const article = makeArticle({ excerpt: "摘要" });
    let resolveResult;
    mockFetchComments.mockImplementationOnce(
      () => new Promise((resolve) => { resolveResult = () => resolve({ ok: true, comments: [] }); }),
    );
    const { getByRole } = render(<NewsArticleRow article={article} />);
    await act(async () => {
      fireEvent.click(getByRole("button", { name: /查看评论/ }));
    });
    expect(getByRole("button", { name: /评论加载中/ })).toBeTruthy();
    await act(async () => {
      resolveResult();
    });
  });
});

describe("NewsArticleRow 分享按钮", () => {
  const baseArticle = {
    id: "s1",
    title: "Test",
    pubDate: "2026-06-17T10:00:00+08:00",
    link: "https://x",
  };

  beforeEach(() => {
    mockSummaries.value = {};
    mockSharingIds.value = {};
    mockShareArticle.mockReset();
    mockShareArticle.mockResolvedValue({ ok: true, bytes: 1234 });
  });
  afterEach(() => cleanup());

  it("仅当 summary.text 存在时渲染分享按钮", () => {
    const { rerender } = render(<NewsArticleRow article={baseArticle} />);
    expect(screen.queryByText(/分享/)).toBeNull();

    mockSummaries.value = { s1: { text: "sum", keywords: [] } };
    rerender(<NewsArticleRow article={baseArticle} />);
    expect(screen.getByText(/分享/)).toBeTruthy();
  });

  it("分享中: 按钮 disabled 且文案为 生成图片中", () => {
    mockSummaries.value = { s1: { text: "sum", keywords: [] } };
    mockSharingIds.value = { s1: true };
    render(<NewsArticleRow article={baseArticle} />);
    const btn = screen.getByText(/生成图片中/);
    expect(btn.getAttribute("disabled")).not.toBeNull();
  });

  it("点击调用 shareIthomeArticle 并显示成功 toast", async () => {
    mockSummaries.value = { s1: { text: "sum", keywords: [] } };
    render(<NewsArticleRow article={baseArticle} />);
    fireEvent.click(screen.getByText(/分享/));
    await waitFor(() =>
      expect(screen.getByText(/已复制到剪贴板/)).toBeTruthy(),
    );
    expect(mockShareArticle).toHaveBeenCalledWith("s1");
  });

  it("IPC 失败时显示错误 toast", async () => {
    mockSummaries.value = { s1: { text: "sum", keywords: [] } };
    mockShareArticle.mockResolvedValueOnce({ ok: false, reason: "render_failed" });
    render(<NewsArticleRow article={baseArticle} />);
    fireEvent.click(screen.getByText(/分享/));
    await waitFor(() =>
      expect(screen.getByText(/图片生成失败/)).toBeTruthy(),
    );
  });

  it("用 ithomeSharingIds 信号控制 disabled 状态", () => {
    mockSummaries.value = { s1: { text: "sum", keywords: [] } };
    mockSharingIds.value = {};
    const { rerender } = render(<NewsArticleRow article={baseArticle} />);
    expect(screen.getByText(/分享/).getAttribute("disabled")).toBeNull();

    mockSharingIds.value = { s1: true };
    rerender(<NewsArticleRow article={baseArticle} />);
    expect(screen.getByText(/生成图片中/).getAttribute("disabled")).not.toBeNull();
  });
});
