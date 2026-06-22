/**
 * tests/main/twitter-serenity/cache-store.test.js
 *
 * Task 6: cache-store LRU + 增量合并.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createCacheStore,
  mergeTweets,
  LRU_LIMIT,
} from "../../../src/main/twitter-serenity/cache-store.js";

describe("mergeTweets (纯函数)", () => {
  it("按 id 去重, 新帖插前面, 旧帖 metrics 更新", () => {
    const existing = [
      { id: "1", text: "old", metrics: { likes: 5 } },
      { id: "3", text: "c", metrics: { likes: 0 } },
    ];
    const incoming = [
      { id: "2", text: "new", metrics: { likes: 1 } },
      { id: "1", text: "old", metrics: { likes: 99 } },
    ];
    const merged = mergeTweets(existing, incoming);
    const ids = merged.map((t) => t.id);
    expect(ids).toEqual(["2", "1", "3"]);
    const one = merged.find((t) => t.id === "1");
    expect(one.metrics.likes).toBe(99);
  });

  it("去重后 ≤ LRU 上限, 超出截断保留最新 (incoming 在前)", () => {
    const existing = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      text: "x",
    }));
    const incoming = [{ id: "2000", text: "y" }];
    const merged = mergeTweets(existing, incoming, 1000);
    expect(merged).toHaveLength(1000);
    expect(merged[0].id).toBe("2000");
  });

  it("existing / incoming 为空/null 容错", () => {
    expect(mergeTweets(null, [{ id: "1" }])).toEqual([{ id: "1" }]);
    expect(mergeTweets([{ id: "1" }], null)).toEqual([{ id: "1" }]);
    expect(mergeTweets(null, null)).toEqual([]);
  });
});

describe("createCacheStore", () => {
  it("load 无 cache 返回空结构 + 默认 handle", () => {
    const stateStore = { loadTwitterCache: () => null, saveTwitterCache: vi.fn() };
    const cs = createCacheStore({ stateStore });
    const c = cs.load();
    expect(c.tweets).toEqual([]);
    expect(c.handle).toBe("aleabitoreddit");
    expect(c.translations).toEqual({});
    expect(c.consecutiveFailureCount).toBe(0);
  });

  it("load 有旧 cache 返回 tweets", () => {
    const stateStore = {
      loadTwitterCache: () => ({
        handle: "aleabitoreddit",
        tweets: [{ id: "1", text: "a" }],
        translations: {},
      }),
      saveTwitterCache: vi.fn(),
    };
    const cs = createCacheStore({ stateStore });
    expect(cs.load().tweets).toHaveLength(1);
  });

  it("mergeAndSave 合并后 save + 更新 lastFetchedAt", () => {
    const saveMock = vi.fn();
    const stateStore = {
      loadTwitterCache: () => ({
        tweets: [{ id: "1", text: "old", metrics: { likes: 0 } }],
      }),
      saveTwitterCache: saveMock,
    };
    const cs = createCacheStore({ stateStore });
    cs.mergeAndSave([{ id: "2", text: "new", metrics: { likes: 0 } }]);
    expect(saveMock).toHaveBeenCalled();
    const saved = saveMock.mock.calls[0][0];
    expect(saved.tweets).toHaveLength(2);
    expect(saved.lastFetchedAt).toBeTruthy();
  });

  it("mergeAndSave 带 lastSuccessMirror 时重置 failureCount", () => {
    const saveMock = vi.fn();
    const stateStore = {
      loadTwitterCache: () => ({ consecutiveFailureCount: 2, tweets: [] }),
      saveTwitterCache: saveMock,
    };
    const cs = createCacheStore({ stateStore });
    cs.mergeAndSave([{ id: "9", text: "x" }], { lastSuccessMirror: "twiiit.com" });
    expect(saveMock.mock.calls[0][0].consecutiveFailureCount).toBe(0);
    expect(saveMock.mock.calls[0][0].lastSuccessMirror).toBe("twiiit.com");
  });

  it("setDegraded 累加 consecutiveFailureCount", () => {
    // 用 in-memory store 模拟真实 state-store round-trip (load 反映上次 save)
    let stored = null;
    const stateStore = {
      loadTwitterCache: () => stored,
      saveTwitterCache: (c) => {
        stored = c;
      },
    };
    const cs = createCacheStore({ stateStore });
    cs.setDegraded();
    const count = cs.setDegraded();
    expect(count).toBe(2);
  });

  it("resetDegraded 清零", () => {
    let stored = { consecutiveFailureCount: 3 };
    const stateStore = {
      loadTwitterCache: () => stored,
      saveTwitterCache: (c) => {
        stored = c;
      },
    };
    const cs = createCacheStore({ stateStore });
    cs.resetDegraded();
    expect(stored.consecutiveFailureCount).toBe(0);
  });

  it("LRU_LIMIT 导出 = 1000", () => {
    expect(LRU_LIMIT).toBe(1000);
  });
});
