/**
 * src/detectors/redirect-filename.ts
 *
 * HEAD 跟随重定向链，从最终 URL 的文件名提取版本号。
 * 例: .../Kimi-darwin-arm64-1.2.3.dmg → "1.2.3"
 *
 * 配置: { type: 'redirect_filename', url: 'https://...' }
 */

import { Detector, DetectorResult } from "./base";
import { DetectorError, REASONS } from "./errors";
import { expandUrl } from "./url-template";
import {
  followHeadRedirects,
  resolveFinalUrlAfterHead,
  extractVersionFromFilename,
} from "./redirect-base";

export class RedirectFilenameDetector extends Detector {
  // ponytail: name via Object.defineProperty (TS 禁 static name vs Function.name)

  constructor(opts: any = {}) {
    super({ timeout: opts.timeout ?? 10000 });
    this.url = opts.url || "";
  }

  async detect(ctx: any) {
    const rawUrl = this.url || ctx.url;
    if (!rawUrl) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no url configured",
      });
    }
    const url = expandUrl(rawUrl, ctx.arch);
    const timeout = ctx.timeout || this.timeout;
    const detector = this.constructor.name;

    const head = await followHeadRedirects(ctx, url, { detector, timeout });
    const finalUrl = await resolveFinalUrlAfterHead(ctx, {
      detector,
      current: head.current,
      finalUrl: head.finalUrl,
      lastStatus: head.lastStatus,
      lastAllowHeader: head.lastAllowHeader,
      getOptions: {
        timeout: 5000,
        headers: { Accept: "*/*", Range: "bytes=0-0" },
        follow: true,
        maxBodyBytes: 4 * 1024,
      },
      tooLargeNote:
        "endpoint returned >256KB body, treating as binary file (likely whole dmg)",
    });

    const extracted = extractVersionFromFilename(finalUrl);
    if (!extracted) {
      throw new DetectorError({
        detector,
        reason: REASONS.NO_VERSION,
        raw: { finalUrl, filename: finalUrl.split("/").pop() || "" },
        note: "no version in filename",
      });
    }

    return new DetectorResult({
      version: extracted.version,
      raw: { finalUrl, filename: extracted.filename },
      source: detector,
      confidence: "medium",
      note: "redirect filename",
    });
  }
}

Object.defineProperty(RedirectFilenameDetector, "name", { value: "redirect_filename", configurable: true });

