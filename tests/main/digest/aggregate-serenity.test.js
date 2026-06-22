/**
 * tests/main/digest/aggregate-serenity.test.js
 *
 * Task 16: aggregate serenity section (Top 3 + 译文优先).
 */

import { describe, it, expect } from "vitest";
import { aggregate, SECTION_ORDER } from "../../../src/main/digest/aggregate.js";

describe("aggregate serenity section", () => {
  it("twitterCache 有 tweets 时输出 serenity section (Top 3)", () => {
    const state = {
      apps: {},
      twitterCache: {
        handle: "aleabitoreddit",
        tweets: [
          { id: "1", text: "tweet one", author: { handle: "h", displayName: "Serenity" }, publishedAt: "2026-06-22T10:00:00Z" },
          { id: "2", text: "tweet two", author: { handle: "h", displayName: "Serenity" }, publishedAt: "2026-06-22T09:00:00Z" },
          { id: "3", text: "tweet three", author: { handle: "h", displayName: "Serenity" }, publishedAt: "2026-06-22T08:00:00Z" },
          { id: "4", text: "tweet four (should be cut)", author: { handle: "h", displayName: "Serenity" }, publishedAt: "2026-06-22T07:00:00Z" },
        ],
        translations: { "1": "推文一", "2": "推文二" },
      },
    };
    const r = aggregate(state, { now: new Date("2026-06-22T11:00:00Z") });
    const sec = r.sections.find((s) => s.kind === "serenity");
    expect(sec).toBeTruthy();
    expect(sec.items).toHaveLength(3);
    // 译文优先
    expect(sec.items[0].text).toBe("推文一");
    expect(sec.items[0].isTranslated).toBe(true);
    // 无译文的用原文 (截断到 60)
    expect(sec.items[2].isTranslated).toBe(false);
    expect(sec.items[2].text).toContain("tweet three");
  });

  it("无 twitterCache 时不输出 serenity section", () => {
    const r = aggregate({ apps: {} }, { now: new Date() });
    expect(r.sections.find((s) => s.kind === "serenity")).toBeFalsy();
  });

  it("twitterCache.tweets 空数组时不输出", () => {
    const r = aggregate({ apps: {}, twitterCache: { tweets: [] } }, { now: new Date() });
    expect(r.sections.find((s) => s.kind === "serenity")).toBeFalsy();
  });

  it("serenity 在 SECTION_ORDER 末尾", () => {
    expect(SECTION_ORDER[SECTION_ORDER.length - 1]).toBe("serenity");
  });

  it("serenity 有数据时 lines 含 'Serenity:' 行", () => {
    const state = {
      apps: {},
      twitterCache: {
        tweets: [{ id: "1", text: "market update", author: { handle: "h" } }],
        translations: {},
      },
    };
    const r = aggregate(state, { now: new Date() });
    const serenityLine = r.lines.find((l) => l.includes("Serenity"));
    expect(serenityLine).toBeTruthy();
    expect(serenityLine).toContain("@h");
  });

  it("其他 section 仍正常 (serenity 不破坏现有)", () => {
    const state = {
      apps: { A: { name: "A", has_update: true, latest_version: "2" } },
      twitterCache: { tweets: [{ id: "1", text: "x", author: { handle: "h" } }] },
    };
    const r = aggregate(state, { now: new Date() });
    const kinds = r.sections.map((s) => s.kind);
    expect(kinds).toContain("updates");
    expect(kinds).toContain("serenity");
  });
});
