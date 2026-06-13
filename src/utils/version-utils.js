/**
 * src/utils/version-utils.js
 *
 * 共享的版本号处理工具 — 给 detect-worker (installed 侧) 和
 * detectors/api-json (latest 侧) 共用.
 */

/**
 * cleanVersion — 规范化版本号字符串.
 *
 * 处理顺序: trim → 去引号包裹 → 去逗号 build hash → 去 v/V 前缀 → trim.
 *
 * 例:
 *   "  v1.2.3  "             → "1.2.3"
 *   "3.6.31,81fcf293"       → "3.6.31"        (brew 带 commit hash)
 *   "\"1.0\""               → "1.0"           (iTunes 偶尔带引号)
 *   "V2.0"                  → "2.0"
 *
 * 合并自原 4 处副本 (brew-formulae / brew-local-cask / app-store-lookup /
 * detect-worker), 行为是它们的并集.
 */
function cleanVersion(v) {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  // 去前后引号包裹 (iTunes / 某些 API 偶尔带)
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  // 去逗号 build hash: "3.6.31,81fcf293" → "3.6.31"
  if (s.includes(",")) s = s.split(",")[0];
  // 去 v/V 前缀
  if (s.startsWith("v") || s.startsWith("V")) s = s.slice(1);
  return s.trim() || null;
}

/**
 * stripBuildNumber — Phase 8: 4 段且末段 ≥ 1000 → 剥掉末段.
 * 用于剥离 CI build counter (如 WorkBuddy 的 5.0.2.29916712 → 5.0.2)
 * 或 RDelivery telemetry 的 appVersion (如 IMA 的 2.5.3.4392 → 2.5.3).
 *
 * 启发式:
 *  - < 4 段: 不动
 *  - 4+ 段且末段 < 1000: 不动 (看着像真实 semver)
 *  - 4+ 段且末段 ≥ 1000: 剥末段 (保守只剥一段)
 *
 * 例:
 *  - "5.0.2.29916712"  → "5.0.2"
 *  - "2.5.3.4392"      → "2.5.3"
 *  - "1.0.0.5"         → "1.0.0.5"
 *  - "1.0.10051"       → "1.0.10051"
 *  - "1.2.3.4.5000"    → "1.2.3.4"
 */
function stripBuildNumber(ver) {
  if (typeof ver !== "string") return ver;
  const parts = ver.split(".");
  if (parts.length < 4) return ver;
  const last = parseInt(parts[parts.length - 1], 10);
  if (!Number.isFinite(last) || last < 1000) return ver;
  return parts.slice(0, -1).join(".");
}

module.exports = { cleanVersion, stripBuildNumber };
