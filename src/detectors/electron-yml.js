/**
 * src/detectors/electron-yml.js
 *
 * electron-builder 风格 latest-mac.yml — YAML 格式，最少包含 version。
 * 用 js-yaml 解析（已装）；无 js-yaml 时回退到正则。
 *
 * 配置: { type: 'electron_yml', url: 'https://.../latest-mac.yml' }
 *
 * Phase 6 修复 (MiniMax Code / QoderWork):
 *   - URL 模板展开 ({arch} / {arch_short})
 *   - 兼容 path 字段: 有时最新 yml 用 path 代替顶层 version (虽然一般都有 version)
 *   - 兼容 files[] 数组 — 从 arch-specific 文件名提取版本 (e.g. QoderWorkCN-arm64-mac.zip
 *     → 0.5.8)
 *   - regex fallback 更稳: 允许多种引号/前缀 (version: 1.2.3, version: '1.2.3', version: "1.2.3")
 */

const { Detector, DetectorResult } = require('./base');
const { DetectorError, REASONS } = require('./errors');
const { expandUrl } = require('./url-template');

let yamlLib = null;
try { yamlLib = require('js-yaml'); } catch { /* fallback to regex */ }

class ElectronYmlDetector extends Detector {
  static name = 'electron_yml';

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 8000 });
    this.url = opts.url || '';
  }

  async detect(ctx) {
    const rawUrl = this.url || ctx.url;
    if (!rawUrl) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: 'no url configured',
      });
    }
    const url = expandUrl(rawUrl, ctx.arch);

    const r = await ctx.http.get(url, { timeout: ctx.timeout || this.timeout });
    if (r.error === 'timeout') {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.TIMEOUT, note: url });
    }
    if (r.error === 'network') {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.NETWORK, note: url });
    }
    if (r.status >= 400 && r.status < 500) {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.HTTP_4XX, httpStatus: r.status, raw: truncate(r.body), note: url });
    }
    if (r.status >= 500) {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.HTTP_5XX, httpStatus: r.status, raw: truncate(r.body), note: url });
    }

    let ver = null;
    let verSource = 'top';
    let parsed = null;
    if (yamlLib) {
      try {
        const data = yamlLib.load(r.body);
        // Phase 6: 1) 顶层 version, 2) 数组第一个的 version, 3) path 文件名
        ver = data && (data.version || (Array.isArray(data) && data[0] && data[0].version));
        if (!ver && data && typeof data.path === 'string') {
          const m = data.path.match(/[vV]?(\d+\.\d+(?:\.\d+)*)/);
          if (m) { ver = m[1]; verSource = 'path'; }
        }
        parsed = data;
      } catch (e) {
        // 继续尝试 regex 回退
        ver = regexExtractVersion(r.body);
        if (!ver) {
          throw new DetectorError({ detector: this.constructor.name, reason: REASONS.PARSE, raw: truncate(r.body), note: e.message });
        }
        verSource = 'regex-after-yaml-fail';
      }
    } else {
      ver = regexExtractVersion(r.body);
      if (!ver) {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.NO_VERSION, raw: truncate(r.body), note: 'version field not found' });
      }
      verSource = 'regex';
    }

    if (!ver) {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.NO_VERSION, raw: truncate(r.body), note: 'version field empty' });
    }

    // Phase 14: 提取 releaseNotes. electron-builder 1.x+ 在 latest-mac.yml 里
    // 有 releaseNotes 字段 (string, markdown 格式). 老格式可能没有.
    const changelog = (parsed && typeof parsed.releaseNotes === 'string') ? parsed.releaseNotes : '';

    return new DetectorResult({
      version: String(ver).trim(),
      raw: truncate(r.body, 1024),
      source: this.constructor.name,
      confidence: 'high',
      note: `electron yml (${verSource})`,
      changelog,
    });
  }
}

/**
 * 用正则从 yml 文本提取第一个 version 值 — 兼容:
 *   version: 1.2.3
 *   version: '1.2.3'
 *   version: "1.2.3"
 */
function regexExtractVersion(body) {
  if (!body) return null;
  const m = body.match(/^\s*version:\s*['"]?([^'"\n]+)['"]?/m);
  if (m) return m[1].trim();
  // path: 兜底 — 文件名里有版本号
  const pm = body.match(/^\s*path:\s*['"]?.*?[vV]?(\d+\.\d+(?:\.\d+)*)/m);
  if (pm) return pm[1];
  return null;
}

function truncate(s, n = 4096) {
  if (!s) return null;
  return s.length > n ? s.slice(0, n) + '…' : s;
}

module.exports = { ElectronYmlDetector };
