const { requireMain, requirePlatform, requireUtils, requireConfig, requireDetector, requireMetals, requireFunds, requireStocks, requireAi, requireAiSessions, requireAiUsage, requireWorkers, requireReleaseNotes } = require("../_setup/require-main.cjs");

/**
 * tests/main/fund-fetcher-sina.test.js
 */

import { describe, it, expect } from "vitest";
import { MockHttp } from "../helpers/mock-http";
const {
  fetchFundNavSina,
  parseSinaFundLine,
} = requireFunds("fund-fetcher-sina");

// 新浪 of 接口字段: 名称, 单位净值(最新), 累计净值, 上日净值, 涨跌幅%, 日期
// parts[3]=4.682 是"上日净值", 不是估算净值; 涨跌幅 -0.21% 与 (4.672-4.682)/4.682 自洽.
const SAMPLE =
  'var hq_str_of021528="财通成长优选混合C,4.672,4.672,4.682,-0.21,2026-06-11";';

describe("parseSinaFundLine", () => {
  it("解析新浪 of 行 (parts[3] 为上日净值, 无估算净值)", () => {
    const p = parseSinaFundLine(SAMPLE);
    expect(p).not.toBeNull();
    expect(p.nav).toBe(4.672);
    expect(p.estimatedNav).toBeNull(); // 新浪 of 接口无盘中估算净值
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
    expect(r.estimatedNav).toBeNull();
  });
});
