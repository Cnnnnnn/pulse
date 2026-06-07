/**
 * src/detectors/cursor-redirect.js
 *
 * Cursor 专用：
 *   1) HEAD 跟随重定向到 .../production/{hash}/darwin/arm64/Cursor-darwin-arm64.dmg
 *   2) 从原始 URL 的 /cursor/{x.y} 段拿 major 版本号
 *   3) 兜底：从 finalUrl 文件名提取
 *
 * 配置: { type: 'cursor_redirect', url: 'https://...' }
 *
 * Phase 6 修复:
 *   - 展开 {arch_short} 占位符 (config.json Cursor 用的是这个)
 *   - HEAD 4xx / 405 → GET 兜底 (跟 redirect-filename.js 一致)
 */

const { Detector, DetectorResult } = require('./base');
const { DetectorError, REASONS } = require('./errors');
const { expandUrl } = require('./url-template');

class CursorRedirectDetector extends Detector {
  static name = 'cursor_redirect';

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 10000 });
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
    // 展开 {arch} / {arch_short} 占位符
    const originalUrl = expandUrl(rawUrl, ctx.arch);

    // 先尝试从原 URL 拿 major version
    const majorMatch = originalUrl.match(/\/cursor\/(\d+\.\d+)/);
    const majorVersion = majorMatch ? majorMatch[1] : null;

    // 跟随重定向
    let current = originalUrl;
    let finalUrl = originalUrl;
    let lastStatus = 0;
    let lastAllowHeader = '';
    for (let i = 0; i < 5; i++) {
      const r = await ctx.http.head(current, { timeout: ctx.timeout || this.timeout, follow: false });
      if (r.error === 'timeout') {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.TIMEOUT, note: current });
      }
      if (r.error === 'network') {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.NETWORK, note: current });
      }
      lastStatus = r.status;
      if (r.headers && r.headers.allow) {
        lastAllowHeader = String(r.headers.allow).toUpperCase();
      }
      if (r.status >= 300 && r.status < 400 && r.headers && r.headers.location) {
        const next = absUrl(r.headers.location, current);
        current = next;
        continue;
      }
      finalUrl = r.finalUrl || current;
      break;
    }
    finalUrl = finalUrl || current;

    // Phase 6: HEAD 4xx / 405 → GET 兜底
    if (lastStatus === 405 || (lastStatus >= 400 && lastStatus < 500 && /GET/.test(lastAllowHeader))) {
      const getResp = await ctx.http.get(current, {
        timeout: ctx.timeout || this.timeout,
        headers: { Accept: '*/*' },
        follow: true,
        maxBodyBytes: 256 * 1024,
      });
      if (getResp.error === 'timeout') {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.TIMEOUT, note: current });
      }
      if (getResp.error === 'network') {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.NETWORK, note: current });
      }
      if (getResp.error === 'too_large') {
        throw new DetectorError({
          detector: this.constructor.name,
          reason: REASONS.TOO_LARGE,
          note: 'endpoint returned >256KB body, treating as binary file',
        });
      }
      if (getResp.status >= 400 && getResp.status < 500) {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.HTTP_4XX, httpStatus: getResp.status, note: current });
      }
      if (getResp.status >= 500) {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.HTTP_5XX, httpStatus: getResp.status, note: current });
      }
      finalUrl = getResp.finalUrl || current;
    } else if (lastStatus >= 400 && lastStatus < 500) {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.HTTP_4XX, httpStatus: lastStatus, note: finalUrl });
    } else if (lastStatus >= 500) {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.HTTP_5XX, httpStatus: lastStatus, note: finalUrl });
    }

    // /production/{hash} 路径 → 走 major version（更准）
    const productionMatch = finalUrl.match(/\/production\/([a-f0-9]{8,})/);
    if (productionMatch && majorVersion) {
      // Phase 10 bugfix: cursor API 只按 major 答, 不给 build (3.6.31 vs 3.6).
      // 之前以 high confidence 返回 major-only 版本, 阻断 brew_formulae (返回完整 3.6.31)
      // 用户看到 "3.6.31 → 3.6" 困惑. 改成 low confidence, 让 chain 继续跑后续 detector
      // (brew_formulae cask API 返回 "3.6.31,hash" 完整版本, 会以 high 覆盖).
      // brew 失败时, 这个 low result 作为 fallback, 至少告诉用户 major 状态.
      return new DetectorResult({
        version: majorVersion,
        raw: { finalUrl, majorVersion, hash: productionMatch[1] },
        source: this.constructor.name,
        confidence: 'low',
        note: 'cursor /cursor/{major} only (brew override expected)',
      });
    }

    // 兜底：从 finalUrl 文件名提取
    const filename = finalUrl.split('/').pop() || '';
    const m = filename.match(/[vV]?(\d+\.\d+(?:\.\d+)*)/);
    if (m) {
      let v = m[1];
      if (v.startsWith('v') || v.startsWith('V')) v = v.slice(1);
      return new DetectorResult({
        version: v,
        raw: { finalUrl, filename },
        source: this.constructor.name,
        confidence: 'medium',
        note: 'cursor filename fallback',
      });
    }

    throw new DetectorError({
      detector: this.constructor.name,
      reason: REASONS.NO_VERSION,
      raw: { finalUrl, majorVersion, filename },
      note: 'no version extracted',
    });
  }
}

function absUrl(loc, base) {
  if (!loc) return base;
  if (loc.startsWith('http://') || loc.startsWith('https://')) return loc;
  try {
    const u = new URL(base);
    if (loc.startsWith('//')) return `${u.protocol}${loc}`;
    if (loc.startsWith('/')) return `${u.protocol}//${u.host}${loc}`;
    return `${u.protocol}//${u.host}/${loc}`;
  } catch {
    return loc;
  }
}

module.exports = { CursorRedirectDetector };
