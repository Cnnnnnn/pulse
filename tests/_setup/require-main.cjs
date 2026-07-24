/**
 * tests/_setup/require-main.cjs
 *
 * Phase 3 Batch 9b: load migrated main/platform/utils/config/detectors/metals modules
 * from dist-test per-file .cjs (built by build-main-ts globalSetup).
 *
 * Usage (CJS test or createRequire):
 *   const { requireMain, requirePlatform, requireUtils, requireConfig, requireDetector, requireMetals } = require("../_setup/require-main.cjs");
 *   const { getLeaderboard } = requireMain("ai-leaderboard/aggregator");
 *   const win = requirePlatform("windows");
 *   const { cleanVersion } = requireUtils("version-utils");
 *   const category = requireConfig("category");
 *   const { Detector } = requireDetector("base");
 *   const { METALS } = requireMetals("metal-config");
 */
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..", "..");
const outMainDir = path.join(rootDir, "dist-test", "main", "per-file");
const outPlatformDir = path.join(rootDir, "dist-test", "platform");
const outUtilsDir = path.join(rootDir, "dist-test", "utils");
const outConfigDir = path.join(rootDir, "dist-test", "config");
const outDetectorsDir = path.join(rootDir, "dist-test", "detectors");
const outMetalsDir = path.join(rootDir, "dist-test", "metals");

function cleanRel(rel, fallback) {
  return String(rel || fallback || "")
    .replace(/^\//, "")
    .replace(/\.cjs$/, "")
    .replace(/\.ts$/, "")
    .replace(/\.js$/, "");
}

function requireMain(rel) {
  return require(path.join(outMainDir, cleanRel(rel) + ".cjs"));
}

function requirePlatform(rel) {
  return require(path.join(outPlatformDir, cleanRel(rel, "index") + ".cjs"));
}

function requireUtils(rel) {
  return require(path.join(outUtilsDir, cleanRel(rel) + ".cjs"));
}

function requireConfig(rel) {
  return require(path.join(outConfigDir, cleanRel(rel) + ".cjs"));
}

function requireDetector(rel) {
  return require(path.join(outDetectorsDir, cleanRel(rel) + ".cjs"));
}

function requireMetals(rel) {
  return require(path.join(outMetalsDir, cleanRel(rel) + ".cjs"));
}

function mainArtifactPath(rel) {
  return path.join(outMainDir, cleanRel(rel) + ".cjs");
}

function platformArtifactPath(rel) {
  return path.join(outPlatformDir, cleanRel(rel, "index") + ".cjs");
}

function utilsArtifactPath(rel) {
  return path.join(outUtilsDir, cleanRel(rel) + ".cjs");
}

function configArtifactPath(rel) {
  return path.join(outConfigDir, cleanRel(rel) + ".cjs");
}

function detectorArtifactPath(rel) {
  return path.join(outDetectorsDir, cleanRel(rel) + ".cjs");
}

function metalsArtifactPath(rel) {
  return path.join(outMetalsDir, cleanRel(rel) + ".cjs");
}

module.exports = {
  requireMain,
  requirePlatform,
  requireUtils,
  requireConfig,
  requireDetector,
  requireMetals,
  mainArtifactPath,
  platformArtifactPath,
  utilsArtifactPath,
  configArtifactPath,
  detectorArtifactPath,
  metalsArtifactPath,
};
