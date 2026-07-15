/**
 * tests/workers/detector-chain-multi-source.test.js
 *
 * 多源共同探寻, 取最新版本 (2026-07-15 修 WorkBuddy 误判预发布).
 *
 * 背景: WorkBuddy 配 [html_changelog(enrich_only), api_json]. changelog 页
 * 经常滞后 (停在 5.2.3), 而 api_json 才是权威最新源 (5.2.6). 旧逻辑在
 * api_json 失败时回退到 changelog 的 5.2.3, 导致"已装 5.2.6 > 最新 5.2.3 →
 * 误判预发布". 新逻辑: 收集所有源版本取最新; 仅在"所有权威源都失败、唯一
 * 版本来自 enrich_only"时降级标记 enrich_fallback.
 */
import { describe, it, expect } from "vitest";
import { runDetectorChain } from "../../src/workers/detector-chain.js";
import { MockHttp, makeCtx } from "../helpers/mock-http.js";

const HTML_CHANGELOG = (ver) =>
  `<h2 id="_${ver}">${ver} 版本发布</h2><p>release notes</p>` +
  `<h2 id="_old">1.0.0 版本发布</h2>`;

const WB_DETECTORS = [
  {
    type: "html_changelog",
    url: "https://www.codebuddy.cn/docs/workbuddy/Changelog",
    section_pattern: '<h2 id="_',
    section_end: '<h2 id="_',
    version_pattern: ">([0-9.]+) 版本发布",
    enrich_only: true,
  },
  {
    type: "api_json",
    url: "https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-{arch}",
  },
];

