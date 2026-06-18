/**
 * tests/main/wechat-hot/cache.test.js
 *
 * 单测 wechat-hot cache:
 *   - 初始 load() 返 EMPTY (不让 IPC 在 fetch 前拿 undefined)
 *   - refresh() 成功后写 cache 并通知 onUpdate
 *   - 并发 refresh 合并 (in-flight guard)
 *   - 失败不写 cache, load() 仍返先前状态; in-flight 释放
 *   - onUpdate 在 success 时被调用
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
const {
  createWechatHotCache,
} = require("../../../src/main/wechat-hot/cache.js");

function makeFetcher(impl) {
  return vi.fn(impl);
}

const EMPTY = { items: [], fetchedAt: 0, source: "xxapi" };
const OK = {
  items: [{ rank: 1, title: "X", url: "https://x" }],
  fetchedAt: 1700000000000,
  source: "xxapi",
};

describe("wechat-hot cache", () => {
  let cache;
  beforeEach(() => {
    cache = createWechatHotCache({ fetcher: makeFetcher(async () => OK) });
  });

  it("load returns empty payload initially", () => {
    expect(cache.load()).toEqual(EMPTY);
  });

  it("refresh writes cache and returns payload", async () => {
    const fetcher = vi.fn().mockResolvedValue(OK);
    cache = createWechatHotCache({ fetcher });
    const r = await cache.refresh();
    expect(r).toEqual(OK);
    expect(cache.load()).toEqual(OK);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refresh during in-flight returns the same in-flight promise (no double fetch)", async () => {
    let resolveFetch;
    const fetcher = vi.fn(
      () =>
        new Promise((res) => {
          resolveFetch = res;
        }),
    );
    cache = createWechatHotCache({ fetcher });
    const p1 = cache.refresh();
    const p2 = cache.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetch(OK);
    const r1 = await p1;
    const r2 = await p2;
    expect(r1).toBe(r2);
    expect(r1).toEqual(OK);
  });

  it("refresh after failure does NOT cache the failure; cache stays prior state; next refresh re-fetches", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("x"), { reason: "fetch_failed" }),
      );
    cache = createWechatHotCache({ fetcher });
    await expect(cache.refresh()).rejects.toMatchObject({
      reason: "fetch_failed",
    });
    // 失败后 cache 保持 initial EMPTY (load() 不暴露 throw)
    expect(cache.load()).toEqual(EMPTY);
    // in-flight 已释放, 下次 refresh 会重新 fetch
    fetcher.mockResolvedValueOnce(OK);
    const r = await cache.refresh();
    expect(r).toEqual(OK);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cache.load()).toEqual(OK);
  });

  it("onUpdate hook is called with new payload after success", async () => {
    const fetcher = vi.fn().mockResolvedValue(OK);
    const onUpdate = vi.fn();
    cache = createWechatHotCache({ fetcher, onUpdate });
    await cache.refresh();
    expect(onUpdate).toHaveBeenCalledWith(OK);
  });
});
