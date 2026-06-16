/**
 * src/detectors/winget-show.js
 *
 * WingetShowDetector — winget show <id> --versions, 取第一个 (最新) 版本号.
 * Windows 专用 (winget CLI 只在 Windows 上). 走 execFile, 不走 HTTP.
 *
 * 配置: { type: 'winget_show', id: 'Anysphere.Cursor', platform: 'win' }
 *
 * 版本解析策略:
 *   winget show 输出形如 (中文 locale):
 *     找到 [Anysphere.Cursor] 版本 1.0.0
 *     ----------------------------------------
 *     1.0.0
 *     0.50.5
 *   或英文 locale:
 *     Anysphere.Cursor 1.2.3
 *     1.2.3
 *   策略: 从输出里找第一个独立的版本号行 (纯数字+点).
 *
 * 依赖注入: ctx.detCfg._exec 用于测试 mock. 生产环境用 child_process.execFile.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const { Detector, DetectorResult } = require('./base');
const { DetectorError, REASONS } = require('./errors');

const pExecFile = promisify(execFile);

// 版本号行: 纯 x.y.z 格式 (至少 2 段数字), 可带 prerelease (+/- 后缀)
const VERSION_LINE = /^\d+\.\d+(?:\.\d+)*(?:[-+].+)?$/;

class WingetShowDetector extends Detector {
  static name = 'winget_show';

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 15000 });
    this.id = opts.id || '';
  }

  async detect(ctx) {
    const id = this.id || (ctx.detCfg && ctx.detCfg.id) || '';
    if (!id) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: 'no winget id configured',
      });
    }

    const exec = (ctx.detCfg && ctx.detCfg._exec) || pExecFile;

    let stdout = '';
    try {
      const result = await exec(
        'winget',
        ['show', '--id', id, '--versions', '--exact'],
        { timeout: ctx.timeout || this.timeout, encoding: 'utf-8' },
      );
      stdout = (result && result.stdout) || '';
    } catch (e) {
      // winget 不存在 / 报错 → 没拿到版本
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: `winget exec failed: ${(e && e.message) || 'unknown'}`,
      });
    }

    // 从输出里找第一个版本号行
    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (VERSION_LINE.test(trimmed)) {
        return new DetectorResult({
          version: trimmed,
          raw: stdout.slice(0, 500),
          source: this.constructor.name,
          confidence: 'high',
          note: `winget show ${id}`,
        });
      }
    }

    throw new DetectorError({
      detector: this.constructor.name,
      reason: REASONS.NO_VERSION,
      raw: stdout.slice(0, 200),
      note: 'no version line found in winget output',
    });
  }
}

module.exports = { WingetShowDetector };
