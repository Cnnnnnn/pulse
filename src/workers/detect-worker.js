/**
 * src/workers/detect-worker.js
 *
 * Worker thread 入口（spec §6）— 跑 detector 链。
 *
 * 主进程 → worker:  { id, task: { type, payload } }
 * worker → 主进程:  { type: 'progress' | 'result' | 'log' | 'error', payload? }
 *
 * 支持的 task.type:
 *   - 'detect-app'    { appCfg }            → 跑 detector chain，返回 { name, version, ... }
 *   - 'brew-upgrade'  { cask }              → 本地 brew upgrade
 *   - 'brew-update'   {}                    → brew update
 *
 * 设计：
 *   - 收到 task 后立刻 postMessage 一个 'started' progress（带 taskId）
 *   - 跑 detector chain 中每步也 postMessage 'progress'（带 step 信息）
 *   - 最终 postMessage 'result' 携带结果
 *   - 任何异常 → postMessage 'error'
 *   - 不退出：worker 长期存活，main 死了才退出
 */

const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const pExecFile = promisify(execFile);

const { HttpClient } = require("../main/http-client");
const { DetectContext } = require("../detectors/base");
const { DetectorError } = require("../detectors/errors");
const { stripBuildNumber } = require("../utils/version-utils");
const { tryVersionSource } = require("./version-source");
const {
  AppBundleChangelogDetector,
} = require("../detectors/app-bundle-changelog");

// 加载所有 detector
const DETECTORS = {
  brew_formulae: require("../detectors/brew-formulae"),
  brew_local_cask: require("../detectors/brew-local-cask"),
  sparkle_appcast: require("../detectors/sparkle-appcast"),
  electron_yml: require("../detectors/electron-yml"),
  app_store_lookup: require("../detectors/app-store-lookup"),
  api_json: require("../detectors/api-json"),
  redirect_filename: require("../detectors/redirect-filename"),
  cursor_redirect: require("../detectors/cursor-redirect"),
  qclaw_api: require("../detectors/qclaw-api"),
  app_update_yml: require("../detectors/app-update-yml"),
  electron_zip_probe: require("../detectors/electron-zip-probe"),
};

const ARCH =
  (workerData && workerData.arch) ||
  (process.arch === "arm64" ? "arm64" : "x64");

const http = new HttpClient({ timeout: 8000, maxBodyBytes: 1024 * 1024 });
const logger = makePostMessageLogger();

function makePostMessageLogger() {
  function send(level, text, meta) {
    try {
      parentPort.postMessage({ type: "log", level, text, meta: meta || null });
    } catch {
      /* parent dead — ignore */
    }
  }
  return {
    debug: (t, m) => send("DEBUG", t, m),
    info: (t, m) => send("INFO", t, m),
    warn: (t, m) => send("WARN", t, m),
    error: (t, m) => send("ERROR", t, m),
  };
}

function sendProgress(payload) {
  try {
    parentPort.postMessage({ type: "progress", payload });
  } catch {
    /* noop */
  }
}

function sendResult(payload) {
  try {
    parentPort.postMessage({ type: "result", payload });
  } catch {
    /* noop */
  }
}

function sendError(message) {
  try {
    parentPort.postMessage({ type: "error", message });
  } catch {
    /* noop */
  }
}

// ─── detector chain runner ───────────────────────────────

function makeDetector(detCfg) {
  const mod = DETECTORS[detCfg.type];
  if (!mod) return null;
  // 每个 module 导出 { XxxDetector: class }, class 上有 static name = '<type>'
  // 例: qclaw_api.js 导出 QClawApiDetector, 其 static.name === 'qclaw_api'
  // 之前的实现按 detCfg.type camelCase 推 class name, 但 'qclaw_api' 模块导出的是
  // 'QClawApiDetector' (中间 Q 大写), 不符合 camelCase 规则 → 找不到 → 抛 'unknown detector type'
  const Cls = Object.values(mod).find(
    (v) => typeof v === "function" && v.name === detCfg.type,
  );
  if (!Cls) return null;
  return new Cls(detCfg);
}

function cleanVersion(ver) {
  if (!ver || typeof ver !== "string") return null;
  let v = ver.trim();
  if (v.includes(",")) v = v.split(",")[0];
  if (v.startsWith("v") || v.startsWith("V")) v = v.slice(1);
  return v.trim() || null;
}

