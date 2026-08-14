/**
 * src/utils/app-paths.ts
 *
 * macOS .app bundle 路径解析 — config 里 bundle 通常是裸名 (e.g. "Cursor.app").
 */

import path from "node:path";
import { existsSync } from "node:fs";

export const DEFAULT_APPS_DIR = "/Applications";

/**
 * @param {string|null|undefined} bundle  裸 bundle 名或绝对路径
 * @returns {string|null}
 */
export function resolveAppBundlePath(bundle: any) {
  if (!bundle || typeof bundle !== "string") return null;
  const trimmed = bundle.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  return `${DEFAULT_APPS_DIR}/${trimmed}`;
}

/**
 * Return the configured bundle followed by any renamed-package aliases.
 *
 * Some Electron apps change the visible .app name while keeping the old
 * internal bundle identifiers.  Keeping the candidates at the config seam
 * lets detection support both an upgraded install and an older install.
 */
export function getAppBundleCandidates(bundle: any, appCfg?: any) {
  const aliases =
    appCfg && Array.isArray(appCfg.bundle_aliases)
      ? appCfg.bundle_aliases
      : [];
  const candidates = [bundle, ...aliases]
    .filter((candidate) => typeof candidate === "string")
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  return [...new Set(candidates)];
}

/**
 * Find the first bundle candidate that exists on disk.
 *
 * The optional exists function keeps this helper deterministic in tests while
 * production callers use the real filesystem.
 */
export function resolveExistingAppBundle(
  bundle: any,
  appCfg?: any,
  exists: (bundlePath: string) => boolean = existsSync,
) {
  for (const candidate of getAppBundleCandidates(bundle, appCfg)) {
    const bundlePath = resolveAppBundlePath(candidate);
    if (bundlePath && exists(bundlePath)) return candidate;
  }
  return null;
}

/**
 * @param {string|null|undefined} bundle
 * @param {...string} segments  e.g. 'Contents', 'Info.plist'
 * @returns {string|null}
 */
export function appBundleResourcePath(bundle: any, ...segments: string[]) {
  const base = resolveAppBundlePath(bundle);
  if (!base) return null;
  return path.join(base, ...segments);
}
