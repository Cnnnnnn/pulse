import { beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const fetcher = require("../../src/main/ithome/comment-fetcher.js");
const newsStore = require("../../src/main/ithome/news-store.js");

function statePath() {
  const dir = join(
    tmpdir(),
    `pulse-ithome-comments-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

const id = "https://www.ithome.com/0/866/661.htm";
const article = { id, link: id, title: "测试", dateKey: "2026-07-18" };
const page = '<div id="post_comm" data-nid="866661" data-id="sn-abc"></div>';
const response = {
  success: true,
  content: {
    hotComments: [
      {
        id: 1,
        parentCommentId: 0,
        userInfo: { userNick: "用户 A" },
        postTime: "2026-07-18T10:00:00+08:00",
        support: 8,
        elements: [{ type: 0, content: "评论内容" }],
      },
    ],
  },
};

function seed(path, extra = {}) {
  writeFileSync(
    path,
    JSON.stringify({
      v: 1,
      apps: {},
      mutes: {},
      ithome_news: {
        ts: 1,
        articles: { [id]: { ...article, ...extra } },
        summaries: {},
        favorites: {},
      },
    }),
  );
}

function httpStub({ pageBody = page, commentBody = JSON.stringify(response) } = {}) {
  const calls = [];
  return {
    calls,
    async get(url) {
      calls.push(url);
      if (url === id) return { status: 200, body: pageBody };
      if (url.startsWith("https://cmt.ithome.com/api/webcomment/getnewscomment?")) {
        return { status: 200, body: commentBody };
      }
      return { status: 404, body: "" };
    },
  };
}

describe("ithome comment-fetcher", () => {
  let p;
  beforeEach(() => {
    p = statePath();
    seed(p);
  });

  it("fetches page params, requests hot comments, and persists them", async () => {
    const http = httpStub();
    const result = await fetcher.fetchAndAttachComments({ id, statePath: p, http });

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("fetched");
    expect(result.comments[0].author).toBe("用户 A");
    expect(http.calls).toHaveLength(2);
    expect(http.calls[1]).toContain("sn=sn-abc");
    expect(http.calls[1]).toContain("cid=0");

    const stored = newsStore.getArticle(id, p);
    expect(stored.comments).toHaveLength(1);
    expect(stored.commentsFetchedAt).toBeGreaterThan(0);
  });

  it("keeps comments in favorite snapshot", async () => {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    raw.ithome_news.favorites[id] = {
      article: { ...article },
      favoritedAt: 1,
      summary: null,
    };
    writeFileSync(p, JSON.stringify(raw));

    await fetcher.fetchAndAttachComments({ id, statePath: p, http: httpStub() });
    const loaded = newsStore.loadAll(p);
    expect(loaded.favorites[id].article.comments[0].content).toBe("评论内容");
  });

  it("uses cached empty comments without a network request", async () => {
    seed(p, { comments: [], commentsFetchedAt: 123 });
    const http = httpStub();
    const result = await fetcher.fetchAndAttachComments({ id, statePath: p, http });
    expect(result).toEqual({ ok: true, reason: "already_loaded", comments: [] });
    expect(http.calls).toEqual([]);
  });

  it("returns stable reasons and does not write failed results", async () => {
    const badPage = httpStub({ pageBody: "<html></html>" });
    expect(
      (await fetcher.fetchAndAttachComments({ id, statePath: p, http: badPage })).reason,
    ).toBe("comment_params_missing");

    const failedApi = httpStub({ commentBody: "not json" });
    expect(
      (await fetcher.fetchAndAttachComments({ id, statePath: p, http: failedApi })).reason,
    ).toBe("parse_failed");
    expect(newsStore.getArticle(id, p).commentsFetchedAt).toBeUndefined();
  });

  it("still fetches when the article is not yet in state (renderer-only id)", async () => {
    // renderer 持有内存信号但 main 进程 state 还没写入 (用户首次点评论)
    const freshPath = statePath();
    writeFileSync(
      freshPath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: { ts: 1, articles: {}, summaries: {}, favorites: {} },
      }),
    );
    const http = httpStub();
    const result = await fetcher.fetchAndAttachComments({
      id,
      statePath: freshPath,
      http,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("fetched");
    expect(result.comments).toHaveLength(1);
    const stored = newsStore.getArticle(id, freshPath);
    expect(stored.commentsFetchedAt).toBeGreaterThan(0);
    // stub article 也写进了 articles 字典
    const all = newsStore.loadAll(freshPath);
    expect(all.articles[id]).toBeTruthy();
  });

  it("does not treat commentsFetchedAt=0 stub as already loaded", async () => {
    const freshPath = statePath();
    writeFileSync(
      freshPath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {
            [id]: { ...article, comments: [], commentsFetchedAt: 0 },
          },
          summaries: {},
          favorites: {},
        },
      }),
    );
    const http = httpStub();
    const result = await fetcher.fetchAndAttachComments({
      id,
      statePath: freshPath,
      http,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("fetched");
    expect(http.calls.length).toBeGreaterThan(0);
  });
});
