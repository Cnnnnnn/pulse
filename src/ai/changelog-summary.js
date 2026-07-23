/**
 * src/ai/changelog-summary.js
 *
 * A1 — changelog 智能摘要: 多源 release notes → LLM 抽「最重要的 3 件事」.
 */

const crypto = require("crypto");
const { chatCompletion } = require("./shared-llm");
const { resolvePrompt } = require("./prompt-registry");
const stateStore = require("../main/state-store.ts");

function summaryCacheKey(appName, latestVersion) {
  return `${appName}::${latestVersion || ""}`;
}

function changelogExcerpt(changelog, limit = 800) {
  if (!changelog || typeof changelog !== "string") return "";
  const plain = changelog
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  if (plain.length <= limit) return plain;
  return `${plain.slice(0, limit)}…`;
}

/**
 * 聚合当前 + 历史 changelog 片段 (多源交叉 v1: 同 app 多版本文本).
 * @param {object} app
 */
function collectChangelogSources(app) {
  const blocks = [];
  const cur = changelogExcerpt(app.changelog, 1000);
  if (cur) {
    blocks.push({
      label: `当前版本 ${app.latest_version || ""}`,
      text: cur,
    });
  }
  const hist = Array.isArray(app.changelog_history) ? app.changelog_history : [];
  for (const h of hist.slice(0, 3)) {
    if (!h || !h.changelog) continue;
    const ex = changelogExcerpt(h.changelog, 600);
    if (ex) {
      blocks.push({
        label: `历史 ${h.version || "?"}`,
        text: ex,
      });
    }
  }
  return blocks;
}

function buildSummaryMessages(app) {
  const prompt = resolvePrompt("changelog_summary");
  const blocks = collectChangelogSources(app);
  const userLines = [
    "请从以下 release notes 中提炼「这版本最重要的 3 件事」:",
    `应用: ${app.name}`,
    `当前安装: ${app.installed_version || "未知"}`,
    `最新版本: ${app.latest_version || "未知"}`,
    `检测来源: ${app.source || ""}`,
    "",
  ];
  if (blocks.length === 0) {
    userLines.push("(无 changelog 正文，请根据版本号保守概括)");
  } else {
    for (const b of blocks) {
      userLines.push(`--- ${b.label} ---`, b.text, "");
    }
  }
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
 */
function parseSummaryResponse(text) {
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
  const oneLiner =
    typeof parsed.oneLiner === "string" ? parsed.oneLiner.trim() : "";
  const highlights = Array.isArray(parsed.highlights)
    ? parsed.highlights
        .filter((h) => typeof h === "string" && h.trim())
        .map((h) => h.trim())
        .slice(0, 3)
    : [];
  if (!oneLiner && highlights.length === 0) return null;
  return {
    oneLiner: oneLiner || highlights[0] || "",
    highlights: highlights.length > 0 ? highlights : [oneLiner],
  };
}

function contentHash(app) {
  const blocks = collectChangelogSources(app);
  const base = [
    app.name,
    app.installed_version,
    app.latest_version,
    blocks.map((b) => `${b.label}\n${b.text}`).join("\n"),
  ].join("\n");
  return crypto.createHash("sha256").update(base).digest("hex").slice(0, 16);
}

/**
 * @param {object} opts
 * @param {string} opts.appName
 * @param {boolean} [opts.force]
 */
async function fetchChangelogSummary(opts) {
  const appName = opts && opts.appName;
  if (!appName || typeof appName !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const statePath = opts && opts.statePath;
  const state = stateStore.load(statePath);
  const app = state && state.apps && state.apps[appName];
  if (!app) return { ok: false, reason: "app_not_found" };

  const cacheKey = summaryCacheKey(appName, app.latest_version);
  const hash = contentHash(app);
  if (!opts || !opts.force) {
    const cached = stateStore.loadChangelogSummaryEntry(cacheKey, statePath);
    if (cached && cached.contentHash === hash) {
      return { ok: true, cached: true, appName, ...cached };
    }
  }

  const messages = buildSummaryMessages(app);
  const llm = await chatCompletion(messages, opts && opts.llmOpts);
  if (!llm.ok) {
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };
  }

  const parsed = parseSummaryResponse(llm.text);
  if (!parsed) return { ok: false, reason: "parse_failed" };

  const entry = {
    cacheKey,
    appName,
    latestVersion: app.latest_version || "",
    contentHash: hash,
    generatedAt: Date.now(),
    ...parsed,
  };
  stateStore.saveChangelogSummaryEntry(entry, statePath);
  return { ok: true, cached: false, ...entry };
}

module.exports = {
  summaryCacheKey,
  collectChangelogSources,
  buildSummaryMessages,
  parseSummaryResponse,
  fetchChangelogSummary,
};
