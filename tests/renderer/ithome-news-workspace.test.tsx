// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";

const {
  mockSummaries,
  mockFavorites,
  mockFetchBody,
  mockMarkRead,
  mockToggleFavorite,
  mockSummarize,
} = vi.hoisted(() => ({
  mockSummaries: { value: {} },
  mockFavorites: { value: {} },
  mockFetchBody: vi.fn().mockResolvedValue({ ok: true, body: "x".repeat(260) }),
  mockMarkRead: vi.fn().mockResolvedValue({ ok: true }),
  mockToggleFavorite: vi.fn().mockResolvedValue({ ok: true, favorited: true }),
  mockSummarize: vi.fn().mockResolvedValue({ ok: true, text: "生成的摘要" }),
}));

vi.mock("../../src/renderer/ithome/store.ts", () => ({
  ithomeSummaries: mockSummaries,
  ithomeFavorites: mockFavorites,
  fetchIthomeArticleBody: mockFetchBody,
  markIthomeRead: mockMarkRead,
  toggleIthomeFavorite: mockToggleFavorite,
  summarizeIthomeArticle: mockSummarize,
}));

vi.mock("../../src/renderer/store.ts", () => ({
  refreshAIReadyStatus: () => Promise.resolve(true),
}));

import { NewsReader } from "../../src/renderer/ithome/NewsReader.tsx";
import { NewsAnalysisPanel } from "../../src/renderer/ithome/NewsAnalysisPanel.tsx";

const ARTICLE = {
  id: "a1",
  title: "测试新闻标题",
  link: "https://www.ithome.com/a1",
  pubDate: "2026-08-07T10:00:00+08:00",
  category: "AI",
  excerpt: "短摘要",
  body: "正文段落。".repeat(80),
};

describe("IT 新闻阅读工作台", () => {
  beforeEach(() => {
    mockSummaries.value = {};
    mockFavorites.value = {};
    mockFetchBody.mockClear();
    mockMarkRead.mockClear();
    mockToggleFavorite.mockClear();
    mockSummarize.mockClear();
  });

  afterEach(() => cleanup());

  it("正文足够长时直接展示正文，不触发额外抓取", () => {
    render(<NewsReader article={ARTICLE} />);

    expect(screen.getByRole("heading", { name: ARTICLE.title })).toBeTruthy();
    expect(screen.getByText(/正文段落/)).toBeTruthy();
    expect(mockFetchBody).not.toHaveBeenCalled();
  });

  it("文章阅读器的收藏动作使用现有收藏 store", async () => {
    render(<NewsReader article={ARTICLE} />);

    fireEvent.click(screen.getByRole("button", { name: /收藏/ }));
    await waitFor(() => expect(mockToggleFavorite).toHaveBeenCalledWith("a1"));
  });

  it("AI 面板切换到影响模式时展示已有结构化字段", () => {
    mockSummaries.value = {
      a1: {
        text: "快速摘要",
        abstract: "快速摘要",
        whyImportant: "这会改变开发者选择模型平台的方式。",
        impact: "开发者和模型平台",
        risks: ["价格和可用性仍有不确定性"],
        followUps: ["后续产品发布节奏"],
        evidence: ["原文提到平台将调整服务策略"],
        completeness: "high",
        keywords: ["AI"],
      },
    };

    render(<NewsAnalysisPanel article={ARTICLE} />);
    expect(screen.getByRole("button", { name: "展开 AI 分析" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "影响谁" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "展开 AI 分析" }));
    fireEvent.click(screen.getByRole("tab", { name: "影响谁" }));

    expect(screen.getByText("开发者和模型平台")).toBeTruthy();
    expect(screen.getByText(/已缓存/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "风险与不确定性" }));
    expect(screen.getByText("价格和可用性仍有不确定性")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "后续关注" }));
    expect(screen.getByText("后续产品发布节奏")).toBeTruthy();
    expect(screen.getByText(/AI 依据：原文提到平台将调整服务策略/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "收起 AI 分析" }));
    expect(screen.queryByRole("tab", { name: "后续关注" })).toBeNull();
  });

  it("没有摘要时可以从固定面板发起 AI 分析", async () => {
    render(<NewsAnalysisPanel article={ARTICLE} />);

    fireEvent.click(screen.getByRole("button", { name: "展开 AI 分析" }));
    fireEvent.click(screen.getByRole("button", { name: "生成分析" }));
    await waitFor(() => expect(mockSummarize).toHaveBeenCalledWith("a1", false));
  });
});
