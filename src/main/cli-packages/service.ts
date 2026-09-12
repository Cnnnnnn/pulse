/**
 * src/main/cli-packages/service.ts
 *
 * v3.2: CLI 包(npm -g / pip / brew formulae)版本监控 — 编排层.
 *
 * 流程: sweepEcosystem ×3 (并行) → 合并 installed+outdated → 与 ignored 集合
 * 过滤 → 落盘 state.cli_packages. 不升级、不安装 — 只做"看" (升级仍然回到
 * 用户自己的终端, 与 app 的 bulk-upgrade 不同).
 *
 * deps 全部可注入 (sweep / loadState / saveState / now) 便于单测.
 */

import { sweepEcosystem, type CliEcosystem, type EcoSweepResult } from "./enumerate";
import { compareCliVersions } from "./version-cmp";

export const CLI_ECOSYSTEMS: CliEcosystem[] = ["npm", "pip", "brew"];
export type { CliEcosystem, EcoSweepResult };

export type CliPackageItem = {
  ecosystem: CliEcosystem;
  name: string;
  installed: string;
  latest: string;
  has_update: boolean;
  note: string; // '' | 'installed_newer'
};

export type CliPackagesState = {
  items: CliPackageItem[];
  ignored: Array<{ ecosystem: CliEcosystem; name: string }>;
  errors: Array<{ ecosystem: CliEcosystem; reason: string }>;
  checkedAt: number;
};

export type CliPackagesDeps = {
  sweep?: (eco: CliEcosystem) => Promise<EcoSweepResult>;
  loadState?: () => any;
  saveState?: (data: CliPackagesState) => any;
  now?: () => Date;
};

function defaultLoadState(): any {
  const { load } = require("../state-store");
  return load() || {};
}

function defaultSaveState(data: CliPackagesState): any {
  const { saveCliPackages } = require("../state-store");
  return saveCliPackages(data);
}

/** 组装一个生态的 items; sweep 失败 → null (记生态级错误) */
function buildEcoItems(eco: CliEcosystem, sweep: EcoSweepResult): CliPackageItem[] | null {
  if (!sweep.ok) return null;
  const installed = Array.isArray(sweep.installed) ? sweep.installed : [];
  const outdated = Array.isArray(sweep.outdated) ? sweep.outdated : [];
  const outdatedMap = new Map(outdated.map((o) => [o.name, o]));
  const items: CliPackageItem[] = [];
  for (const row of installed) {
    if (!row || !row.name || !row.installed) continue;
    const isOutdated = outdatedMap.has(row.name);
    const latest = isOutdated ? outdatedMap.get(row.name)!.latest : row.installed;
    const cmp = compareCliVersions(row.installed, latest);
    // 包管理器明确报 outdated 就算可升级 — version-cmp 对 brew revision bump
    // (3.2.0 → 3.2.0_1) 判相等, 这里以包管理器为准; 本机明显更新则不算
    let hasUpdate = false;
    if (isOutdated) {
      hasUpdate = cmp.note === "installed_newer" ? false : cmp.hasUpdate || latest !== row.installed;
    }
    items.push({
      ecosystem: eco,
      name: row.name,
      installed: row.installed,
      latest,
      has_update: hasUpdate,
      note: cmp.note || "",
    });
  }
  // installed 列表漏掉但 outdated 有的包 (理论不该发生, 兜底) — 也要露出
  for (const o of outdated) {
    if (o && o.name && !items.some((it) => it.name === o.name)) {
      items.push({
        ecosystem: eco,
        name: o.name,
        installed: o.installed || "",
        latest: o.latest,
        has_update: true,
        note: "",
      });
    }
  }
  return items;
}

/**
 * 全量刷新. 单生态失败不影响其它生态.
 * @returns { ok, items, errors, checkedAt } — ok = 至少一个生态成功
 */
