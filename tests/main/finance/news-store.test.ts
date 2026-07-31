/**
 * tests/main/finance/news-store.test.ts
 *
 * financial_news 本地模型单测：getFiltered(分类/搜索/时间排序) + toggleFavorite + markRead。
 *
 * B1 后财经数据落在独立文件 finance_news.json（与 state.json 同目录），
 * 故此处直接读写该专属文件（路径由 finance-files.newsFilePath 推导），不再依赖 state.json.financial_news。
 * 不触网。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const { requireMain } = require("../../_setup/require-main.cjs");
const store = requireMain("finance/news-store");
const files = requireMain("finance/finance-files");

function mkArt(
  id: string,
  title: string,
  category: string,
  tags: string[] = [],
  pubDate = "2026-07-27T09:00:00+08:00",
): any {
  const sourceKey = id.split(":")[0];
  return {
    id,
    source: "测试",
    sourceKey,
    title,
    summary: `${title}摘要`,
    body: "",
    bodyFetchedAt: 0,
    url: "https://example.com",
    pubDate,
    dateKey: "2026-07-27",
    category,
    tags,
    popularity: 0,
    isRed: false,
    fetchedAt: Date.now(),
    readAt: 0,
  };
}

// 财经子状态（即 finance_news.json 的内容）
// 财经子状态（即 finance_news.json 的内容）
function newsInner(articles: Record<string, any>, extra: any = {}): any {
  return {
    ts: Date.now(),
    articles,
    favorites: {},
    ...extra,
  };
}

let tmp = "";

function seedNews(articles: Record<string, any>, extra: any = {}): void {
  fs.writeFileSync(
    files.newsFilePath(tmp),
    JSON.stringify(newsInner(articles, extra)),
  );
}

function readNews(): any {
  return JSON.parse(fs.readFileSync(files.newsFilePath(tmp), "utf-8"));
}

beforeEach(() => {
  // 每个用例独立子目录（模拟真实用户数据目录），避免共享 os.tmpdir 下的
  // finance_news.json 互相污染（dirname(statePath) 决定专属文件位置）。
  tmp = path.join(
    os.tmpdir(),
    `finance-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    "state.json",
  );
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
});
afterEach(() => {
  try {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("finance news-store · getFiltered", () => {
  it("按分类过滤", () => {
    const articles = {
      "eastmoney:1": mkArt("eastmoney:1", "股市新闻", "股市"),
      "wallstreetcn:1": mkArt("wallstreetcn:1", "全球市场", "全球"),
      "stats:1": mkArt("stats:1", "宏观数据", "宏观"),
    };
    seedNews(articles);
    const list = store.getFiltered(tmp, { category: "宏观" });
    expect(list.map((a: any) => a.id)).toEqual(["stats:1"]);
  });

  it("全部分类返回所有", () => {
    const articles = {
      "eastmoney:1": mkArt("eastmoney:1", "股市新闻", "股市"),
      "stats:1": mkArt("stats:1", "宏观数据", "宏观"),
    };
    seedNews(articles);
    const list = store.getFiltered(tmp, { category: "all" });
    expect(list).toHaveLength(2);
  });

  it("搜索匹配标题/标签/摘要", () => {
    const articles = {
      "eastmoney:1": mkArt("eastmoney:1", "降准利好股市", "股市", ["降准"]),
      "wallstreetcn:1": mkArt("wallstreetcn:1", "美股创新高", "全球", ["美股"]),
    };
    seedNews(articles);
    const byTag = store.getFiltered(tmp, { search: "降准" });
    expect(byTag.map((a: any) => a.id)).toEqual(["eastmoney:1"]);
    const byTitle = store.getFiltered(tmp, { search: "美股" });
    expect(byTitle.map((a: any) => a.id)).toEqual(["wallstreetcn:1"]);
  });

  it("默认按时间倒序排序", () => {
    const articles = {
      "eastmoney:1": mkArt(
        "eastmoney:1",
        "旧",
        "股市",
        [],
        "2026-07-01T09:00:00+08:00",
      ),
      "eastmoney:2": mkArt(
        "eastmoney:2",
        "新",
        "股市",
        [],
        "2026-07-27T09:00:00+08:00",
      ),
    };
    seedNews(articles);
    const list = store.getFiltered(tmp, {});
    expect(list[0].id).toBe("eastmoney:2");
  });

  it("popularity 排序（全部为 0 时兜底按时间）", () => {
    const articles = {
      "eastmoney:1": mkArt(
        "eastmoney:1",
        "A",
        "股市",
        [],
        "2026-07-27T09:00:00+08:00",
      ),
      "eastmoney:2": mkArt(
        "eastmoney:2",
        "B",
        "股市",
        [],
        "2026-07-26T09:00:00+08:00",
      ),
    };
    seedNews(articles);
    const list = store.getFiltered(tmp, { sort: "popularity" });
    // 全部 popularity=0 → 兜底时间倒序
    expect(list[0].id).toBe("eastmoney:1");
  });
});

describe("finance news-store · toggleFavorite / markRead", () => {
  it("toggleFavorite 收藏→取消 + 标记 isFavorited", () => {
    const articles = { "eastmoney:1": mkArt("eastmoney:1", "x", "股市") };
    seedNews(articles);
    const r1 = store.toggleFavorite(tmp, "eastmoney:1");
    expect(r1.ok).toBe(true);
    expect(r1.favorited).toBe(true);
    const st1 = readNews();
    expect(st1.favorites["eastmoney:1"]).toBeTruthy();

    const r2 = store.toggleFavorite(tmp, "eastmoney:1");
    expect(r2.favorited).toBe(false);
    const st2 = readNews();
    expect(st2.favorites["eastmoney:1"]).toBeUndefined();
  });

  it("toggleFavorite 无效 id（空串）→ invalid_args", () => {
    const articles = { "eastmoney:1": mkArt("eastmoney:1", "x", "股市") };
    seedNews(articles);
    const r = store.toggleFavorite(tmp, "");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
  });

  it("toggleFavorite 存在格式但文章不存在 → article_not_found", () => {
    const articles = { "eastmoney:1": mkArt("eastmoney:1", "x", "股市") };
    seedNews(articles);
    const r = store.toggleFavorite(tmp, "nope");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("article_not_found");
  });

  it("markRead 置 readAt", () => {
    const articles = { "eastmoney:1": mkArt("eastmoney:1", "x", "股市") };
    seedNews(articles);
    const r = store.markRead(tmp, "eastmoney:1");
    expect(r.ok).toBe(true);
    const st = readNews();
    expect(st.articles["eastmoney:1"].readAt).toBeGreaterThan(0);
  });
});

// ===== QA 独立验证补充断言 =====
describe("finance news-store · getArticle (QA 补充)", () => {
  it("存在的文章返回带 isFavorited=false", () => {
    const articles = { "eastmoney:1": mkArt("eastmoney:1", "x", "股市") };
    seedNews(articles);
    const a = store.getArticle(tmp, "eastmoney:1");
    expect(a).not.toBeNull();
    expect(a.id).toBe("eastmoney:1");
    expect(a.isFavorited).toBe(false);
  });

  it("合法格式但不存在 → 返回 null（IPC 层映射为 article_not_found）", () => {
    const articles = { "eastmoney:1": mkArt("eastmoney:1", "x", "股市") };
    seedNews(articles);
    expect(store.getArticle(tmp, "nope:999")).toBeNull();
  });

  it("空 id（无效参数）→ 返回 null（IPC 层映射为 article_not_found）", () => {
    const articles = { "eastmoney:1": mkArt("eastmoney:1", "x", "股市") };
    seedNews(articles);
    expect(store.getArticle(tmp, "")).toBeNull();
  });

  it("收藏夹中的文章 getArticle 返回 isFavorited=true", () => {
    const articles = { "eastmoney:1": mkArt("eastmoney:1", "x", "股市") };
    seedNews(articles, {
      favorites: {
        "eastmoney:1": {
          article: articles["eastmoney:1"],
          favoritedAt: 1,
          summary: null,
        },
      },
    });
    const a = store.getArticle(tmp, "eastmoney:1");
    expect(a).not.toBeNull();
    expect(a.isFavorited).toBe(true);
  });
});

describe("finance news-store · getFiltered 排序 (QA 补充)", () => {
  it("popularity 排序：高热度靠前", () => {
    const articles = {
      "eastmoney:1": { ...mkArt("eastmoney:1", "A", "股市"), popularity: 100 },
      "eastmoney:2": { ...mkArt("eastmoney:2", "B", "股市"), popularity: 500 },
      "eastmoney:3": { ...mkArt("eastmoney:3", "C", "股市"), popularity: 0 },
    };
    seedNews(articles);
    const list = store.getFiltered(tmp, { sort: "popularity" });
    expect(list.map((a: any) => a.id)).toEqual([
      "eastmoney:2",
      "eastmoney:1",
      "eastmoney:3",
    ]);
  });

  it("popularity 相同 → 兜底时间倒序", () => {
    const articles = {
      "eastmoney:1": {
        ...mkArt("eastmoney:1", "旧", "股市", [], "2026-07-01T09:00:00+08:00"),
        popularity: 10,
      },
      "eastmoney:2": {
        ...mkArt("eastmoney:2", "新", "股市", [], "2026-07-27T09:00:00+08:00"),
        popularity: 10,
      },
    };
    seedNews(articles);
    const list = store.getFiltered(tmp, { sort: "popularity" });
    expect(list[0].id).toBe("eastmoney:2");
  });
});
