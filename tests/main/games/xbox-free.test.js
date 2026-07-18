import { afterEach, describe, expect, it, vi } from "vitest";

const {
  fetchXboxFree,
  parseFpdGames,
  parseEndDate,
} = require("../../../src/main/games/xbox-free.js");

afterEach(() => vi.restoreAllMocks());

// ── fixture：最小化但贴近真实结构的 RSS XML ──────────────────────
//   真实来源：https://news.xbox.com/en-us/feed/?tag=free-play-days
//   每个 <item> 的 <content:encoded> 里嵌有指向 store 页的链接：
//   https://www.xbox.com/<locale>/games/store/<slug>/<12位bigId>
const RSS_TWO_ITEMS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Xbox Wire</title>
    <item>
      <title><![CDATA[Free Play Days – Game A, Game B, and Game C]]></title>
      <link>https://news.xbox.com/en-us/2026/07/16/free-play-days-07-16-2026/</link>
      <pubDate>Thu, 16 Jul 2026 15:00:00 +0000</pubDate>
      <content:encoded><![CDATA[
        <article>
          <p>These games are available this weekend for Xbox Game Pass members to play from now through Sunday, July 19.</p>
          <a href="https://www.xbox.com/en-US/games/store/game-a/9AAAAAAAA001">Game A</a>
          <a href="https://www.xbox.com/en-GB/games/store/game-b-xbox-series-xs/9BBBBBBBBB02">Game B</a>
          <a href="https://www.xbox.com/en-US/games/store/game-c/9CCCCCCCCC03/">Game C</a>
          <a href="https://www.xbox.com/en-US/games/store/game-a/9AAAAAAAA001">Game A duplicate link</a>
          <a href="https://news.xbox.com/en-us/some-news/">Unrelated Xbox Wire link</a>
        </article>
      ]]></content:encoded>
    </item>
    <item>
      <title><![CDATA[Free Play Days – Old Game (last week)]]></title>
      <pubDate>Thu, 09 Jul 2026 15:00:00 +0000</pubDate>
      <content:encoded><![CDATA[
        <a href="https://www.xbox.com/en-US/games/store/old-game/9ZZZZZZZZZ99">Old Game</a>
      ]]></content:encoded>
    </item>
  </channel>
