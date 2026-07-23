/**
 * tests/main/changelog-summary.test.js
 *
 * A1 — changelog 智能摘要.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "module";
import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const require = createRequire(import.meta.url);

const chatCompletion = vi.fn();
const sharedLlm = require("../../src/ai/shared-llm.js");
sharedLlm.chatCompletion = chatCompletion;

const stateStore = require("../../src/main/state-store.ts");
const {
  collectChangelogSources,
  parseSummaryResponse,
  buildSummaryMessages,
  summaryCacheKey,
  fetchChangelogSummary,
} = require("../../src/ai/changelog-summary");

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-a1-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

function seedApp(statePath, name) {
  writeFileSync(
    statePath,
    JSON.stringify({
      v: 1,
      apps: {
        [name]: {
          name,
          installed_version: "1.0",
          latest_version: "2.0",
          changelog: "## Fix\n- bug A\n- bug B",
          source: "brew",
        },
      },
    }),
  );
}

describe("summaryCacheKey", () => {
  it("app + version", () => {
    expect(summaryCacheKey("VSCode", "1.2.3")).toBe("VSCode::1.2.3");
  });
});

describe("collectChangelogSources", () => {
  it("当前 + 历史 changelog", () => {
    const blocks = collectChangelogSources({
      name: "App",
      latest_version: "2.0",
      changelog: "## Fix bugs",
      changelog_history: [
        { version: "1.9", changelog: "Old notes" },
      ],
    });
    expect(blocks.length).toBe(2);
    expect(blocks[0].label).toContain("2.0");
  });
});

describe("parseSummaryResponse", () => {
  it("合法 JSON", () => {
    const r = parseSummaryResponse(
      '{"oneLiner":"重要更新","highlights":["安全修复","新功能","性能"]}',
    );
    expect(r.oneLiner).toBe("重要更新");
    expect(r.highlights).toHaveLength(3);
  });

  it("缺字段 → null", () => {
    expect(parseSummaryResponse("{}")).toBeNull();
  });
});

describe("buildSummaryMessages", () => {
  it("含 system + user", () => {
    const msgs = buildSummaryMessages({
      name: "Cursor",
      installed_version: "1.0",
      latest_version: "2.0",
      changelog: "Security fix",
      source: "brew",
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toContain("Cursor");
    expect(msgs[1].content).toContain("Security");
  });

  it("默认 few-shot 示例被注入 user content", () => {
    const msgs = buildSummaryMessages({
      name: "VSCode",
      installed_version: "1.0",
      latest_version: "2.0",
      changelog: "Critical security fix",
    });
    expect(msgs[1].content).toContain("【参考示例】");
    expect(msgs[1].content).toContain("VSCode");
  });
});

describe("fetchChangelogSummary 端到端", () => {
  let statePath;

  beforeEach(() => {
    statePath = tmpStatePath();
    seedApp(statePath, "Cursor");
    stateStore._setStatePathForTest(statePath);
    chatCompletion.mockReset();
  });

  it("LLM ok → 落盘并返回 cached:false + generatedAt", async () => {
    chatCompletion.mockResolvedValue({
      ok: true,
      text: '{"oneLiner":"修复关键崩溃","highlights":["安全","性能"]}',
    });
    const r = await fetchChangelogSummary({ appName: "Cursor", statePath });
    expect(r.ok).toBe(true);
    expect(r.cached).toBe(false);
    expect(r.oneLiner).toBe("修复关键崩溃");
    expect(r.generatedAt).toBeTypeOf("number");
  });

  it("二次调用 → 缓存命中 cached:true 不再调 LLM", async () => {
    chatCompletion.mockResolvedValue({
      ok: true,
      text: '{"oneLiner":"x","highlights":["a"]}',
    });
    await fetchChangelogSummary({ appName: "Cursor", statePath });
    chatCompletion.mockClear();
    const r = await fetchChangelogSummary({ appName: "Cursor", statePath });
    expect(r.cached).toBe(true);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("LLM parse 失败 → 返回 reason:parse_failed 不落盘", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: "not json" });
    const r = await fetchChangelogSummary({ appName: "Cursor", statePath });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });
});
