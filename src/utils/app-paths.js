/**
 * src/utils/app-paths.js
 *
 * macOS .app bundle 路径解析 — config 里 bundle 通常是裸名 (e.g. "Cursor.app").
 */

const path = require("path");

const DEFAULT_APPS_DIR = "/Applications";

/**
 * @param {string|null|undefined} bundle  裸 bundle 名或绝对路径
 * @returns {string|null}
 */
function resolveAppBundlePath(bundle) {
  if (!bundle || typeof bundle !== "string") return null;
  const trimmed = bundle.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  return `${DEFAULT_APPS_DIR}/${trimmed}`;
}

/**
 * @param {string|null|undefined} bundle
 * @param {...string} segments  e.g. 'Contents', 'Info.plist'
 * @returns {string|null}
 */
function appBundleResourcePath(bundle, ...segments) {
  const base = resolveAppBundlePath(bundle);
  if (!base) return null;
  return path.join(base, ...segments);
}

module.exports = {
  DEFAULT_APPS_DIR,
  resolveAppBundlePath,
  appBundleResourcePath,
};
