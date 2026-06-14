/**
 * tests/main/ithome-article-ai.test.js
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const chatCompletion = vi.fn();
const sharedLlm = require("../../src/ai/shared-llm.js");
sharedLlm.chatCompletion = chatCompletion;

// 在 require article-ai 之前完成 chatCompletion 替换
const aiModule = require("../../src/main/ithome/article-ai.js");

const NEWS_LINK = "https://www.ithome.com/0/866/661.htm";
const LONG_BODY = "重要正文".repeat(120);

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-ithome-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

function seedArticle(statePath, article) {
  writeFileSync(
    statePath,
    JSON.stringify({
      v: 1,
      apps: {},
      mutes: {},
      ithome_news: {
        ts: 1,
        articles: { [article.id]: { ...article, fetchedAt: 1, updatedAt: 1 } },
        summaries: {},
        favorites: {},
      },
    }),
  );
}

describe("ithome article-ai buildMessages", () => {
  it("prefers body over excerpt when body is long enough", () => {
    const { buildMessages } = aiModule;
    const msgs = buildMessages({
      title: "T",
      excerpt: "短摘录",
      body: LONG_BODY,
    });
    const user = msgs[1].content;
    expect(user).toContain(LONG_BODY);
    expect(user).not.toContain("短摘录");
    expect(user).toContain("标题：T");
  });

  it("falls back to excerpt when body is missing/short", () => {
    const { buildMessages } = aiModule;
    const msgs = buildMessages({
      title: "T",
      excerpt: "列表页摘要片段",
      body: "",
    });
    expect(msgs[1].content).toContain("列表页摘要片段");
  });

  it("explicitly signals fallback when both body and excerpt are empty", () => {
    const { buildMessages } = aiModule;
    const msgs = buildMessages({ title: "T", excerpt: "", body: "" });
    expect(msgs[1].content).toMatch(/信息可能不完整|无原文/);
  });
});

describe("ithome article-ai contentHash", () => {
  it("changes when body is appended (so cached summary is invalidated)", () => {
    const { contentHash } = aiModule;
    const a = contentHash({ title: "T", excerpt: "e", body: "" });
    const b = contentHash({ title: "T", excerpt: "e", body: LONG_BODY });
    expect(a).not.toBe(b);
  });
});

describe("ithome article-ai summarizeArticle lazy fetch", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
    chatCompletion.mockReset();
  });

  it("fetches detail body when excerpt too short, then summarizes with body in prompt", async () => {
    seedArticle(p, {
      id: NEWS_LINK,
      title: "蔚来回应与江淮合资公司注销",
      link: NEWS_LINK,
      excerpt: "短",
      dateKey: "2026-06-13",
    });
    chatCompletion.mockResolvedValue({
      ok: true,
      text:
        "摘要：蔚来回应合资公司注销。\n" +
        "关键词：蔚来、江淮\n" +
        "所属领域：汽车\n" +
        "影响方面：可能影响代工合作。",
    });
    const http = {
      async get() {
        return {
          status: 200,
          body:
            '<div class="post_content" id="paragraph"><p>' +
            LONG_BODY +
            "</p></div>",
        };
      },
    };

    const r = await aiModule.summarizeArticle({
      id: NEWS_LINK,
      http,
      statePath: p,
    });
    expect(r.ok).toBe(true);

    // 抓正文后入提示
    const call = chatCompletion.mock.calls[0][0];
    const user = call[1].content;
    expect(user).toContain(LONG_BODY);
    expect(user).toContain("蔚来回应与江淮合资公司注销");

    // 状态写回 body
    const stored = JSON.parse(readFileSync(p, "utf-8"));
    expect(stored.ithome_news.articles[NEWS_LINK].body.length).toBeGreaterThan(
      100,
    );
  });

  it("uses stored body directly without re-fetching when body is already long", async () => {
    seedArticle(p, {
      id: NEWS_LINK,
      title: "T",
      link: NEWS_LINK,
      excerpt: "短",
      body: LONG_BODY,
      dateKey: "2026-06-13",
    });
    chatCompletion.mockResolvedValue({
      ok: true,
      text: "摘要：测试摘要。\n关键词：A、B\n所属领域：测试\n影响方面：测试。",
    });
    const http = { get: vi.fn() };
    const r = await aiModule.summarizeArticle({
      id: NEWS_LINK,
      http,
      statePath: p,
    });
    expect(r.ok).toBe(true);
    expect(http.get).not.toHaveBeenCalled();
    const user = chatCompletion.mock.calls[0][0][1].content;
    expect(user).toContain(LONG_BODY);
  });
});