function compareVersions(installed, latest) {
  const ins = cleanVersion(installed);
  const lat = cleanVersion(latest);
  if (ins === lat) return { hasUpdate: false, note: "" };

  // Phase 7 bugfix: Marvis 这类 app, installed = "1.0.0.10155" (4 段: semver + build),
  //                  latest = "1.0.10051" (3 段, 命名约定省略了 0 patch).
  // 旧逻辑: 段数不同直接走 "incompatible" / "no_auto_check" → 误判.
  // 新逻辑: 如果首 2 段一致, 把"看起来像 build 号"的段(>= 100)剥离, 比较 base + build.
  //   - 若 base 一致, 比 build: ins_build > lat_build → installed_newer
  //   - 否则按 base 段比
  //   - 不识别的极端情况回退到段对齐比较.
  const si = ins.split(".").map((s) => parseInt(s, 10) || 0);
  const sl = lat.split(".").map((s) => parseInt(s, 10) || 0);

  const looksLikeBuild = (n) => Number.isFinite(n) && n >= 100;
  const canNormalize =
    si.length >= 3 &&
    sl.length >= 3 &&
    si[0] === sl[0] &&
    si[1] === sl[1] &&
    (si.length === 4 || sl.length === 4) &&
    (looksLikeBuild(si[si.length - 1]) || looksLikeBuild(sl[sl.length - 1]));

  if (canNormalize) {
    // 剥离末段作为 build
    const insBase = si.slice(0, 3);
    const latBase = sl.slice(0, 3);
    const insBuild = si[si.length - 1];
    const latBuild = sl[sl.length - 1];
    // base 比较
    for (let i = 0; i < 3; i++) {
      if (insBase[i] !== latBase[i]) {
        if (latBase[i] > insBase[i]) return { hasUpdate: true, note: "" };
        if (latBase[i] < insBase[i])
          return { hasUpdate: false, note: "installed_newer" };
      }
    }
    // base 完全一致, 比 build
    if (insBuild !== latBuild) {
      if (latBuild > insBuild) return { hasUpdate: true, note: "" };
      if (latBuild < insBuild)
        return { hasUpdate: false, note: "installed_newer" };
    }
    return { hasUpdate: false, note: "" };
  }

  // 兜底: 段对齐比较
  const maxLen = Math.max(si.length, sl.length);
  for (let i = 0; i < maxLen; i++) {
    const a = si[i] || 0;
    const b = sl[i] || 0;
    if (b > a) return { hasUpdate: true, note: "" };
    if (b < a) return { hasUpdate: false, note: "installed_newer" };
  }
  return { hasUpdate: false, note: "" };
}

async function runDetectorChain(appCfg) {
  const detectors = Array.isArray(appCfg.detectors) ? appCfg.detectors : [];
  const trace = [];
  let firstHit = null;
  for (const detCfg of detectors) {
    const Det = makeDetector(detCfg);
    if (!Det) {
      trace.push({ det: detCfg.type, ms: 0, error: "unknown detector type" });
      continue;
    }
    const ctx = new DetectContext({
      appCfg,
      arch: ARCH,
      http,
      logger,
      detCfg,
    });
    const t0 = Date.now();
    let result = null;
    let error = null;
    try {
      result = await Det.detect(ctx);
    } catch (err) {
      error = err && err.message ? err.message : String(err);
    }
    const ms = Date.now() - t0;
    if (result) {
      trace.push({
        det: detCfg.type,
        ms,
        version: result.version,
        confidence: result.confidence,
        note: result.note,
      });
      if (result.version && result.confidence !== "low") {
        return { result, trace, stoppedAt: detCfg.type };
      }
      if (!firstHit && result.version) firstHit = { result, trace };
    } else {
      trace.push({ det: detCfg.type, ms, error });
    }
  }
  return { result: firstHit ? firstHit.result : null, trace, stoppedAt: null };
}

// ─── installed version (worker 内本地跑) ─────────────────

const _spCache = { data: null, time: 0 };
const SP_TTL = 5 * 60 * 1000;

