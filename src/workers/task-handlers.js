/**
 * src/workers/task-handlers.js
 *
 * 三个 task.type: detect-app / brew-upgrade / brew-update.
 */

const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const platform = require("../platform");
const { runDetectorChain } = require("./detector-chain");
const { getInstalledVersion } = require("./installed-version");
const { buildDetectResult } = require("./result-builder");
const { sendProgress, postLog, ARCH, PLATFORM } = require("./ipc");
const {
  AppBundleChangelogDetector,
} = require("../detectors/app-bundle-changelog");

const pExecFile = promisify(execFile);

const DETECT_APP_TIMEOUT_MS = 90_000;
const BREW_UPGRADE_TIMEOUT_MS = 320_000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    }),
  ]);
}

async function handleDetectApp(appCfg, deps) {
  const { http, logger } = deps;
  const name = (appCfg && appCfg.name) || "unknown";
  const bundle = (appCfg && appCfg.bundle) || "";
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
      brew_cask: require("./result-builder").extractBrewCask(appCfg),
      trace: [],
      ms: Date.now() - startedAt,
    };
    sendProgress({ task: "detect-app", name, status: "not_installed" });
    return r;
  }

  let installed = null;
  let versionUnknown = false;
  try {
    installed = await getInstalledVersion(bundle, appCfg.version_sources);
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

  const chainResult = await runDetectorChain(appCfg, {
    arch: ARCH,
    platform: PLATFORM,
    http,
    logger,
  });

  if (chainResult.trace.length) {
    for (const t of chainResult.trace) {
      const meta = { app: name, det: t.det, ms: t.ms };
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
        appCfg,
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
    bundle,
    appCfg,
    installed,
    versionUnknown,
    chainResult,
    changelogHistory,
    startedAt,
  });
  sendProgress({ task: "detect-app", ...r });
  return r;
}

async function handleBrewUpgrade(cask) {
  if (!cask) return { success: false, output: "no cask" };
  try {
    const { stdout, stderr } = await pExecFile(
      "brew",
      ["upgrade", "--cask", cask],
      { timeout: 300000 },
    );
    return { success: true, output: (stdout || "") + (stderr || "") };
  } catch (err) {
    return {
      success: false,
      output: (err && err.message) || "brew upgrade failed",
    };
  }
}

async function handleBrewUpdate() {
  try {
    const { stdout } = await pExecFile("brew", ["update"], {
      timeout: 120000,
    });
    return { success: true, output: stdout || "" };
  } catch (err) {
    return {
      success: false,
      output: (err && err.message) || "brew update failed",
    };
  }
}

module.exports = {
  handleDetectApp,
  handleBrewUpgrade,
  handleBrewUpdate,
  withTimeout,
  DETECT_APP_TIMEOUT_MS,
  BREW_UPGRADE_TIMEOUT_MS,
};
