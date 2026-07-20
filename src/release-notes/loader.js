/**
 * src/release-notes/loader.js
 *
 * ON: 读 release notes md + slides.json 的纯函数.
 * 任何失败 (缺文件 / parse 错 / schema 错) 都返回 null + log warn,
 * 永远不抛错 (main 端 handler 靠 null 判定优雅退化).
 *
 * 路径:
 *   versions/<version>.md                        (仓库根 versions/ 文件夹, v2.50 起)
 *   versions/<version>/slides.json               (v2.31.1 起, 统一归入 versions/)
 *
 * __setTestOverrides 让测试可以注入 mock repoRoot (主进程测试时, 仓库根可能不是 __dirname 解析的目标).
 */

const fs = require("fs");
const path = require("path");
const { createLogger } = require("../main/log.js");

const log = createLogger("release-notes-loader");

let __testRepoRoot = null;

function __setTestRepoRoot(repoRoot) {
  __testRepoRoot = repoRoot;
}

function __resetTestRepoRoot() {
  __testRepoRoot = null;
}

function resolveRepoRoot() {
  if (__testRepoRoot) return __testRepoRoot;
  // ponytail: dev 走 __dirname 解析更可靠 (cwd 在 prod asar 启动时是用户家目录).
  // 找不到时回退 cwd — prod asar 仍会找不到, 留给打包脚本专门处理 (e.g. process.resourcesPath).
  const fromDirname = path.resolve(__dirname, "..", "..");
  if (fs.existsSync(path.join(fromDirname, "versions"))) return fromDirname;
  return process.cwd();
}

/**
 * @param {string} version semver string
 * @returns {string|null} md 内容, 或 null (缺/错)
 */
function readReleaseNotes(version) {
  if (typeof version !== "string" || !version) return null;
  const file = path.join(resolveRepoRoot(), "versions", `${version}.md`);
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, "utf8");
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
  if (typeof version !== "string" || !version) return null;
  const file = path.join(
    resolveRepoRoot(),
    "versions",
    version,
    "slides.json",
  );
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.version !== "string") return null;
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
  __setTestRepoRoot,
  __resetTestRepoRoot,
};
