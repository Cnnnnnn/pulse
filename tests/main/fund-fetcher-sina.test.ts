/**
 * tests/main/fund-fetcher-sina.test.js
 */

import { describe, it, expect } from "vitest";
import { MockHttp } from "../helpers/mock-http.js";
const {
  fetchFundNavSina,
  parseSinaFundLine,
} = require("../../src/funds/fund-fetcher-sina.js");

const SAMPLE =
  'var hq_str_of021528="财通成长优选混合C,4.672,4.672,4.682,-0.21,2026-06-11";';

describe("parseSinaFundLine", () => {
  it("解析新浪 of 行", () => {
    const p = parseSinaFundLine(SAMPLE);
    expect(p).not.toBeNull();
    expect(p.nav).toBe(4.672);
    expect(p.estimatedNav).toBe(4.682);
    expect(p.dayChangePct).toBe(-0.21);
    expect(p.navDate).toBe("2026-06-11");
  });

  it("无效内容 → null", () => {
    expect(parseSinaFundLine("")).toBeNull();
    expect(parseSinaFundLine("nope")).toBeNull();
  });
});

describe("fetchFundNavSina", () => {
  it("200 + 合法 body → 映射", async () => {
    const http = new MockHttp({ get: [{ status: 200, body: SAMPLE }] });
    const r = await fetchFundNavSina("021528", http);
    expect(r.code).toBe("021528");
    expect(r.source).toBe("sina");
    expect(r.estimatedNav).toBe(4.682);
  });
});