</rss>`;

const RSS_THROUGH_DATE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <item>
      <pubDate>Thu, 16 Jul 2026 15:00:00 +0000</pubDate>
      <content:encoded><![CDATA[<p>Play for free through July 21.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

const RSS_WEEKDAY_DATE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <item>
      <pubDate>Thu, 16 Jul 2026 15:00:00 +0000</pubDate>
      <content:encoded><![CDATA[<p>Available until Sunday, July 19.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

const RSS_NO_DATE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <item>
      <pubDate>Thu, 16 Jul 2026 15:00:00 +0000</pubDate>
      <content:encoded><![CDATA[<p>Some games this weekend.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

// ── 纯函数：parseFpdGames ────────────────────────────────────────
describe("parseFpdGames", () => {
  it("从首个 item 提取 productId + slug（去重、跨 locale）", () => {
    const games = parseFpdGames(RSS_TWO_ITEMS);
    // 第一个 item 含 3 个唯一游戏（Game A 重复一次被去重）；第二个 item 被忽略
    expect(games).toEqual([
      { productId: "9AAAAAAAA001", slug: "game-a" },
      { productId: "9BBBBBBBBB02", slug: "game-b-xbox-series-xs" },
      { productId: "9CCCCCCCCC03", slug: "game-c" },
    ]);
  });

  it.each([
    ["空字符串", ""],
    ["无 item", "<rss></rss>"],
    ["非 XML", "not xml at all"],
    ["item 无 content:encoded", '<rss><channel><item><title>x</title></item></channel></rss>'],
    ["item content 里无 store 链接", '<rss><channel><item><content:encoded><![CDATA[<p>no links</p>]]></content:encoded></item></channel></rss>'],
  ])("畸形/空输入 %# 返回 []", (_label, xml) => {
    expect(parseFpdGames(xml)).toEqual([]);
  });

  it("忽略非 store 路径的 xbox.com 链接", () => {
    const xml = `<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item>
      <content:encoded><![CDATA[
        <a href="https://www.xbox.com/en-US/consoles">Consoles</a>
        <a href="https://www.xbox.com/en-US/games/browse/free-play-days">Browse page</a>
        <a href="https://www.xbox.com/en-US/games/store/real-game/9REALGAME001">Real Game</a>
      ]]></content:encoded>
    </item></channel></rss>`;
    expect(parseFpdGames(xml)).toEqual([
      { productId: "9REALGAME001", slug: "real-game" },
    ]);
  });

  it("匹配小写 productId（如 bx03760d0qgn，真实 Dragon Ball 案例）", () => {
    const xml = `<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item>
      <content:encoded><![CDATA[
        <a href="https://www.xbox.com/en-us/games/store/dragon-ball-xenoverse-2/bx03760d0qgn">Dragon Ball</a>
      ]]></content:encoded>
    </item></channel></rss>`;
    expect(parseFpdGames(xml)).toEqual([
      { productId: "bx03760d0qgn", slug: "dragon-ball-xenoverse-2" },
    ]);
  });
});

// ── 纯函数：parseEndDate ─────────────────────────────────────────
describe("parseEndDate", () => {
  it("'through July 21' 解析为 ISO 日期（年份取 pubDate）", () => {
    const iso = parseEndDate(RSS_THROUGH_DATE);
    expect(iso).toBe("2026-07-21T00:00:00.000Z");
  });

  it("'Sunday, July 19' 解析为 ISO 日期", () => {
    const iso = parseEndDate(RSS_WEEKDAY_DATE);
    expect(iso).toBe("2026-07-19T00:00:00.000Z");
  });

  it("无匹配日期模式返回 null", () => {
    expect(parseEndDate(RSS_NO_DATE)).toBeNull();
  });

  it("畸形/空 XML 返回 null", () => {
    expect(parseEndDate("")).toBeNull();
    expect(parseEndDate("<rss></rss>")).toBeNull();
  });
});

// ── 集成：fetchXboxFree（fetch mock RSS XML + catalog JSON）──────
function validProduct(overrides = {}) {
  return {
    ProductId: "9AAAAAAAA001",
    LocalizedProperties: [{
      ProductTitle: "Game A",
      Images: [{ ImagePurpose: "Poster", Uri: "//img/game-a.jpg" }],
    }],
    DisplaySkuAvailabilities: [{
      Availabilities: [{
        Conditions: { EndDate: "2026-07-19T09:59:59Z" },
        OrderManagementData: { Price: { MSRP: 59.99, CurrencyCode: "USD" } },
      }],
    }],
    ...overrides,
  };
}

describe("fetchXboxFree", () => {
  it("完整流程：RSS → catalog 字段映射", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => RSS_TWO_ITEMS })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Products: [validProduct()] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const items = await fetchXboxFree();
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item).toMatchObject({
      id: "xbox-free-9AAAAAAAA001",
      platform: "xbox",
      title: "Game A",
      thumb: "https://img/game-a.jpg",
      salePrice: 0,
      normalPrice: 59.99,
      savings: 100,
      isFree: true,
      currency: "USD",
      promotionType: "free-play-days",
      requirements: "需 Game Pass，活动期间限时试玩",
      provider: "microsoft",
      source: "live",
      store: "Microsoft Store",
    });
    // freeUntil 优先用 RSS 解析出的 through July 19
    expect(item.freeUntil).toBe("2026-07-19T00:00:00.000Z");
    // dealUrl 用 RSS 解析出的 slug
    expect(item.dealUrl).toBe("https://www.xbox.com/en-US/games/store/game-a/9AAAAAAAA001");
    // 第一次 fetch 是 RSS（news.xbox.com），第二次是 catalog（displaycatalog）
    expect(String(fetchMock.mock.calls[0][0])).toContain("news.xbox.com");
    expect(String(fetchMock.mock.calls[1][0])).toContain("displaycatalog.mp.microsoft.com");
    expect(String(fetchMock.mock.calls[1][0])).toContain("bigIds=9AAAAAAAA001");
  });

  it("RSS 无 store 链接时返回空列表，且不请求 catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<rss><channel><item><content:encoded><![CDATA[<p>no games</p>]]></content:encoded></item></channel></rss>',
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchXboxFree()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 只调 RSS，未调 catalog
  });

  it("RSS 失败时返回空列表（兜底）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(fetchXboxFree()).resolves.toEqual([]);
  });

  it("RSS HTTP 非 2xx 时返回空列表", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => "",
    })));
    await expect(fetchXboxFree()).resolves.toEqual([]);
  });

  it("catalog 失败时返回空列表（兜底）", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => RSS_TWO_ITEMS })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchXboxFree()).resolves.toEqual([]);
  });

  it("RSS 解析不出日期时，freeUntil 回退到 catalog EndDate", async () => {
    const rssNoDate = `<?xml version="1.0"?>
      <rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item>
        <pubDate>Thu, 16 Jul 2026 15:00:00 +0000</pubDate>
        <content:encoded><![CDATA[
          <a href="https://www.xbox.com/en-US/games/store/game-x/9XXXXXXXXX01">Game X</a>
        ]]></content:encoded>
      </item></channel></rss>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => rssNoDate })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          Products: [validProduct({
            ProductId: "9XXXXXXXXX01",
            LocalizedProperties: [{ ProductTitle: "Game X" }],
            DisplaySkuAvailabilities: [{
              Availabilities: [{
                Conditions: { EndDate: "2026-07-20T09:59:59Z" },
                OrderManagementData: { Price: { MSRP: 29.99 } },
              }],
            }],
          })],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const [item] = await fetchXboxFree();
    expect(item.freeUntil).toBe("2026-07-20T09:59:59.000Z");
  });

  it("catalog EndDate 为 9998 占位符时被忽略（回退 null）", async () => {
    const rssNoDateWithGame = `<?xml version="1.0"?>
      <rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item>
        <pubDate>Thu, 16 Jul 2026 15:00:00 +0000</pubDate>
        <content:encoded><![CDATA[
          <a href="https://www.xbox.com/en-US/games/store/game-a/9AAAAAAAA001">Game A</a>
        ]]></content:encoded>
      </item></channel></rss>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => rssNoDateWithGame })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          Products: [validProduct({
            DisplaySkuAvailabilities: [{
              Availabilities: [{
                Conditions: { EndDate: "9998-12-30T00:00:00Z" },
                OrderManagementData: { Price: { MSRP: 29.99 } },
              }],
            }],
          })],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const [item] = await fetchXboxFree();
    expect(item.freeUntil).toBeNull();
  });

  it("catalog 字段缺失时使用安全默认值", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => RSS_TWO_ITEMS })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          Products: [{
            ProductId: "9AAAAAAAA001",
            LocalizedProperties: null,
            DisplaySkuAvailabilities: null,
          }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const [item] = await fetchXboxFree();
    expect(item).toMatchObject({
      id: "xbox-free-9AAAAAAAA001",
      title: "Xbox 免费试玩",
      thumb: null,
      normalPrice: null,
    });
    // freeUntil 仍来自 RSS 解析
    expect(item.freeUntil).toBe("2026-07-19T00:00:00.000Z");
  });
});
