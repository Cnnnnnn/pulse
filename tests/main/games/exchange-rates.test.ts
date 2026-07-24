import { afterEach, describe, expect, it, vi } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../../_setup/require-main.cjs");

const { createExchangeRateService } = requireMain("games/exchange-rates");

const DAY_MS = 24 * 60 * 60 * 1000;

function frankfurterResponse(base, rate, date = "2026-07-17") {
  return [{ base, quote: "CNY", rate, date }];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exchange-rates service", () => {
  it("多币种分别请求并返回 rates 快照", async () => {
    const fetchJson = vi.fn(async (url) => {
      if (url.includes("base=USD")) return frankfurterResponse("USD", 7.2);
      if (url.includes("base=EUR")) return frankfurterResponse("EUR", 7.8);
      throw new Error("unexpected");
    });
    const now = vi.fn(() => 1_000_000);
    const svc = createExchangeRateService({ fetchJson, now });

    const snap = await svc.getRates(["USD", "EUR"]);

    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(snap.rates).toEqual({ USD: 7.2, EUR: 7.8 });
    expect(snap.date).toBe("2026-07-17");
    expect(snap.fetchedAt).toBe(new Date(1_000_000).toISOString());
    expect(snap.stale).toBe(false);
  });

  it("忽略 CNY、空值与非法币种代码", async () => {
    const fetchJson = vi.fn(async () => frankfurterResponse("USD", 7.2));
    const svc = createExchangeRateService({ fetchJson });

    const snap = await svc.getRates(["CNY", "", "US", "usd", null, "USD"]);

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson.mock.calls[0][0]).toContain("base=USD");
    expect(snap.rates).toEqual({ USD: 7.2 });
  });

  it("fresh TTL 命中时不发请求", async () => {
    let t = 5_000;
    const now = vi.fn(() => t);
    const fetchJson = vi.fn(async () => frankfurterResponse("USD", 7.2));
    const svc = createExchangeRateService({ fetchJson, now, ttlMs: DAY_MS });

    await svc.getRates(["USD"]);
    expect(fetchJson).toHaveBeenCalledTimes(1);

    t += DAY_MS - 1;
    const snap = await svc.getRates(["USD"]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(snap.rates.USD).toBe(7.2);
    expect(snap.stale).toBe(false);
  });

  it("同币种并发刷新只发一个请求", async () => {
    let resolveFetch;
    const fetchJson = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve(frankfurterResponse("USD", 7.2));
        }),
    );
    const svc = createExchangeRateService({ fetchJson });

    const p1 = svc.getRates(["USD"]);
    const p2 = svc.getRates(["USD"]);
    resolveFetch();
    await Promise.all([p1, p2]);

    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("过期后刷新；刷新失败时返回 last-good 且 stale=true", async () => {
    let t = 0;
    const now = vi.fn(() => t);
    const fetchJson = vi
      .fn()
      .mockResolvedValueOnce(frankfurterResponse("USD", 7.2))
      .mockRejectedValueOnce(new Error("network"));
    const svc = createExchangeRateService({ fetchJson, now, ttlMs: DAY_MS });

    const first = await svc.getRates(["USD"]);
    expect(first.stale).toBe(false);

    t += DAY_MS + 1;
    const second = await svc.getRates(["USD"]);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(second.rates.USD).toBe(7.2);
    expect(second.stale).toBe(true);
  });

  it("无缓存且失败时省略该币种；全部失败返回空 rates 且不抛出", async () => {
    const fetchJson = vi.fn(async () => {
      throw new Error("down");
    });
    const svc = createExchangeRateService({ fetchJson });

    await expect(svc.getRates(["USD", "EUR"])).resolves.toEqual({
      rates: {},
      date: null,
      fetchedAt: null,
      stale: true,
    });
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("拒绝非法 Frankfurter 响应形状", async () => {
    const fetchJson = vi.fn(async () => ({ base: "USD", rates: { CNY: 7.2 } }));
    const svc = createExchangeRateService({ fetchJson });

    const snap = await svc.getRates(["USD"]);
    expect(snap.rates).toEqual({});
    expect(snap.stale).toBe(true);
  });

  it("date 取可用记录中最新值", async () => {
    let t = 0;
    const now = vi.fn(() => {
      t += 1;
      return t * 1_000;
    });
    const fetchJson = vi.fn(async (url) => {
      if (url.includes("base=USD")) return frankfurterResponse("USD", 7.2, "2026-07-15");
      return frankfurterResponse("EUR", 7.8, "2026-07-17");
    });
    const svc = createExchangeRateService({ fetchJson, now, ttlMs: DAY_MS });

    const snap = await svc.getRates(["USD", "EUR"]);
    expect(snap.date).toBe("2026-07-17");
  });
});