export async function refreshCliPackages(deps: CliPackagesDeps = {}) {
  const sweep = deps.sweep || sweepEcosystem;
  const loadState = deps.loadState || defaultLoadState;
  const saveState = deps.saveState || defaultSaveState;
  const now = deps.now || (() => new Date());

  const prev = loadState();
  const prevIgnored: Array<{ ecosystem: CliEcosystem; name: string }> =
    prev && Array.isArray(prev.cli_packages) // 容错: 旧数据形态直接忽略
      ? []
      : prev && prev.cli_packages && Array.isArray(prev.cli_packages.ignored)
        ? prev.cli_packages.ignored
        : [];
  const ignoredKey = new Set(prevIgnored.map((g) => `${g.ecosystem}::${g.name}`));

  const results = await Promise.all(CLI_ECOSYSTEMS.map((eco) => sweep(eco)));

  const items: CliPackageItem[] = [];
  const errors: Array<{ ecosystem: CliEcosystem; reason: string }> = [];
  CLI_ECOSYSTEMS.forEach((eco, i) => {
    const ecoItems = buildEcoItems(eco, results[i]);
    if (!ecoItems) {
      const reason = results[i].reason || "sweep_failed";
      errors.push({ ecosystem: eco, reason });
      return;
    }
    for (const it of ecoItems) {
      if (ignoredKey.has(`${it.ecosystem}::${it.name}`)) continue;
      items.push(it);
    }
  });

  // 可升级在前, 同组内按名排序 — 稳定可读
  items.sort((a, b) => {
    if (a.has_update !== b.has_update) return a.has_update ? -1 : 1;
    if (a.ecosystem !== b.ecosystem) return CLI_ECOSYSTEMS.indexOf(a.ecosystem) - CLI_ECOSYSTEMS.indexOf(b.ecosystem);
    return a.name.localeCompare(b.name);
  });

  const state: CliPackagesState = {
    items: items.slice(0, 500),
    ignored: prevIgnored,
    errors,
    checkedAt: now().getTime(),
  };
  try {
    saveState(state);
  } catch {
    /* 落盘失败不阻塞返回 — 本次结果仍回给 UI */
  }
  return { ok: items.length > 0 || errors.length < CLI_ECOSYSTEMS.length, ...state };
}

/** 读最近一次扫描结果 (无数据时返回 null, UI 引导用户点刷新) */
export function loadCliPackages(): CliPackagesState | null {
  try {
    const s = defaultLoadState();
    return normalizeCliState(s && s.cli_packages);
  } catch {
    return null;
  }
}

function normalizeCliState(data: any): CliPackagesState | null {
  if (!data || !Array.isArray(data.items)) return null;
  return {
    items: data.items,
    ignored: Array.isArray(data.ignored) ? data.ignored : [],
    errors: Array.isArray(data.errors) ? data.errors : [],
    checkedAt: typeof data.checkedAt === "number" ? data.checkedAt : 0,
  };
}

/**
 * 忽略/恢复一个包. ignored 集合持久化 — 下次刷新也生效.
 * @returns 更新后的 ignored 数组
 */
export function toggleCliPackageIgnore(
  ecosystem: CliEcosystem,
  name: string,
  deps: CliPackagesDeps = {},
): { ok: boolean; ignored?: Array<{ ecosystem: CliEcosystem; name: string }>; reason?: string } {
  if (!CLI_ECOSYSTEMS.includes(ecosystem)) return { ok: false, reason: "bad_ecosystem" };
  if (typeof name !== "string" || !name) return { ok: false, reason: "bad_name" };
  const loadState = deps.loadState || defaultLoadState;
  const saveState = deps.saveState || defaultSaveState;

  const raw = loadState();
  const cur = normalizeCliState(raw && (raw as any).cli_packages);
  if (!cur) return { ok: false, reason: "no_data" };
  const key = `${ecosystem}::${name}`;
  const has = cur.ignored.some((g) => `${g.ecosystem}::${g.name}` === key);
  const ignored = has
    ? cur.ignored.filter((g) => `${g.ecosystem}::${g.name}` !== key)
    : [...cur.ignored, { ecosystem, name }];

  // items 保持原样 — 忽略/恢复只动 ignored 集合, UI 据此置灰; refresh 时才真正剔除
  const nextState: CliPackagesState = { ...cur, ignored };
  try {
    saveState(nextState);
  } catch {
    /* noop */
  }
  return { ok: true, ignored };
}
