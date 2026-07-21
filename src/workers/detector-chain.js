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

/**
 * 拆出 pre-release 后缀: "5.2.6-rc1" → { core: "5.2.6", pre: "rc1" }.
 * 无后缀 → { core, pre: null }. 只切第一个 "-", 保留 build 号里的 ".".
 */
function splitPrerelease(v) {
  if (!v) return { core: "", pre: null };
  const s = String(v);
  const idx = s.indexOf("-");
  if (idx === -1) return { core: s, pre: null };
  return { core: s.slice(0, idx), pre: s.slice(idx + 1) };
}

/**
 * pre-release 排序权重: alpha < beta/pre < rc < release(无后缀).
 * 未知标识给中间权重, 数字后缀用于同级精确比较 (beta.2 > beta.1).
 */
const PRE_RANK = { alpha: 0, a: 0, beta: 1, b: 1, pre: 1, preview: 1, rc: 2, c: 2 };
function parsePre(pre) {
  if (!pre) return { rank: 99, num: 0 }; // release 视为最"新"
  const nameMatch = String(pre).match(/^[a-zA-Z]+/);
  const name = nameMatch ? nameMatch[0].toLowerCase() : "";
  const rank = PRE_RANK[name] !== undefined ? PRE_RANK[name] : 50;
  const numMatch = String(pre).match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : 0;
  return { rank, num };
}

/** 比较 pre-release: 返回 -1 (a 更早/更小) / 0 / 1 (a 更新/更大). */
function comparePre(pi, pl) {
  const a = parsePre(pi);
  const b = parsePre(pl);
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  if (a.num !== b.num) return a.num < b.num ? -1 : 1;
  return 0;
}

/**
 * 仅比版本号主体 (core), 保留原 4 段 build 号归一逻辑. 返回 -1/0/1.
 * 与旧 compareVersions 的逐段 + build 归一行为完全一致.
 */
