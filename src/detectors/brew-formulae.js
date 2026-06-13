/**
 * src/detectors/brew-formulae.js
 *
 * 在线 brew formulae API — 拿 cask 最新版本号。
 * Endpoint: https://formulae.brew.sh/api/cask/{cask}.json → { version: "x.y.z,abc123..." }
 *
 * 配置: { type: 'brew_formulae', cask: 'cursor' }
 */

const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");
const { truncate, cleanVersion, assertHttpResponse } = require("./utils");

class BrewFormulaeDetector extends Detector {
  static name = "brew_formulae";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 8000 });
    this.cask = opts.cask || "";
  }

  async detect(ctx) {
    const cask = this.cask || ctx.detCfg.cask || ctx.appCfg.brew_cask;
    if (!cask) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no cask configured",
      });
    }

    const url = `https://formulae.brew.sh/api/cask/${encodeURIComponent(cask)}.json`;
    const r = await ctx.http.get(url, { timeout: ctx.timeout || this.timeout });

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

    const ver = cleanVersion(data && data.version);
    if (!ver) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: data,
        note: "version field empty",
      });
    }

    return new DetectorResult({
      version: ver,
      raw: data,
      source: this.constructor.name,
      confidence: "high",
      note: "brew formulae API",
    });
  }
}

module.exports = { BrewFormulaeDetector };
