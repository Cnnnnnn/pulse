/**
 * GitHub project repository。
 *
 * Interface: load/save project collection. localStorage、内存 fallback、JSON 损坏
 * 回退和 quota 提示都藏在 implementation 里，项目 store 只处理业务状态变更。
 */

export interface GithubProjectRepository {
  load(): any[];
  save(_projects: any[]): boolean;
  resetQuotaWarning(): void;
}

export function createGithubProjectRepository(
  onQuotaExceeded: () => void = () => {},
): GithubProjectRepository {
  const storageKey = "pulse.github.projects.v1";
  const memoryFallback = new Map<string, string>();
  let lastQuotaWarnTs = 0;

  function read(): string | null {
    try {
      if (typeof globalThis.localStorage === "undefined") return null;
      return globalThis.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }

  function write(raw: string): boolean {
    if (typeof globalThis.localStorage === "undefined") {
      memoryFallback.set(storageKey, raw);
      return true;
    }
    try {
      globalThis.localStorage.setItem(storageKey, raw);
      return true;
    } catch {
      memoryFallback.set(storageKey, raw);
      return false;
    }
  }

  function warnQuotaOnce(): void {
    const now = Date.now();
    if (now - lastQuotaWarnTs < 60_000) return;
    lastQuotaWarnTs = now;
    onQuotaExceeded();
  }

  return {
    load() {
      const raw = read() ?? memoryFallback.get(storageKey) ?? null;
      if (!raw) return [];
      try {
        const projects = JSON.parse(raw);
        return Array.isArray(projects) ? projects : [];
      } catch {
        return [];
      }
    },
    save(projects) {
      const ok = write(JSON.stringify(projects));
      if (!ok) warnQuotaOnce();
      return ok;
    },
    resetQuotaWarning() {
      lastQuotaWarnTs = 0;
    },
  };
}