function compareCores(ic, lc) {
  const si = String(ic).split(".").map((s) => parseInt(s, 10) || 0);
  const sl = String(lc).split(".").map((s) => parseInt(s, 10) || 0);

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
      if (insBase[i] !== latBase[i]) return insBase[i] < latBase[i] ? -1 : 1;
    }
    if (insBuild !== latBuild) return insBuild < latBuild ? -1 : 1;
    return 0;
  }

  const maxLen = Math.max(si.length, sl.length);
  for (let i = 0; i < maxLen; i++) {
    const a = si[i] || 0;
    const b = sl[i] || 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

function compareVersions(installed, latest) {
  const ins = cleanVersion(installed);
  const lat = cleanVersion(latest);
  if (ins === lat) return { hasUpdate: false, note: "" };

  const { core: ic, pre: ip } = splitPrerelease(ins);
  const { core: lc, pre: lp } = splitPrerelease(lat);

  // 先比主体 (含 build 号归一); 主体不同即可定论
  const coreCmp = compareCores(ic, lc);
  if (coreCmp !== 0) {
    return coreCmp < 0
      ? { hasUpdate: true, note: "" }
      : { hasUpdate: false, note: "installed_newer" };
  }

  // 主体相等 → 比 pre-release: 更"早"的预发布标识 = 更小版本
  // 例: 5.2.6-beta < 5.2.6-rc1 < 5.2.6 (release)
  const preCmp = comparePre(ip, lp);
  if (preCmp === 0) return { hasUpdate: false, note: "" };
  return preCmp < 0
    ? { hasUpdate: true, note: "" }
    : { hasUpdate: false, note: "installed_newer" };
}

/**
 * C5: 增量模式决策 — app 名在 appCfg 上, ts 在 incremental.appsLastChecked[name].
 * 返 detectorLimit (跑前 N 个) + isIncremental 标志.
 */
function resolveDetectorLimit(detectors, incremental, appCfg) {
  if (!incremental || typeof incremental !== "object") {
    return { detectorLimit: detectors.length, isIncremental: false };
  }
  const name = (appCfg && appCfg.name) || "";
  const appTs =
    incremental.appsLastChecked && name ? incremental.appsLastChecked[name] : null;
  const decision = decideIncremental({
    detectors,
    appTs,
    recentDays: incremental.recentDays || 7,
    now: Date.now(),
  });
  return { detectorLimit: decision.maxIndex, isIncremental: decision.useIncremental };
}

/**
 * 执行单个 detector: detect + breaker 记录 + trace push.
 *
 * @param {object} detCfg
 * @param {object} ctx - 已构造好的 DetectContext
 * @param {object} stored - 全部 stored breakers (key→snapshot)
 * @returns {Promise<{detCfg, result, error, ms, traceEntry}>}
 *   traceEntry 为 push 到 trace 的对象 (可能含 skipped/error/version 信息).
 *   当 detector 被 circuit_open / unknown type 跳过时, result=null 且按
 *   traceEntry.skipped 记录; detect 抛错时 error 有值.
 */
/**
 * @param {object} detCfg
 * @param {object} ctx - 已构造好的 DetectContext
 * @param {object} stored - 全部 stored breakers (key→snapshot)
 * @param {boolean} [force=false]  手动刷新时绕过熔断冷却, 强制跑一次.
 */
async function runOneDetector(detCfg, ctx, stored, force = false) {
  // C9 (2026-06-28): enrich_only detector 不参与版本号竞争, 拿到 result
  // 后**继续**跑后续 detector, 不 stop chain. 仅当 chain 已拿到 version
  // 时, 用该 detector 返的 changelog/changelog_url/release_url 等字段
  // 填到 result 上 (若尚为空). 适用: e.g. Codex RSS 拿 markdown 内容但
  // 拿不到版本号 — 让 sparkle_appcast 先拿 26.623.42026, RSS 后 enrich.
  // 没有该 flag 时行为不变 (默认 false, 走原 stop 逻辑).
  const enrichOnly = detCfg.enrich_only === true;
  const Det = makeDetector(detCfg);
  if (!Det) {
    return {
      result: null,
      error: null,
      ms: 0,
      enrichOnly,
      traceEntry: { det: detCfg.type, ms: 0, error: "unknown detector type" },
    };
  }
  const key = breakerKey(detCfg);
  const storedBreaker = stored[key];
  const breaker = storedBreaker
    ? cbStorage.hydrate(storedBreaker)
    : createBreaker({ key });
  const now = breaker._now();
  const openBefore = breaker.state === "open";
  // 该源上次成功时间 (来自持久化的 breaker.lastSuccessAt). 用于 enrich_fallback
  // 时向用户透出"权威源上次成功拿到版本"是多久以前.
  const prevSuccessAt =
    typeof breaker.lastSuccessAt === "number" ? breaker.lastSuccessAt : 0;
  if (!shouldAllow(breaker, now, force)) {
    return {
      result: null,
      error: null,
      ms: 0,
      enrichOnly,
      breakerLastSuccessAt: prevSuccessAt,
      traceEntry: {
        det: detCfg.type,
        ms: 0,
        skipped: "circuit_open",
        breakerState: "open",
        breakerOpenUntil: breaker.openUntil,
        note: breaker.openUntil
          ? `circuit_open until ${new Date(breaker.openUntil).toISOString()}`
          : "circuit_open",
      },
    };
  }
  const probe = transitionAfterProbe(breaker, now);
  const t0 = Date.now();
  let result = null;
  let error = null;
  try {
    result = await Det.detect(ctx);
  } catch (err) {
    error = err && err.message ? err.message : String(err);
  }
  const ms = Date.now() - t0;
  // force 且原本处于 open 冷却 → 本次是"强制重试", 打标记便于排查 (自愈/失败
  // 仍走正常 recordSuccess/recordFailure).
  const forced = !!force && openBefore;
  if (result) {
    const next = recordSuccess(probe, now);
    await cbStorage.upsertBreaker(key, cbStorage.snapshot(next));
    return {
      result,
      error: null,
      ms,
      enrichOnly,
      breakerLastSuccessAt: now, // 本次成功 → 最新成功时间即 now
      traceEntry: {
        det: detCfg.type,
        ms,
        version: result.version,
        confidence: result.confidence,
        note: result.note,
        ...(forced ? { forced: true } : {}),
      },
    };
  }
  const next = recordFailure(probe, now);
  await cbStorage.upsertBreaker(key, cbStorage.snapshot(next));
  return {
    result: null,
    error,
    ms,
    enrichOnly,
    breakerLastSuccessAt: prevSuccessAt, // 本次失败 → 沿用上次成功时间
    traceEntry: {
      det: detCfg.type,
      ms,
      error,
      breakerState: next.state,
      ...(forced ? { forced: true } : {}),
    },
  };
}

async function runDetectorChain(appCfg, deps) {
  const { arch, http, logger, platform, incremental, forceRefresh } = deps;
  // forceRefresh 由检测链上游透传 (手动刷新路径为 true), 单 app 内所有
  // detector 共享 — 即"手动刷新时绕过熔断冷却强制重试权威源一次".
  const currentPlatform = platform || process.platform;
  const detectors = Array.isArray(appCfg.detectors) ? appCfg.detectors : [];
  const trace = [];
  let firstHit = null;
  // 多源版本候选: 收集链上所有返回了 version 的 detector 结果 (含 enrich_only),
  // 用于"多源共同探寻, 取最新版本". 这样:
  //   1) api_json 等权威源成功时, 即便 enrich_only 的 changelog 页滞后
  //      (停在旧版), 也以权威源的最新版本为准;
  //   2) 权威源全部失败时, 退化到 enrich_only 版本但打 _enrichFallback 标记
  //      (降级置信度), 避免把滞后的 changelog 版本当成"最新"误导用户.
  const versionCandidates = [];
  // 权威 (非 enrich) 源上次成功拿到版本的时间 (跨源取最大值). enrich_fallback
  // 时透出给 UI: "权威源上次成功 · X 前".
  let authoritativeLastSuccessAt = 0;
  const stored = await cbStorage.loadBreakers();
  const { detectorLimit, isIncremental } = resolveDetectorLimit(
    detectors,
    incremental,
    appCfg,
  );

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

    const ctx = new DetectContext({
      appCfg,
      arch,
      http,
      logger,
      detCfg,
      platform: currentPlatform,
    });
    const outcome = await runOneDetector(detCfg, ctx, stored, forceRefresh);
    trace.push(outcome.traceEntry);
    const { result, enrichOnly } = outcome;
    // 跨源累计权威源的上次成功时间 (含本次失败沿用的历史值). enrich_only 源
    // 不算权威, 不纳入.
    if (!enrichOnly && typeof outcome.breakerLastSuccessAt === "number") {
      authoritativeLastSuccessAt = Math.max(
        authoritativeLastSuccessAt,
        outcome.breakerLastSuccessAt,
      );
    }
    if (!result) continue;

    // 收集版本候选 (enrich_only 也纳入, 多源取最新)
    if (result.version) {
      versionCandidates.push({
        version: result.version,
        source: result.source,
        confidence: result.confidence,
        isEnrich: enrichOnly,
        result,
      });
    }

    // C9 enrich_only: 不参与版本号竞争, 仅缓存作 changelog 富集 base.
    if (enrichOnly) {
      if (!firstHit) firstHit = { result, trace };
      continue;
    }

    // 非 enrich 权威源命中: 收集候选后用多源取最新 (赢家可能是更早的
    // enrich_only 候选, 若它版本更高). 为保持性能与历史行为, 首个非 enrich
    // 命中即 stop (后续 detector 不再跑 — enrich_only 必须排在前面才有意义).
    if (result.version && result.confidence !== "low") {
      const finalResult = pickLatestVersion(
        versionCandidates,
        firstHit,
        authoritativeLastSuccessAt,
      );
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
  }
  const finalResult = pickLatestVersion(
    versionCandidates,
    firstHit,
    authoritativeLastSuccessAt,
  );
  const out = {
    result: finalResult,
    trace,
    stoppedAt: finalResult && finalResult._wonFrom ? finalResult._wonFrom : null,
  };
  if (isIncremental) {
    out.incremental = {
      skippedCount: detectors.length - detectorLimit,
    };
  }
  return out;
}

/**
 * 版本号倒序比较 (cleanVersion 后比主体 + pre-release). 返回 1 (a>b) / -1 (a<b) / 0.
 * 用于多源候选排序, 与 compareVersions 的排序语义一致 (含 pre-release).
 */
function versionCompareDesc(a, b) {
  const ca = cleanVersion(a) || "";
  const cb = cleanVersion(b) || "";
  if (ca === cb) return 0;
  const { core: ic, pre: ip } = splitPrerelease(ca);
  const { core: lc, pre: lp } = splitPrerelease(cb);
  const coreCmp = compareCores(ic, lc);
  if (coreCmp !== 0) return coreCmp > 0 ? -1 : 1; // 降序: 大者在前
  const preCmp = comparePre(ip, lp);
  return preCmp > 0 ? -1 : 1;
}

/**
 * 多源共同探寻: 在所有版本候选里取最新版本, 并把 enrich_only 拿到的
 * changelog 字段合并进来.
 *
 * 边界:
 *  - 无候选: 退回 firstHit (enrich_only 单独跑, 无版本) 或 null.
 *  - 最高版本来自 enrich_only (说明所有权威源都失败): 降级 confidence=low
 *    并打 _enrichFallback 标记, 让 result-builder / UI 显示"更新源异常,
 *    版本仅供参考"而非误导性的"预发布版本".
 */
function pickLatestVersion(candidates, firstHit, authoritativeLastSuccessAt) {
  if (!candidates.length) {
    return firstHit ? firstHit.result : null;
  }
  const sorted = [...candidates].sort((a, b) =>
    versionCompareDesc(a.version, b.version),
  );
  const top = sorted[0];
  const base = firstHit ? firstHit.result : null;

  // changelog 归属版本: 优先用权威源 (top) 自带 changelog, 其归属版本即
  // top.version; 否则用 enrich_only 源 (base) 的 changelog, 归属版本是
  // base.version —— 可能与展示版本 top.version 不同 (官方 changelog 页滞后于
  // API). 透出 changelog_source_version, 让 UI 标注"这是 X.Y.Z 的更新日志",
  // 避免被误读为展示版本的日志 (修复 "5.2.6 显示 5.2.3 更新日志" 的错位).
  const topHasChangelog = !!(top.result && top.result.changelog);
  const merged = {
    version: top.version,
    source: top.source,
    confidence: top.confidence,
    note: top.result.note || top.source,
    track_id: top.result.track_id,
    raw: top.result.raw,
    changelog: top.result.changelog || (base && base.changelog) || "",
    changelog_url:
      (topHasChangelog ? top.result.changelog_url : (base && base.changelog_url)) || "",
    release_url: top.result.release_url || (base && base.release_url) || "",
    changelog_format:
      (topHasChangelog ? top.result.changelog_format : (base && base.changelog_format)) ||
      "md",
    changelog_source_version: topHasChangelog
      ? top.version
      : (base && base.version) || "",
  };

  if (top.isEnrich) {
    // 仅当所有权威 (非 enrich) 源都失败、唯一版本来自 enrich_only 时才降级.
    // 若至少存在一个非 enrich 候选 (哪怕版本号较低), 不算 fallback — 此时
    // 取到的更高版本可能是 changelog 已更新而 API 尚未同步, 仍属有效信息.
    const hasAuthoritative = candidates.some((c) => !c.isEnrich);
    if (!hasAuthoritative) {
      merged.confidence = "low";
      merged.note = "enrich_fallback";
      merged._enrichFallback = true;
      // 透出权威源上次成功时间 (>0 才有意义; 0 = 从未成功过).
      if (authoritativeLastSuccessAt > 0) {
        merged.authoritative_last_success_at = authoritativeLastSuccessAt;
      }
    }
  }
  merged._wonFrom = top.source;
  return merged;
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
