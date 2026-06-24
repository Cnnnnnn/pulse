import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// prompt-registry 顶层 require state-store, 必须同步 require 拿同一实例.
// _setStatePathForTest 设 _resolvedStatePath, defaultPath() 会返回它.
const stateStore = require("../../src/main/state-store.js");
const {
  DEFAULT_PROMPTS,
  resolvePrompt,
  PROMPT_KEYS,
} = require("../../src/ai/prompt-registry.js");

let tmpFile;
beforeEach(() => {
  tmpFile = path.join(
    os.tmpdir(),
    `pulse-a7reg-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  // load() 校验 apps 必须非空对象 (空 {} 是 falsy 会返 null), 给个占位 app
  fs.writeFileSync(
    tmpFile,
    JSON.stringify({ v: 1, apps: { __test: { installed_version: "1" } } }),
    "utf-8",
  );
  stateStore._setStatePathForTest(tmpFile);
});
afterEach(() => {
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    /* noop */
  }
});

function writeAiPrompts(prompts) {
  const s = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
  s.ai_prompts = prompts;
  fs.writeFileSync(tmpFile, JSON.stringify(s), "utf-8");
}

describe("prompt-registry (A7)", () => {
  it("PROMPT_KEYS 含 7 个 prompt (A7 v2 + A2 + A1 + v3 daily_digest)", () => {
    expect(PROMPT_KEYS).toEqual(
      expect.arrayContaining([
        "ithome_summary",
        "worldcup_prematch",
        "worldcup_postmatch",
        "upgrade_advice",
        "changelog_summary",
        "category_classify",
        "daily_digest_summary",
      ]),
    );
    expect(PROMPT_KEYS).toHaveLength(7);
  });

  it("DEFAULT_PROMPTS 每个 prompt 有 system + rules", () => {
    for (const key of PROMPT_KEYS) {
      const p = DEFAULT_PROMPTS[key];
      expect(typeof p.system).toBe("string");
      expect(p.system.length).toBeGreaterThan(0);
      expect(typeof p.rules).toBe("string");
      expect(p.rules.length).toBeGreaterThan(0);
    }
  });

  it("resolvePrompt 无用户配置 → 返默认值", () => {
    const p = resolvePrompt("ithome_summary");
    expect(p.system).toBe(DEFAULT_PROMPTS.ithome_summary.system);
    expect(p.rules).toBe(DEFAULT_PROMPTS.ithome_summary.rules);
  });

  it("resolvePrompt 有用户配置 → 返用户值", () => {
    writeAiPrompts({
      ithome_summary: { system: "自定义角色", rules: "自定义规则" },
    });
    const p = resolvePrompt("ithome_summary");
    expect(p.system).toBe("自定义角色");
    expect(p.rules).toBe("自定义规则");
  });

  it("resolvePrompt 用户配置 system 为空 → 回退默认(整体替换语义)", () => {
    writeAiPrompts({
      ithome_summary: { system: "", rules: "只剩 rules" },
    });
    const p = resolvePrompt("ithome_summary");
    expect(p.system).toBe(DEFAULT_PROMPTS.ithome_summary.system);
    expect(p.rules).toBe(DEFAULT_PROMPTS.ithome_summary.rules);
  });

  it("resolvePrompt 未知 key → throw", () => {
    expect(() => resolvePrompt("nonexistent")).toThrow();
  });

  it("DEFAULT_PROMPTS.ithome_summary.system 含「科技新闻编辑」", () => {
    expect(DEFAULT_PROMPTS.ithome_summary.system).toContain("科技新闻编辑");
  });

  it("DEFAULT_PROMPTS.worldcup_prematch.system 含「足球分析师」", () => {
    expect(DEFAULT_PROMPTS.worldcup_prematch.system).toContain("足球分析师");
  });

  it("DEFAULT_PROMPTS.worldcup_postmatch.system 含「足球评论员」", () => {
    expect(DEFAULT_PROMPTS.worldcup_postmatch.system).toContain("足球评论员");
  });

  it("upgrade_advice 默认含 JSON schema 规则", () => {
    expect(DEFAULT_PROMPTS.upgrade_advice.rules).toContain("recommendation");
  });

  it("resolvePrompt fewShot 用户可覆盖", () => {
    writeAiPrompts({
      ithome_summary: { system: "自定义", rules: "规则", fewShot: "示例输出" },
    });
    const p = resolvePrompt("ithome_summary");
    expect(p.fewShot).toBe("示例输出");
  });

  it("A1/A2 默认 fewShot 非空 (v2.46 打磨后填了示例)", () => {
    expect(DEFAULT_PROMPTS.upgrade_advice.fewShot).toBeTruthy();
    expect(DEFAULT_PROMPTS.upgrade_advice.fewShot.length).toBeGreaterThan(20);
    expect(DEFAULT_PROMPTS.upgrade_advice.fewShot).toContain("recommendation");
    expect(DEFAULT_PROMPTS.changelog_summary.fewShot).toBeTruthy();
    expect(DEFAULT_PROMPTS.changelog_summary.fewShot).toContain("oneLiner");
  });

  it("A1/A2 默认 fewShot 出现在 resolvePrompt 返值", () => {
    const a1 = resolvePrompt("changelog_summary");
    expect(a1.fewShot).toBe(DEFAULT_PROMPTS.changelog_summary.fewShot);
    const a2 = resolvePrompt("upgrade_advice");
    expect(a2.fewShot).toBe(DEFAULT_PROMPTS.upgrade_advice.fewShot);
  });
});
