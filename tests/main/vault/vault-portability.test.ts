import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const { requireMain } = require("../../_setup/require-main.cjs");
const portability = requireMain("vault/vault-portability");
const vault = requireMain("vault/secret-vault");

/** fake dialog: showSaveDialogSync / showOpenDialogSync (Electron 43 同步方法存在) */
function makeFakeDialog(saveTarget: string | undefined, openTargets: string[] | undefined) {
  return {
    showSaveDialogSync: () => saveTarget,
    showOpenDialogSync: () => openTargets,
  };
}

describe("vault-portability", () => {
  let userData: string;
  let dir: string;

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-vault-port-ud-"));
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-vault-port-fs-"));
    vault.__setSafeStorageForTest({
      isEncryptionAvailable: () => true,
      encryptString: (p: string) => Buffer.from(`enc1:${Buffer.from(p).toString("base64")}`),
      decryptString: (b: Buffer) =>
        Buffer.from(Buffer.from(b).toString("utf8").slice(5), "base64").toString(),
    });
    vault.__setUserDataDirForTest(userData);
    portability.resetImportCacheForTest();
  });

  afterEach(() => {
    vault.__resetForTest();
    try {
      fs.rmSync(userData, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  });

  it("导出 → 导入 roundtrip：apply 后条目值一致", () => {
    vault.setEntry({ name: "gh", value: "tok-1", category: "内置功能", note: "n1" });
    vault.setEntry({ name: "ai", value: "sk-2", category: "AI", expiresAt: "2026-10-01" });

    const file = path.join(dir, "export.json");
    const exp = portability.exportVaultToFile(makeFakeDialog(file, undefined));
    expect(exp.ok).toBe(true);
    expect(exp.count).toBe(2);
    // 文件权限 0600；Windows 不提供可比的 POSIX mode 位。
    if (process.platform !== "win32") {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }

    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(parsed.schema).toBe("pulse.vault.export.v1");
    expect(parsed.entries).toHaveLength(2);

    // 清空本地（模拟换机）
    vault.deleteEntry(vault.listIndexEntries()[0].id);
    vault.deleteEntry(vault.listIndexEntries()[0].id);
    expect(vault.listIndexEntries()).toHaveLength(0);

    const preview = portability.loadVaultImportFile(makeFakeDialog(undefined, [file]));
    expect(preview.ok).toBe(true);
    expect(preview.total).toBe(2);
    // 预览只有掩码，不含明文
    expect(JSON.stringify(preview)).not.toContain("tok-1");
    expect(JSON.stringify(preview)).not.toContain("sk-2");

    const applied = portability.applyVaultImport(preview.importId);
    expect(applied).toMatchObject({ ok: true, imported: 2, updated: 0, failed: 0 });
    expect(vault.getSecretValue("gh")).toBe("tok-1");
    expect(vault.getSecretValue("ai")).toBe("sk-2");
    const aiMeta = vault.listIndexEntries().find((e: any) => e.name === "ai");
    expect(aiMeta.expiresAt).toBe(new Date(2026, 9, 1).getTime());
  });

  it("导出 → 导入 roundtrip：附加字段随条目导出导入（v2.84）", () => {
    vault.setEntry({
      name: "plan",
      value: "pv1",
      fields: [
        { label: "baseUrl", value: "https://api.example.com" },
        { label: "model", value: "glm-5.3" },
      ],
    });

    const file = path.join(dir, "export-fields.json");
    const exp = portability.exportVaultToFile(makeFakeDialog(file, undefined));
    expect(exp.ok).toBe(true);

    // 导出文件含字段明文（导出本来就是明文备份）
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(parsed.entries[0].fields).toEqual([
      { label: "baseUrl", value: "https://api.example.com" },
      { label: "model", value: "glm-5.3" },
    ]);

    // 预览只含字段掩码
    const preview = portability.loadVaultImportFile(makeFakeDialog(undefined, [file]));
    expect(preview.ok).toBe(true);
    expect(preview.entries[0].fields).toEqual([
      { label: "baseUrl", hint: "htt….com (23)" },
      { label: "model", hint: "••••" },
    ]);
    expect(JSON.stringify(preview)).not.toContain("https://api.example.com");

    // 换机导入：字段原样恢复
    vault.deleteEntry(vault.listIndexEntries()[0].id);
    const applied = portability.applyVaultImport(preview.importId);
    expect(applied).toMatchObject({ ok: true, imported: 1, failed: 0 });
    const rev = vault.revealEntry(vault.listIndexEntries()[0].id);
    expect(rev.fields).toEqual([
      { label: "baseUrl", value: "https://api.example.com" },
      { label: "model", value: "glm-5.3" },
    ]);
  });

  it("旧版导出文件（无 fields）导入兼容", () => {
    const file = path.join(dir, "legacy.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        schema: "pulse.vault.export.v1",
        exportedAt: Date.now(),
        entries: [{ name: "legacy", category: "", value: "lv1", note: "", expiresAt: null }],
      }),
    );
    const preview = portability.loadVaultImportFile(makeFakeDialog(undefined, [file]));
    expect(preview.ok).toBe(true);
    expect(preview.entries[0].fields).toEqual([]);
    const applied = portability.applyVaultImport(preview.importId);
    expect(applied).toMatchObject({ ok: true, imported: 1, failed: 0 });
    const rev = vault.revealEntry(vault.listIndexEntries()[0].id);
    expect(rev.value).toBe("lv1");
    expect(rev.fields).toEqual([]);
  });

  it("导入预览标记同名冲突；apply 走覆盖并计数", () => {
    vault.setEntry({ name: "gh", value: "local-val", upsert: true });

    const file = path.join(dir, "import.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        schema: "pulse.vault.export.v1",
        exportedAt: 1,
        entries: [
          { name: "gh", category: "", value: "imported-val", note: "" },
          { name: "new-one", category: "AI", value: "v2", note: "" },
          { name: "", value: "no-name" },
          { value: "no-name-2" },
        ],
      }),
    );
    const preview = portability.loadVaultImportFile(makeFakeDialog(undefined, [file]));
    expect(preview.ok).toBe(true);
    expect(preview.total).toBe(2); // 无 name/value 的 2 条被剔除
    expect(preview.invalidCount).toBe(0); // invalidCount 统计超 pre截断的, 这里剔除发生在 parse 内
    const ghRow = preview.entries!.find((e: any) => e.name === "gh");
    expect(ghRow.conflict).toBe(true);

    const applied = portability.applyVaultImport(preview.importId);
    expect(applied).toMatchObject({ ok: true, imported: 1, updated: 1, failed: 0 });
    expect(vault.getSecretValue("gh")).toBe("imported-val");
  });

  it("未 load 直接 apply / 错 importId → no_import_session", () => {
    expect(portability.applyVaultImport("whatever")).toMatchObject({ ok: false });
  });

  it("schema 不符 / 坏 JSON → invalid_schema / invalid_json", () => {
    const bad1 = path.join(dir, "bad1.json");
    fs.writeFileSync(bad1, JSON.stringify({ schema: "other", entries: [] }));
    expect(portability.loadVaultImportFile(makeFakeDialog(undefined, [bad1])).reason).toBe("invalid_schema");

    const bad2 = path.join(dir, "bad2.json");
    fs.writeFileSync(bad2, "not json");
    expect(portability.loadVaultImportFile(makeFakeDialog(undefined, [bad2])).reason).toBe("invalid_json");
  });

  it("用户取消 save / open → cancelled", () => {
    expect(portability.exportVaultToFile(makeFakeDialog(undefined, undefined))).toMatchObject({
      ok: false,
      reason: "cancelled",
    });
    expect(portability.loadVaultImportFile(makeFakeDialog(undefined, undefined))).toMatchObject({
      ok: false,
      reason: "cancelled",
    });
  });
});
