/**
 * src/workers/task-handlers.ts
 *
 * 三个 task.type: detect-app / brew-upgrade / brew-update.
 */

import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
// ponytail: src/platform/index.ts 是 CJS module.exports + ESM default. namespace
// import 拿到 { default: impl } — 取 .default 解 impl. 7a-6 加 named export 后
// 再换 import platform from "...";. 现在 namespace import + .default 兼容.
import * as platformMod from "../platform/index";
const platform: any = (platformMod as any).default || platformMod;
import { runDetectorChain } from "./detector-chain";
import { getInstalledVersion } from "./installed-version";
import { buildDetectResult } from "./result-builder";
import { sendProgress, postLog, ARCH, PLATFORM } from "./ipc";
const {
  AppBundleChangelogDetector,
} = require("../detectors/app-bundle-changelog.js");

const pExecFile = promisify(execFile);

export const DETECT_APP_TIMEOUT_MS = 90_000;
export const BREW_UPGRADE_TIMEOUT_MS = 320_000;

export function withTimeout(promise: any, ms: any, label: any) {
  return Promise.race([
    promise,
    new Promise((_: any, reject: any) => {
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    }),
  ]);
}

export async function handleDetectApp(appCfg: any, deps: any) {
  const { http, logger } = deps;
  const name = (appCfg && appCfg.name) || "unknown";
  const bundle = (appCfg && appCfg.bundle) || "";
  let detectedBundle = bundle;
  const startedAt = Date.now();
  sendProgress({ task: "detect-app", name, status: "started", ts: startedAt });

  let appExists;
  try {
    // Windows: resolveAppPath 只回 win_bundle 字符串 (静态配置), 拿它做
    // "appExists" 判定永远 true, 哪怕用户根本没装这个 app — 结果就是
    // getInstalledVersion 返回 null → 标 version_unknown → UI 误显示
    // "已安装版本无法读取". 改走真正的安装探测: win 上调 getInstalledVersion
    // (注册表扫 + version_sources), 返回 null 即视为未安装.
    if (process.platform === "win32") {
      appExists = !!(await platform.getInstalledVersion(appCfg));
    } else {
      appExists = fs.existsSync(platform.resolveAppPath(bundle, appCfg));
      if (
        appExists &&
        typeof platform.resolveBundleName === "function"
      ) {
        detectedBundle = platform.resolveBundleName(bundle, appCfg) || bundle;
      }
    }
  } catch {
    appExists = false;
  }
  if (!appExists) {
    const r = {
      name,
      installed_version: null,
      latest_version: null,
      has_update: false,
      status: "not_installed",
      source: "",
      note: "",
      bundle,
      brew_cask: require("./result-builder.js").extractBrewCask(appCfg),
      trace: [],
      ts: startedAt,
      ms: Date.now() - startedAt,
    };
    sendProgress({ task: "detect-app", name, status: "not_installed" });
    return r;
  }

  // Bundle-dependent detectors (app-update.yml / bundle changelog) must read
  // the actual installed alias as well, not only the configured package name.
  const effectiveAppCfg =
    detectedBundle === bundle
      ? appCfg
      : { ...appCfg, bundle: detectedBundle };

  let installed = null;
  let versionUnknown = false;
  try {
    installed = await getInstalledVersion(
      detectedBundle,
      appCfg.version_sources,
    );
  } catch {
    /* noop */
  }
  if (!installed) {
    installed = "未知";
    versionUnknown = true;
  }

  // Phase 9 debug: log installed extraction path
  const hasVS = !!(appCfg.version_sources && appCfg.version_sources.length);
  postLog("INFO", "", {
    app: name,
    det: "installed_extract",
    ms: 0,
    version: installed,
    note: hasVS ? `vs[${appCfg.version_sources.length}]` : "legacy",
  });

  const chainResult = await runDetectorChain(effectiveAppCfg, {
    arch: ARCH,
    platform: PLATFORM,
    http,
    logger,
    incremental: deps.incremental || null,
    forceRefresh: !!deps.forceRefresh,
  });
  if (chainResult.trace.length) {
    for (const t of chainResult.trace) {
      const meta: any = { app: name, det: t.det, ms: t.ms };
      if (t.version) meta.version = t.version;
      if (t.confidence) meta.confidence = t.confidence;
      if (t.error) meta.error = t.error;
      if (t.note) meta.note = t.note;
      postLog("INFO", "", meta);
    }
  }

  // Phase 21: app bundle changelog 增强器 (post-step)
  if (appCfg.bundle_changelog === true) {
    try {
      const bundleResult = await new AppBundleChangelogDetector().detect({
        appCfg: effectiveAppCfg,
        arch: ARCH,
        http: null,
        logger,
        detCfg: {},
      });
      if (bundleResult && bundleResult.changelog) {
        if (!chainResult.result || !chainResult.result.changelog)
          chainResult.result.changelog = bundleResult.changelog;
        if (chainResult.result && !chainResult.result.changelog_format)
          chainResult.result.changelog_format = bundleResult.changelog_format;
        chainResult.trace.push({
          det: "app_bundle_changelog",
          ms: 0,
          version: "",
          note: bundleResult.note || "app bundle changelog",
        });
      }
    } catch {
      /* 静默忽略 */
    }
  }

  const changelogHistory =
    appCfg && Array.isArray(appCfg.changelog_history)
      ? appCfg.changelog_history
      : [];

  const r = buildDetectResult({
    name,
    bundle: detectedBundle,
    appCfg: effectiveAppCfg,
    installed,
    versionUnknown,
    chainResult,
    changelogHistory,
    startedAt,
  });
  sendProgress({ task: "detect-app", ...r });
  return r;
}

export async function handleBrewUpgrade(cask: any) {
  if (!cask) return { success: false, output: "no cask" };
  try {
    const { stdout, stderr } = await pExecFile(
      "brew",
      ["upgrade", "--cask", cask],
      { timeout: 300000 },
    );
    return { success: true, output: (stdout || "") + (stderr || "") };
  } catch (err: any) {
    return {
      success: false,
      output: (err && err.message) || "brew upgrade failed",
    };
  }
}

export async function handleBrewUpdate() {
  try {
    const { stdout } = await pExecFile("brew", ["update"], {
      timeout: 120000,
    });
    return { success: true, output: stdout || "" };
  } catch (err: any) {
    return {
      success: false,
      output: (err && err.message) || "brew update failed",
    };
  }
}
