/**
 * tests/main/ithome-news-store.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const newsStore = require("../../src/main/ithome/news-store.js");
const { parseIthomeRss } = require("../../src/main/ithome/rss-parser.js");
const stateStore = require("../../src/main/state-store.js");

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
