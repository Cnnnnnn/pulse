/**
 * tests/ai-leaderboard/aa-key.test.ts
 *
 * AA key 解析链（vault > env > .env）单元测试（无网络、无真实 vault）。
 * vi.mock 接管 secret-vault；.env 用临时文件注入，不碰 process.cwd() 真实 .env。
 */

// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const vaultEntries = new Map<string, string>();
const vaultSetCalls: any[] = [];
let vaultSetOk = true;

vi.mock("../../src/main/vault/secret-vault", () => ({
  getSecretValue: vi.fn((name: string) => vaultEntries.get(name) ?? null),
  hasEntryNamed: vi.fn((name: string) => vaultEntries.has(name)),
  setEntry: vi.fn((input: any) => {
    vaultSetCalls.push(input);
    if (!vaultSetOk) return { ok: false, reason: "no_safe_storage" };
    vaultEntries.set(input.name, input.value);
    return { ok: true };
  }),
  deleteEntryByName: vi.fn((name: string) => {
    vaultEntries.delete(name);
    return { ok: true };
  }),
}));

import { loadAaApiKey, AA_VAULT_NAME } from "../../src/main/ai-leaderboard/aa-key.ts";

let tmpDir = "";

beforeEach(() => {
  vaultEntries.clear();
  vaultSetCalls.length = 0;
  vaultSetOk = true;
  delete process.env.ARTIFICIAL_ANALYSIS_API_KEY;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-key-test-"));
});

afterEach(() => {
  delete process.env.ARTIFICIAL_ANALYSIS_API_KEY;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeEnvFile(content: string): string {
  const p = path.join(tmpDir, ".env");
  fs.writeFileSync(p, content);
  return p;
}

describe("loadAaApiKey", () => {
  it("vault 命中优先，且不读 env/.env", () => {
    vaultEntries.set(AA_VAULT_NAME, " vault-key ");
    const key = loadAaApiKey({ envFile: path.join(tmpDir, "nope.env") });
    expect(key).toBe("vault-key");
    expect(vaultSetCalls).toHaveLength(0);
  });

  it("env 命中 → 返回并 best-effort 种入 vault", () => {
    process.env.ARTIFICIAL_ANALYSIS_API_KEY = "env-key";
    const key = loadAaApiKey({ envFile: path.join(tmpDir, "nope.env") });
    expect(key).toBe("env-key");
    expect(vaultSetCalls).toHaveLength(1);
    expect(vaultSetCalls[0].name).toBe(AA_VAULT_NAME);
    expect(vaultSetCalls[0].value).toBe("env-key");
  });

  it(".env 命中 → 引号剥离 + 种 vault", () => {
    const envFile = writeEnvFile('# comment\nARTIFICIAL_ANALYSIS_API_KEY="quoted-key"\n');
    const key = loadAaApiKey({ envFile });
    expect(key).toBe("quoted-key");
    expect(vaultEntries.get(AA_VAULT_NAME)).toBe("quoted-key");
  });

  it("vault 写入失败（no_safe_storage）不影响取值，也不落明文", () => {
    vaultSetOk = false;
    const envFile = writeEnvFile("ARTIFICIAL_ANALYSIS_API_KEY=plain-key\n");
    const key = loadAaApiKey({ envFile });
    expect(key).toBe("plain-key");
    expect(vaultEntries.has(AA_VAULT_NAME)).toBe(false);
  });

  it("全部未命中 → 空串（调用方发无 key 请求）", () => {
    const key = loadAaApiKey({ envFile: path.join(tmpDir, "nope.env") });
    expect(key).toBe("");
  });

  it("vault 空白值视为未命中，回落 env", () => {
    vaultEntries.set(AA_VAULT_NAME, "   ");
    process.env.ARTIFICIAL_ANALYSIS_API_KEY = "fallback-key";
    const key = loadAaApiKey({ envFile: path.join(tmpDir, "nope.env") });
    expect(key).toBe("fallback-key");
  });
});
