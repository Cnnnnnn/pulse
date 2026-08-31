/**
 * GitHub Settings module。
 *
 * Interface: settings signals + load/set actions. 项目库、Release 检查和页面不需要
 * 了解 localStorage key、损坏数据回退或 scheduler 事件细节。
 *
 * v2.83：token 不再存 localStorage（明文），迁入密钥库（主进程 safeStorage 加密）。
 * 旧 localStorage 里的 token 由 migrateLegacyGithubToken() 一次性搬进密钥库后清除。
 */

import { signal } from "@preact/signals";
import { api } from "../api.ts";

export type GithubDensity = "comfortable" | "compact";

type GithubSettingsPayload = {
  density: GithubDensity;
  autoCheck: boolean;
  autoCheckIntervalMin: number;
  notifyOnNew: boolean;
};

const SETTINGS_KEY = "pulse.github.settings.v1";
const memoryFallback = new Map<string, string>();
/** 旧 localStorage 读出、待迁移的 token（迁移成功前不清除原数据） */
let legacyTokenCache: string | null = null;

export const githubDensity = signal<GithubDensity>("comfortable");
/** v2.83 起恒为空串：token 在主进程密钥库里，renderer 不再持有明文（保留导出兼容旧调用点） */
export const githubToken = signal("");
export const githubAutoCheck = signal(true);
export const githubAutoCheckIntervalMin = signal(360);
export const githubNotifyOnNew = signal(true);

function readStorage(): string | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(SETTINGS_KEY);
  } catch {
    return null;
  }
}

function writeStorage(raw: string): boolean {
  if (typeof globalThis.localStorage === "undefined") {
    memoryFallback.set(SETTINGS_KEY, raw);
    return true;
  }
  try {
    globalThis.localStorage.setItem(SETTINGS_KEY, raw);
    return true;
  } catch {
    memoryFallback.set(SETTINGS_KEY, raw);
    return false;
  }
}

function emitSettingsChanged(): void {
  try {
    if (typeof globalThis.dispatchEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("github-settings-changed"));
    }
  } catch {
    /* 非浏览器环境忽略 */
  }
}

function currentSettings(): GithubSettingsPayload {
  return {
    density: githubDensity.value,
    autoCheck: githubAutoCheck.value,
    autoCheckIntervalMin: githubAutoCheckIntervalMin.value,
    notifyOnNew: githubNotifyOnNew.value,
  };
}

function persistSettings(): boolean {
  return writeStorage(JSON.stringify(currentSettings()));
}

export function loadGithubSettings(): void {
  const raw = readStorage() ?? memoryFallback.get(SETTINGS_KEY) ?? null;
  if (!raw) return;
  try {
    const value = JSON.parse(raw) as Partial<GithubSettingsPayload & { token?: string }>;
    if (value.density === "compact" || value.density === "comfortable") {
      githubDensity.value = value.density;
    }
    if (typeof value.token === "string" && value.token) {
      // 旧版明文 token：只进迁移缓存，不再回填信号 / 不再持久化
      legacyTokenCache = value.token;
    }
    if (typeof value.autoCheck === "boolean") githubAutoCheck.value = value.autoCheck;
    if (typeof value.autoCheckIntervalMin === "number" && value.autoCheckIntervalMin > 0) {
      githubAutoCheckIntervalMin.value = value.autoCheckIntervalMin;
    }
    if (typeof value.notifyOnNew === "boolean") githubNotifyOnNew.value = value.notifyOnNew;
  } catch {
    /* 损坏数据忽略，保留默认值 */
  }
}

/**
 * 一次性迁移：旧 localStorage 明文 token → 密钥库 "github" 条目，成功后清除明文。
 * 密钥库已有 github 条目（用户手动建过）→ 只清除本地明文，不覆盖密钥库。
 * 迁移失败（如加密不可用）保留 localStorage，下次启动重试。
 */
export async function migrateLegacyGithubToken(): Promise<void> {
  const token = legacyTokenCache;
  if (!token) return;
  try {
    const list = await api.vaultList();
    const exists =
      list &&
      list.ok &&
      (list.entries || []).some((e) => e.name.toLowerCase() === "github");
    if (!exists) {
      const res = await api.vaultSet({
        name: "github",
        value: token,
        category: "内置功能",
        note: "GitHub 访问令牌（自动迁移）",
      });
      if (!res || !res.ok) return; // 保留明文，下次启动重试
    }
    legacyTokenCache = null;
    const stored = readStorage() ?? memoryFallback.get(SETTINGS_KEY) ?? null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && "token" in parsed) {
          delete parsed.token;
          writeStorage(JSON.stringify(parsed));
        }
      } catch {
        /* 损坏数据忽略 */
      }
    }
  } catch {
    /* IPC 不可用（测试环境等）：保留明文，下次重试 */
  }
}

export function setGithubDensity(value: GithubDensity): void {
  if (value !== "compact" && value !== "comfortable") return;
  githubDensity.value = value;
  persistSettings();
}

export function setGithubAutoCheck(value: unknown): void {
  githubAutoCheck.value = !!value;
  persistSettings();
  emitSettingsChanged();
}

export function setGithubAutoCheckInterval(value: unknown): void {
  const minutes = Math.max(10, Math.floor(Number(value) || 360));
  githubAutoCheckIntervalMin.value = minutes;
  persistSettings();
  emitSettingsChanged();
}

export function setGithubNotifyOnNew(value: unknown): void {
  githubNotifyOnNew.value = !!value;
  persistSettings();
}
