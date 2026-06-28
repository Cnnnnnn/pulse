/**
 * src/workers/detector-chain.js
 *
 * Detector chain runner + version compare.
 */

const { DetectContext } = require("../detectors/base");
const { cleanVersion } = require("../utils/version-utils");
const cbStorage = require("../detectors/circuit-breaker-storage");
const {
  shouldAllow,
  transitionAfterProbe,
  recordSuccess,
  recordFailure,
  createBreaker,
} = require("../detectors/circuit-breaker");
const { decideIncremental } = require("./detector-chain-incremental");

const DETECTORS = {
  brew_formulae: require("../detectors/brew-formulae"),
  brew_local_cask: require("../detectors/brew-local-cask"),
  sparkle_appcast: require("../detectors/sparkle-appcast"),
  electron_yml: require("../detectors/electron-yml"),
  app_store_lookup: require("../detectors/app-store-lookup"),
  api_json: require("../detectors/api-json"),
  rss_changelog: require("../detectors/rss-changelog"),
  redirect_filename: require("../detectors/redirect-filename"),
  cursor_redirect: require("../detectors/cursor-redirect"),
  qclaw_api: require("../detectors/qclaw-api"),
  app_update_yml: require("../detectors/app-update-yml"),
  electron_zip_probe: require("../detectors/electron-zip-probe"),
  html_changelog: require("../detectors/html-changelog"),
  winget_show: require("../detectors/winget-show"),
  github_release: require("../detectors/github-release"),
  hilo_changelog_manifest: require("../detectors/hilo-changelog-manifest"),
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

function breakerKey(detCfg) {
  const id =
    detCfg.url ||
    detCfg.id ||
    detCfg.cask ||
    detCfg.product ||
    detCfg.baseUrl ||
    "";
  return `${detCfg.type}:${id}`;
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
  const { arch, http, logger, platform, incremental } = deps;
  const currentPlatform = platform || process.platform;
  const detectors = Array.isArray(appCfg.detectors) ? appCfg.detectors : [];
  const trace = [];
  let firstHit = null;
  const stored = await cbStorage.loadBreakers();

  // C5: 增量模式决策 — app 名在 appCfg 上, ts 在 incremental.appsLastChecked[name]
  let detectorLimit = detectors.length;
  let isIncremental = false;
  if (incremental && typeof incremental === "object") {
    const name = (appCfg && appCfg.name) || "";
    const appTs =
      incremental.appsLastChecked && name
        ? incremental.appsLastChecked[name]
        : null;
    const decision = decideIncremental({
      detectors,
      appTs,
      recentDays: incremental.recentDays || 7,
      now: Date.now(),
    });
    isIncremental = decision.useIncremental;
    detectorLimit = decision.maxIndex;
  }

  for (let idx = 0; idx < detectors.length; idx++) {
    const detCfg = detectors[idx];
    if (idx >= detectorLimit) {
      // C5: 增量模式跳过剩余 detector
      trace.push({ det: detCfg.type, ms: 0, skipped: "incremental" });
      continue;
    }
    if (detCfg.platform && detCfg.platform !== currentPlatform) {
      trace.push({ det: detCfg.type, ms: 0, skipped: "platform" });
      continue;
    }
    // C9 (2026-06-28): enrich_only detector 不参与版本号竞争, 拿到 result
    // 后**继续**跑后续 detector, 不 stop chain. 仅当 chain 已拿到 version
    // 时, 用该 detector 返的 changelog/changelog_url/release_url 等字段
    // 填到 result 上 (若尚为空). 适用: e.g. Codex RSS 拿 markdown 内容但
    // 拿不到版本号 — 让 sparkle_appcast 先拿 26.623.42026, RSS 后 enrich.
    // 没有该 flag 时行为不变 (默认 false, 走原 stop 逻辑).
    const enrichOnly = detCfg.enrich_only === true;
    const Det = makeDetector(detCfg);
    if (!Det) {
      trace.push({ det: detCfg.type, ms: 0, error: "unknown detector type" });
      continue;
    }
    const key = breakerKey(detCfg);
    const storedBreaker = stored[key];
    const breaker = storedBreaker
      ? cbStorage.hydrate(storedBreaker)
      : createBreaker({ key });
    const now = breaker._now();
    if (!shouldAllow(breaker, now)) {
      trace.push({
        det: detCfg.type,
        ms: 0,
        skipped: "circuit_open",
        breakerState: "open",
      });
      continue;
    }
    const probe = transitionAfterProbe(breaker, now);
    const ctx = new DetectContext({
      appCfg,
      arch,
      http,
      logger,
      detCfg,
      platform: currentPlatform,
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
      const next = recordSuccess(probe, now);
      await cbStorage.upsertBreaker(key, cbStorage.snapshot(next));
      trace.push({
        det: detCfg.type,
        ms,
        version: result.version,
        confidence: result.confidence,
        note: result.note,
      });
      // C9 enrich_only: 不参与版本号竞争. 把 result 当作 firstHit "base",
      // 缓存到 firstHit 占位 (后续 detector 拿到 version 时把版本号 / source
      // / confidence 覆盖, 但保留这个 base 的 changelog 字段).
      // 适用场景: e.g. Codex 配 [rss_changelog, sparkle_appcast] —
      // rss 跑 (拿 markdown) → 缓存到 firstHit; sparkle 跑 (拿版本号)
      // → 走 stop 路径, 但用 mergeFirstHit 把 rss 的 changelog 字段带过去.
      if (enrichOnly) {
        if (!firstHit) firstHit = { result, trace };
        continue;
      }
      if (result.version && result.confidence !== "low") {
        const finalResult = firstHit
          ? mergeEnrich(firstHit.result, result)
          : result;
        if (isIncremental) {
          return {
            result: finalResult,
            trace,
            stoppedAt: detCfg.type,
            incremental: { skippedCount: detectors.length - detectorLimit },
          };
        }
        return { result: finalResult, trace, stoppedAt: detCfg.type };
      }
      if (!firstHit && result.version) firstHit = { result, trace };
    } else {
      const next = recordFailure(probe, now);
      await cbStorage.upsertBreaker(key, cbStorage.snapshot(next));
      trace.push({ det: detCfg.type, ms, error, breakerState: next.state });
    }
  }
  const out = {
    result: firstHit ? firstHit.result : null,
    trace,
    stoppedAt: null,
  };
  if (isIncremental) {
    out.incremental = {
      skippedCount: detectors.length - detectorLimit,
    };
  }
  return out;
}

/**
 * C9 (2026-06-28): 合并 enrich_only detector 的 result 到 winner result.
 * winner (主 detector 拿到 version) 字段优先, base (enrich_only 拿到
 * changelog markdown) 仅在 winner 字段为空时填空. 跟 workbuddy 调 detector
 * 顺序的解法 (排 html_changelog 第一) 不同, 这里允许两个 detector 各自
 * 拿不同字段然后合并.
 */
function mergeEnrich(base, winner) {
  if (!base) return winner;
  if (!winner) return base;
  return {
    version: winner.version || base.version,
    source: winner.source,
    confidence: winner.confidence,
    note: winner.note,
    track_id: winner.track_id,
    raw: winner.raw,
    changelog: winner.changelog || base.changelog,
    changelog_url: winner.changelog_url || base.changelog_url,
    release_url: winner.release_url || base.release_url,
    changelog_format: winner.changelog_format || base.changelog_format,
  };
}

module.exports = { makeDetector, runDetectorChain, compareVersions };
