/**
 * tests/main/wechat-hot/list-parser.test.js
 */
import { describe, it, expect } from "vitest";
const { parseWechatHotPayload } = require("../../../src/main/wechat-hot/list-parser.js");

const RAW_OK = {
  code: 0,
  data: {
    list: [
      { id: "a", title: "微信支付上线新功能", url: "https://a", hot: { value: "12.3万" }, label: { name: "沸" } },
      { id: "b", title: "苹果发布会定档", url: "https://b", hot: { value: "8.1万" }, label: { name: "爆" } },
      { id: "c", title: "某明星工作室声明", url: "https://c" }, // 无 hot / label
      { id: "d", title: "", url: "https://d" }, // 空 title, 应被过滤
    ],
  },
};

describe("wechat-hot list-parser", () => {
  it("parses successful payload, drops empty titles, assigns rank by index", () => {
    const items = parseWechatHotPayload(RAW_OK);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      rank: 1, title: "微信支付上线新功能", url: "https://a", heat: "12.3万", tag: "沸",
    });
    expect(items[1].tag).toBe("爆");
    expect(items[2].heat).toBeUndefined();
    expect(items[2].tag).toBeUndefined();
  });

  it("throws parse_failed on code != 0", () => {
    expect(() => parseWechatHotPayload({ code: 1, data: { list: [] } }))
      .toThrowError(expect.objectContaining({ reason: "parse_failed" }));
  });

  it("throws parse_failed on missing data.list", () => {
    expect(() => parseWechatHotPayload({ code: 0, data: null }))
      .toThrowError(expect.objectContaining({ reason: "parse_failed" }));
    expect(() => parseWechatHotPayload({ code: 0, data: {} }))
      .toThrowError(expect.objectContaining({ reason: "parse_failed" }));
  });

  it("throws parse_failed on non-object payload", () => {
    expect(() => parseWechatHotPayload(null))
      .toThrowError(expect.objectContaining({ reason: "parse_failed" }));
    expect(() => parseWechatHotPayload("not-an-object"))
      .toThrowError(expect.objectContaining({ reason: "parse_failed" }));
  });

  it("returns [] for empty list", () => {
    const items = parseWechatHotPayload({ code: 0, data: { list: [] } });
    expect(items).toEqual([]);
  });
});
