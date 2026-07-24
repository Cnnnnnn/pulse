/**
 * tests/main/ithome-news-store.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const newsStore = requireMain("ithome/news-store");
const { parseIthomeRss } = requireMain("ithome/rss-parser");
const stateStore = requireMain("state-store");

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-ithome-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

const SAMPLE_RSS = `<?xml version="1.0"?><rss><channel>
<item><title>A</title><link>https://www.ithome.com/0/1/a.htm</link><guid>https://www.ithome.com/0/1/a.htm</guid><pubDate>Fri, 12 Jun 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>正文A</p>]]></description></item>
</channel></rss>`;

describe("ithome news-store", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("loadAll returns empty when missing", () => {
    const r = newsStore.loadAll(p);
    expect(r.articles).toEqual({});
    expect(r.summaries).toEqual({});
    expect(r.favorites).toEqual({});
  });

  it("persists articles in state.json", () => {
    const items = parseIthomeRss(SAMPLE_RSS);
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {
            [items[0].id]: { ...items[0], fetchedAt: 1, updatedAt: 1 },
          },
          summaries: {},
        },
      }),
    );
    const loaded = newsStore.loadAll(p);
    expect(loaded.articles[items[0].id].title).toBe("A");
  });

  it("saveAll preserves ithome_news", () => {
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: { X: { name: "X" } },
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: { id1: { id: "id1", title: "t" } },
          summaries: {},
        },
      }),
    );
    stateStore.saveAll(
      [
        {
          name: "X",
          latest_version: "1.0",
          has_update: false,
          status: "up_to_date",
        },
      ],
      p,
    );
    const raw = JSON.parse(readFileSync(p, "utf-8"));
    expect(raw.ithome_news.articles.id1.title).toBe("t");
  });

  it("toggleFavorite snapshots article and persists across prune", () => {
    const items = parseIthomeRss(SAMPLE_RSS);
    const article = { ...items[0], fetchedAt: 1, updatedAt: 1 };
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: { [article.id]: article },
          summaries: {
            [article.id]: { text: "摘要：测试", abstract: "测试" },
          },
          favorites: {},
        },
      }),
    );

    const added = newsStore.toggleFavorite(article.id, p);
    expect(added.ok).toBe(true);
    expect(added.favorited).toBe(true);

    const loaded = newsStore.loadAll(p);
    expect(loaded.favorites[article.id].article.title).toBe("A");
    expect(loaded.favorites[article.id].summary.text).toContain("摘要");

    const removed = newsStore.toggleFavorite(article.id, p);
    expect(removed.favorited).toBe(false);
    expect(newsStore.loadAll(p).favorites[article.id]).toBeUndefined();
  });

  it("getArticle falls back to favorites when monthly cache pruned", () => {
    const items = parseIthomeRss(SAMPLE_RSS);
    const article = { ...items[0], fetchedAt: 1, updatedAt: 1 };
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {},
          summaries: {},
          favorites: {
            [article.id]: {
              article,
              favoritedAt: 1,
              summary: null,
            },
          },
        },
      }),
    );
    expect(newsStore.getArticle(article.id, p).title).toBe("A");
  });

  it("_pruneArticles keeps each day independently", () => {
    const now = new Date("2026-06-13T12:00:00+08:00");
    const articles = {};
    for (let d = 8; d <= 13; d += 1) {
      const dateKey = `2026-06-${String(d).padStart(2, "0")}`;
      for (let i = 0; i < 200; i += 1) {
        const id = `${dateKey}-${i}`;
        articles[id] = {
          id,
          dateKey,
          pubDate: `${dateKey}T${String(i % 24).padStart(2, "0")}:00:00+08:00`,
        };
      }
    }
    const pruned = newsStore._pruneArticles(articles, now);
    const countFor = (dateKey) =>
      Object.values(pruned).filter((a) => a.dateKey === dateKey).length;
    expect(countFor("2026-06-13")).toBe(200);
    expect(countFor("2026-06-08")).toBe(200);
    expect(Object.keys(pruned).length).toBe(6 * 200);
  });

  it("loadAll returns persisted dayStats", () => {
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {},
          summaries: {},
          favorites: {},
          dayStats: {
            "2026-06-10": { count: 169, fetchedAt: 1 },
            "2026-06-08": { count: 120, fetchedAt: 1 },
          },
        },
      }),
    );
    const loaded = newsStore.loadAll(p);
    expect(loaded.dayStats["2026-06-10"].count).toBe(169);
    expect(loaded.dayStats["2026-06-08"].count).toBe(120);
  });
});

describe("ithome news-store markArticleRead", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("markArticleRead 第一次写入 readAt", () => {
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {
            "https://www.ithome.com/0/1/a.htm": {
              id: "https://www.ithome.com/0/1/a.htm",
              title: "A",
              dateKey: "2026-06-13",
            },
          },
          summaries: {},
        },
      }),
    );
    const r = newsStore.markArticleRead("https://www.ithome.com/0/1/a.htm", p);
    expect(r.ok).toBe(true);
    const article = newsStore.getArticle("https://www.ithome.com/0/1/a.htm", p);
    expect(typeof article.readAt).toBe("number");
    expect(article.readAt).toBeGreaterThan(0);
  });

  it("markArticleRead 重复调用不更新 readAt（幂等）", async () => {
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {
            "https://www.ithome.com/0/1/a.htm": {
              id: "https://www.ithome.com/0/1/a.htm",
              title: "A",
              dateKey: "2026-06-13",
            },
          },
          summaries: {},
        },
      }),
    );
    newsStore.markArticleRead("https://www.ithome.com/0/1/a.htm", p);
    const t1 = newsStore.getArticle("https://www.ithome.com/0/1/a.htm", p).readAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    newsStore.markArticleRead("https://www.ithome.com/0/1/a.htm", p);
    const t2 = newsStore.getArticle("https://www.ithome.com/0/1/a.htm", p).readAt;
    expect(t2).toBe(t1);
  });

  it("markArticleRead 写入已收藏文章的 readAt", () => {
    const id = "https://www.ithome.com/0/1/fav.htm";
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {},
          summaries: {},
          favorites: {
            [id]: {
              article: { id, title: "Fav", dateKey: "2026-06-13" },
              favoritedAt: 1,
              summary: null,
            },
          },
        },
      }),
    );
    const r = newsStore.markArticleRead(id, p);
    expect(r.ok).toBe(true);
    const loaded = newsStore.loadAll(p);
    expect(loaded.favorites[id].article.readAt).toBeGreaterThan(0);
  });
});

describe("ithome news-store _mergeArticles preserves readAt", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("刷新时 _mergeArticles 保留旧 readAt", () => {
    const id = "https://www.ithome.com/0/1/a.htm";
    const oldReadAt = 1000;
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {
            [id]: { id, title: "old", dateKey: "2026-06-13", readAt: oldReadAt, fetchedAt: 1 },
          },
          summaries: {},
        },
      }),
    );
    const cur = newsStore.loadAll(p);
    const merged = newsStore._mergeArticles(cur, [{ id, title: "new", dateKey: "2026-06-13", excerpt: "" }], 2000);
    expect(merged[id].readAt).toBe(oldReadAt);
    expect(merged[id].title).toBe("new");
  });
});

describe("ithome news-store attachArticleBody", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  function seedArticle(id, extra = {}) {
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {
            [id]: { id, title: "T", dateKey: "2026-06-13", fetchedAt: 1, ...extra },
          },
          summaries: {},
        },
      }),
    );
  }

  it("writes body + bodyFetchedAt to article", () => {
    const id = "https://www.ithome.com/0/1/x.htm";
    seedArticle(id);
    const r = newsStore.attachArticleBody(id, "正文内容", p);
    expect(r.ok).toBe(true);
    const a = newsStore.getArticle(id, p);
    expect(a.body).toBe("正文内容");
    expect(typeof a.bodyFetchedAt).toBe("number");
  });

  it("also writes to favorites.article.body if present", () => {
    const id = "https://www.ithome.com/0/1/y.htm";
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {},
          summaries: {},
          favorites: {
            [id]: {
              id,
              article: { id, title: "Fav", dateKey: "2026-06-13" },
              addedAt: 1,
            },
          },
        },
      }),
    );
    const r = newsStore.attachArticleBody(id, "收藏正文", p);
    expect(r.ok).toBe(true);
    const loaded = newsStore.loadAll(p);
    expect(loaded.favorites[id].article.body).toBe("收藏正文");
  });

  it("returns article_not_found for unknown id", () => {
    const r = newsStore.attachArticleBody("nonexistent", "x", p);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("article_not_found");
  });

  it("returns invalid_args for non-string id", () => {
    expect(newsStore.attachArticleBody(null, "x", p).reason).toBe("invalid_args");
    expect(newsStore.attachArticleBody("", "x", p).reason).toBe("invalid_args");
    expect(newsStore.attachArticleBody(123, "x", p).reason).toBe("invalid_args");
  });

  it("normalizes non-string body to empty string", () => {
    const id = "https://www.ithome.com/0/1/z.htm";
    seedArticle(id);
    const r = newsStore.attachArticleBody(id, null, p);
    expect(r.ok).toBe(true);
    expect(newsStore.getArticle(id, p).body).toBe("");
  });
});

describe("ithome news-store saveSummary", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("writes summary under summaries[id]", () => {
    const id = "https://www.ithome.com/0/1/sum.htm";
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: { [id]: { id, title: "T", dateKey: "2026-06-13" } },
          summaries: {},
        },
      }),
    );
    const entry = {
      text: "摘要正文",
      abstract: "abstract",
      keywords: ["k1", "k2"],
      domain: "AI",
      impact: "影响",
      contentHash: "abc",
      generatedAt: 1234,
      provider: "shared",
    };
    const r = newsStore.saveSummary(id, entry, p);
    expect(r.ok).toBe(true);
    const loaded = newsStore.loadAll(p);
    expect(loaded.summaries[id].text).toBe("摘要正文");
    expect(loaded.summaries[id].contentHash).toBe("abc");
  });

  it("returns article_not_found for unknown id", () => {
    const r = newsStore.saveSummary("missing", { text: "x" }, p);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("article_not_found");
  });

  it("also works for favorited article", () => {
    const id = "https://www.ithome.com/0/1/sum-fav.htm";
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {},
          summaries: {},
          favorites: {
            [id]: { id, article: { id, title: "F" }, addedAt: 1 },
          },
        },
      }),
    );
    const r = newsStore.saveSummary(id, { text: "Fav 摘要" }, p);
    expect(r.ok).toBe(true);
    const loaded = newsStore.loadAll(p);
    expect(loaded.summaries[id].text).toBe("Fav 摘要");
  });
});
