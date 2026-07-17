/**
 * tests/main/games/playstation.test.js
 *
 * 覆盖 playstation.js 暴露给测试的两个纯函数：
 *   - buildDealsFromPsGameSpider(priceHistory, metaData, opts)
 *   - parseDealsHtml(html)
 * 两者都不碰 fetch/fs，零 mock。
 */
import { describe, it, expect } from "vitest";

const {
  buildDealsFromPsGameSpider,
  parseDealsHtml,
} = require("../../../src/main/games/playstation.js");

// ── buildDealsFromPsGameSpider ─────────────────────────────────────

describe("buildDealsFromPsGameSpider — sanity check 过滤", () => {
  // 构造一份覆盖各过滤分支的 priceHistory：
  //   - good:    2 个价格点，latest<max，discPct 在 5~95，max<=300  → 保留
  //   - toofew:  仅 1 个价格点（<2）                                  → 过滤
  //   - maxtoobig: max>300                                            → 过滤
  //   - notdiscount: latest>=max（非折扣）                            → 过滤
  //   - disctoosmall: discPct<5                                       → 过滤
  //   - disctoobig: discPct>95                                        → 过滤
  const priceHistory = {
    good: [
      ["2026-01-01", 60],
      ["2026-07-01", 20],
    ],
    toofew: [["2026-01-01", 50]],
    maxtoobig: [
      ["2026-01-01", 350],
      ["2026-07-01", 40],
    ],
    notdiscount: [
      ["2026-01-01", 20],
      ["2026-07-01", 30],
    ],
    disctoosmall: [
      ["2026-01-01", 100],
      ["2026-07-01", 98],
    ],
    disctoobig: [
      ["2026-01-01", 100],
      ["2026-07-01", 3],
    ],
    best: [
      ["2026-01-01", 80],
      ["2026-07-01", 10],
    ], // 折扣绝对值最大，应排第一
  };
  const metaData = [
    { name: "good", fullname: "Good Game", path: "/product/good", img: "images/good.jpg", rate: "85", releaseTime: "2024-01-01" },
    { name: "best", fullname: "Best Game", path: "/product/best", img: "images/best.jpg", rate: "90", releaseTime: "2023-05-01" },
  ];

  it("只保留通过 sanity check 的条目（good + best）", () => {
    const deals = buildDealsFromPsGameSpider(priceHistory, metaData, { limit: 10 });
    const names = deals.map((d) => d.title).sort();
    expect(names).toEqual(["Best Game", "Good Game"]);
  });

  it("按折扣绝对值（popular = normalPrice - salePrice）降序", () => {
    const deals = buildDealsFromPsGameSpider(priceHistory, metaData, { limit: 10 });
    expect(deals[0].title).toBe("Best Game"); // 80-10=70 > 60-20=40
    expect(deals[1].title).toBe("Good Game");
  });

  it("字段映射正确（经 toGameDeal 规范化）", () => {
    const deals = buildDealsFromPsGameSpider(priceHistory, metaData, { limit: 10 });
    const best = deals.find((d) => d.title === "Best Game");
    expect(best.platform).toBe("playstation");
    expect(best.salePrice).toBe(10);
    expect(best.normalPrice).toBe(80);
    expect(best.savings).toBe(88); // round((1-10/80)*100)=88
    expect(best.currency).toBe("USD");
    expect(best.source).toBe("live");
    expect(best.store).toBe("PlayStation Store");
    expect(best.rating).toBe(90);
    expect(best.dealUrl).toBe("/product/best");
    expect(best.thumb).toMatch(/\/best\.jpg$/);
  });

  it("limit 钳位到 [1,100] 且截断结果", () => {
    const all = buildDealsFromPsGameSpider(priceHistory, metaData, { limit: 1 });
    expect(all).toHaveLength(1);
    const big = buildDealsFromPsGameSpider(priceHistory, metaData, { limit: 1000 });
    expect(big.length).toBeLessThanOrEqual(100);
  });

  it("metaData 缺失时用 name 作 title，thumb 为 null", () => {
    const deals = buildDealsFromPsGameSpider(
      { lonely: [["2026-01-01", 50], ["2026-07-01", 25]] },
      [],
      { limit: 5 },
    );
    expect(deals).toHaveLength(1);
    expect(deals[0].title).toBe("lonely");
    expect(deals[0].thumb).toBeNull();
    expect(deals[0].dealUrl).toBeNull();
  });

  it("空 priceHistory 返回空数组", () => {
    expect(buildDealsFromPsGameSpider({}, [], { limit: 5 })).toEqual([]);
  });

  it("priceHistory 为 null 时抛错（源码不防御，由调用方 loadPsGameSpiderData 兜底）", () => {
    expect(() => buildDealsFromPsGameSpider(null, [], { limit: 5 })).toThrow();
  });
});

