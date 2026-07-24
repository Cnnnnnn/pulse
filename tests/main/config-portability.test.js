/**
 * tests/main/config-portability.test.js
 *
 * P61 Task 1: 序列化 / 解析 / diff 纯函数.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  CONFIG_FIELDS,
  serializeConfig,
  parseConfigFile,
  computeDiff,
} = requireMain("config-portability");

describe("config-portability", () => {
  describe("CONFIG_FIELDS", () => {
    it("含 4 个字段: watchlist/reminders/funds/ai_prompts", () => {
      expect(CONFIG_FIELDS).toEqual([
        "watchlist",
        "reminders",
        "funds",
        "ai_prompts",
      ]);
    });
  });

  describe("serializeConfig", () => {
    it("从 state 提取 4 字段 + schemaVersion + 时间戳", () => {
      const state = {
        watchlist: [{ type: "app", ref: "VSCode" }],
        reminders: [{ id: "r1", text: "升级" }],
        funds: { holdings: [{ code: "000001" }] },
        ai_prompts: { digest: { system: "s" } },
        apps: { other: "ignored" }, // 不导
      };
      const out = serializeConfig(state, "2.46.0");
      expect(out.schemaVersion).toBe(1);
      expect(out.pulseVersion).toBe("2.46.0");
      expect(out.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(out.fields.watchlist).toEqual([{ type: "app", ref: "VSCode" }]);
      expect(out.fields.funds).toEqual({ holdings: [{ code: "000001" }] });
      expect(out.fields.apps).toBeUndefined(); // 不含 apps
    });

    it("缺失字段导出为 null", () => {
      const out = serializeConfig({ watchlist: [] }, "1.0");
      expect(out.fields.reminders).toBeNull();
      expect(out.fields.funds).toBeNull();
      expect(out.fields.ai_prompts).toBeNull();
    });
  });

  describe("parseConfigFile", () => {
    it("合法 JSON + schemaVersion=1 → 返回 fields", () => {
      const content = JSON.stringify({
        schemaVersion: 1,
        exportedAt: "2026-06-25T00:00:00Z",
        fields: { watchlist: [], reminders: null, funds: null, ai_prompts: null },
      });
      const r = parseConfigFile(content);
      expect(r.ok).toBe(true);
      expect(r.fields.watchlist).toEqual([]);
    });

    it("非法 JSON → ok:false reason:bad_json", () => {
      const r = parseConfigFile("not json{");
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("bad_json");
    });

    it("schemaVersion 缺失/不匹配 → ok:false reason:bad_schema", () => {
      const r = parseConfigFile(JSON.stringify({ schemaVersion: 99, fields: {} }));
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("bad_schema");
    });

    it("schemaVersion 缺失 → bad_schema", () => {
      const r = parseConfigFile(JSON.stringify({ fields: {} }));
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("bad_schema");
    });

    it("含未知字段 → ok:false reason:unknown_fields", () => {
      const r = parseConfigFile(JSON.stringify({
        schemaVersion: 1,
        fields: { watchlist: [], evilField: "x" },
      }));
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("unknown_fields");
      expect(r.unknownFields).toContain("evilField");
    });
  });

  describe("computeDiff", () => {
    const cur = {
      watchlist: [{ type: "app", ref: "A" }],
      reminders: [{ id: "r1" }],
      funds: { holdings: [{ code: "1" }] },
      ai_prompts: { d: { system: "old" } },
    };

    it("字段当前 null 传入有 → added", () => {
      const diff = computeDiff({ watchlist: [], reminders: null, funds: null, ai_prompts: null }, cur);
      const r2 = diff.find((d) => d.field === "reminders");
      expect(r2.status).toBe("added");
      expect(r2.summary).toMatch(/新增/);
    });

    it("内容相同 → same", () => {
      const diff = computeDiff(cur, { ...cur });
      expect(diff.every((d) => d.status === "same")).toBe(true);
    });

    it("内容不同 → changed", () => {
      const incoming = { ...cur, watchlist: [{ type: "app", ref: "B" }] };
      const diff = computeDiff(cur, incoming);
      const r = diff.find((d) => d.field === "watchlist");
      expect(r.status).toBe("changed");
      expect(r.summary).toMatch(/不同/);
    });

    it("count 反映数组/对象大小", () => {
      const diff = computeDiff(cur, { ...cur, watchlist: [{ type: "app", ref: "A" }, { type: "app", ref: "B" }] });
      const r = diff.find((d) => d.field === "watchlist");
      expect(r.currentCount).toBe(1);
      expect(r.incomingCount).toBe(2);
    });

    it("incoming 为 null → removed (导入跳过)", () => {
      const diff = computeDiff(cur, { watchlist: null, reminders: null, funds: null, ai_prompts: null });
      const r = diff.find((d) => d.field === "watchlist");
      expect(r.status).toBe("removed");
    });

    it("funds 对象用 Object.keys 长度做 count", () => {
      const diff = computeDiff(cur, { ...cur, funds: { holdings: [1, 2], nav: "x" } });
      const r = diff.find((d) => d.field === "funds");
      expect(r.currentCount).toBe(1);
      expect(r.incomingCount).toBe(2);
    });
  });
});
