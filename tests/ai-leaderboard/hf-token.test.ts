/**
 * tests/ai-leaderboard/hf-token.test.ts
 *
 * HF token 解析链（vault > env > .env）单元测试（无网络、无真实 vault）。
 * 与 aa-key.test.ts 同构；额外覆盖 HF_TOKEN / HUGGINGFACE_TOKEN 双环境变量名。
 */

// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const vaultEntries = new Map<string, string>();
const vaultSetCalls: any[] = [];

vi.mock("../../src/main/vault/secret-vault", () => ({
  getSecretValue: vi.fn((name: string) => vaultEntries.get(name) ?? null),
  hasEntryNamed: vi.fn((name: string) => vaultEntries.has(name)),
  setEntry: vi.fn((input: any) => {
    vaultSetCalls.push(input);
    vaultEntries.set(input.name, input.value);
    return { ok: true };
  }),
  deleteEntryByName: vi.fn((name: string) => {
    vaultEntries.delete(name);
    return { ok: true };
  }),
}));

import { loadHfToken, HF_VAULT_NAME } from "../../src/main/ai-leaderboard/hf-token.ts";

let tmpDir = "";

beforeEach(() => {
  vaultEntries.clear();
  vaultSetCalls.length = 0;
  delete process.env.HF_TOKEN;
  delete process.env.HUGGINGFACE_TOKEN;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-token-test-"));
});

afterEach(() => {
  delete process.env.HF_TOKEN;
  delete process.env.HUGGINGFACE_TOKEN;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadHfToken", () => {
  it("vault 命中优先", () => {
    vaultEntries.set(HF_VAULT_NAME, "vault-token");
    expect(loadHfToken({ envFile: path.join(tmpDir, "nope.env") })).toBe("vault-token");
    expect(vaultSetCalls).toHaveLength(0);
  });

  it("HF_TOKEN 环境变量命中并种入 vault", () => {
    process.env.HF_TOKEN = "hf-short";
    expect(loadHfToken({ envFile: path.join(tmpDir, "nope.env") })).toBe("hf-short");
    expect(vaultEntries.get(HF_VAULT_NAME)).toBe("hf-short");
  });

  it("HUGGINGFACE_TOKEN 作为别名可用（HF_TOKEN 优先）", () => {
    process.env.HUGGINGFACE_TOKEN = "hf-long";
    expect(loadHfToken({ envFile: path.join(tmpDir, "nope.env") })).toBe("hf-long");
    // 首次调用已把 token 种入 vault（vault 优先于 env）— 清掉后再验证 env 内部优先级
    vaultEntries.clear();
    process.env.HF_TOKEN = "hf-short";
    expect(loadHfToken({ envFile: path.join(tmpDir, "nope.env") })).toBe("hf-short");
  });

  it(".env 命中（含引号剥离）", () => {
    const p = path.join(tmpDir, ".env");
    fs.writeFileSync(p, 'HUGGINGFACE_TOKEN="dot-token"\n');
    expect(loadHfToken({ envFile: p })).toBe("dot-token");
  });

  it("全部未命中 → 空串（匿名请求）", () => {
    expect(loadHfToken({ envFile: path.join(tmpDir, "nope.env") })).toBe("");
  });
});
