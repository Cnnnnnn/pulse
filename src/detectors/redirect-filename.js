/**
 * src/detectors/redirect-filename.js
 *
 * HEAD 跟随重定向链，从最终 URL 的文件名提取版本号。
 * 例: .../Kimi-darwin-arm64-1.2.3.dmg → "1.2.3"
 *
 * 配置: { type: 'redirect_filename', url: 'https://...' }
 *
 * Phase 6 修复 (Kimi):
 *   - 该端点 (appsupport.moonshot.cn) 拒绝 HEAD (HTTP 400 + Allow: GET) —
 *     detector 检测到 4xx 且响应头含 'allow: GET' 时, 自动回退到 GET 重试
 *   - 兼容: 即使 HEAD 400 但不含 Allow header, 也允许 GET 一次兜底
 *
 * Phase 6 修复 (URL 模板):
 *   - 配置里可能写 {arch} / {arch_short} (Cursor 用了 {arch_short})
 *   - 启动时按 ctx.arch 展开一次
 */

const { Detector, DetectorResult } = require('./base');
const { DetectorError, REASONS } = require('./errors');
const { expandUrl } = require('./url-template');

class RedirectFilenameDetector extends Detector {
  static name = 'redirect_filename';

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
    const url = expandUrl(rawUrl, ctx.arch);

    // 第一次 HEAD (follow=false) — 拿 location 重定向链
    let current = url;
    let finalUrl = url;
    let lastStatus = 0;
    let lastAllowHeader = '';
    let lastResponseHeaders = null;
    for (let i = 0; i < 5; i++) {
      const r = await ctx.http.head(current, { timeout: ctx.timeout || this.timeout, follow: false });
      if (r.error === 'timeout') {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.TIMEOUT, note: current });
      }
      if (r.error === 'network') {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.NETWORK, note: current });
      }
      lastStatus = r.status;
      lastResponseHeaders = r.headers || {};
      // 记下 'Allow' header — 后面 HEAD 失败时判断要不要 GET 兜底
      if (lastResponseHeaders.allow) lastAllowHeader = String(lastResponseHeaders.allow).toUpperCase();
      if (r.status >= 300 && r.status < 400 && r.headers && r.headers.location) {
        const next = absUrl(r.headers.location, current);
        current = next;
        continue;
      }
      finalUrl = r.finalUrl || current;
      break;
    }
    finalUrl = finalUrl || current;

    // Phase 6: HEAD 4xx → 检测 server 是否只允许 GET, 退到 GET 重试一次
    //   Kimi:  400 + Allow: GET
    //   一般:  405 Method Not Allowed
    if (lastStatus === 405 || (lastStatus >= 400 && lastStatus < 500 && /GET/.test(lastAllowHeader))) {
      // 退到 GET — 我们只需要 finalUrl 的 filename, 不需要 body
      // 之前 256KB + 10s timeout 在 chunked 响应(Kimi 把整个 dmg 当 chunked body 返回)下
      // 永远等不到 256KB, 然后被 10s timeout 杀, 整轮 check 卡住
      // Phase 7 修复: maxBodyBytes 砍到 4KB (header + 极小 body 足够 status/filename)
      //              + timeout 砍到 5s (单 hop 上限)
      //              + Range: bytes=0-0 让 server 知道我们只要 1 字节, 不少服务真会遵守
      const getResp = await ctx.http.get(current, {
        timeout: 5000,
        headers: { Accept: '*/*', Range: 'bytes=0-0' },
        follow: true,
        maxBodyBytes: 4 * 1024,
      });
      if (getResp.error === 'timeout') {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.TIMEOUT, note: current });
      }
      if (getResp.error === 'network') {
        throw new DetectorError({ detector: this.constructor.name, reason: REASONS.NETWORK, note: current });
      }
      // Phase 6: endpoint 把整个 dmg 当 body 返回 → 视为版本检测失败, 让 fallback 处理
      if (getResp.error === 'too_large') {
        throw new DetectorError({
          detector: this.constructor.name,
          reason: REASONS.TOO_LARGE,
          note: `endpoint returned >256KB body, treating as binary file (likely whole dmg)`,
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

    const filename = finalUrl.split('/').pop() || '';
    const m = filename.match(/[vV]?(\d+\.\d+(?:\.\d+)*)/);
    if (!m) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: { finalUrl, filename },
        note: 'no version in filename',
      });
    }

    let v = m[1];
    if (v.startsWith('v') || v.startsWith('V')) v = v.slice(1);

    return new DetectorResult({
      version: v,
      raw: { finalUrl, filename },
      source: this.constructor.name,
      confidence: 'medium',   // 从文件名提取 → 置信度 medium（spec §5）
      note: 'redirect filename',
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

module.exports = { RedirectFilenameDetector };
