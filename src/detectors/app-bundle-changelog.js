/**
 * src/detectors/app-bundle-changelog.js
 *
 * Phase 21: 读 macOS app 自带的 changelog 文件.
 *
 * 很多 macOS app 在 .app 包内嵌 changelog / release notes:
 *   <app>/Contents/Resources/CHANGELOG.md
 *   <app>/Contents/Resources/changelog.md
 *   <app>/Contents/Resources/ReleaseNotes.md
 *   <app>/Contents/Resources/RELEASES.md
 *   <app>/Contents/Resources/HISTORY.md
 *   <app>/Contents/Resources/NEWS
 *
 * 配置: { type: 'app_bundle_changelog' } (无 url/path, 自动从 installed bundle 读)
 *
 * 策略:
 *   1. 读 app 路径 (从 appCfg.bundle 找 /Applications/<bundle>)
 *   2. 列 Resources/ 下匹配的文件, 取第一个
 *   3. 按 "## X.Y.Z" 或 "## vX.Y.Z" 切段, 取第一段 (最新)
 *   4. 如果文件没分段, 整个文件当作一个段返回
 *   5. 没找到任何 changelog 文件 → throw NO_VERSION (chain 继续到下个 detector)
 *
 * 局限: 跟 detector chain 一样, 依赖 `appCfg.bundle` 路径. 如果 app 不在 /Applications
 * 就不工作. (跟 version_sources 的 plist 路径有同样限制, 不在 Phase 21 解决.)
 */

const fs = require('fs').promises;
const path = require('path');

const { Detector, DetectorResult } = require('./base');
const { DetectorError, REASONS } = require('./errors');

const FILENAMES = [
  'CHANGELOG.md', 'changelog.md', 'CHANGELOG',
  'ReleaseNotes.md', 'RELEASE_NOTES.md', 'release-notes.md',
  'RELEASES.md', 'RELEASES',
  'HISTORY.md', 'HISTORY',
  'NEWS.md', 'NEWS',
  'WhatsNew.md', 'WHATSNEW',
];

class AppBundleChangelogDetector extends Detector {
  static name = 'app_bundle_changelog';

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 3000 });
  }

  async detect(ctx) {
    const appCfg = ctx.appCfg || {};
    const bundle = appCfg.bundle;
    if (!bundle) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: 'no bundle in appCfg',
      });
    }

    // 跟 installed version 走同样的 /Applications 约定
    const resourcesDir = path.join('/Applications', bundle, 'Contents', 'Resources');
    let foundFile = null;
    let foundPath = null;

    // 浅递归: 先查 Resources/ 根, 再查第一层子目录 (QoderWork 在 Resources/bin/)
    try {
      const topEntries = await fs.readdir(resourcesDir, { withFileTypes: true });
      const topDirs = new Set();
      for (const ent of topEntries) {
        if (ent.isFile()) {
          if (matchesName(ent.name)) { foundFile = ent.name; foundPath = path.join(resourcesDir, ent.name); break; }
        } else if (ent.isDirectory()) {
          topDirs.add(ent.name);
        }
      }
      if (!foundFile) {
        for (const dir of topDirs) {
          try {
            const sub = await fs.readdir(path.join(resourcesDir, dir), { withFileTypes: true });
            for (const ent of sub) {
              if (ent.isFile() && matchesName(ent.name)) {
                foundFile = `${dir}/${ent.name}`;
                foundPath = path.join(resourcesDir, dir, ent.name);
                break;
              }
            }
            if (foundFile) break;
          } catch { /* 跳过无权限子目录 */ }
        }
      }
    } catch (err) {
      // Resources 目录不存在/无权限 → 跳到下个 detector
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: `resources dir missing: ${err.code || err.message}`,
      });
    }

    if (!foundFile || !foundPath) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: 'no changelog file in Resources/ (or subdirs)',
      });
    }

    const fullPath = foundPath;
    let content;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch (err) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: `readFile failed: ${err.code || err.message}`,
      });
    }

    // 切段, 取第一段 (最新)
    const section = extractFirstSection(content);

    return new DetectorResult({
      version: (ctx.appCfg && appCfg.__detectVersion) || '',  // 不参与 version 比较
      raw: { path: fullPath, totalLength: content.length, sectionLength: section.length },
      source: this.constructor.name,
      confidence: 'high',
      note: `app bundle changelog (${foundFile})`,
      changelog: section,
      changelog_url: '',  // 没有 remote URL
      changelog_format: 'md',
    });
  }
}

function matchesName(filename) {
  const lower = filename.toLowerCase();
  return FILENAMES.some((want) => want.toLowerCase() === lower);
}

/**
 * 按 ## 或 # 切 markdown, 取第一段.
 * 如果没有 heading, 整个 content 作为一个段.
 * 段间分隔: /^#{1,3}\s+/
 */
function extractFirstSection(content) {
  if (!content) return '';
  // 找第一个 heading 之后到下一个 heading 之间的内容
  const lines = content.split(/\r?\n/);
  let inSection = false;
  let collected = [];
  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      if (inSection) break;  // 遇到第二个 heading → 段结束
      inSection = true;     // 第一个 heading → 进入段
      continue;              // heading 行本身不要
    }
    if (inSection) collected.push(line);
  }
  if (collected.length > 0) return collected.join('\n').trim();
  // 没找到任何 heading → 整个文件
  return content.trim();
}

module.exports = { AppBundleChangelogDetector, extractFirstSection };