async function getInstalledVersion(bundleName, versionSources) {
  // Phase 7 bugfix: ima.copilot 这类 app, system_profiler 在 macOS 上有时返回
  //   CFBundleVersion (build 号, 7680.4571) 当作 app.version
  //   而不是 CFBundleShortVersionString (用户看的 2.5.3).
  // 旧逻辑: 拿到 system_profiler 的值就 return, 不再 plutil 兜底.
  // 新逻辑: 拿到 system_profiler 的值后, 仍跑一次 plutil 取 shortVer.
  //         如果 shortVer 存在且与 system_profiler 的值不同, 优先用 shortVer.
  //         (我们关心"用户看到的版本", 不是 build 号)

  // Phase 8 bugfix: Marvis 这类有 electron-updater 自升级的 app, plist 里的
  //   CFBundleShortVersionString (1.0.0.10155) 是"二进制 bundle 的 OS 级版本",
  //   跟用户 About 面板显示的版本 (1.0.10050) 是两套. About 用的是
  //   ~/Library/Application Support/{CFBundleIdentifier}/installed.json 里的 appVersion.
  // 这是 electron-updater 的通用模式: 安装时把当前版本写到 installed.json,
  //   启动时优先读这个, 因为 plist 可能滞后于 staged update.
  // 我们的策略: 优先读 installed.json 的 appVersion → 没有则读 plist 的 shortVer → 没有则 system_profiler.

  // Phase 9: 加 version_sources 配置数组, 让每个 app 自定义"哪里读 installed 版本".
  //   来源类型:
  //     - "installed_json"  : { type, path? } 读 JSON 的 appVersion
  //     - "plist"           : {}              读 CFBundleShortVersionString
  //     - "regex_file"      : { type, path, pattern } 读文件用 regex 提取
  //   优先级: 数组顺序, 第一个非空 wins. 全部失败 → 走 legacy 链
  //     (installed.json → plist → system_profiler) 然后再 null.
  //
  // 例 (IMA):
  //   "version_sources": [
  //     { "type": "regex_file",
  //       "path": "~/Library/Application Support/com.tencent.imamac/mmkv/RDConfigKVStoragePrefix_f3b56f2322_10001_release_0",
  //       "pattern": "appVersion.{0,4}([0-9.]+)" }
  //   ]

  const HOME = process.env.HOME || "/Users/Shared";

  // 一次性读 plist (后面 plist source 也要用)
  let plistRaw = null;
  let bundleId = null;
  try {
    const { stdout } = await pExecFile(
      "plutil",
      [
        "-convert",
        "xml1",
        "-o",
        "-",
        `/Applications/${bundleName}/Contents/Info.plist`,
      ],
      { timeout: 5000 },
    );
    plistRaw = stdout;
    const m = stdout.match(
      /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/,
    );
    if (m) bundleId = m[1];
  } catch {
    /* noop */
  }

  // Phase 9: 用户配置的 version_sources 链 (按顺序尝试, 第一个非空 wins)
  if (Array.isArray(versionSources) && versionSources.length > 0) {
    for (const src of versionSources) {
      const v = await tryVersionSource(src, { bundleId, plistRaw });
      if (v) return v;
    }
    // 用户给了 sources 但都没结果 — 仍然尊重配置, 不回落到 legacy
    return null;
  }

  // Legacy 默认链 (没配 version_sources 的 app): installed.json → plist → system_profiler
  if (bundleId) {
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
  }

  if (plistRaw) {
    const m1 = plistRaw.match(
      /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
    );
    if (m1) return m1[1];
  }

  if (_spCache.data && Date.now() - _spCache.time < SP_TTL) {
    return lookupSp(bundleName, _spCache.data);
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
    return lookupSp(bundleName, map);
  } catch {
    /* noop */
  }

  return null;
}

/**
 * Phase 9: 按单个 source 配置尝试读 installed 版本, 失败返回 null.
 * 实现已搬到 ./version-source.js 方便 vitest 单独测.
 * 提取后再过 stripBuildNumber 兜底 (如 IMA 拿到 "2.5.3.4392" → "2.5.3").
 */

function lookupSp(bundleName, map) {
  const fromPath = map[`__path__${bundleName}`];
  if (fromPath) return fromPath;
  const appName = bundleName.replace(/\.app$/, "");
  return map[appName] || null;
}

/**
 * Phase 11: 从 appCfg.detectors 找第一个 type=brew_formulae 的 cask 字段.
 * 老 schema 的 brew_cask 顶层字段已不再用 (migrate.js 转成了 detector).
 * 没找到返回空串.
 */
function extractBrewCask(appCfg) {
  const dets =
    appCfg && Array.isArray(appCfg.detectors) ? appCfg.detectors : [];
  for (const d of dets) {
    if (
      d &&
      d.type === "brew_formulae" &&
      typeof d.cask === "string" &&
      d.cask.trim()
    ) {
      return d.cask.trim();
    }
  }
  return "";
}

