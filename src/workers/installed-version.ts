/**
 * src/workers/installed-version.ts
 *
 * 读 macOS app bundle 已安装版本.
 *
 * 优先级:
 *   1) appCfg.version_sources (用户配置的 source 链)
 *   2) legacy: installed.json → plist shortVer → system_profiler
 */

import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { appBundleResourcePath } from "../utils/app-paths";
import { tryVersionSource } from "./version-source";

const pExecFile = promisify(execFile);

const SP_TTL = 5 * 60 * 1000;
const _spCache = { data: null, time: 0 };

export function lookupSp(bundleName, map) {
  if (!map) return null;
  const fromPath = map[`__path__${bundleName}`];
  if (fromPath) return fromPath;
  const appName = bundleName.replace(/\.app$/, "");
  return map[appName] || null;
}

export async function readPlistOnce(bundleName) {
  const result = { plistRaw: null, bundleId: null };
  try {
    const { stdout } = await pExecFile(
      "plutil",
      [
        "-convert",
        "xml1",
        "-o",
        "-",
        appBundleResourcePath(bundleName, "Contents", "Info.plist"),
      ],
      { timeout: 5000 },
    );
    result.plistRaw = stdout;
    const m = stdout.match(
      /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/,
    );
    if (m) result.bundleId = m[1];
  } catch {
    /* noop */
  }
  return result;
}

export async function tryInstalledJson(bundleId) {
  if (!bundleId) return null;
  const HOME = process.env.HOME || "/Users/Shared";
  const installedJsonPath = `${HOME}/Library/Application Support/${bundleId}/installed.json`;
  try {
    const raw = await fs.promises.readFile(installedJsonPath, "utf-8");
    const j = JSON.parse(raw);
    if (j && typeof j.appVersion === "string" && j.appVersion.trim()) {
      return j.appVersion.trim();
    }
  } catch {
    /* noop */
  }
  return null;
}

export function plistShortVersion(plistRaw) {
  if (!plistRaw) return null;
  const m = plistRaw.match(
    /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
  );
  return m ? m[1] : null;
}

export async function refreshSystemProfilerCache() {
  if (_spCache.data && Date.now() - _spCache.time < SP_TTL) {
    return _spCache.data;
  }
  try {
    const { stdout } = await pExecFile(
      "system_profiler",
      ["SPApplicationsDataType", "-json", "-detailLevel", "mini"],
      { timeout: 30000 },
    );
    const data = JSON.parse(stdout);
    const apps = data.SPApplicationsDataType || [];
    const map = {};
    for (const app of apps) {
      if (app._name) map[app._name] = app.version || null;
      if (app.path) {
        const bundle = app.path.split("/").pop();
        map[`__path__${bundle}`] = app.version || null;
      }
    }
    _spCache.data = map;
    _spCache.time = Date.now();
  } catch {
    /* noop */
  }
  return _spCache.data;
}

/**
 * 读已安装版本. 优先级: user version_sources → installed.json → plist → system_profiler.
 * @param {string} bundleName
 * @param {Array} [versionSources]
 * @returns {Promise<string|null>}
 */
export async function getInstalledVersion(bundleName, versionSources) {
  if (!bundleName) return null;
  const { plistRaw, bundleId } = await readPlistOnce(bundleName);

  if (Array.isArray(versionSources) && versionSources.length > 0) {
    const currentPlatform = process.platform;
    const filtered = versionSources.filter(
      (s) => !s.platform || s.platform === currentPlatform,
    );
    for (const src of filtered) {
      const v = await tryVersionSource(src, { bundleId, plistRaw });
      if (v) return v;
    }
    if (filtered.length > 0) return null;
    // filtered.length === 0: 当前平台没配 source, 走下面的 fallback 链
  }

  const fromJson = await tryInstalledJson(bundleId);
  if (fromJson) return fromJson;

  const fromPlist = plistShortVersion(plistRaw);
  if (fromPlist) return fromPlist;

  const spMap = await refreshSystemProfilerCache();
  return lookupSp(bundleName, spMap);
}

// ponytail: Phase 7 7a 保留 module.exports, 给 CJS 测试 mock (eg: 测试改写
// getInstalledVersion spy). 7b 删 shim 阶段再去掉, 此时测试改 vi.mock.
module.exports = { getInstalledVersion, lookupSp, plistShortVersion };

