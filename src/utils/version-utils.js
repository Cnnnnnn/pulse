/**
 * src/utils/version-utils.js
 *
 * 共享的版本号处理工具 — 给 detect-worker (installed 侧) 和
 * detectors/api-json (latest 侧) 共用.
 */

/**
 * cleanVersion — 去掉 'v' 前缀和首尾空白.
 * "  v1.2.3  " → "1.2.3"
 */
function cleanVersion(v) {
  if (v == null) return null;
  let s = String(v);
  if (s.startsWith('v') || s.startsWith('V')) s = s.slice(1);
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
  if (typeof ver !== 'string') return ver;
  const parts = ver.split('.');
  if (parts.length < 4) return ver;
  const last = parseInt(parts[parts.length - 1], 10);
  if (!Number.isFinite(last) || last < 1000) return ver;
  return parts.slice(0, -1).join('.');
}

module.exports = { cleanVersion, stripBuildNumber };
