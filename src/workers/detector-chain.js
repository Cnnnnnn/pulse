/**
 * src/workers/detector-chain.js
 *
 * Detector chain runner + version compare.
 */

const { DetectContext } = require("../detectors/base");
const { cleanVersion } = require("../utils/version-utils");

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

function makeDetector(detCfg) {
  const mod = DETECTORS[detCfg.type];
  if (!mod) return null;
  const Cls = Object.values(mod).find(
    (v) => typeof v === "function" && v.name === detCfg.type,
  );
  if (!Cls) return null;
  return new Cls(detCfg);
}

function compareVersions(installed, latest) {
  const ins = cleanVersion(installed);
  const lat = cleanVersion(latest);
  if (ins === lat) return { hasUpdate: false, note: "" };

  // Marvis-style: installed 4 段 (semver + build), latest 3 段.
  // 若首 2 段一致且末段 >=100 (build 命名约定), 剥 build 比 base + build.
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
    const insBase = si.slice(0, 3);
    const latBase = sl.slice(0, 3);
    const insBuild = si[si.length - 1];
    const latBuild = sl[sl.length - 1];
    for (let i = 0; i < 3; i++) {
      if (insBase[i] !== latBase[i]) {
        if (latBase[i] > insBase[i]) return { hasUpdate: true, note: "" };
        if (latBase[i] < insBase[i])
          return { hasUpdate: false, note: "installed_newer" };
      }
    }
    if (insBuild !== latBuild) {
      if (latBuild > insBuild) return { hasUpdate: true, note: "" };
      if (latBuild < insBuild)
        return { hasUpdate: false, note: "installed_newer" };
    }
    return { hasUpdate: false, note: "" };
  }

  const maxLen = Math.max(si.length, sl.length);
  for (let i = 0; i < maxLen; i++) {
    const a = si[i] || 0;
    const b = sl[i] || 0;
    if (b > a) return { hasUpdate: true, note: "" };
    if (b < a) return { hasUpdate: false, note: "installed_newer" };
  }
  return { hasUpdate: false, note: "" };
}

async function runDetectorChain(appCfg, deps) {
  const { arch, http, logger } = deps;
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
      arch,
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

module.exports = { makeDetector, runDetectorChain, compareVersions };