describe("runDetectorChain — 多源取最新 (WorkBuddy)", () => {
  it("api_json(5.2.6) 成功 → 取 5.2.6, 不被 changelog(5.2.3) 拖低", async () => {
    const http = new MockHttp({
      get: [
        { status: 200, body: HTML_CHANGELOG("5.2.3") },
        {
          status: 200,
          body: JSON.stringify({
            version: "5.2.6.33159827",
            productVersion: "5.2.6.33159827",
          }),
        },
      ],
    });
    const out = await runDetectorChain(
      { name: "WorkBuddy", bundle: "WorkBuddy.app", detectors: WB_DETECTORS },
      makeCtx({ http }),
    );
    expect(out.result.version).toBe("5.2.6");
    expect(out.result.source).toBe("api_json");
    expect(out.result.confidence).toBe("high");
    expect(out.result._enrichFallback).toBeFalsy();
    // changelog 仍来自 enrich_only 的 html_changelog
    expect(out.result.changelog).toContain("release notes");
  });

  it("api_json 失败 → enrich_fallback 标记, 版本仍显示但降级", async () => {
    const http = new MockHttp({
      get: [
        { status: 200, body: HTML_CHANGELOG("5.2.3") },
        { error: "network" }, // api_json 失败
      ],
    });
    const out = await runDetectorChain(
      { name: "WorkBuddy", bundle: "WorkBuddy.app", detectors: WB_DETECTORS },
      makeCtx({ http }),
    );
    expect(out.result.version).toBe("5.2.3");
    expect(out.result.source).toBe("html_changelog");
    expect(out.result.confidence).toBe("low");
    expect(out.result.note).toBe("enrich_fallback");
    expect(out.result._enrichFallback).toBe(true);
  });

  it("changelog(5.2.9) 比 api_json(5.2.6) 高 → 取最新 5.2.9, 但因有权威源不标 fallback", async () => {
    const http = new MockHttp({
      get: [
        { status: 200, body: HTML_CHANGELOG("5.2.9") },
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
    expect(out.result.version).toBe("5.2.9");
    expect(out.result._enrichFallback).toBeFalsy();
  });

  it("多权威冗余: api_json 失败, 第二权威源(github_release)顶上且非 fallback", async () => {
    // 验证"多源取最新"在 api_json 宕机时能从第二权威源拿到正确版本,
    // 而不是退化到 changelog 的滞后版本. (WorkBuddy 当前无可用第二源,
    // 此测试证明该能力一旦配置即生效.)
    const detectors = [
      {
        type: "api_json",
        url: "https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-{arch}",
      },
      {
        type: "github_release",
        url: "https://api.github.com/repos/workbuddy/workbuddy/releases/latest",
      },
      {
        type: "html_changelog",
        url: "https://www.codebuddy.cn/docs/workbuddy/Changelog",
        section_pattern: '<h2 id="_',
        section_end: '<h2 id="_',
        version_pattern: ">([0-9.]+) 版本发布",
        enrich_only: true,
      },
    ];
    const http = new MockHttp({
      get: [
        { error: "network" }, // api_json 失败
        { status: 200, body: JSON.stringify({ tag_name: "v5.2.6" }) }, // github_release 成功
        { status: 200, body: HTML_CHANGELOG("5.2.3") }, // changelog (enrich, 滞后)
      ],
    });
    const out = await runDetectorChain(
      { name: "WorkBuddy", bundle: "WorkBuddy.app", detectors },
      makeCtx({ http }),
    );
    expect(out.result.version).toBe("5.2.6");
    expect(out.result.source).toBe("github_release");
    expect(out.result._enrichFallback).toBeFalsy(); // 来自权威源, 非滞后 changelog
  });
});

/**
 * changelog 版本归属 (修复 "5.2.6 显示 5.2.3 更新日志" 的错位).
 * 关键不变量: 无论展示版本来自权威源还是 enrich_only, result.changelog_source_version
 * 必须等于该 changelog 内容实际对应的版本, 而非展示版本. UI 据此标注, 避免误读.
 */
describe("runDetectorChain — changelog 版本归属", () => {
  it("api_json(5.2.6) + changelog 页滞后(5.2.3) → changelog_source_version=5.2.3 (滞后标注)", async () => {
    const http = new MockHttp({
      get: [
        { status: 200, body: HTML_CHANGELOG("5.2.3") },
        { status: 200, body: JSON.stringify({ version: "5.2.6.33159827" }) },
      ],
    });
    const out = await runDetectorChain(
      { name: "WorkBuddy", bundle: "WorkBuddy.app", detectors: WB_DETECTORS },
      makeCtx({ http }),
    );
    expect(out.result.version).toBe("5.2.6"); // 展示版本 = 权威源
    expect(out.result.changelog).toContain("release notes"); // changelog 仍附上
    // 关键: changelog 内容实际属于 5.2.3, 必须如实上报, 不能被展示版本 5.2.6 覆盖
    expect(out.result.changelog_source_version).toBe("5.2.3");
  });

  it("api_json 自带 changelog → changelog_source_version 取权威版本(5.2.6), 不取 enrich", async () => {
    const http = new MockHttp({
      get: [
        { status: 200, body: HTML_CHANGELOG("5.2.3") },
        {
          status: 200,
          body: JSON.stringify({
            version: "5.2.6.33159827",
            body: "api release notes for 5.2.6",
          }),
        },
      ],
    });
    const out = await runDetectorChain(
      { name: "WorkBuddy", bundle: "WorkBuddy.app", detectors: WB_DETECTORS },
      makeCtx({ http }),
    );
    expect(out.result.version).toBe("5.2.6");
    expect(out.result.changelog).toContain("api release notes for 5.2.6");
    expect(out.result.changelog_source_version).toBe("5.2.6");
  });

  it("enrich_fallback: 唯一版本来自 enrich_only(5.2.3) → source_version=5.2.3 (与展示版本一致)", async () => {
    const http = new MockHttp({
      get: [
        { status: 200, body: HTML_CHANGELOG("5.2.3") },
        { error: "network" }, // api_json 失败
      ],
    });
    const out = await runDetectorChain(
      { name: "WorkBuddy", bundle: "WorkBuddy.app", detectors: WB_DETECTORS },
      makeCtx({ http }),
    );
    expect(out.result.version).toBe("5.2.3");
    expect(out.result.changelog_source_version).toBe("5.2.3");
  });
});
