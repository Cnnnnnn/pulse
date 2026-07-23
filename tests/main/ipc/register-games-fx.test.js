import { describe, expect, it, vi } from "vitest";

const { attachFx } = require("../../../src/main/ipc/register-games.ts");

const EMPTY_FX = { rates: {}, date: null, fetchedAt: null, stale: true };

describe("attachFx", () => {
  it("从 items 提取非 CNY 合法币种并去重", async () => {
    const getRates = vi.fn(async () => ({
      rates: { USD: 7.2, EUR: 7.8 },
      date: "2026-07-17",
      fetchedAt: "2026-07-17T00:00:00.000Z",
      stale: false,
    }));
    const result = {
      ok: true,
      items: [
        { id: "1", currency: "USD" },
        { id: "2", currency: "EUR" },
        { id: "3", currency: "USD" },
        { id: "4", currency: "CNY" },
        { id: "5", currency: "badx" },
      ],
    };

    const out = await attachFx(result, { getRates });

    expect(getRates).toHaveBeenCalledWith(["USD", "EUR"]);
    expect(out.fx.rates).toEqual({ USD: 7.2, EUR: 7.8 });
    expect(out.items).toBe(result.items);
  });

  it("小写/带空白 currency 先 trim+uppercase 再验证", async () => {
    const getRates = vi.fn(async () => ({
      rates: { USD: 7.2 },
      date: "2026-07-17",
      fetchedAt: "2026-07-17T00:00:00.000Z",
      stale: false,
    }));
    const result = {
      ok: true,
      items: [
        { id: "1", currency: " usd " },
        { id: "2", currency: "eur" },
        { id: "3", currency: " cny " },
      ],
    };

    const out = await attachFx(result, { getRates });

    expect(getRates).toHaveBeenCalledWith(["USD", "EUR"]);
    expect(out.fx.rates).toEqual({ USD: 7.2 });
  });

  it("result.ok === false 时不调用 service 并附空 stale fx", async () => {
    const getRates = vi.fn();
    const result = { ok: false, items: [{ currency: "USD" }] };

    const out = await attachFx(result, { getRates });

    expect(getRates).not.toHaveBeenCalled();
    expect(out.fx).toEqual(EMPTY_FX);
  });

  it("service throw 时仍返回游戏结果并附空 stale fx", async () => {
    const getRates = vi.fn(async () => {
      throw new Error("fx down");
    });
    const result = {
      ok: true,
      items: [{ id: "1", currency: "USD", title: "Game" }],
    };

    const out = await attachFx(result, { getRates });

    expect(out.items).toEqual(result.items);
    expect(out.fx).toEqual(EMPTY_FX);
  });

  it("不修改原 items 引用内容", async () => {
    const getRates = vi.fn(async () => ({
      rates: { USD: 7.2 },
      date: "2026-07-17",
      fetchedAt: "2026-07-17T00:00:00.000Z",
      stale: false,
    }));
    const items = [{ id: "1", currency: "USD", salePrice: 10 }];
    const result = { ok: true, items };

    await attachFx(result, { getRates });

    expect(items[0].salePrice).toBe(10);
    expect(items).toHaveLength(1);
  });
});
