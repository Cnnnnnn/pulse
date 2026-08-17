/**
 * GitHub Settings module。
 *
 * Interface: settings signals + load/set actions. 项目库、Release 检查和页面不需要
 * 了解 localStorage key、损坏数据回退或 scheduler 事件细节。
 */

import { signal } from "@preact/signals";

export type GithubDensity = "comfortable" | "compact";

type GithubSettingsPayload = {
  density: GithubDensity;
  token: string;
  autoCheck: boolean;
  autoCheckIntervalMin: number;
  notifyOnNew: boolean;
};

const SETTINGS_KEY = "pulse.github.settings.v1";
const memoryFallback = new Map<string, string>();

export const githubDensity = signal<GithubDensity>("comfortable");
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
    token: githubToken.value,
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
    const value = JSON.parse(raw) as Partial<GithubSettingsPayload>;
    if (value.density === "compact" || value.density === "comfortable") {
      githubDensity.value = value.density;
    }
    if (typeof value.token === "string") githubToken.value = value.token;
    if (typeof value.autoCheck === "boolean") githubAutoCheck.value = value.autoCheck;
    if (typeof value.autoCheckIntervalMin === "number" && value.autoCheckIntervalMin > 0) {
      githubAutoCheckIntervalMin.value = value.autoCheckIntervalMin;
    }
    if (typeof value.notifyOnNew === "boolean") githubNotifyOnNew.value = value.notifyOnNew;
  } catch {
    /* 损坏数据忽略，保留默认值 */
  }
}

export function setGithubDensity(value: GithubDensity): void {
  if (value !== "compact" && value !== "comfortable") return;
  githubDensity.value = value;
  persistSettings();
}

export function setGithubToken(value: unknown): void {
  githubToken.value = typeof value === "string" ? value.trim() : "";
  persistSettings();
  emitSettingsChanged();
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
