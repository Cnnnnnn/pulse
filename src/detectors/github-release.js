/**
 * src/detectors/github-release.js
 *
 * GitHub Releases API — api.github.com/repos/{owner}/{repo}/releases/latest
 * 取 tag_name (去 v 前缀). 纯 HTTP, mac/win 通用.
 *
 * 配置: { type: 'github_release', url: 'https://api.github.com/repos/{owner}/{repo}/releases/latest' }
 *
 * 适用: 发在 GitHub Releases 的 Electron app / 开源工具. Windows 端缺 app_store_lookup
 *       这种通用源, github_release 填补这个空缺 (mac 也能用).
 */

const { Detector, DetectorResult } = require('./base');
const { DetectorError, REASONS } = require('./errors');
const { truncate, assertHttpResponse } = require('./utils');

class GithubReleaseDetector extends Detector {
  static name = 'github_release';

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 8000 });
    this.url = opts.url || '';
  }

  async detect(ctx) {
    const url = this.url || ctx.url;
    if (!url) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: 'no url configured',
      });
    }

    const r = await ctx.http.get(url, {
      timeout: ctx.timeout || this.timeout,
      headers: { 'User-Agent': 'Pulse', Accept: 'application/vnd.github+json' },
    });

    assertHttpResponse(r, this.constructor.name, url);

    let data;
    try {
      data = JSON.parse(r.body);
    } catch (e) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.PARSE,
        raw: truncate(r.body),
        note: e.message,
      });
    }

    const tag =
      data && typeof data.tag_name === 'string' ? data.tag_name.trim() : '';
    if (!tag) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: data,
        note: 'tag_name field empty',
      });
    }

    // 去 v / V 前缀 (v3.7.12 → 3.7.12)
    const version = tag.replace(/^[vV]/, '');

    // release body 当 changelog (markdown 格式)
    const changelog = data && typeof data.body === 'string' ? data.body : '';

    // html_url 是 GitHub 给的天然 releases page URL, 跟 tag 绑定
    // (https://github.com/{owner}/{repo}/releases/tag/{tag_name}). 用作 release_url
    // 让 ChangelogPanel / BulkUpgrade 能 deep-link 到具体版本.
    const releaseUrl =
      data && typeof data.html_url === 'string' ? data.html_url : '';

    return new DetectorResult({
      version,
      raw: truncate(r.body, 1024),
      source: this.constructor.name,
      confidence: 'high',
      note: 'github releases latest',
      changelog,
      release_url: releaseUrl,
    });
  }
}

module.exports = { GithubReleaseDetector };