/**
 * Phase 15: 从 trace 抽最后一条 error, 给 UI 显示.
 *
 * 规则:
 *   - 没有 trace 或 trace 全成功 → null
 *   - 装版本读不出来 (versionUnknown) → "已安装版本无法读取"
 *   - 全部 detector 失败且没有 latest → "所有检测源都失败" + 最后一条 error
 *   - 其它 (部分成功但用户看不到 latest) → 用最后一条 error (可能解释为啥)
 */
function extractErrorMessage(trace, latest, versionUnknown) {
  if (versionUnknown) return "已安装版本无法读取";
  if (!trace || trace.length === 0) return null;
  // 优先返回最后一条 error
  for (let i = trace.length - 1; i >= 0; i--) {
    if (trace[i].error) {
      return trace[i].error;
    }
  }
  return null;
}

function isChromiumVersion(ver) {
  if (!ver || typeof ver !== "string") return false;
  const parts = ver.split(".");
  if (parts.length !== 4) return false;
  const major = parseInt(parts[0], 10);
  return major >= 80 && parts.every((p) => /^\d+$/.test(p));
}

// ─── task handlers ───────────────────────────────────────

async function handleDetectApp(appCfg) {
  const name = (appCfg && appCfg.name) || "unknown";
  const bundle = (appCfg && appCfg.bundle) || "";
  const startedAt = Date.now();
  sendProgress({ task: "detect-app", name, status: "started", ts: startedAt });

  // installed — 先快查 app 是否存在（避免对不存在的 app 跑 system_profiler）
  const appExists = (() => {
    try {
      return fs.existsSync(`/Applications/${bundle}`);
    } catch {
      return false;
    }
  })();
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
      brew_cask: extractBrewCask(appCfg),
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
  // Phase 9 debug: log installed extraction path (will keep, useful for future diagnostics)
  try {
    const hasVS = !!(appCfg.version_sources && appCfg.version_sources.length);
    parentPort.postMessage({
      type: "log",
      level: "INFO",
      text: "",
      meta: {
        app: name,
        det: "installed_extract",
        ms: 0,
        version: installed,
        note: hasVS ? `vs[${appCfg.version_sources.length}]` : "legacy",
      },
    });
  } catch {
    /* noop */
  }

  // chain
  const { result, trace, stoppedAt } = await runDetectorChain(appCfg);

  if (trace.length) {
    // spec §6: 每步写一行 [detect] 记录 — 顺序 trace, 便于 grep 找问题
    for (const t of trace) {
      const meta = { app: name, det: t.det, ms: t.ms };
      if (t.version) meta.version = t.version;
      if (t.confidence) meta.confidence = t.confidence;
      if (t.error) meta.error = t.error;
      if (t.note) meta.note = t.note;
      // 用 postMessage 'log' 走 main process 落盘 (确保时区/格式一致)
      try {
        parentPort.postMessage({ type: "log", level: "INFO", text: "", meta });
      } catch {
        /* parent dead — ignore */
      }
    }
  }

  const latest = result ? result.version : null;
  const source = result ? result.source || stoppedAt : "";

  // Phase 11 bugfix: 升级按钮依赖 result.brew_cask, 但新 schema 把 cask 藏在
  // detectors[].cask 里 (老 schema 的顶层 brew_cask 字段不再有).
  // 旧逻辑: brew_cask: appCfg.brew_cask || ''  → 永远空 → 按钮永远不出现
  // 新逻辑: 扫 detectors[], 找 type=brew_formulae 的 cask 字段
  const brewCask = extractBrewCask(appCfg);

  // Phase 21: app bundle changelog 增强器 (post-step). 配置 bundle_changelog: true 后,
  // 读 /Applications/<bundle>/Contents/Resources/ 下的 CHANGELOG.md 等文件.
  // 跟 detector chain 解耦: chain 已经返回 result.version, 这个只是补 changelog.
  // 没找到文件 → 静默忽略.
  // Phase 21: app bundle changelog 增强器 (post-step). 配置 bundle_changelog: true 后,
  // 读 /Applications/<bundle>/Contents/Resources/ 下的 CHANGELOG.md 等文件.
  // 跟 detector chain 解耦: chain 已经返回 result.version, 这个只是补 changelog.
  // 没找到文件 → 静默忽略.
  if (appCfg.bundle_changelog === true) {
    try {
      const bundleResult = await new AppBundleChangelogDetector().detect({
        appCfg,
        arch: ARCH,
        http: null, // 不用 http
        logger,
        detCfg: {},
      });
      if (bundleResult && bundleResult.changelog) {
        if (!result || !result.changelog)
          result.changelog = bundleResult.changelog;
        if (result && !result.changelog_format)
          result.changelog_format = bundleResult.changelog_format;
        // 写到 trace (诊断用, 不参与 version 比较)
        trace.push({
          det: "app_bundle_changelog",
          ms: 0,
          version: "",
          note: bundleResult.note || "app bundle changelog",
        });
      }
    } catch {
      // bundle 目录不存在 / 没 changelog 文件 / 读不了 → 静默忽略
    }
  }

  // Phase 18: 读 state.json 看是否有 changelog_history, 透传给 renderer
  // 读操作在 main 那边已做了, 我们只读 task payload 里的 (避免 worker 直接读 fs)
  const changelogHistory =
    appCfg && Array.isArray(appCfg.changelog_history)
      ? appCfg.changelog_history
      : [];

  let note = "";
  let hasUpdate = false;
  if (versionUnknown) {
    note = "version_unknown";
  } else if (latest && installed && installed !== "未知") {
    const cmp = compareVersions(installed, latest);
    hasUpdate = cmp.hasUpdate;
    note = cmp.note;
  }

  let status;
  if (versionUnknown && latest) status = "no_auto_check";
  else if (!latest) status = "no_auto_check";
  else if (hasUpdate) status = "update_available";
  else if (note === "incompatible") status = "no_auto_check";
  else status = "up_to_date";

  const r = {
    name,
    installed_version: installed,
    latest_version: latest ? cleanVersion(latest) : null,
    has_update: hasUpdate,
    status,
    source,
    note,
    bundle,
    brew_cask: brewCask,
    // Phase 14: 透传 changelog (electron_yml / sparkle_appcast / api_json 解析出来)
    changelog: (result && result.changelog) || "",
    changelog_url: (result && result.changelog_url) || "",
    changelog_format: (result && result.changelog_format) || "md",
    // Phase 18: 老版本 release notes, state-store saveAll 推进来, worker 读 appCfg 透传
    changelog_history: changelogHistory,
    // Phase 20: per-app 配置的 release notes URL. 当 detector 没拿到 changelog 时,
    // UI 显示 "查看 release notes ↗" 链接. 没配就 fallback 到 download_url.
    release_notes_url: appCfg.release_notes_url || "",
    // Phase 22: App Store trackId, 给 Bulk Upgrade 拼 macappstore:// 深链用.
    // app_store_lookup 探测器抓 iTunes lookup 响应的 results[0].trackId.
    track_id: (result && result.track_id) || 0,
    // Phase 22: sparkle <enclosure url="..."> — 该版本的 .zip 下载.
    // 给 Bulk Upgrade 走 openExternal 打开下载页, 比 shell.openPath 启动 app
    // 等 Sparkle updater 弹更可靠.
    release_url: (result && result.release_url) || "",
    // Phase 15: 错误原因. 全部 detector 都失败时, 把最后一条错误暴露给 UI
    // (status === 'no_auto_check' 且 !latest 才有意义)
    error_message: extractErrorMessage(trace, latest, versionUnknown),
    trace,
    ms: Date.now() - startedAt,
  };
  // Phase 7 bugfix: 之前 sendProgress 只发了 status 元数据, 渲染端拿不到 installed_version / bundle
  // → AppRow 显示 installed 为 "—" 占位. 改成发完整 result 对象.
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
    const { stdout } = await pExecFile("brew", ["update"], { timeout: 120000 });
    return { success: true, output: stdout || "" };
  } catch (err) {
    return {
      success: false,
      output: (err && err.message) || "brew update failed",
    };
  }
}

// ─── message loop ────────────────────────────────────────

if (parentPort) {
  parentPort.on("message", async (msg) => {
    if (!msg || !msg.task) return;
    const { id, task } = msg;
    try {
      let result;
      if (task.type === "detect-app") {
        result = await handleDetectApp(task.payload && task.payload.appCfg);
      } else if (task.type === "brew-upgrade") {
        result = await handleBrewUpgrade(task.payload && task.payload.cask);
      } else if (task.type === "brew-update") {
        result = await handleBrewUpdate();
      } else {
        sendError(`unknown task type: ${task.type}`);
        return;
      }
      sendResult({ id, ...result });
    } catch (err) {
      sendError((err && err.message) || String(err));
    }
  });

  // 主进程在 worker 启动时会 postMessage 一条 "init" 消息以触发 ready 回调
  // （可选；不在这里强制）
  parentPort.postMessage({ type: "log", level: "INFO", text: "worker ready" });
}
