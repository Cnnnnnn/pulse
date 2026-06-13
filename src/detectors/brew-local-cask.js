/**
 * src/detectors/brew-local-cask.js
 *
 * 本地 brew 命令 — `brew info --cask --json=v2 {cask}` → cask.version
 * 需要用户本机装了 brew；没有就当网络一样当失败。
 *
 * 配置: { type: 'brew_local_cask', cask: 'cursor' }
 */

const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");
const { truncate, cleanVersion } = require("./utils");
const { execFile } = require("child_process");

class BrewLocalCaskDetector extends Detector {
  static name = "brew_local_cask";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 15000 });
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

    const timeout = ctx.timeout || this.timeout;
    let stdout;
    try {
      stdout = await this._runBrew(cask, timeout);
    } catch (err) {
      // brew 不在 / 命令失败 → 当作 network
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NETWORK,
        note: `brew info failed: ${err.message || err}`,
      });
    }

    let data;
    try {
      data = JSON.parse(stdout);
    } catch (e) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.PARSE,
        raw: truncate(stdout),
        note: e.message,
      });
    }

    const caskInfo = data && data.casks && data.casks[0];
    // brew cask 的 version 可能是 "3.6.31,81fcf293..."（带 commit hash），先清
    const ver = cleanVersion(caskInfo && caskInfo.version);
    if (!ver) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: caskInfo,
        note: "cask version empty",
      });
    }

    return new DetectorResult({
      version: ver,
      raw: caskInfo,
      source: this.constructor.name,
      confidence: "high",
      note: "local brew cask",
    });
  }

  _runBrew(cask, timeout) {
    return new Promise((resolve, reject) => {
      execFile(
        "brew",
        ["info", "--cask", "--json=v2", cask],
        { timeout },
        (err, stdout, stderr) => {
          if (err) {
            // 区分 timeout / 其他
            if (err.killed || /timeout/i.test(String(err.message))) {
              return reject(new Error("brew timeout"));
            }
            return reject(new Error(err.message || "brew failed"));
          }
          resolve(stdout);
        },
      );
    });
  }
}

module.exports = { BrewLocalCaskDetector };
