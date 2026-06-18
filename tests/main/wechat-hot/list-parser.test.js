/**
 * tests/main/wechat-hot/list-parser.test.js
 *
 * v2.24.1 适配 xxapi 微博热搜 API:
 *   { code:200, data:[{index,title,hot,url}] }
 */
import { describe, it, expect } from "vitest";
const {
  parseWechatHotPayload,
} = require("../../../src/main/wechat-hot/list-parser.js");

const RAW_OK = {
  code: 200,
  msg: "数据请求成功",
  data: [
    {
      index: 1,
      title: "甲酰胺 致癌",
      hot: "208万",
      url: "https://s.weibo.com/weibo?q=甲酰胺 致癌",
    },
    {
      index: 2,
      title: "宁德时代利润超7家车企总和",
      hot: "99万",
      url: "https://s.weibo.com/weibo?q=xxx",
    },
    {
      index: 3,
      title: "各地花式迎端午",
      url: "https://s.weibo.com/weibo?q=yyy",
    }, // 无 hot
    { index: 4, title: "", url: "https://s.weibo.com/weibo?q=zzz" }, // 空 title, 应被过滤
    { index: 5, title: "valid-no-url", url: "" }, // 空 url, 应被过滤
  ],
};

describe("wechat-hot list-parser (xxapi weibo)", () => {
  it("parses successful payload, drops empty titles/urls, assigns rank by index", () => {
    const items = parseWechatHotPayload(RAW_OK);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      rank: 1,
      title: "甲酰胺 致癌",
      url: "https://s.weibo.com/weibo?q=甲酰胺 致癌",
      heat: "208万",
    });
    expect(items[1].title).toBe("宁德时代利润超7家车企总和");
    expect(items[1].heat).toBe("99万");
    expect(items[2].heat).toBeUndefined();
  });

  it("throws parse_failed on code != 200", () => {
    expect(() => parseWechatHotPayload({ code: 500, data: [] })).toThrowError(
      expect.objectContaining({ reason: "parse_failed" }),
    );
  });

  it("throws parse_failed on missing/non-array data", () => {
    expect(() => parseWechatHotPayload({ code: 200, data: null })).toThrowError(
      expect.objectContaining({ reason: "parse_failed" }),
    );
    expect(() =>
      parseWechatHotPayload({ code: 200, data: "string-not-array" }),
    ).toThrowError(expect.objectContaining({ reason: "parse_failed" }));
    expect(() => parseWechatHotPayload({ code: 200 })).toThrowError(
      expect.objectContaining({ reason: "parse_failed" }),
    );
  });

  it("throws parse_failed on non-object payload", () => {
    expect(() => parseWechatHotPayload(null)).toThrowError(
      expect.objectContaining({ reason: "parse_failed" }),
    );
    expect(() => parseWechatHotPayload("not-an-object")).toThrowError(
      expect.objectContaining({ reason: "parse_failed" }),
    );
  });

  it("returns [] for empty data array", () => {
    const items = parseWechatHotPayload({ code: 200, data: [] });
    expect(items).toEqual([]);
  });

  it("ignores entries with non-string title/url", () => {
    const items = parseWechatHotPayload({
      code: 200,
      data: [
        { index: 1, title: 123, url: "https://a" },
        { index: 2, title: "ok", url: null },
        { index: 3, title: null, url: "https://c" },
      ],
    });
    expect(items).toEqual([]);
  });
});
