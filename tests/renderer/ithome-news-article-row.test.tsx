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
} = vi.hoisted(() => ({
  mockSummarize: vi.fn(),
  mockSummaries: { value: {} },
  mockFavorites: { value: {} },
  mockReadIds: { value: {} },
  mockNewIds: { value: {} },
  mockMarkRead: vi.fn().mockResolvedValue({ ok: true }),
  mockShareArticle: vi.fn().mockResolvedValue({ ok: true, bytes: 1234 }),
  mockSharingIds: { value: {} },
}));

vi.mock("../../src/renderer/ithome/store.ts", () => ({
  ithomeSummaries: mockSummaries,
  ithomeFavorites: mockFavorites,
  ithomeReadIds: mockReadIds,
  ithomeNewIds: mockNewIds,
  ithomeSharingIds: mockSharingIds,
  summarizeIthomeArticle: mockSummarize,
  toggleIthomeFavorite: vi.fn(),
  markIthomeRead: mockMarkRead,
  shareIthomeArticle: mockShareArticle,
}));

vi.mock("../../src/renderer/store.ts", () => ({
  refreshAIReadyStatus: () => Promise.resolve(true),
}));

import { NewsArticleRow } from "../../src/renderer/ithome/NewsArticleRow.tsx";

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

describe("NewsArticleRow 封面缩略图", () => {
  afterEach(() => cleanup());

  it("有 cover 字段 → 渲染 <img> 且 loading=lazy", () => {
    const article = makeArticle({ excerpt: "x".repeat(500) });
    article.cover = "https://img.ithome.com/newsuploadfiles/2026/test.jpg";
    const { container } = render(<NewsArticleRow article={article} />);
    const img = container.querySelector(".ithome-row-cover-img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("src")).toContain("test.jpg");
    expect(container.querySelector(".ithome-row.has-cover")).toBeTruthy();
  });

  it("无 cover 字段 → 不渲染缩略图容器", () => {
    const article = makeArticle({ excerpt: "x".repeat(500) });
    const { container } = render(<NewsArticleRow article={article} />);
    expect(container.querySelector(".ithome-row-cover")).toBeNull();
    expect(container.querySelector(".ithome-row.has-cover")).toBeNull();
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

  // ⋯ 菜单折叠后，分享/重新生成等次操作需先点开菜单才可见。
  function openOverflow() {
    fireEvent.click(screen.getByTestId("ithome-row-menu"));
  }

  it("仅当 summary.text 存在时渲染分享入口", () => {
    // 无摘要：菜单内只有「收藏」，无分享项
    const r1 = render(<NewsArticleRow article={baseArticle} />);
    openOverflow();
    expect(r1.queryByText(/分享/)).toBeNull();
    r1.unmount();

    // 有摘要：菜单出现「分享卡片」
    mockSummaries.value = { s1: { text: "sum", keywords: [] } };
    render(<NewsArticleRow article={baseArticle} />);
    openOverflow();
    expect(screen.getByText(/分享卡片/)).toBeTruthy();
  });

  it("分享中: 菜单项 disabled 且文案为 生成图片中", () => {
    mockSummaries.value = { s1: { text: "sum", keywords: [] } };
    mockSharingIds.value = { s1: true };
    render(<NewsArticleRow article={baseArticle} />);
    openOverflow();
    const btn = screen.getByText(/生成图片中/).closest("button");
    expect(btn?.getAttribute("disabled")).not.toBeNull();
  });

  it("点击调用 shareIthomeArticle 并显示成功 toast", async () => {
    mockSummaries.value = { s1: { text: "sum", keywords: [] } };
    render(<NewsArticleRow article={baseArticle} />);
    openOverflow();
    fireEvent.click(screen.getByText(/分享卡片/));
    await waitFor(() =>
      expect(screen.getByText(/已复制到剪贴板/)).toBeTruthy(),
    );
    expect(mockShareArticle).toHaveBeenCalledWith("s1");
  });

  it("IPC 失败时显示错误 toast", async () => {
    mockSummaries.value = { s1: { text: "sum", keywords: [] } };
    mockShareArticle.mockResolvedValueOnce({ ok: false, reason: "render_failed" });
    render(<NewsArticleRow article={baseArticle} />);
    openOverflow();
    fireEvent.click(screen.getByText(/分享卡片/));
    await waitFor(() =>
      expect(screen.getByText(/图片生成失败/)).toBeTruthy(),
    );
  });

  it("用 ithomeSharingIds 信号控制 disabled 状态", () => {
    mockSummaries.value = { s1: { text: "sum", keywords: [] } };
    // 未在分享中：菜单项可点
    mockSharingIds.value = {};
    const r1 = render(<NewsArticleRow article={baseArticle} />);
    openOverflow();
    expect(
      screen.getByText(/分享卡片/).closest("button")?.getAttribute("disabled"),
    ).toBeNull();
    r1.unmount();

    // 分享中：文案变「生成图片中」且 disabled
    mockSharingIds.value = { s1: true };
    render(<NewsArticleRow article={baseArticle} />);
    openOverflow();
    expect(
      screen.getByText(/生成图片中/).closest("button")?.getAttribute("disabled"),
    ).not.toBeNull();
  });
});
