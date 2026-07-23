/**
 * tests/main/bootstrap-category.test.js
 *
 * v2.16: LLM classify fire-and-forget 拆分后, 测试 bootstrap/category.ts 的两个
 * 拆分后入口的契约:
 *   - primeLLMCacheFromDisk: 同步注入历史 LLM cache, 不抛, 不阻塞
 *   - classifyUnmappedAppsByLLM: 异步跑 LLM, 失败不抛, 成功写入 cache
 *
 * 启动期顺序约定 (main/index.js):
 *   1) loadCategoryConfig()                — 同步注入静态 map
 *   2) primeLLMCacheFromDisk({stateStore})  — 同步注入历史 LLM cache
 *   3) classifyUnmappedAppsByLLM(cfg, ...)  — fire-and-forget 后台跑新分类
 *
 * 测试目标: 验证 (2) 和 (3) 拆开后语义不变, 都能单独工作.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const categoryConfig = require("../../src/config/category.js");
const {
  primeLLMCacheFromDisk,
  classifyUnmappedAppsByLLM,
} = require("../../src/main/bootstrap/category.ts");

const GOOD_CATS = [
  { id: "ai", name: "AI 工具", icon: "🤖", order: 1 },
  { id: "dev", name: "开发者", icon: "🛠", order: 2 },
  { id: "browser", name: "浏览器", icon: "🌐", order: 3 },
  { id: "other", name: "其他", icon: "📦", order: 99 },
];
const GOOD_MAP = {
  cursor: "dev",
  kimi: "ai",
  chrome: "browser",
};

function makeStateStore({ cache = {}, saveThrows = false } = {}) {
  return {
    loadLLMClassifyCache: vi.fn(function load() {
      return cache;
    }),
    saveLLMClassifyCache: saveThrows
      ? vi.fn(() => {
          throw new Error("disk full");
        })
      : vi.fn(() => {}),
  };
}

beforeEach(() => {
  // 重置 category module state
  categoryConfig.setData({
    cats: GOOD_CATS,
    map: GOOD_MAP,
    source: "test",
  });
  // setLLMCache 是累加的, 不接 reset — 用 _clearLLMCache 真清空
  categoryConfig._clearLLMCache();
});

afterEach(() => {
  categoryConfig._clearLLMCache();
});

describe("primeLLMCacheFromDisk (v2.16 sync prime)", () => {
  it("从 stateStore 读 cache + 注入到 module-level Map", () => {
    const stateStore = makeStateStore({
      cache: { kimi: "ai", cursor: "dev" },
    });
    primeLLMCacheFromDisk({ stateStore });
    expect(stateStore.loadLLMClassifyCache).toHaveBeenCalledTimes(1);
    expect(categoryConfig.getCategory("kimi")).toBe("ai");
    expect(categoryConfig.getCategory("cursor")).toBe("dev");
  });

  it("空 cache: 不抛, getCategory 走静态 map / other 兜底", () => {
    const stateStore = makeStateStore({ cache: {} });
    expect(() => primeLLMCacheFromDisk({ stateStore })).not.toThrow();
    expect(categoryConfig.getCategory("cursor")).toBe("dev"); // 静态 map
    expect(categoryConfig.getCategory("Unknown.app")).toBe("other");
  });

  it("stateStore.loadLLMClassifyCache 抛错时: 不抛, 仅 noop", () => {
    const stateStore = {
      loadLLMClassifyCache: vi.fn(() => {
        throw new Error("corrupt state.json");
      }),
      saveLLMClassifyCache: vi.fn(),
    };
    expect(() => primeLLMCacheFromDisk({ stateStore })).not.toThrow();
    // 注入失败, getCategory 仍能走静态 map
    expect(categoryConfig.getCategory("cursor")).toBe("dev");
  });

  it("case-insensitive: cache 里小写, 查时也小写", () => {
    const stateStore = makeStateStore({ cache: { kimi: "ai" } });
    primeLLMCacheFromDisk({ stateStore });
    expect(categoryConfig.getCategory("Kimi")).toBe("ai");
    expect(categoryConfig.getCategory("KIMI")).toBe("ai");
  });

  it("幂等: 多次调, 后写入的覆盖前写入的 (跟 setLLMCache 行为一致)", () => {
    // 用一个不在静态 map 里的 app — 才能纯走 LLM cache 路径
    const stateStore1 = makeStateStore({ cache: { foo: "ai" } });
    expect(stateStore1.loadLLMClassifyCache).toBeDefined();
    primeLLMCacheFromDisk({ stateStore: stateStore1 });
    expect(stateStore1.loadLLMClassifyCache).toHaveBeenCalled();
    const llmCache1 = categoryConfig.getLLMCache();
    expect(JSON.stringify(llmCache1)).toBe('{"foo":"ai"}');

    const stateStore2 = makeStateStore({ cache: { foo: "browser" } });
    primeLLMCacheFromDisk({ stateStore: stateStore2 });
    const llmCache2 = categoryConfig.getLLMCache();
    expect(JSON.stringify(llmCache2)).toBe('{"foo":"browser"}');
  });
});

describe("classifyUnmappedAppsByLLM (async, fire-and-forget)", () => {
  function makeAppConfig(apps) {
    return { apps };
  }

  it("全部 app 已分类 (静态 map 命中) → 跳过 LLM, 不调 caller", async () => {
    const stateStore = makeStateStore();
    const cfg = makeAppConfig([
      { name: "Cursor", bundle: "Cursor.app" },
      { name: "Kimi", bundle: "Kimi.app" },
    ]);
    // mock classifyByLLM 确认不被调
    const spy = vi.spyOn(categoryConfig, "classifyByLLM");
    await classifyUnmappedAppsByLLM(cfg, { stateStore });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("未分类 app → 调 LLM, 成功后写入 cache + save disk", async () => {
    const stateStore = makeStateStore();
    const cfg = makeAppConfig([
      { name: "Cursor", bundle: "Cursor.app" }, // 已分类 (dev)
      { name: "UnknownApp", bundle: "Unknown.app" }, // 未分类
    ]);
    // 注入 mock llmCaller 避免真打 ollama (127.0.0.1:11434 没服务会等到 25s 超时)
    const llmCaller = vi.fn(async () => '{"unknownapp": "dev"}');
    await classifyUnmappedAppsByLLM(cfg, { stateStore, llmCaller });
    // mock 被调 (说明走到了 LLM 分支, 不是空 cached 短路)
    expect(llmCaller).toHaveBeenCalledTimes(1);
    // mock JSON 解析后写入 cache → getCategory 返 'dev'
    expect(categoryConfig.getCategory("UnknownApp")).toBe("dev");
    // 写入磁盘
    expect(stateStore.saveLLMClassifyCache).toHaveBeenCalledTimes(1);
    expect(stateStore.saveLLMClassifyCache).toHaveBeenCalledWith(
      expect.objectContaining({ unknownapp: "dev" }),
    );
  });

  it("空 config / 无 apps → noop, 不抛", async () => {
    const stateStore = makeStateStore();
    expect(() => classifyUnmappedAppsByLLM(null, { stateStore })).not.toThrow();
    expect(() =>
      classifyUnmappedAppsByLLM({ apps: [] }, { stateStore }),
    ).not.toThrow();
  });

  it("llmCaller 抛错 → 不向外抛 (内部 try/catch 兜住)", async () => {
    const stateStore = makeStateStore();
    const cfg = makeAppConfig([{ name: "X1" }]);
    const llmCaller = vi.fn(async () => {
      throw new Error("simulated ollama 502");
    });
    // 调用方能安全 await, 不抛; mock 失败时 classifyByLLM 内部 try/catch
    // 兜住, 返 {}, 落到 "0 results" warn log 分支.
    await expect(
      classifyUnmappedAppsByLLM(cfg, { stateStore, llmCaller }),
    ).resolves.toBeUndefined();
    expect(llmCaller).toHaveBeenCalledTimes(1);
    // LLM 失败: cache 没写, save 也没调
    expect(stateStore.saveLLMClassifyCache).not.toHaveBeenCalled();
    expect(categoryConfig.getCategory("X1")).toBe("other");
  });
});

describe("primeLLMCacheFromDisk + classifyUnmappedAppsByLLM 协同 (启动路径)", () => {
  it("prime 先调 (注入历史), classify 跑空 (旧 cache 全部命中)", async () => {
    const stateStore = makeStateStore({
      cache: { cursor: "dev", kimi: "ai" },
    });
    // 1. prime
    primeLLMCacheFromDisk({ stateStore });
    expect(categoryConfig.getCategory("Cursor")).toBe("dev");
    expect(categoryConfig.getCategory("Kimi")).toBe("ai");
    // 2. classify (此时 unmapped = [], 跳过 LLM)
    const cfg = { apps: [{ name: "Cursor" }, { name: "Kimi" }] };
    await classifyUnmappedAppsByLLM(cfg, { stateStore });
    // 全部仍命中
    expect(categoryConfig.getCategory("Cursor")).toBe("dev");
    expect(categoryConfig.getCategory("Kimi")).toBe("ai");
  });
});
