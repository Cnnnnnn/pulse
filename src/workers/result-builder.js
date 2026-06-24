/**
 * src/workers/result-builder.js
 *
 * Detector result → IPC result 对象 + 错误信息提取.
 */

const { cleanVersion } = require("../utils/version-utils");

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
 *  - versionUnknown → "已安装版本无法读取"
 *  - 全部 detector 失败 + 没有 latest → 最后一条 error
 *  - 其它 → null
 */
function extractErrorMessage(trace, latest, versionUnknown) {
  if (versionUnknown) return "已安装版本无法读取";
  if (!trace || trace.length === 0) return null;
  for (let i = trace.length - 1; i >= 0; i--) {
    if (trace[i].error) {
      return trace[i].error;
    }
    if (trace[i].skipped === 'circuit_open') {
      return "电路熔断 · 5 分钟内重试";
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

function statusOf(versionUnknown, latest, hasUpdate, note) {
  if (versionUnknown && latest) return "no_auto_check";
  if (!latest) return "no_auto_check";
  if (hasUpdate) return "update_available";
  if (note === "incompatible") return "no_auto_check";
  return "up_to_date";
}

function buildDetectResult({
  name,
  bundle,
  appCfg,
  installed,
  versionUnknown,
  chainResult,
  changelogHistory,
  startedAt,
}) {
  const { result, trace, stoppedAt } = chainResult;
  const latest = result ? result.version : null;
  const source = result ? result.source || stoppedAt : "";
  const brewCask = extractBrewCask(appCfg);

  let note = "";
  let hasUpdate = false;
  if (versionUnknown) {
    note = "version_unknown";
  } else if (latest && installed && installed !== "未知") {
    const cmp = require("./detector-chain").compareVersions(installed, latest);
    hasUpdate = cmp.hasUpdate;
    note = cmp.note;
  }

  const status = statusOf(versionUnknown, latest, hasUpdate, note);

  return {
    name,
    installed_version: installed,
    latest_version: latest ? cleanVersion(latest) : null,
    has_update: hasUpdate,
    status,
    source,
    note,
    bundle,
    brew_cask: brewCask,
    changelog: (result && result.changelog) || "",
    changelog_url: (result && result.changelog_url) || "",
    changelog_format: (result && result.changelog_format) || "md",
    changelog_history: changelogHistory,
    release_notes_url: appCfg.release_notes_url || "",
    track_id: (result && result.track_id) || 0,
    release_url: (result && result.release_url) || "",
    error_message: extractErrorMessage(trace, latest, versionUnknown),
    trace,
    // I7: 写盘时间戳, 用于 tray 顶部摘要显示 "5m 前检测"
    ts: startedAt,
    ms: Date.now() - startedAt,
  };
}

module.exports = {
  extractBrewCask,
  extractErrorMessage,
  isChromiumVersion,
  statusOf,
  buildDetectResult,
};
