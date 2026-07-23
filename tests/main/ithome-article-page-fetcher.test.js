/**
 * tests/main/ithome-article-page-fetcher.test.js
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync as readFixture } from "fs";

const fetcher = require("../../src/main/ithome/article-page-fetcher.js");
const newsStore = require("../../src/main/ithome/news-store.js");
const stateStore = require("../../src/main/state-store.ts");

const FIXTURE_HTML = readFixture(
  join(__dirname, "..", "fixtures", "ithome", "article-866661.html"),
  "utf-8",
);

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-ithome-fetcher-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

function stubHttp(map) {
  return {
    async get(url) {
      const handler = map[url];
      if (!handler) return { status: 404, body: "" };
      return typeof handler === "function"
        ? handler(url)
        : { status: 200, body: handler };
    },
  };
}

const SAMPLE_ARTICLE = {
  id: "https://www.ithome.com/0/866/661.htm",
  title: "测试",
  link: "https://www.ithome.com/0/866/661.htm",
  excerpt: "太短",
  dateKey: "2026-06-13",
};

describe("ithome article-page-fetcher", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {
            [SAMPLE_ARTICLE.id]: {
              ...SAMPLE_ARTICLE,
              fetchedAt: 1,
              updatedAt: 1,
            },
          },
          summaries: {},
          favorites: {},
        },
      }),
    );
  });

  it("returns ok=true and stores body when excerpt too short and page fetchable", async () => {
    const http = stubHttp({ [SAMPLE_ARTICLE.link]: FIXTURE_HTML });
    const r = await fetcher.fetchAndAttachBody({
      id: SAMPLE_ARTICLE.id,
      statePath: p,
      http,
    });
    expect(r.ok).toBe(true);
    expect(r.body.length).toBeGreaterThan(100);
    expect(r.body).toContain("蔚来与江淮合资公司注销");
    expect(r.reason).toBe("fetched");

    const stored = newsStore.getArticle(SAMPLE_ARTICLE.id, p);
    expect(stored.body).toBe(r.body);
    expect(typeof stored.bodyFetchedAt).toBe("number");
  });

  it("skips network and returns ok=true with reason=already_loaded when body is long enough", async () => {
    const long = "已有正文".repeat(100);
    const seededPath = tmpStatePath();
    writeFileSync(
      seededPath,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {
            [SAMPLE_ARTICLE.id]: {
              ...SAMPLE_ARTICLE,
              body: long,
              bodyFetchedAt: 123,
              fetchedAt: 1,
              updatedAt: 1,
            },
          },
          summaries: {},
        },
      }),
    );
    const called = [];
    const http = {
      async get(url) {
        called.push(url);
        return { status: 200, body: FIXTURE_HTML };
      },
    };
    const r = await fetcher.fetchAndAttachBody({
      id: SAMPLE_ARTICLE.id,
      statePath: seededPath,
      http,
    });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("already_loaded");
    expect(r.body).toBe(long);
    expect(called).toEqual([]); // 不发请求
  });

  it("returns ok=false with reason=article_not_found when id missing", async () => {
    const r = await fetcher.fetchAndAttachBody({
      id: "https://www.ithome.com/0/0/0.htm",
      statePath: p,
      http: stubHttp({}),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("article_not_found");
  });

  it("returns ok=false with reason=fetch_failed on non-200", async () => {
    const http = {
      async get() {
        return { status: 500, body: "" };
      },
    };
    const r = await fetcher.fetchAndAttachBody({
      id: SAMPLE_ARTICLE.id,
      statePath: p,
      http,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });

  it("returns ok=false with reason=parse_failed when page has no #paragraph", async () => {
    const http = stubHttp({
      [SAMPLE_ARTICLE.link]: "<html><body>no body</body></html>",
    });
    const r = await fetcher.fetchAndAttachBody({
      id: SAMPLE_ARTICLE.id,
      statePath: p,
      http,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("needsBodyFetch returns true for short excerpt and false for long body", () => {
    expect(fetcher.needsBodyFetch({ excerpt: "abc", body: "" })).toBe(true);
    expect(
      fetcher.needsBodyFetch({ excerpt: "abc", body: "x".repeat(500) }),
    ).toBe(false);
    expect(fetcher.needsBodyFetch({ excerpt: "x".repeat(500), body: "" })).toBe(
      false,
    );
  });
});
