import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildKlineUrl,
  parseKlineResponse,
  dedupeByDate,
  fetchMetalKline,
  pointsToHistoryMap,
} from "../../src/metals/metal-kline-fetcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIX = (name) =>
  fs.readFileSync(
    path.join(__dirname, "../fixtures/eastmoney_kline", name),
    "utf8",
  );

describe("metal-kline-fetcher: buildKlineUrl", () => {
  it("拼出包含 secid/beg/end 的 URL", () => {
    const url = buildKlineUrl("118.AU9999", "20260601", "20260628");
    expect(url).toMatch(/secid=118\.AU9999/);
    expect(url).toMatch(/beg=20260601/);
    expect(url).toMatch(/end=20260628/);
    expect(url).toMatch(/klt=101/);
    expect(url).toMatch(/fqt=0/);
  });
});

describe("metal-kline-fetcher: parseKlineResponse", () => {
  it("正常 AU9999 响应: 30 条 points + source='eastmoney'", () => {
    const r = parseKlineResponse(FIX("au9999_day30.txt"), "118.AU9999");
    expect(r).not.toBeNull();
    expect(r.id).toBe("118.AU9999");
    expect(r.source).toBe("eastmoney");
    expect(r.points.length).toBe(30);
    expect(r.points[0]).toEqual({
      date: "2026-05-19",
      open: 920.5,
      close: 925.3,
      high: 930,
      low: 918.2,
    });
    expect(r.points[29].date).toBe("2026-06-27");
  });

  it("rc=100 data=null 返 null (不抛)", () => {
    const text = '{"rc":100,"rt":1,"data":null}';
    expect(parseKlineResponse(text, "101.GC00")).toBeNull();
  });

  it("空字符串 返 null", () => {
    expect(parseKlineResponse("", "118.AU9999")).toBeNull();
  });

  it("非 JSON 文本 返 null", () => {
    expect(parseKlineResponse("<html>error</html>", "118.AU9999")).toBeNull();
  });

  it("缺 klines 字段 返 null", () => {
    const text = '{"rc":0,"data":{}}';
    expect(parseKlineResponse(text, "118.AU9999")).toBeNull();
  });
});

describe("metal-kline-fetcher: dedupeByDate", () => {
  it("同日重复 → 保留最后一条", () => {
    const points = [
      { date: "2026-06-01", close: 100 },
      { date: "2026-06-01", close: 105 },
      { date: "2026-06-02", close: 110 },
    ];
    expect(dedupeByDate(points)).toEqual([
      { date: "2026-06-01", close: 105 },
      { date: "2026-06-02", close: 110 },
    ]);
  });

  it("超 30 天 → 保留最近 30 条", () => {
    const fmt = (i) => {
      // day 0 = 2026-04-01; pure UTC date math, no timezone drift
      const d = new Date(Date.UTC(2026, 3, 1 + i));
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const points = Array.from({ length: 50 }, (_, i) => ({
      date: fmt(i),
      close: 100 + i,
    }));
    const out = dedupeByDate(points);
    expect(out.length).toBe(30);
    // slice(-30) on a 50-elem ascending-sorted array keeps the LAST 30
    // (= the 30 largest dates = indices 20..49 of the original input).
    expect(out[0].date).toBe("2026-04-21");
    expect(out[out.length - 1].date).toBe("2026-05-20");
  });

  it("无序输入 → 按 date 升序输出", () => {
    const out = dedupeByDate([
      { date: "2026-06-02", close: 1 },
      { date: "2026-05-30", close: 2 },
      { date: "2026-06-01", close: 3 },
    ]);
    expect(out.map((p) => p.date)).toEqual([
      "2026-05-30",
      "2026-06-01",
      "2026-06-02",
    ]);
  });
});

describe("metal-kline-fetcher: fetchMetalKline (集成)", () => {
  it("正常 4 个 items 并发 → 都成功", async () => {
    const items = [
      { id: "AU9999", secid: "118.AU9999" },
      { id: "AG9999", secid: "118.AG9999" },
      { id: "XAU", secid: "113.AU2608" },
      { id: "XAG", secid: "113.AG2608" },
    ];
    const httpGet = async (url) => {
      if (url.includes("118.AU9999")) return FIX("au9999_day30.txt");
      if (url.includes("118.AG9999")) return FIX("ag9999_day30.txt");
      if (url.includes("113.AU2608")) return FIX("au2608_day30.txt");
      if (url.includes("113.AG2608")) return FIX("ag2608_day30.txt");
      throw new Error("unexpected url: " + url);
    };
    const out = await fetchMetalKline(items, httpGet);
    expect(Object.keys(out).sort()).toEqual(["AG9999", "AU9999", "XAG", "XAU"]);
    expect(out.AU9999.length).toBe(30);
    expect(out.XAU.length).toBe(26);
  });

  it("部分失败 → 返部分结果 (不抛)", async () => {
    const items = [
      { id: "AU9999", secid: "118.AU9999" },
      { id: "XAU", secid: "113.AU2608" },
    ];
    const httpGet = async (url) => {
      if (url.includes("118.AU9999")) return FIX("au9999_day30.txt");
      if (url.includes("113.AU2608")) throw new Error("network error");
      throw new Error("unexpected");
    };
    const out = await fetchMetalKline(items, httpGet);
    expect(out.AU9999.length).toBe(30);
    expect(out.XAU).toBeUndefined();
  });

  it("全失败 → 抛聚合 error", async () => {
    const items = [
      { id: "XAU", secid: "113.AU2608" },
      { id: "XAG", secid: "113.AG2608" },
    ];
    const httpGet = async () => {
      throw new Error("all down");
    };
    await expect(fetchMetalKline(items, httpGet)).rejects.toThrow(/all 2 symbol/);
  });
});

describe("metal-kline-fetcher: pointsToHistoryMap", () => {
  it("取每个 points 的 close 字段, 转成 historyMap 形态", () => {
    const fetched = {
      XAU: [
        { date: "2026-05-30", close: 100 },
        { date: "2026-05-31", close: 105 },
      ],
      AU9999: [{ date: "2026-05-30", close: 200 }],
    };
    const items = [
      { id: "XAU", secid: "113.AU2608" },
      { id: "AU9999", secid: "118.AU9999" },
    ];
    expect(pointsToHistoryMap(fetched, items)).toEqual({
      XAU: [
        { date: "2026-05-30", close: 100 },
        { date: "2026-05-31", close: 105 },
      ],
      AU9999: [{ date: "2026-05-30", close: 200 }],
    });
  });

  it("fetched 里缺某 id → 不出现在结果里", () => {
    expect(pointsToHistoryMap({}, [{ id: "XAU", secid: "113.AU2608" }])).toEqual({});
  });
});