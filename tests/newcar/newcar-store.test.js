/**
 * tests/newcar/newcar-store.test.js
 *
 * src/renderer/store/newcar-store.js — 信号状态层验收 (node 环境).
 *
 * 说明: useNewCarData() 依赖 Preact hook 渲染上下文, 无法在纯 node 单测直接调用;
 *       本测试覆盖 store 的信号 / 方法层 (loadCached / setFilters / bumpNavBadge / ...),
 *       派生计算 (filtered / kpis / byMonth / byDate) 已在 aggregate / dataset 单测中覆盖.
 *       localStorage 在 node 下未定义, 源码已用 try/catch 包裹, 不影响断言.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// 主进程 IPC 桥接 mock (暴露 newcar 需要的 onSidenavBadge + newcarRefresh).
const onSidenavBadge = vi.fn();
let capturedBadgeHandler = null;
onSidenavBadge.mockImplementation((cb) => {
  capturedBadgeHandler = cb;
});

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    onSidenavBadge,
    // 默认: 远程空 releases → 合并后仍是内置基线 (115). IPC 化后 refresh() 仍成立.
    newcarRefresh: async () => ({ ok: true, releases: [], fetchedAt: Date.now() }),
  },
}));

const { api } = await import("../../src/renderer/api.js");
const toastStore = await import("../../src/renderer/store/toast-store.js");

const store = await import("../../src/renderer/store/newcar-store.js");

beforeEach(() => {
  store.newCarReleases.value = [];
  store.newCarFilters.value = {};
  store.newCarLoading.value = false;
  store.newCarLastUpdate.value = null;
  store.newCarError.value = null;
  store.newCarNavBadge.value = 0;
  store.newCarSelectedDate.value = null;
  onSidenavBadge.mockClear();
  capturedBadgeHandler = null;
});

describe("loadCached", () => {
  it("载入内置数据集并 normalize 到 newCarReleases (115 条)", () => {
    store.loadCached();
    expect(store.newCarReleases.value.length).toBe(115);
    expect(store.newCarLoading.value).toBe(false);
    expect(store.newCarError.value).toBeNull();
    expect(typeof store.newCarLastUpdate.value).toBe("number");
  });
});

describe("setFilters / setSelectedDate", () => {
  it("setFilters 更新筛选信号", () => {
    store.setFilters({ brands: ["比亚迪"] });
    expect(store.newCarFilters.value).toEqual({ brands: ["比亚迪"] });
  });

  it("setSelectedDate 更新并清空选中日期", () => {
    store.setSelectedDate("2026-03-12");
    expect(store.newCarSelectedDate.value).toBe("2026-03-12");
    store.setSelectedDate(null);
    expect(store.newCarSelectedDate.value).toBeNull();
  });
});

describe("navBadge", () => {
  it("bumpNavBadge 累加 (默认 +1)", () => {
    store.bumpNavBadge();
    expect(store.newCarNavBadge.value).toBe(1);
    store.bumpNavBadge(3);
    expect(store.newCarNavBadge.value).toBe(4);
  });

  it("clearNavBadge 归零", () => {
    store.bumpNavBadge(2);
    store.clearNavBadge();
    expect(store.newCarNavBadge.value).toBe(0);
  });

  it("applyEvent({count}) 透传 bumpNavBadge", () => {
    store.applyEvent({ count: 5 });
    expect(store.newCarNavBadge.value).toBe(5);
  });
});

describe("subscribeNewCarUpdates", () => {
  it("幂等注册, 主进程推送驱动角标", () => {
    store.subscribeNewCarUpdates();
    store.subscribeNewCarUpdates(); // 二次调用应被忽略
    expect(onSidenavBadge).toHaveBeenCalledTimes(1);
    expect(typeof capturedBadgeHandler).toBe("function");
    capturedBadgeHandler({ key: "newcar", count: 4 });
    expect(store.newCarNavBadge.value).toBe(4);
  });
});

describe("refresh", () => {
  it("返回 Promise 且重载内置数据", async () => {
    await store.refresh();
    expect(store.newCarReleases.value.length).toBe(115);
  });
});

describe("导出", () => {
  it("useNewCarData 作为函数导出 (hook, 需组件上下文调用)", () => {
    expect(typeof store.useNewCarData).toBe("function");
  });
});

describe("refresh (IPC 化)", () => {
  it("成功路径: 远程优先合并 + success toast (含「已同步」)", async () => {
    const prev = api.newcarRefresh;
    toastStore.clearToasts();
    api.newcarRefresh = async () => ({
      ok: true,
      releases: [{ id: "r-remote-1", brand: "远程", model: "", releaseDate: "2026-12-01" }],
      fetchedAt: Date.now(),
    });
    let res;
    try {
      res = await store.refresh();
    } finally {
      api.newcarRefresh = prev;
    }
    expect(res.ok).toBe(true);
    expect(store.newCarError.value).toBeNull();
    // 115 基线 + 1 远程独有
    expect(store.newCarReleases.value.length).toBe(116);
    expect(store.newCarReleases.value.some((r) => r.id === "r-remote-1")).toBe(true);
    // toast 经 toast-store signal 验证 (showToast 单点入口, 不依赖 spy 命名导出)
    expect(toastStore.toast.value.length).toBe(1);
    expect(toastStore.toast.value[0].message).toContain("已同步");
    expect(toastStore.toast.value[0].type).toBe("success");
  });

  it("失败路径: 保留当前数据 + newCarError=reason + 不抛", async () => {
    const prev = api.newcarRefresh;
    toastStore.clearToasts();
    api.newcarRefresh = async () => ({ ok: false, reason: "network" });
    store.newCarReleases.value = [
      { id: "keep", brand: "K", model: "", releaseDate: "2026-01-01" },
    ];
    let threw = false;
    let res;
    try {
      res = await store.refresh();
    } catch (e) {
      threw = true;
    } finally {
      api.newcarRefresh = prev;
    }
    expect(threw).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("network");
    expect(store.newCarError.value).toBe("network");
    expect(store.newCarReleases.value.length).toBe(1); // 保留原数据
    expect(store.newCarLoading.value).toBe(false);
    expect(toastStore.toast.value.length).toBe(1);
    expect(toastStore.toast.value[0].type).toBe("error");
  });
});
