import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const { requireMain } = require("../../_setup/require-main.cjs");
const { pickDueEntries, formatExpiryNotice, checkVaultExpiry, REMIND_DEDUPE_MS } =
  requireMain("vault/expiry-watch");
const vault = requireMain("vault/secret-vault");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 29, 12, 0, 0).getTime(); // 2026-09-29 12:00 当地

function meta(over: any = {}) {
  return {
    id: "e1",
    name: "k",
    expiresAt: null,
    lastExpiryRemindAt: null,
    ...over,
  };
}

describe("pickDueEntries (pure)", () => {
  it("无过期时间 / 超出窗口的条目不提醒", () => {
    const entries = [
      meta({ id: "a", expiresAt: null }),
      meta({ id: "b", expiresAt: NOW + 30 * DAY }), // 窗口外
    ];
    expect(pickDueEntries(entries, NOW)).toEqual([]);
  });

  it("窗口内未过期 + 已过期都提醒，days 取整天数", () => {
    const entries = [
      meta({ id: "soon", name: "即将", expiresAt: NOW + 3 * DAY }),
      meta({ id: "past", name: "已过", expiresAt: NOW - 5 * DAY }),
      meta({ id: "hours", name: "几小时后", expiresAt: NOW + 6 * 60 * 60 * 1000 }),
    ];
    const due = pickDueEntries(entries, NOW);
    expect(due).toHaveLength(3);
    // 排序: 已过期在前且天数多的最急
    expect(due[0]).toMatchObject({ id: "past", expired: true, days: 5 });
    expect(due[1]).toMatchObject({ id: "soon", expired: false, days: 3 });
    expect(due[2]).toMatchObject({ id: "hours", expired: false, days: 0 });
  });

  it("24h 内已提醒过的不再提醒", () => {
    const entries = [
      meta({ id: "a", expiresAt: NOW - DAY, lastExpiryRemindAt: NOW - 2 * 60 * 60 * 1000 }),
      meta({ id: "b", expiresAt: NOW - DAY, lastExpiryRemindAt: NOW - 25 * 60 * 60 * 1000 }),
    ];
    const due = pickDueEntries(entries, NOW);
    expect(due.map((d) => d.id)).toEqual(["b"]);
  });

  it("自定义去重间隔生效", () => {
    const entries = [meta({ expiresAt: NOW - DAY, lastExpiryRemindAt: NOW - 90 * 60 * 1000 })];
    expect(pickDueEntries(entries, NOW, undefined, 60 * 60 * 1000)).toHaveLength(1);
    expect(pickDueEntries(entries, NOW, undefined, 3 * 60 * 60 * 1000)).toHaveLength(0);
  });
});

describe("formatExpiryNotice", () => {
  it("过期 / 未过期文案", () => {
    expect(formatExpiryNotice({ id: "x", name: "gh token", expired: true, days: 3 })).toContain("已过期 3 天");
    expect(formatExpiryNotice({ id: "x", name: "gh token", expired: false, days: 0 })).toContain("不到 1 天");
    expect(formatExpiryNotice({ id: "x", name: "gh token", expired: false, days: 7 })).toContain("7 天后过期");
  });
});

describe("checkVaultExpiry (IO)", () => {
  let userData: string;

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-vault-expiry-"));
    vault.__setSafeStorageForTest({
      isEncryptionAvailable: () => true,
      encryptString: (p: string) => Buffer.from(`enc1:${Buffer.from(p).toString("base64")}`),
      decryptString: (b: Buffer) =>
        Buffer.from(Buffer.from(b).toString("utf8").slice(5), "base64").toString(),
    });
    vault.__setUserDataDirForTest(userData);
  });

  afterEach(() => {
    vault.__resetForTest();
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  });

  it("发送通知 + 写 lastExpiryRemindAt；下一轮 (24h 内) 不重复", () => {
    vault.setEntry({ name: "gh", value: "v1", expiresAt: "2026-09-25" });
    vault.setEntry({ name: "ok", value: "v2", expiresAt: "2027-09-25" }); // 窗口外

    const sent: any[] = [];
    const due = checkVaultExpiry((n) => sent.push(n), NOW);
    expect(due).toHaveLength(1);
    expect(due[0].name).toBe("gh");
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe("密钥过期提醒");
    expect(sent[0].body).toContain("gh");

    // 立即再查 → 去重为空
    expect(checkVaultExpiry((n) => sent.push(n), NOW + 1000)).toHaveLength(0);
    expect(sent).toHaveLength(1);
    // 24h 后再查 → 重复提醒
    expect(checkVaultExpiry((n) => sent.push(n), NOW + REMIND_DEDUPE_MS + 1000)).toHaveLength(1);
    expect(sent).toHaveLength(2);
  });

  it("send 注入抛错不阻塞标记", () => {
    vault.setEntry({ name: "gh", value: "v1", expiresAt: "2026-09-25" });
    const due = checkVaultExpiry(() => {
      throw new Error("notify down");
    }, NOW);
    expect(due).toHaveLength(1);
    expect(vault.listIndexEntries()[0].lastExpiryRemindAt).toBe(NOW);
  });
});
