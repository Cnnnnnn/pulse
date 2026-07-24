/**
 * tests/main/upgrade-advice.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const chatCompletion = vi.fn();
const sharedLlm = require("../../src/ai/shared-llm.js");
sharedLlm.chatCompletion = chatCompletion;

const stateStore = requireMain("state-store");
const {
  adviceCacheKey,
  parseAdviceResponse,
  buildAdviceMessages,
  usageTierLabel,
  fetchUpgradeAdvice,
} = require("../../src/ai/upgrade-advice.js");

let tmpFile;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `pulse-a2-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(
    tmpFile,
    JSON.stringify({
      v: 1,
      apps: {
        Cursor: {
          name: "Cursor",
          installed_version: "1.0",
          latest_version: "2.0",
          has_update: true,
          changelog: "Fix crash on startup",
          source: "brew_formulae",
        },
      },
    }),
    "utf-8",
  );
  stateStore._setStatePathForTest(tmpFile);
  chatCompletion.mockReset();
});

afterEach(() => {
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    /* noop */
  }
});

describe("upgrade-advice", () => {
  it("adviceCacheKey", () => {
    expect(adviceCacheKey("Cursor", "2.0")).toBe("Cursor::2.0");
  });

  it("usageTierLabel tiers", () => {
    const now = Date.now();
    expect(usageTierLabel(now - 2 * 86400_000, now)).toContain("hot");
    expect(usageTierLabel(now - 15 * 86400_000, now)).toContain("warm");
    expect(usageTierLabel(now - 40 * 86400_000, now)).toContain("cold");
    expect(usageTierLabel(null, now)).toContain("unknown");
  });

  it("parseAdviceResponse valid JSON", () => {
    const r = parseAdviceResponse(
      '{"recommendation":"upgrade","confidence":"high","summary":"建议升级","reasons":["修复崩溃"]}',
    );
    expect(r).toEqual({
      recommendation: "upgrade",
      confidence: "high",
      summary: "建议升级",
      reasons: ["修复崩溃"],
    });
  });

  it("parseAdviceResponse invalid → null", () => {
    expect(parseAdviceResponse("not json")).toBeNull();
    expect(
      parseAdviceResponse('{"recommendation":"maybe","summary":"x"}'),
    ).toBeNull();
  });

  it("buildAdviceMessages includes app + changelog", () => {
    const msgs = buildAdviceMessages(
      {
        name: "Cursor",
        installed_version: "1",
        latest_version: "2",
        changelog: "bugfix",
      },
      { ms: Date.now() - 86400_000 },
    );
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toContain("Cursor");
    expect(msgs[1].content).toContain("bugfix");
  });

  it("buildAdviceMessages 默认 few-shot 示例被注入 user content", () => {
    const msgs = buildAdviceMessages(
      {
        name: "Cursor",
        installed_version: "1",
        latest_version: "2",
        changelog: "x",
      },
      { ms: Date.now() - 86400_000 },
    );
    expect(msgs[1].content).toContain("【参考示例】");
    expect(msgs[1].content).toContain("iTerm2");
    expect(msgs[1].content).toContain("Cursor");
  });
});

describe("fetchUpgradeAdvice 端到端", () => {
  it("LLM ok → 落盘并返回 cached:false + generatedAt", async () => {
    chatCompletion.mockResolvedValue({
      ok: true,
      text: '{"recommendation":"upgrade","confidence":"high","summary":"建议升级","reasons":["修复崩溃"]}',
    });
    const r = await fetchUpgradeAdvice({ appName: "Cursor", statePath: tmpFile });
    expect(r.ok).toBe(true);
    expect(r.cached).toBe(false);
    expect(r.recommendation).toBe("upgrade");
    expect(r.generatedAt).toBeTypeOf("number");
  });

  it("二次调用 → 缓存命中 cached:true 不再调 LLM", async () => {
    chatCompletion.mockResolvedValue({
      ok: true,
      text: '{"recommendation":"wait","summary":"可等","reasons":["非关键"]}',
    });
    await fetchUpgradeAdvice({ appName: "Cursor", statePath: tmpFile });
    chatCompletion.mockClear();
    const r = await fetchUpgradeAdvice({ appName: "Cursor", statePath: tmpFile });
    expect(r.cached).toBe(true);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("LLM parse 失败 → reason:parse_failed", async () => {
    chatCompletion.mockResolvedValue({ ok: true, text: "not json" });
    const r = await fetchUpgradeAdvice({ appName: "Cursor", statePath: tmpFile });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("无 has_update → reason:no_update 不调 LLM", async () => {
    const noUpdate = path.join(os.tmpdir(), `pulse-a2-noupdate-${Date.now()}.json`);
    fs.writeFileSync(
      noUpdate,
      JSON.stringify({
        v: 1,
        apps: { Foo: { name: "Foo", installed_version: "1.0", latest_version: "1.0", has_update: false } },
      }),
    );
    stateStore._setStatePathForTest(noUpdate);
    const r = await fetchUpgradeAdvice({ appName: "Foo", statePath: noUpdate });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_update");
    expect(chatCompletion).not.toHaveBeenCalled();
    fs.unlinkSync(noUpdate);
  });
});
