/**
 * tests/_setup/require-main.cjs
 *
 * Phase 3 Batch 9b: load migrated main/platform modules from dist-test
 * per-file .cjs (built by build-main-ts globalSetup).
 *
 * Usage (CJS test or createRequire):
 *   const { requireMain, requirePlatform } = require("../_setup/require-main.cjs");
 *   const { getLeaderboard } = requireMain("ai-leaderboard/aggregator");
 *   const win = requirePlatform("windows");
 */
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..", "..");
const outMainDir = path.join(rootDir, "dist-test", "main", "per-file");
const outPlatformDir = path.join(rootDir, "dist-test", "platform");

function requireMain(rel) {
  const cleaned = String(rel).replace(/^\//, "").replace(/\.cjs$/, "").replace(/\.ts$/, "").replace(/\.js$/, "");
  return require(path.join(outMainDir, cleaned + ".cjs"));
}

function requirePlatform(rel) {
  const cleaned = String(rel || "index")
    .replace(/^\//, "")
    .replace(/\.cjs$/, "")
    .replace(/\.ts$/, "")
    .replace(/\.js$/, "");
  return require(path.join(outPlatformDir, cleaned + ".cjs"));
}

function mainArtifactPath(rel) {
  const cleaned = String(rel).replace(/^\//, "").replace(/\.cjs$/, "").replace(/\.ts$/, "").replace(/\.js$/, "");
  return path.join(outMainDir, cleaned + ".cjs");
}

function platformArtifactPath(rel) {
  const cleaned = String(rel || "index")
    .replace(/^\//, "")
    .replace(/\.cjs$/, "")
    .replace(/\.ts$/, "")
    .replace(/\.js$/, "");
  return path.join(outPlatformDir, cleaned + ".cjs");
}

module.exports = {
  requireMain,
  requirePlatform,
  mainArtifactPath,
  platformArtifactPath,
};