// ── parseDealsHtml ─────────────────────────────────────────────────

describe("parseDealsHtml — SSR 折扣磁贴解析", () => {
  // 构造一段模拟 store.playstation.com SSR 的 HTML 片段。
  // 关键标记：discount-badge#text / price#display-price / price#price-strikethrough
  // / data-telemetry-meta（含 &quot; &#x27; 实体）/ game-art#image#preview
  // parseDealsHtml 以 discount-badge 为锚点，向后 3000 字符找 price/telemetry-meta，
  // 向前 3000 字符找 img/tag，故 badge 居中、其余标记散布前后均可见。
  const SAMPLE_HTML = `
    <div class="grid">
      <span data-telemetry-name="game-art#image#preview" src="https://img.pp/gow.jpg?w=240"></span>
      <span data-telemetry-name="game-art#tag0">PS5</span>
      <span data-telemetry-name="discount-badge#text">-50%</span>
      <span data-telemetry-name="price#display-price">$19.99</span>
      <span data-telemetry-name="price#price-strikethrough">$39.99</span>
      <a href="/en-us/product/HP0001-god-of-war"
         data-telemetry-meta="{&quot;name&quot;:&quot;God of War Ragnar&#x27;ok&quot;,&quot;id&quot;:&quot;PPSA00001_00&quot;}"></a>
      <span data-telemetry-name="discount-badge#text">-10%</span>
      <span data-telemetry-name="price#display-price">$35.99</span>
      <span data-telemetry-name="price#price-strikethrough">$39.99</span>
    </div>`;

  it("解析出折扣条目并提取字段", () => {
    const deals = parseDealsHtml(SAMPLE_HTML);
    expect(deals.length).toBeGreaterThanOrEqual(1);
    const gow = deals[0];
    expect(gow.savings).toBe(50);
    expect(gow.salePrice).toBeCloseTo(19.99);
    expect(gow.normalPrice).toBeCloseTo(39.99);
    expect(gow.normalPrice).toBeGreaterThan(gow.salePrice);
  });

  it("data-telemetry-meta 实体解码（&quot; / &#x27;）", () => {
    const deals = parseDealsHtml(SAMPLE_HTML);
    const gow = deals.find((d) => d.name && d.name.includes("God of War"));
    expect(gow).toBeTruthy();
    expect(gow.name).toBe("God of War Ragnar'ok"); // &#x27; → '
  });

  it("thumb 去掉查询串", () => {
    const deals = parseDealsHtml(SAMPLE_HTML);
    const gow = deals.find((d) => d.name && d.name.includes("God of War"));
    expect(gow.thumb).toBe("https://img.pp/gow.jpg");
  });

  it("dealUrl 拼上 STORE_BASE", () => {
    const deals = parseDealsHtml(SAMPLE_HTML);
    const gow = deals.find((d) => d.name && d.name.includes("God of War"));
    expect(gow.dealUrl).toMatch(/^https:\/\/store\.playstation\.com\/en-us\/product\/HP0001/);
  });

  it("normal<=sale 的条目被过滤（第二条 35.99 vs 39.99 实际通过；构造无效折扣验证过滤）", () => {
    // 构造一个 normal<=sale 的无效条目，应被过滤
    const badHtml = `
      <a href="/x">
        <span data-telemetry-name="discount-badge#text">-5%</span>
        <span data-telemetry-name="price#display-price">$40.00</span>
        <span data-telemetry-name="price#price-strikethrough">$30.00</span>
      </a>`;
    expect(parseDealsHtml(badHtml)).toEqual([]);
  });

  it("无 discount-badge 的 HTML 返回空数组", () => {
    expect(parseDealsHtml("<div>nothing here</div>")).toEqual([]);
  });
});
