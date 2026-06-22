/**
 * tests/main/dianping-scraper.test.js
 *
 * Task 5: 大众点评搜索结果 HTML 解析 + scraper 单元测.
 * 6 cases: 3 parseShopListHtml + 3 search.
 * HttpClient 通过 `{http: stub}` 注入, 不发真实网络请求.
 * (vitest 1.x 用 import, 不是 require — 跟其他 food 测试一致)
 */

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { createDianpingScraper, parseShopListHtml } from "../../src/main/food/dianping-scraper.js";

const FIXTURE_PATH = path.join(__dirname, "../fixtures/dianping-search-sample.html");

describe("parseShopListHtml", () => {
  it("extracts shops from fixture", () => {
    const html = fs.readFileSync(FIXTURE_PATH, "utf8");
    const shops = parseShopListHtml(html);
    expect(shops.length).toBe(2);
    expect(shops[0].name).toBe("麦当劳(建国路店)");
    expect(shops[0].rating).toBe(4.5);
    expect(shops[0].reviewCount).toBe(328);
    expect(shops[0].avgPrice).toBe(45);
    expect(shops[1].name).toBe("海底捞火锅");
    expect(shops[1].avgPrice).toBe(120);
  });

  it("returns empty array on no matches", () => {
    expect(parseShopListHtml("<html></html>")).toEqual([]);
  });

  it("skips shops with invalid rating", () => {
    const html = '<li class="shop-list-item"><h4 class="shop-title">X</h4><span class="rating">n/a</span></li>';
    expect(parseShopListHtml(html)).toEqual([]);
  });
});

describe("dianping-scraper.search", () => {
  function makeStubHttp(responses) {
    let i = 0;
    return { get: vi.fn(async () => responses[i++] ?? { status: 0, body: "", error: "network" }) };
  }

  it("returns shops on 200", async () => {
    const html = fs.readFileSync(FIXTURE_PATH, "utf8");
    const http = makeStubHttp([{ status: 200, body: html }]);
    const s = createDianpingScraper({ http });
    const r = await s.search({ lat: 39.99, lng: 116.48 });
    expect(r.ok).toBe(true);
    expect(r.data.length).toBe(2);
  });

  it("returns network on http error", async () => {
    const http = makeStubHttp([{ status: 0, body: "", error: "network" }]);
    const s = createDianpingScraper({ http });
    const r = await s.search({ lat: 39.99, lng: 116.48 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("network");
    // 合规: 网络错误不允许重试, 避免触发大众点评反爬封 IP
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it("returns rate_limit on 403", async () => {
    const http = makeStubHttp([{ status: 403, body: "Forbidden" }]);
    const s = createDianpingScraper({ http });
    const r = await s.search({ lat: 39.99, lng: 116.48 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("rate_limit");
  });
});