/**
 * tests/main/wechat-hot/fetcher.test.js
 *
 * 单测 wechat-hot fetcher: 注入 HttpClient, 验证:
 *   - 200 + 有效 JSON → 解析后的 payload + source + fetchedAt
 *   - 5xx → fetch_failed
 *   - 非 JSON body → parse_failed
 *   - code != 0 → parse_failed
 *   - HttpClient 报告 timeout/network → http_timeout
 */
import { describe, it, expect, vi } from "vitest";
const { fetchWechatHot } = require("../../../src/main/wechat-hot/fetcher.js");

function makeClient({ status = 200, body = "{}", error = null } = {}) {
  return {
    get: vi.fn().mockResolvedValue({ status, body, headers: {}, error }),
  };
}

const RAW_OK = JSON.stringify({
  code: 0,
  data: { list: [{ id: "a", title: "X", url: "https://x" }] },
});

describe("wechat-hot fetcher", () => {
  it("returns parsed payload on 200 + valid JSON", async () => {
    const client = makeClient({ body: RAW_OK });
    const r = await fetchWechatHot({ httpClient: client });
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].title).toBe("X");
    expect(r.source).toBe("tenhot");
    expect(typeof r.fetchedAt).toBe("number");
  });

  it("throws fetch_failed on HTTP 5xx", async () => {
    const client = makeClient({ status: 502, body: "" });
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "fetch_failed",
    });
  });

  it("throws parse_failed on non-JSON body", async () => {
    const client = makeClient({ status: 200, body: "<html>not json</html>" });
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "parse_failed",
    });
  });

  it("throws parse_failed when code != 0", async () => {
    const body = JSON.stringify({ code: 1, data: { list: [] } });
    const client = makeClient({ body });
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "parse_failed",
    });
  });

  it("throws http_timeout when HttpClient reports timeout", async () => {
    const client = makeClient({ body: "", error: "timeout" });
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "http_timeout",
    });
  });

  it("throws http_timeout on network error", async () => {
    const client = makeClient({ body: "", error: "network" });
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "http_timeout",
    });
  });
});
