/**
 * src/detectors/cursor-redirect.js
 *
 * Cursor 专用：
 *   1) HEAD 跟随重定向到 .../production/{hash}/darwin/arm64/Cursor-darwin-arm64.dmg
 *   2) 从原始 URL 的 /cursor/{x.y} 段拿 major 版本号
 *   3) 兜底：从 finalUrl 文件名提取
 *
 * 配置: { type: 'cursor_redirect', url: 'https://...' }
 */

const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");
const { expandUrl } = require("./url-template");
const {
  followHeadRedirects,
  resolveFinalUrlAfterHead,
  extractVersionFromFilename,
} = require("./redirect-base");

class CursorRedirectDetector extends Detector {
  static name = "cursor_redirect";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 10000 });
    this.url = opts.url || "";
  }

  async detect(ctx) {
    const rawUrl = this.url || ctx.url;
    if (!rawUrl) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no url configured",
      });
    }
    const originalUrl = expandUrl(rawUrl, ctx.arch);
    const majorMatch = originalUrl.match(/\/cursor\/(\d+\.\d+)/);
    const majorVersion = majorMatch ? majorMatch[1] : null;
    const timeout = ctx.timeout || this.timeout;
    const detector = this.constructor.name;

    const head = await followHeadRedirects(ctx, originalUrl, {
      detector,
      timeout,
    });
    const finalUrl = await resolveFinalUrlAfterHead(ctx, {
      detector,
      current: head.current,
      finalUrl: head.finalUrl,
      lastStatus: head.lastStatus,
      lastAllowHeader: head.lastAllowHeader,
      getOptions: {
        timeout,
        headers: { Accept: "*/*" },
        follow: true,
        maxBodyBytes: 256 * 1024,
      },
      tooLargeNote: "endpoint returned >256KB body, treating as binary file",
    });

    const productionMatch = finalUrl.match(/\/production\/([a-f0-9]{8,})/);
    if (productionMatch && majorVersion) {
      return new DetectorResult({
        version: majorVersion,
        raw: { finalUrl, majorVersion, hash: productionMatch[1] },
        source: detector,
        confidence: "low",
        note: "cursor /cursor/{major} only (brew override expected)",
      });
    }

    const extracted = extractVersionFromFilename(finalUrl);
    if (extracted) {
      return new DetectorResult({
        version: extracted.version,
        raw: { finalUrl, filename: extracted.filename },
        source: detector,
        confidence: "medium",
        note: "cursor filename fallback",
      });
    }

    throw new DetectorError({
      detector,
      reason: REASONS.NO_VERSION,
      raw: { finalUrl, majorVersion, filename: finalUrl.split("/").pop() || "" },
      note: "no version extracted",
    });
  }
}

module.exports = { CursorRedirectDetector };
