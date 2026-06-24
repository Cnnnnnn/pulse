/**
 * tests/main/changelog-summary.test.js
 *
 * A1 — changelog 智能摘要.
 */

import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  collectChangelogSources,
  parseSummaryResponse,
  buildSummaryMessages,
  summaryCacheKey,
} = require("../../src/ai/changelog-summary");

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
});
