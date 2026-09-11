/**
 * src/ai/changelog-risk.ts
 *
 * 「更新风险标签」— 轻量 changelog 分类，给列表行打 badge，不用点开完整 AI 建议。
 * 与 upgrade-advice（完整「该不该升」）互补：这里只出 risk / score / tags。
 *
 * 缓存复用 upgrade_advice_cache 体系（同 key：app::version），字段 risk 子集。
 */

import { chatCompletion } from "./shared-llm";
import { resolvePrompt } from "./prompt-registry";
import crypto from "node:crypto";
const stateStore: any = require("../main/state-store.js");

/** 风险等级：score 越高越建议尽快升 */
export const RISK_LEVELS = ["security", "breaking", "mixed", "feature", "bugfix", "unknown"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_SCORE_DEFAULT: Record<RiskLevel, number> = {
  security: 90,
  breaking: 75,
  mixed: 60,
  feature: 45,
  bugfix: 20,
  unknown: 40,
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  security: "安全修复",
  breaking: "破坏性变更",
  mixed: "多项变更",
  feature: "新功能",
  bugfix: "仅修复",
  unknown: "待分类",
};

export function riskCacheKey(appName: any, latestVersion: any) {
  return `${appName}::${latestVersion || ""}`;
}

function stripHtml(s: any): string {
  if (!s || typeof s !== "string") return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function changelogExcerpt(changelog: any, limit = 2000): string {
  const plain = stripHtml(changelog);
  if (!plain) return "(无 release notes)";
  return plain.length <= limit ? plain : `${plain.slice(0, limit)}…`;
}

export function buildRiskMessages(app: any) {
  const prompt = resolvePrompt("changelog_risk");
  const userLines = [
    "请给这次 macOS 应用更新打风险标签:",
    `应用: ${app.name}`,
    `当前安装: ${app.installed_version || "未知"}`,
    `最新版本: ${app.latest_version || "未知"}`,
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

function clampScore(n: any, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function parseRiskResponse(text: any): {
  risk: RiskLevel;
  score: number;
  tags: string[];
  oneLiner: string;
} | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const risk = (RISK_LEVELS as readonly string[]).includes(parsed.risk)
    ? (parsed.risk as RiskLevel)
    : "unknown";
  const score = clampScore(parsed.score, RISK_SCORE_DEFAULT[risk]);
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .filter((t: any) => typeof t === "string" && t.trim())
        .map((t: string) => t.trim().slice(0, 24))
        .slice(0, 4)
    : [];
  const oneLiner =
    typeof parsed.oneLiner === "string" ? parsed.oneLiner.trim().slice(0, 80) : "";
  return { risk, score, tags, oneLiner };
}

function contentHash(app: any) {
  const base = [
    app.name,
    app.installed_version,
    app.latest_version,
    app.changelog || "",
  ].join("\n");
  return crypto.createHash("sha256").update(base).digest("hex").slice(0, 16);
}

/**
 * 拉风险标签。缓存 miss 或 force → 调 LLM；命中 → 直接返回。
 */
export async function fetchChangelogRisk(opts: any) {
  const appName = opts && opts.appName;
  if (!appName || typeof appName !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const statePath = opts && opts.statePath;
  const force = !!(opts && opts.force);
  const state = stateStore.load(statePath);
  const app = state && state.apps && state.apps[appName];
  if (!app) return { ok: false, reason: "app_not_found" };
  if (!app.latest_version) {
    return { ok: false, reason: "no_latest_version" };
  }

  const cacheKey = riskCacheKey(appName, app.latest_version);
  const hash = contentHash(app);
  if (!force) {
    const hit = stateStore.loadUpgradeAdviceEntry(cacheKey, statePath);
    if (
      hit &&
      hit.contentHash === hash &&
      hit.risk &&
      typeof hit.riskScore === "number"
    ) {
      return {
        ok: true,
        appName,
        latestVersion: app.latest_version,
        risk: hit.risk,
        score: hit.riskScore,
        tags: Array.isArray(hit.riskTags) ? hit.riskTags : [],
        oneLiner: hit.riskOneLiner || "",
        generatedAt: hit.generatedAt || 0,
        cached: true,
      };
    }
  }

  const llm = await chatCompletion(buildRiskMessages(app));
  if (!llm.ok) {
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };
  }

  const parsed = parseRiskResponse(llm.text);
  if (!parsed) {
    return {
      ok: false,
      reason: "parse_failed",
      raw: String(llm.text || "").slice(0, 400),
    };
  }

  const entry = {
    cacheKey,
    contentHash: hash,
    appName,
    latestVersion: app.latest_version,
    risk: parsed.risk,
    riskScore: parsed.score,
    riskTags: parsed.tags,
    riskOneLiner: parsed.oneLiner,
    generatedAt: Date.now(),
  };
  try {
    stateStore.saveUpgradeAdviceEntry(entry, statePath);
  } catch {
    /* 缓存失败不阻塞返回 */
  }

  return {
    ok: true,
    appName,
    latestVersion: app.latest_version,
    risk: parsed.risk,
    score: parsed.score,
    tags: parsed.tags,
    oneLiner: parsed.oneLiner,
    generatedAt: entry.generatedAt,
    cached: false,
  };
}
