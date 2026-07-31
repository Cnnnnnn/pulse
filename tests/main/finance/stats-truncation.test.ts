/**
 * tests/main/finance/stats-truncation.test.ts
 *
 * B4 验证：RSS 抓取 body 显著短于 warnBelowBytes 阈值时，工厂应触发 mainLog.warn。
 * 通过 mock ./http 的 fetchText 与 ../log 的 mainLog 控制输入并断言告警行为。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/main/finance/http", () => ({
  fetchText: vi.fn(),
}));
vi.mock("../../../src/main/log", () => ({
  mainLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const { createRssFetcher } = await import(
  "../../../src/main/finance/rss-fetcher-factory"
);
const http = await import("../../../src/main/finance/http");
const log = await import("../../../src/main/log");

describe("rss-fetcher-factory · 截断告警 (B4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("body 短于 warnBelowBytes 时告警", async () => {
    (http as any).fetchText.mockResolvedValue({ ok: true, body: "<rss/>" });
    const f = createRssFetcher({
      id: "stats",
      label: "国家统计局",
      url: "http://x",
      warnBelowBytes: 100,
    });
    await f.fetch();
    expect((log as any).mainLog.warn).toHaveBeenCalledTimes(1);
    expect(
      (log as any).mainLog.warn.mock.calls[0][0] as string,
    ).toContain("可能被截断");
  });

  it("body 充足时不告警", async () => {
    (http as any).fetchText.mockResolvedValue({ ok: true, body: "x".repeat(200) });
    const f = createRssFetcher({
      id: "stats",
      label: "国家统计局",
      url: "http://x",
      warnBelowBytes: 100,
    });
    await f.fetch();
    expect((log as any).mainLog.warn).not.toHaveBeenCalled();
  });

  it("未配置 warnBelowBytes 时即便 body 短也不告警", async () => {
    (http as any).fetchText.mockResolvedValue({ ok: true, body: "<rss/>" });
    const f = createRssFetcher({ id: "t", label: "测试源", url: "http://x" });
    await f.fetch();
    expect((log as any).mainLog.warn).not.toHaveBeenCalled();
  });

  it("抓取失败只返 ok:false，不告警", async () => {
    (http as any).fetchText.mockResolvedValue({ ok: false, error: "timeout" });
    const f = createRssFetcher({
      id: "stats",
      label: "国家统计局",
      url: "http://x",
      warnBelowBytes: 100,
    });
    const r = await f.fetch();
    expect(r.ok).toBe(false);
    expect((log as any).mainLog.warn).not.toHaveBeenCalled();
  });
});
