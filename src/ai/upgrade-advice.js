/**
 * src/ai/upgrade-advice.js
 *
 * A2 — 「该不该升」AI 建议. JSON schema 约束输出 + 按 app+version 缓存.
 */

const crypto = require("crypto");
const { chatCompletion } = require("./shared-llm");
const { resolvePrompt } = require("./prompt-registry");
const stateStore = require("../main/state-store.js");

const VALID_RECOMMENDATIONS = ["upgrade", "wait", "skip"];
const VALID_CONFIDENCE = ["high", "medium", "low"];

function adviceCacheKey(appName, latestVersion) {
  return `${appName}::${latestVersion || ""}`;
}

function usageTierLabel(lastMs, now = Date.now()) {
  if (lastMs == null || typeof lastMs !== "number")
    return "unknown（未使用记录）";
  const ageDays = (now - lastMs) / 86400_000;
  if (ageDays <= 7) return "hot（近 7 天常用）";
  if (ageDays <= 30) return "warm（7–30 天未开）";
  return "cold（30 天以上未开）";
}

function changelogExcerpt(changelog, limit = 1200) {
  if (!changelog || typeof changelog !== "string") return "(无 release notes)";
  const plain = changelog
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= limit) return plain;
  return `${plain.slice(0, limit)}…`;
}

/**
 * @param {object} app  state.apps[name] 或 detect result
 * @param {object|null} lastOpened  { ms, source }
 */
function buildAdviceMessages(app, lastOpened) {
  const prompt = resolvePrompt("upgrade_advice");
  const tier = usageTierLabel(lastOpened && lastOpened.ms);
  const userLines = [
    "请判断用户是否该升级此 macOS 应用:",
    `应用: ${app.name}`,
    `当前安装: ${app.installed_version || "未知"}`,
    `最新版本: ${app.latest_version || "未知"}`,
    `检测来源: ${app.source || ""}`,
    `使用频次: ${tier}`,
    "",
    "Release notes / changelog:",
    changelogExcerpt(app.changelog),
  ];
  if (prompt.fewShot && prompt.fewShot.trim()) {
    userLines.unshift(`【参考示例】\n${prompt.fewShot.trim()}\n`);
  }
  return [
    { role: "system", content: `${prompt.system}\n${prompt.rules}` },
    { role: "user", content: userLines.join("\n") },
  ];
}

/**
 * @param {string} text
 * @returns {object|null}
 */
function parseAdviceResponse(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed.recommendation;
  const conf = parsed.confidence;
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!VALID_RECOMMENDATIONS.includes(rec) || !summary) return null;
  const confidence = VALID_CONFIDENCE.includes(conf) ? conf : "medium";
  const reasons = Array.isArray(parsed.reasons)
    ? parsed.reasons
        .filter((r) => typeof r === "string" && r.trim())
        .slice(0, 4)
    : [];
  return { recommendation: rec, confidence, summary, reasons };
}

function contentHash(app) {
  const base = [
    app.name,
    app.installed_version,
    app.latest_version,
    app.changelog || "",
  ].join("\n");
  return crypto.createHash("sha256").update(base).digest("hex").slice(0, 16);
}

/**
 * @param {object} opts
 * @param {string} opts.appName
 * @param {boolean} [opts.force]
 * @param {string} [opts.statePath]
 */
async function fetchUpgradeAdvice(opts) {
  const appName = opts && opts.appName;
  if (!appName || typeof appName !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const statePath = opts && opts.statePath;
  const state = stateStore.load(statePath);
  const app = state && state.apps && state.apps[appName];
  if (!app) return { ok: false, reason: "app_not_found" };
  if (!app.has_update) return { ok: false, reason: "no_update" };

  const cacheKey = adviceCacheKey(appName, app.latest_version);
  const hash = contentHash(app);
  if (!opts || !opts.force) {
    const cached = stateStore.loadUpgradeAdviceEntry(cacheKey, statePath);
    if (cached && cached.contentHash === hash) {
      return { ok: true, cached: true, appName, ...cached };
    }
  }

  const lastOpenedMap = stateStore.loadLastOpened(statePath);
  const lastOpened = lastOpenedMap && lastOpenedMap[appName];
  const messages = buildAdviceMessages(app, lastOpened);
  const llm = await chatCompletion(messages, opts && opts.llmOpts);
  if (!llm.ok)
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };

  const parsed = parseAdviceResponse(llm.text);
  if (!parsed) return { ok: false, reason: "parse_failed" };

  const entry = {
    cacheKey,
    appName,
    latestVersion: app.latest_version || "",
    contentHash: hash,
    generatedAt: Date.now(),
    ...parsed,
  };
  stateStore.saveUpgradeAdviceEntry(entry, statePath);
  return { ok: true, cached: false, ...entry };
}

module.exports = {
  VALID_RECOMMENDATIONS,
  adviceCacheKey,
  usageTierLabel,
  buildAdviceMessages,
  parseAdviceResponse,
  fetchUpgradeAdvice,
};
