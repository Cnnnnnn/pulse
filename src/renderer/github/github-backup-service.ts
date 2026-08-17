/**
 * GitHub backup/import module。
 *
 * Interface: exportData、importData、downloadBackup、pickBackupFile。项目列表合并、
 * settings 策略和持久化由 adapter 提供，备份 schema 与浏览器文件流程集中维护。
 */

import type { GithubDensity } from "./github-settings-store.ts";

export interface GithubBackupDeps {
  getProjects(): any[];
  mergeProjects(_incoming: any[]): { imported: number; skipped: number };
  getDensity(): GithubDensity;
  setDensity(_value: GithubDensity): void;
  getToken(): string;
  setToken(_value: string): void;
  persist(): void;
}

export interface GithubBackupResult {
  ok: boolean;
  imported?: number;
  skipped?: number;
  reason?: string;
}

const EXPORT_SCHEMA = "pulse.github.export.v1";

export function createGithubBackupService(deps: GithubBackupDeps) {
  function exportData(): string {
    return JSON.stringify({
      schema: EXPORT_SCHEMA,
      exportedAt: Date.now(),
      projects: deps.getProjects(),
      settings: {
        density: deps.getDensity(),
        token: deps.getToken(),
      },
    });
  }

  function importData(jsonString: string): GithubBackupResult {
    let payload: any;
    try {
      payload = JSON.parse(jsonString);
    } catch {
      return { ok: false, reason: "invalid_format" };
    }
    if (!payload || payload.schema !== EXPORT_SCHEMA || !Array.isArray(payload.projects)) {
      return { ok: false, reason: "invalid_format" };
    }
    const merged = deps.mergeProjects(payload.projects);
    const settings = payload.settings || {};
    if (settings.density === "compact" || settings.density === "comfortable") {
      deps.setDensity(settings.density);
    }
    if (!deps.getToken() && typeof settings.token === "string" && settings.token) {
      deps.setToken(settings.token);
    }
    deps.persist();
    return { ok: true, ...merged };
  }

  function downloadBackup(): void {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `github-backup-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function pickBackupFile(): Promise<GithubBackupResult | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => {
          try {
            resolve(importData(typeof reader.result === "string" ? reader.result : ""));
          } catch {
            resolve({ ok: false, reason: "invalid_format" });
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      input.click();
    });
  }

  return { exportData, importData, downloadBackup, pickBackupFile };
}
