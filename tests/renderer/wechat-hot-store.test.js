import { describe, it, expect, beforeEach, vi } from "vitest";

const mockLoadRead = vi.fn(() => Promise.resolve({}));
const mockMarkRead = vi.fn(() => Promise.resolve({ ok: true }));

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    wechatHotLoad: () => Promise.resolve({ items: [], fetchedAt: 0 }),
    wechatHotRefresh: () => Promise.resolve({ items: [], fetchedAt: 0, source: "x" }),
    wechatHotLoadRead: () => mockLoadRead(),
    wechatHotMarkRead: (t) => mockMarkRead(t),
    onWechatHotUpdated: () => () => {},
  },
}));

import {
  wechatHotReadIds,
  wechatHotNewIds,
  wechatHotUnreadBadge,
  applyPayload,
  markWechatHotRead,
} from "../../src/renderer/wechat-hot/store.js";

beforeEach(() => {
  wechatHotReadIds.value = {};
  wechatHotNewIds.value = {};
  mockLoadRead.mockClear();
  mockMarkRead.mockClear();
});

describe("wechat-hot store diff + markRead (I6 v2)", () => {
  it("applyPayload 产生 newIds (未读的新词)", () => {
    applyPayload({ items: [{ title: "词A" }, { title: "词B" }] });
    expect(wechatHotNewIds.value["词A"]).toBe(1);
    expect(wechatHotNewIds.value["词B"]).toBe(1);
    expect(wechatHotUnreadBadge.value).toBe(2);
  });

  it("readIds 已有的词不进 newIds", () => {
    wechatHotReadIds.value = { "词A": 100 };
    applyPayload({ items: [{ title: "词A" }, { title: "词B" }] });
    expect(wechatHotNewIds.value["词A"]).toBeUndefined();
    expect(wechatHotNewIds.value["词B"]).toBe(1);
    expect(wechatHotUnreadBadge.value).toBe(1);
  });

  it("重复 applyPayload 不重复累加已追踪的词", () => {
    applyPayload({ items: [{ title: "词A" }] });
    applyPayload({ items: [{ title: "词A" }, { title: "词B" }] });
    expect(wechatHotUnreadBadge.value).toBe(2); // A 不重复
  });

  it("markWechatHotRead 减 newIds + 加 readIds + 调 IPC", async () => {
    applyPayload({ items: [{ title: "词A" }, { title: "词B" }] });
    await markWechatHotRead("词A");
    expect(wechatHotNewIds.value["词A"]).toBeUndefined();
    expect(wechatHotReadIds.value["词A"]).toBeGreaterThan(0);
    expect(wechatHotUnreadBadge.value).toBe(1);
    expect(mockMarkRead).toHaveBeenCalledWith("词A");
  });

  it("markWechatHotRead 无效 title → invalid_args", async () => {
    const r = await markWechatHotRead("");
    expect(r.ok).toBe(false);
  });
});
