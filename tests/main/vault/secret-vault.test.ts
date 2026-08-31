import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const { requireMain } = require("../../_setup/require-main.cjs");
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

function tmpUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pulse-vault-"));
}

describe("secret-vault", () => {
  let userData: string;
  let clipboard: { text: string; writeCalls: number };

  beforeEach(() => {
    userData = tmpUserData();
    clipboard = { text: "", writeCalls: 0 };
    vault.__setSafeStorageForTest(fakeSafeStorage());
    vault.__setUserDataDirForTest(userData);
    vault.__setClipboardForTest({
      writeText: (t: string) => {
        clipboard.text = t;
        clipboard.writeCalls += 1;
      },
      readText: () => clipboard.text,
    });
    let timerFn: (() => void) | null = null;
    vault.__setTimersForTest((fn: () => void) => {
      timerFn = fn;
      return "timer";
    }, () => {
      timerFn = null;
    });
  });

  afterEach(() => {
    vault.__resetForTest();
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  });

  it("setEntry 新建 + listEntries 返回掩码（不含明文）", () => {
    const res = vault.setEntry({ name: "OpenAI Key", value: "sk-abcdefghijklmnop", category: "AI", note: "n1" });
    expect(res.ok).toBe(true);
    const list = vault.listEntries();
    expect(list.ok).toBe(true);
    expect(list.entries).toHaveLength(1);
    const e = list.entries[0];
    expect(e.name).toBe("OpenAI Key");
    expect(e.category).toBe("AI");
    expect(e.note).toBe("n1");
    expect(e.hint).toBe("sk-…mnop (19)");
    expect(JSON.stringify(list)).not.toContain("sk-abcdefghijklmnop");
    // 明文落盘必须是加密的
    const blob = fs.readFileSync(path.join(userData, "vault", "entries", `${e.id}.bin`));
    expect(blob.toString("utf8")).not.toContain("sk-abcdefghijklmnop");
  });

  it("maskHint：短值只给 ••••，长值显示首3尾4+长度", () => {
    expect(vault.maskHint("abc")).toBe("••••");
    expect(vault.maskHint("12345678")).toBe("••••");
    expect(vault.maskHint("sk-1234567890abcdef")).toBe("sk-…cdef (19)");
  });

  it("同名新建冲突；upsert=true 改为更新", () => {
    expect(vault.setEntry({ name: "gh", value: "tok1" }).ok).toBe(true);
    expect(vault.setEntry({ name: "GH", value: "tok2" }).reason).toBe("name_conflict");
    const up = vault.setEntry({ name: "gh", value: "tok2", upsert: true });
    expect(up.ok).toBe(true);
    expect(vault.getSecretValue("gh")).toBe("tok2");
  });

  it("编辑时 value 传空 = 保持原值", () => {
    const created = vault.setEntry({ name: "k", value: "secret-1", note: "old" });
    const updated = vault.setEntry({ id: created.entry.id, name: "k", value: "", note: "new" });
    expect(updated.ok).toBe(true);
    expect(vault.getSecretValue("k")).toBe("secret-1");
    expect(vault.listEntries().entries[0].note).toBe("new");
  });

  it("revealEntry 显式返回明文；deleteEntry 删除", () => {
    const created = vault.setEntry({ name: "k", value: "secret-xyz" });
    expect(vault.revealEntry(created.entry.id)).toEqual({
      ok: true,
      value: "secret-xyz",
      fields: [],
    });
    expect(vault.deleteEntry(created.entry.id)).toEqual({ ok: true });
    expect(vault.revealEntry(created.entry.id).reason).toBe("not_found");
    expect(vault.listEntries().entries).toHaveLength(0);
  });

  it("safeStorage 不可用时拒绝保存（不落明文）", () => {
    vault.__setSafeStorageForTest(null);
    const res = vault.setEntry({ name: "k", value: "secret" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("no_safe_storage");
    expect(vault.listEntries().ok).toBe(false);
    expect(fs.existsSync(path.join(userData, "vault", "secrets-index.json"))).toBe(false);
  });

  it("copyEntry 写剪贴板 + 定时清空（内容未变才清）", () => {
    const created = vault.setEntry({ name: "k", value: "secret-copy" });
    const timers: Array<() => void> = [];
    vault.__setTimersForTest((fn: () => void) => {
      timers.push(fn);
      return timers.length - 1;
    }, () => {});
    const res = vault.copyEntry(created.entry.id);
    expect(res).toEqual({ ok: true, clearAfterSec: vault.CLIPBOARD_CLEAR_AFTER_SEC });
    expect(clipboard.text).toBe("secret-copy");
    expect(timers).toHaveLength(1);

    // 内容未变 → 清空
    timers[0]();
    expect(clipboard.text).toBe("");

    // 再次复制后用户覆盖剪贴板 → 定时器不覆盖用户的新内容
    vault.copyEntry(created.entry.id);
    expect(timers).toHaveLength(2);
    clipboard.text = "user-new-clipboard";
    timers[1]();
    expect(clipboard.text).toBe("user-new-clipboard");
  });

  it("getSecretValue / hasEntryNamed / deleteEntryByName", () => {
    expect(vault.getSecretValue("nope")).toBeNull();
    vault.setEntry({ name: "tmdb", value: "t-key" });
    expect(vault.hasEntryNamed("TMDB")).toBe(true);
    expect(vault.getSecretValue("TMDB")).toBe("t-key");
    expect(vault.deleteEntryByName("tmdb")).toBe(true);
    expect(vault.hasEntryNamed("tmdb")).toBe(false);
  });

  it("索引损坏时按空索引处理（不 crash）", () => {
    vault.setEntry({ name: "a", value: "v1" });
    const indexFile = path.join(userData, "vault", "secrets-index.json");
    fs.writeFileSync(indexFile, "{corrupted!!!");
    expect(vault.listEntries().entries).toHaveLength(0);
    // 空索引上新建仍可用
    expect(vault.setEntry({ name: "b", value: "v2" }).ok).toBe(true);
  });

  it("expiresAt：'YYYY-MM-DD' 归一为当地 0 点；非法值报 invalid_expiry", () => {
    const created = vault.setEntry({ name: "k", value: "v", expiresAt: "2026-09-15" });
    expect(created.ok).toBe(true);
    const expected = new Date(2026, 8, 15).getTime();
    expect(created.entry.expiresAt).toBe(expected);

    expect(vault.setEntry({ name: "k2", value: "v", expiresAt: "2026-9-15" }).reason).toBe("invalid_expiry");
    expect(vault.setEntry({ name: "k2", value: "v", expiresAt: "abc" }).reason).toBe("invalid_expiry");
  });

  it("expiresAt：编辑时 undefined = 保持原值，null = 清除", () => {
    const created = vault.setEntry({ name: "k", value: "v", expiresAt: "2026-09-15" });
    const id = created.entry.id;
    // 改名编辑不带 expiresAt → 保留
    const updated = vault.setEntry({ id, name: "k", value: "", note: "x" });
    expect(updated.entry.expiresAt).toBe(new Date(2026, 8, 15).getTime());
    // 传 null → 清除
    const cleared = vault.setEntry({ id, name: "k", value: "", expiresAt: null });
    expect(cleared.entry.expiresAt).toBeNull();
  });

  it("附加字段：新建带 fields，list 掩码 / reveal 明文 / 按字段复制", () => {
    const created = vault.setEntry({
      name: "Coding Plan",
      value: "sk-plan-primary",
      fields: [
        { label: "baseUrl", value: "https://api.example.com" },
        { label: "model", value: "glm-5.3" },
      ],
    });
    expect(created.ok).toBe(true);

    // list：字段只给掩码，永无明文
    const meta = vault.listEntries().entries[0];
    expect(meta.fields).toEqual([
      { label: "baseUrl", hint: "htt….com (23)" },
      { label: "model", hint: "••••" },
    ]);
    expect(JSON.stringify(vault.listEntries())).not.toContain("https://api.example.com");
    expect(JSON.stringify(vault.listEntries())).not.toContain("glm-5.3");

    // reveal：字段明文一并返回
    const rev = vault.revealEntry(created.entry.id);
    expect(rev.ok).toBe(true);
    expect(rev.value).toBe("sk-plan-primary");
    expect(rev.fields).toEqual([
      { label: "baseUrl", value: "https://api.example.com" },
      { label: "model", value: "glm-5.3" },
    ]);

    // 按字段复制
    const copied = vault.copyEntry(created.entry.id, "baseUrl");
    expect(copied.ok).toBe(true);
    expect(clipboard.text).toBe("https://api.example.com");
    // 大小写不敏感
    expect(vault.copyEntry(created.entry.id, "MODEL").ok).toBe(true);
    expect(clipboard.text).toBe("glm-5.3");
    // 不存在的字段
    expect(vault.copyEntry(created.entry.id, "nope").reason).toBe("field_not_found");
    // 无 label = 主值
    vault.copyEntry(created.entry.id);
    expect(clipboard.text).toBe("sk-plan-primary");
  });

  it("附加字段：编辑时 value 留空 = 保持原字段值；新字段必须有值", () => {
    const created = vault.setEntry({
      name: "plan",
      value: "pv1",
      fields: [{ label: "baseUrl", value: "https://old.example.com" }],
    });
    const id = created.entry.id;

    // 编辑：只改 model（新字段），baseUrl 留空 = 保持原值
    const updated = vault.setEntry({
      id,
      name: "plan",
      value: "",
      fields: [
        { label: "baseUrl", value: "" },
        { label: "model", value: "glm-5.3" },
      ],
    });
    expect(updated.ok).toBe(true);
    const rev = vault.revealEntry(id);
    expect(rev.fields).toEqual([
      { label: "baseUrl", value: "https://old.example.com" },
      { label: "model", value: "glm-5.3" },
    ]);

    // 新 label 留空值 → invalid_fields
    expect(
      vault.setEntry({ id, name: "plan", value: "", fields: [{ label: "region", value: "" }] }).reason,
    ).toBe("invalid_fields");

    // fields: [] = 清空全部附加字段
    const cleared = vault.setEntry({ id, name: "plan", value: "", fields: [] });
    expect(cleared.ok).toBe(true);
    expect(cleared.entry.fields).toEqual([]);
    expect(vault.revealEntry(id).fields).toEqual([]);

    // 编辑不带 fields = 保持原字段（当前为空 → 仍空）
    expect(vault.setEntry({ id, name: "plan", value: "" }).ok).toBe(true);
    expect(vault.revealEntry(id).fields).toEqual([]);
  });

  it("附加字段：非法输入拒绝（非数组/超量/空 label/重复 label）", () => {
    expect(vault.setEntry({ name: "a", value: "v", fields: "nope" }).reason).toBe("invalid_fields");
    expect(
      vault.setEntry({ name: "a", value: "v", fields: [{ label: "", value: "x" }] }).reason,
    ).toBe("invalid_fields");
    const dup = [
      { label: "same", value: "1" },
      { label: "Same", value: "2" },
    ];
    expect(vault.setEntry({ name: "a", value: "v", fields: dup }).reason).toBe("invalid_fields");
    const many = Array.from({ length: 11 }, (_, i) => ({ label: `f${i}`, value: "v" }));
    expect(vault.setEntry({ name: "a", value: "v", fields: many }).reason).toBe("invalid_fields");
  });

  it("附加字段：向后兼容旧版 blob（无 fields）读取为空数组", () => {
    const created = vault.setEntry({ name: "legacy", value: "old-value" });
    const blobFile = path.join(userData, "vault", "entries", `${created.entry.id}.bin`);
    // 手写一个无 fields 的旧版 blob
    const plain = JSON.stringify({ value: "old-value", note: "" });
    const buf = Buffer.from(`enc1:${Buffer.from(plain, "utf8").toString("base64")}`, "utf8");
    fs.writeFileSync(blobFile, buf);
    const rev = vault.revealEntry(created.entry.id);
    expect(rev.ok).toBe(true);
    expect(rev.fields).toEqual([]);
    expect(vault.listEntries().entries[0].fields).toEqual([]);
  });

  it("listIndexEntries / markExpiryReminded 走索引（不解密）", () => {    vault.setEntry({ name: "k", value: "v", expiresAt: "2026-09-15" });
    const metas = vault.listIndexEntries();
    expect(metas).toHaveLength(1);
    expect(metas[0].name).toBe("k");
    expect(metas[0].expiresAt).toBe(new Date(2026, 8, 15).getTime());
    expect(metas[0].lastExpiryRemindAt).toBeNull();

    const now = Date.now();
    expect(vault.markExpiryReminded(metas[0].id, now)).toBe(true);
    expect(vault.listIndexEntries()[0].lastExpiryRemindAt).toBe(now);
  });
});
