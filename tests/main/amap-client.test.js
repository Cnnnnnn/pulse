/**
 * tests/main/amap-client.test.js
 *
 * Task 4: 高德 Maps HTTP API 封装 (geocode + around-search) 单元测.
 * 6 cases: 4 geocode + 2 aroundSearch.
 * HttpClient 通过 `{http: stub}` 注入, 不发真实网络请求.
 * (vitest 1.x 用 import, 不是 require — 跟 Task 1/2/3 一致)
 */

import { describe, it, expect, vi } from "vitest";
import { createAmapClient } from "../../src/main/food/amap-client.js";

function makeStubHttp(responses) {
  let i = 0;
  return {
    get: vi.fn(async () => responses[i++] ?? { status: 0, body: "", error: "network" }),
  };
}

describe("amap-client.geocode", () => {
  it("returns location on success", async () => {
    const http = makeStubHttp([{
      status: 200,
      body: JSON.stringify({
        status: "1",
        geocodes: [{ location: "116.481488,39.990464", formatted_address: "北京市朝阳区" }],
      }),
    }]);
    const c = createAmapClient({ key: "k", http });
    const r = await c.geocode("北京市朝阳区");
    expect(r.ok).toBe(true);
    expect(r.data.lat).toBe(39.990464);
    expect(r.data.lng).toBe(116.481488);
    expect(r.data.label).toBe("北京市朝阳区");
  });

  it("returns invalid_key on status=0", async () => {
    const http = makeStubHttp([{
      status: 200,
      body: JSON.stringify({ status: "0", info: "INVALID_USER_KEY", infocode: "10001" }),
    }]);
    const c = createAmapClient({ key: "bad", http });
    const r = await c.geocode("x");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_key");
  });

  it("returns no_match when geocodes empty", async () => {
    const http = makeStubHttp([{
      status: 200,
      body: JSON.stringify({ status: "1", geocodes: [] }),
    }]);
    const c = createAmapClient({ key: "k", http });
    const r = await c.geocode("asdfasdf");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("no_match");
  });

  it("returns network on http error", async () => {
    const http = makeStubHttp([{ status: 0, body: "", error: "network" }]);
    const c = createAmapClient({ key: "k", http });
    const r = await c.geocode("x");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("network");
  });

  it("returns timeout when http reports timeout (I-1)", async () => {
    const http = makeStubHttp([{ status: 0, body: "", error: "timeout" }]);
    const c = createAmapClient({ key: "k", http });
    const r = await c.geocode("x");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("timeout");
  });
});

describe("amap-client.aroundSearch", () => {
  it("returns pois array", async () => {
    const http = makeStubHttp([{
      status: 200,
      body: JSON.stringify({
        status: "1",
        pois: [
          { id: "B0XXX", name: "麦当劳", address: "建国路88号", location: "116.481,39.990", distance: "850", type: "西式快餐" },
        ],
      }),
    }]);
    const c = createAmapClient({ key: "k", http });
    const r = await c.aroundSearch({ location: "116.481,39.990", radius: 1000 });
    expect(r.ok).toBe(true);
    expect(r.data.length).toBe(1);
    expect(r.data[0].name).toBe("麦当劳");
    expect(r.data[0].location.lat).toBe(39.99);
  });

  it("passes keywords and radius in URL", async () => {
    const http = makeStubHttp([{ status: 200, body: JSON.stringify({ status: "1", pois: [] }) }]);
    const c = createAmapClient({ key: "MYKEY", http });
    await c.aroundSearch({ location: "116,39", radius: 2000, keywords: "美食" });
    const url = http.get.mock.calls[0][0];
    expect(url).toContain("key=MYKEY");
    expect(url).toContain("radius=2000");
    expect(url).toContain("keywords=" + encodeURIComponent("美食"));
  });
});
