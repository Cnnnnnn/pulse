/**
 * tests/workers/detector-chain-enrich-fallback-timestamp.test.js
 *
 * #3 附属增强 (2026-07-15): enrich_fallback 时透出"权威源上次成功拿到版本"
 * 的时间戳, 供 UI 显示"更新源异常 · 权威源上次成功 X 前".
 *
 * 场景: WorkBuddy 配 [html_changelog(enrich_only), api_json]. api_json 权威源
 * 本次失败 (网络错误), 但其熔断器快照里带有历史成功时间 lastSuccessAt>0.
 * 期望: 退化到 changelog 版本 + enrich_fallback 降级, 且 result 上带
 * authoritative_last_success_at = 该历史成功时间.
 *
 * 注入方式: 沿用 detector-chain-circuit-breaker.test.js 的 CJS require.cache
 * 范式 (vitest 1.6 vi.mock 不 hook CJS require) — 但仅替换 storage 的
 * loadBreakers/upsertBreaker, 保留**真实**熔断状态机 (circuit-breaker.js) 与
 * 真实 detector, 用 MockHttp 喂响应. 这样既能预置 lastSuccessAt, 又不写实际
 * state.json.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createRequire } from "node:module";
import { MockHttp, makeCtx } from "../helpers/mock-http.js";

const require = createRequire(import.meta.url);

const HTML_CHANGELOG = (ver) =>
  `<h2 id="_${ver}">${ver} 版本发布</h2><p>release notes</p>` +
  `<h2 id="_old">1.0.0 版本发布</h2>`;

const API_JSON_URL =
  "https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-{arch}";

const WB_DETECTORS = [
  {
    type: "html_changelog",
    url: "https://www.codebuddy.cn/docs/workbuddy/Changelog",
    section_pattern: '<h2 id="_',
    section_end: '<h2 id="_',
    version_pattern: ">([0-9.]+) 版本发布",
    enrich_only: true,
  },
  { type: "api_json", url: API_JSON_URL },
];

// breakerKey(detCfg) = `${type}:${url}` — url 用配置原值 (含 {arch} 占位符).
const API_BREAKER_KEY = `api_json:${API_JSON_URL}`;

const storagePath = require.resolve(
  "../../src/detectors/circuit-breaker-storage.js",
);
const chainPath = require.resolve("../../src/workers/detector-chain.js");

// 保存原始 cache 以便测试后还原, 避免污染同进程其他测试文件.
const origStorageEntry = require.cache[storagePath];
const origChainEntry = require.cache[chainPath];

const mockLoadBreakers = vi.fn();
const mockUpsertBreaker = vi.fn();
const realStorage = require("../../src/detectors/circuit-breaker-storage.js");

/**
 * 注入 storage mock 后重新加载 chain (让其 require 到我们的 storage exports),
 * 其余依赖 (circuit-breaker 状态机 / 各 detector) 保持真实.
 */
function reloadChainWithStoredBreakers(stored) {
  mockLoadBreakers.mockResolvedValue(stored);
  mockUpsertBreaker.mockResolvedValue(undefined);
  delete require.cache[chainPath];
  require.cache[storagePath] = {
    id: storagePath,
    filename: storagePath,
    loaded: true,
    exports: {
      ...realStorage, // 真实 snapshot / hydrate / createBreaker 无关项
      loadBreakers: mockLoadBreakers,
      upsertBreaker: mockUpsertBreaker,
    },
  };
  return require(chainPath);
}

beforeEach(() => {
  mockLoadBreakers.mockReset();
  mockUpsertBreaker.mockReset();
});

afterAll(() => {
  // 还原 require.cache, 避免影响后续测试文件.
  if (origStorageEntry) require.cache[storagePath] = origStorageEntry;
  else delete require.cache[storagePath];
  if (origChainEntry) require.cache[chainPath] = origChainEntry;
  else delete require.cache[chainPath];
});

describe("runDetectorChain — enrich_fallback 透出权威源上次成功时间", () => {
  it("api_json 失败但历史成功过 → enrich_fallback 带 authoritative_last_success_at", async () => {
    const LAST_SUCCESS_AT = 1_700_000_000_000; // 某历史成功时刻 (epoch ms)
    // 预置一个 closed 且带历史成功时间的 api_json 熔断器快照.
    const stored = {
      [API_BREAKER_KEY]: {
        key: API_BREAKER_KEY,
        state: "closed",
        consecutiveFailures: 0,
        openUntil: 0,
        lastFailureAt: 0,
        lastSuccessAt: LAST_SUCCESS_AT,
        config: { failureThreshold: 3, cooldownMs: 300000 },
      },
    };
    const { runDetectorChain } = reloadChainWithStoredBreakers(stored);

    const http = new MockHttp({
      get: [
        { status: 200, body: HTML_CHANGELOG("5.2.3") }, // changelog enrich 成功
        { error: "network" }, // api_json 权威源失败
      ],
    });
    const out = await runDetectorChain(
      { name: "WorkBuddy", bundle: "WorkBuddy.app", detectors: WB_DETECTORS },
      makeCtx({ http }),
    );

    // 退化到 changelog 版本 + enrich_fallback 降级
    expect(out.result.version).toBe("5.2.3");
    expect(out.result.note).toBe("enrich_fallback");
    expect(out.result._enrichFallback).toBe(true);
    // 关键: 权威源历史成功时间被透出
    expect(out.result.authoritative_last_success_at).toBe(LAST_SUCCESS_AT);
  });

  it("api_json 从未成功过 (lastSuccessAt=0) → enrich_fallback 不带时间戳", async () => {
    // 无历史成功时间时不应挂 authoritative_last_success_at (0 无意义, UI 不显示).
    const stored = {}; // 无任何持久化 breaker → 新建 closed breaker, lastSuccessAt=0
    const { runDetectorChain } = reloadChainWithStoredBreakers(stored);

    const http = new MockHttp({
      get: [
        { status: 200, body: HTML_CHANGELOG("5.2.3") },
        { error: "network" },
      ],
    });
    const out = await runDetectorChain(
      { name: "WorkBuddy", bundle: "WorkBuddy.app", detectors: WB_DETECTORS },
      makeCtx({ http }),
    );

    expect(out.result.note).toBe("enrich_fallback");
    expect(out.result._enrichFallback).toBe(true);
    expect(out.result.authoritative_last_success_at).toBeUndefined();
  });

  it("api_json 成功 → 非 fallback, 不带 authoritative_last_success_at", async () => {
    // 权威源成功时走正常路径, 不应出现 fallback 时间戳字段.
    const stored = {};
    const { runDetectorChain } = reloadChainWithStoredBreakers(stored);

    const http = new MockHttp({
      get: [
        { status: 200, body: HTML_CHANGELOG("5.2.3") },
        {
          status: 200,
          body: JSON.stringify({ version: "5.2.6.33159827" }),
        },
      ],
    });
    const out = await runDetectorChain(
      { name: "WorkBuddy", bundle: "WorkBuddy.app", detectors: WB_DETECTORS },
      makeCtx({ http }),
    );

    expect(out.result.version).toBe("5.2.6");
    expect(out.result._enrichFallback).toBeFalsy();
    expect(out.result.authoritative_last_success_at).toBeUndefined();
  });
});
