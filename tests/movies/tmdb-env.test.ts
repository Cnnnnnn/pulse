import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const { requireMain } = require("../_setup/require-main.cjs");
const { loadTmdbApiKey, saveTmdbApiKey, getTmdbApiKeySource, resetTmdbApiKeyCache } =
  requireMain("movies/tmdb-env");
const vault = requireMain("vault/secret-vault");

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) =>
      Buffer.from(`enc1:${Buffer.from(plain, "utf8").toString("base64")}`, "utf8"),
    decryptString: (buf: Buffer) => {
      const s = Buffer.from(buf).toString("utf8");
      if (!s.startsWith("enc1:")) throw new Error("decrypt failed");
      return Buffer.from(s.slice(5), "base64").toString("utf8");
    },
  };
}

function writePrefs(obj: any): string {
  const file = path.join(os.tmpdir(), `pulse-tmdb-prefs-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

describe("loadTmdbApiKey (v2.83 密钥库版)", () => {
  const prev = process.env.TMDB_API_KEY;

  afterEach(() => {
    resetTmdbApiKeyCache();
    vault.__resetForTest();
    if (prev === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = prev;
  });

  it("vault 可用时 saveTmdbApiKey 写密钥库，load 读回 source=vault", () => {
    vault.__setSafeStorageForTest(fakeSafeStorage());
    vault.__setUserDataDirForTest(fs.mkdtempSync(path.join(os.tmpdir(), "pulse-tmdb-vault-")));
    process.env.TMDB_API_KEY = "envkey";
    saveTmdbApiKey("setkey");
    resetTmdbApiKeyCache();
    expect(loadTmdbApiKey(path.join(os.tmpdir(), `pulse-tmdb-missing-${Date.now()}.json`))).toBe("setkey");
    expect(getTmdbApiKeySource()).toBe("vault");
  });

  it("旧 prefs 明文 key 首次加载自动迁移进 vault 并删除明文字段", () => {
    vault.__setSafeStorageForTest(fakeSafeStorage());
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-tmdb-vault-"));
    vault.__setUserDataDirForTest(userData);
    const prefs = writePrefs({ other: 1, tmdbApiKey: "legacy-key" });
    process.env.TMDB_API_KEY = "envkey";
    expect(loadTmdbApiKey(prefs)).toBe("legacy-key");
    expect(getTmdbApiKeySource()).toBe("vault");
    // 明文字段已被清除
    const raw = JSON.parse(fs.readFileSync(prefs, "utf8"));
    expect(raw.tmdbApiKey).toBeUndefined();
    expect(raw.other).toBe(1);
    // vault 里已有条目
    expect(vault.getSecretValue("tmdb")).toBe("legacy-key");
  });

  it("密钥库已有 tmdb 条目时，prefs 冗余明文直接清除不覆盖", () => {
    vault.__setSafeStorageForTest(fakeSafeStorage());
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-tmdb-vault-"));
    vault.__setUserDataDirForTest(userData);
    vault.setEntry({ name: "tmdb", value: "vault-key", upsert: true });
    const prefs = writePrefs({ tmdbApiKey: "stale-prefs-key" });
    process.env.TMDB_API_KEY = "envkey";
    expect(loadTmdbApiKey(prefs)).toBe("vault-key");
    expect(JSON.parse(fs.readFileSync(prefs, "utf8")).tmdbApiKey).toBeUndefined();
  });

  it("vault 不可用时拒绝保存，回退读旧 prefs 明文（兼容）", () => {
    const prefs = writePrefs({ tmdbApiKey: "legacy-only" });
    process.env.TMDB_API_KEY = "envkey";
    expect(saveTmdbApiKey("newkey", prefs)).toBe("");
    expect(loadTmdbApiKey(prefs)).toBe("legacy-only");
    expect(getTmdbApiKeySource()).toBe("settings");
  });

  it("vault 不可用且无 prefs 时用进程环境变量", () => {
    process.env.TMDB_API_KEY = "  envkey123  ";
    const missing = path.join(os.tmpdir(), `pulse-tmdb-missing-${Date.now()}.json`);
    expect(loadTmdbApiKey(missing)).toBe("envkey123");
    expect(getTmdbApiKeySource()).toBe("env");
  });

  it("saveTmdbApiKey('') 清除 vault 条目", () => {
    vault.__setSafeStorageForTest(fakeSafeStorage());
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-tmdb-vault-"));
    vault.__setUserDataDirForTest(userData);
    saveTmdbApiKey("tok");
    expect(vault.hasEntryNamed("tmdb")).toBe(true);
    saveTmdbApiKey("");
    expect(vault.hasEntryNamed("tmdb")).toBe(false);
  });
});
