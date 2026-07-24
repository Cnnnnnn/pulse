import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

let tmpFile;
beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `pulse-a7-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
});
afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
});

const { initStateStorePaths, loadAiPrompts, saveAiPrompts, saveOne } = await Promise.resolve(requireMain("state-store"));

beforeEach(() => {
  initStateStorePaths({ statePath: tmpFile });
});

describe("state-store ai_prompts (A7)", () => {
  it("loadAiPrompts 无字段 → {}", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, apps: {} }));
    expect(loadAiPrompts(tmpFile)).toEqual({});
  });

  it("saveAiPrompts 写入 + loadAiPrompts 读回", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, apps: { A: { installed: "1" } } }));
    saveAiPrompts({ ithome_summary: { system: "x", rules: "y" } }, tmpFile);
    expect(loadAiPrompts(tmpFile)).toEqual({ ithome_summary: { system: "x", rules: "y" } });
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.apps.A.installed).toBe("1");
  });

  it("forward compat: saveOne 保留 ai_prompts (PRESERVE_FIELDS)", () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ v: 1, apps: {}, ai_prompts: { ithome_summary: { system: "保留", rules: "r" } } }),
    );
    saveOne({ name: "Z", installed_version: "2.0", has_update: false }, tmpFile);
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.ai_prompts.ithome_summary.system).toBe("保留");
  });

  it("saveAiPrompts 无效参数 → throw", () => {
    expect(() => saveAiPrompts(null, tmpFile)).toThrow();
    expect(() => saveAiPrompts([], tmpFile)).toThrow();
  });
});
