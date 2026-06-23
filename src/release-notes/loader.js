/**
 * src/release-notes/loader.js
 *
 * ON: 读 release notes md + slides.json 的纯函数.
 * 任何失败 (缺文件 / parse 错 / schema 错) 都返回 null + log warn,
 * 永远不抛错 (main 端 handler 靠 null 判定优雅退化).
 *
 * 路径:
 *   .release-notes-<version>.md                   (仓库根, 跟现有惯例)
 *   src/release-notes-content/<version>/slides.json
 *
 * __testOverrides 让测试可以注入 mock path (主进程测试时, 仓库根可能不是 cwd).
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../main/log.js');

const log = createLogger('release-notes-loader');

let __testOverrides = null;

function __setTestOverrides(overrides) {
  __testOverrides = overrides;
}

function __resetTestOverrides() {
  __testOverrides = null;
}

function resolveRepoRoot() {
  return __testOverrides && __testOverrides.repoRoot
    ? __testOverrides.repoRoot
    : process.cwd();
}

function resolveContentRoot() {
  return __testOverrides && __testOverrides.contentRoot
    ? __testOverrides.contentRoot
    : path.join(resolveRepoRoot(), 'src', 'release-notes-content');
}

/**
 * @param {string} version semver string
 * @returns {string|null} md 内容, 或 null (缺/错)
 */
function readReleaseNotes(version) {
  if (typeof version !== 'string' || !version) return null;
  const file = path.join(resolveRepoRoot(), `.release-notes-${version}.md`);
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    log.warn(`readReleaseNotes(${version}) failed:`, err.message);
    return null;
  }
}

/**
 * @param {string} version
 * @returns {{version: string, slides: Array}|null}
 */
function readSlides(version) {
  if (typeof version !== 'string' || !version) return null;
  const file = path.join(resolveContentRoot(), version, 'slides.json');
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.version !== 'string') return null;
    if (!Array.isArray(parsed.slides)) return null;
    if (parsed.slides.length === 0) return null;
    return parsed;
  } catch (err) {
    log.warn(`readSlides(${version}) failed:`, err.message);
    return null;
  }
}

module.exports = {
  readReleaseNotes,
  readSlides,
  __setTestOverrides,
  __resetTestOverrides,
};
