/**
 * tests/main/wechat-hot/fetcher.test.js
 *
 * 单测 wechat-hot fetcher (v2.24.1 微博热搜):
 *   - 主源 xxapi 成功 → 返 source=xxapi
 *   - 主源失败 + fallback 成功 → 返 source=weibo.com
 *   - 主源失败 + fallback 也失败 → 抛主源 reason
 *   - 网络/timeout → http_timeout
 */
import { describe, it, expect, vi } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../../_setup/require-main.cjs");
const {
  fetchWechatHot,
  parseWeiboAjaxRealtime,
  URL_PRIMARY,
  URL_FALLBACK,
} = requireMain("wechat-hot/fetcher");

function makeClient(responses) {
  // responses: array of { status, body, error? } — 按调用顺序返
  let i = 0;
  return {
    get: vi.fn(async (url, opts) => {
      const r = responses[Math.min(i++, responses.length - 1)];
      return { ...r, headers: {} };
    }),
  };
}

const RAW_XXAPI_OK = JSON.stringify({
  code: 200,
  data: [
    {
      index: 1,
      title: "X",
      hot: "208万",
      url: "https://s.weibo.com/weibo?q=X",
    },
  ],
});

const RAW_WEIBO_AJAX_OK = JSON.stringify({
  ok: 1,
  data: {
    realtime: [
      { word: "甲酰胺 致癌", num: 2081111, label_name: "热" },
      { word: "宁德时代利润", num: 990000 },
      { word: "no-label-no-heat", num: 1 },
    ],
  },
});

describe("wechat-hot fetcher (xxapi primary)", () => {
  it("returns parsed payload on 200 + valid xxapi JSON", async () => {
    const client = makeClient([{ status: 200, body: RAW_XXAPI_OK }]);
    const r = await fetchWechatHot({ httpClient: client });
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith(
      URL_PRIMARY,
      expect.objectContaining({ timeout: 10000 }),
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].title).toBe("X");
    expect(r.source).toBe("xxapi");
    expect(typeof r.fetchedAt).toBe("number");
  });

  it("throws http_timeout when xxapi reports timeout", async () => {
    const client = makeClient([{ status: 200, body: "", error: "timeout" }]);
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "http_timeout",
    });
  });

  it("throws http_timeout on xxapi network error", async () => {
    const client = makeClient([{ status: 200, body: "", error: "network" }]);
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "http_timeout",
    });
  });
});

describe("wechat-hot fetcher (fallback to weibo.com)", () => {
  it("falls back to weibo.com when xxapi returns 5xx", async () => {
    // 第 1 次 xxapi 5xx → 第 2 次 weibo.com OK
    const client = makeClient([
      { status: 502, body: "" },
      { status: 200, body: RAW_WEIBO_AJAX_OK },
    ]);
    const r = await fetchWechatHot({ httpClient: client });
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(r.source).toBe("weibo.com");
    expect(r.items).toHaveLength(3);
    expect(r.items[0].title).toBe("甲酰胺 致癌");
    expect(r.items[0].heat).toBe("208万");
    expect(r.items[0].tag).toBe("热");
    expect(r.items[0].url).toContain("weibo.com");
  });

  it("falls back when xxapi returns parse_failed (code != 200)", async () => {
    const client = makeClient([
      { status: 200, body: JSON.stringify({ code: 500, data: [] }) },
      { status: 200, body: RAW_WEIBO_AJAX_OK },
    ]);
    const r = await fetchWechatHot({ httpClient: client });
    expect(r.source).toBe("weibo.com");
    expect(r.items.length).toBeGreaterThan(0);
  });

  it("passes Referer/UA headers to weibo.com fallback", async () => {
    const client = makeClient([
      { status: 500, body: "" },
      { status: 200, body: RAW_WEIBO_AJAX_OK },
    ]);
    await fetchWechatHot({ httpClient: client });
    expect(client.get).toHaveBeenNthCalledWith(
      2,
      URL_FALLBACK,
      expect.objectContaining({
        headers: expect.objectContaining({ Referer: "https://weibo.com/" }),
      }),
    );
  });

  it("throws primary reason when both sources fail (5xx + weibo 5xx)", async () => {
    const client = makeClient([
      { status: 502, body: "" },
      { status: 503, body: "" },
    ]);
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "fetch_failed",
    });
  });

  it("throws primary parse_failed when both sources return invalid JSON", async () => {
    const client = makeClient([
      { status: 200, body: "<html>bad</html>" },
      { status: 200, body: "<html>bad</html>" },
    ]);
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "parse_failed",
    });
  });

  it("throws fetch_failed when httpClient missing", async () => {
    await expect(fetchWechatHot({ httpClient: null })).rejects.toMatchObject({
      reason: "fetch_failed",
    });
  });
});

describe("parseWeiboAjaxRealtime (weibo.com ajax format)", () => {
  it("extracts realtime array, formats heat, builds search url", () => {
    const items = parseWeiboAjaxRealtime(JSON.parse(RAW_WEIBO_AJAX_OK));
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      rank: 1,
      title: "甲酰胺 致癌",
      heat: "208万",
      tag: "热",
    });
    expect(items[0].url).toContain("s.weibo.com/weibo?q=");
    expect(items[1].heat).toBe("99万");
    expect(items[2].heat).toBe("1");
    expect(items[2].tag).toBeUndefined();
  });

  it("throws parse_failed on ok !== 1", () => {
    expect(() =>
      parseWeiboAjaxRealtime({ ok: 0, data: { realtime: [] } }),
    ).toThrowError(expect.objectContaining({ reason: "parse_failed" }));
  });

  it("throws parse_failed on missing realtime", () => {
    expect(() => parseWeiboAjaxRealtime({ ok: 1, data: {} })).toThrowError(
      expect.objectContaining({ reason: "parse_failed" }),
    );
    expect(() => parseWeiboAjaxRealtime({ ok: 1 })).toThrowError(
      expect.objectContaining({ reason: "parse_failed" }),
    );
  });

  it("throws parse_failed on empty realtime (all entries filtered)", () => {
    expect(() =>
      parseWeiboAjaxRealtime({
        ok: 1,
        data: { realtime: [{ word: "", num: 1 }] },
      }),
    ).toThrowError(expect.objectContaining({ reason: "parse_failed" }));
  });

  it("caps result at 50 items", () => {
    const realtime = Array.from({ length: 80 }, (_, i) => ({
      word: `topic ${i}`,
      num: 1000 - i,
    }));
    const items = parseWeiboAjaxRealtime({ ok: 1, data: { realtime } });
    expect(items).toHaveLength(50);
  });
});
