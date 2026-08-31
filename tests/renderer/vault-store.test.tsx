// @vitest-environment happy-dom
/**
 * tests/renderer/vault-store.test.tsx
 *
 * 密钥库 renderer store：过滤纯函数 + refreshVault 对 api 的消费 + 错误文案映射。
 * store 全程不持有明文 value（reveal 短暂 signal 由组件层管理）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  vaultEntries,
  vaultEncryptionAvailable,
  filterVaultEntries,
  vaultReasonText,
  formatExpiryBadge,
  refreshVault,
} from "../../src/renderer/vault/store.ts";
import { api } from "../../src/renderer/api.ts";

const entry = (over: Partial<any> = {}) => ({
  id: "e1",
  name: "OpenAI Key",
  category: "AI",
  hint: "sk-…cdef (19)",
  note: "生产环境",
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

beforeEach(() => {
  vaultEntries.value = [];
  vaultEncryptionAvailable.value = true;
});

describe("filterVaultEntries", () => {
  const entries = [
    entry({ id: "1", name: "OpenAI Key", category: "AI", note: "生产" }),
    entry({ id: "2", name: "github", category: "内置功能", note: "" }),
    entry({ id: "3", name: "Cloudflare", category: "云服务", note: "dns api" }),
  ];

  it("空搜索返回全部", () => {
    expect(filterVaultEntries(entries, "")).toHaveLength(3);
    expect(filterVaultEntries(entries, "  ")).toHaveLength(3);
  });

  it("按 name / category / note 过滤，大小写不敏感", () => {
    expect(filterVaultEntries(entries, "openai").map((e) => e.id)).toEqual(["1"]);
    expect(filterVaultEntries(entries, "内置").map((e) => e.id)).toEqual(["2"]);
    expect(filterVaultEntries(entries, "DNS").map((e) => e.id)).toEqual(["3"]);
    expect(filterVaultEntries(entries, "不存在的词")).toHaveLength(0);
  });
});

describe("refreshVault", () => {
  it("ok 响应填充 entries + encryptionAvailable", async () => {
    api.vaultList = async () => ({
      ok: true,
      entries: [entry()],
      encryptionAvailable: true,
    });
    await refreshVault();
    expect(vaultEntries.value).toHaveLength(1);
    expect(vaultEntries.value[0].name).toBe("OpenAI Key");
    expect(vaultEncryptionAvailable.value).toBe(true);
  });

  it("no_safe_storage 时 entries 清空 + encryptionAvailable=false", async () => {
    api.vaultList = async () => ({ ok: false, reason: "no_safe_storage", entries: [] });
    await refreshVault();
    expect(vaultEntries.value).toHaveLength(0);
    expect(vaultEncryptionAvailable.value).toBe(false);
  });

  it("IPC 异常时标记 loaded，不 crash（加密状态保持原值）", async () => {
    api.vaultList = async () => {
      throw new Error("ipc down");
    };
    await expect(refreshVault()).resolves.toBeUndefined();
    expect(vaultEntries.value).toHaveLength(0);
  });
});

describe("vaultReasonText", () => {
  it("已知 reason 映射为友好文案", () => {
    expect(vaultReasonText("no_safe_storage")).toContain("加密");
    expect(vaultReasonText("name_conflict")).toContain("同名");
  });

  it("未知 reason 兜底", () => {
    expect(vaultReasonText("weird_reason")).toContain("weird_reason");
    expect(vaultReasonText(null)).toBe("操作失败");
  });
});

describe("formatExpiryBadge", () => {
  const NOW = new Date(2026, 8, 29, 12, 0, 0).getTime();
  const DAY = 24 * 60 * 60 * 1000;

  it("未设置 → null", () => {
    expect(formatExpiryBadge(null, NOW)).toBeNull();
    expect(formatExpiryBadge(undefined, NOW)).toBeNull();
  });

  it("已过期 → danger；窗口内 → warn；更远 → muted 日期", () => {
    expect(formatExpiryBadge(NOW - 3 * DAY, NOW)).toEqual({
      text: "已过期 3 天",
      tone: "danger",
    });
    expect(formatExpiryBadge(NOW + 3 * DAY, NOW)).toEqual({
      text: "3 天后过期",
      tone: "warn",
    });
    expect(formatExpiryBadge(NOW + 6 * 60 * 60 * 1000, NOW).text).toBe("今天过期");
    const far = formatExpiryBadge(NOW + 30 * DAY, NOW);
    expect(far!.tone).toBe("muted");
    expect(far!.text).toBe("2026-10-29");
  });
});
