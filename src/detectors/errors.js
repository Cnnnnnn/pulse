/**
 * src/detectors/errors.js
 *
 * 统一 Detector 错误。runner / logger / UI 都按 reason 字段分发。
 *
 * reason 取值：
 *   - 'timeout'    单个 detector 超时（默认 8s）
 *   - 'parse'      响应体解析失败（JSON / YAML / XML）
 *   - 'http_4xx'   4xx 客户端错误（404 / 401 等）— 多数情况属于"接口失效"
 *   - 'http_5xx'   5xx 服务端错误 — 通常是上游临时故障
 *   - 'network'    DNS / TCP / TLS / 断网 / ECONNRESET 等
 *   - 'no_version' 响应正常但没能提取出版本号
 *   - 'too_large'  响应体超过 maxBodyBytes 上限 (默认 1MB) — 通常是 endpoint 把整个 dmg 当 body 返回
 */

class DetectorError extends Error {
  /**
   * @param {object} opt
   * @param {string} opt.detector    触发错误的 detector 类名（用于日志）
   * @param {string} opt.reason      见上方枚举
   * @param {number|null} [opt.httpStatus]  HTTP 状态码（4xx/5xx 时填）
   * @param {string|null} [opt.raw]  截断后的原始响应（≤4KB），诊断用
   * @param {string} [opt.note='']   人类可读补充说明
   */
  constructor({ detector, reason, httpStatus = null, raw = null, note = '' }) {
    super(`${detector}: ${reason}${httpStatus ? ` (HTTP ${httpStatus})` : ''}${note ? ` — ${note}` : ''}`);
    this.name = 'DetectorError';
    this.detector = detector;
    this.reason = reason;
    this.httpStatus = httpStatus;
    this.raw = raw;
    this.note = note;
  }
}

const REASONS = Object.freeze({
  TIMEOUT: 'timeout',
  PARSE: 'parse',
  HTTP_4XX: 'http_4xx',
  HTTP_5XX: 'http_5xx',
  NETWORK: 'network',
  NO_VERSION: 'no_version',
  TOO_LARGE: 'too_large',
});

module.exports = { DetectorError, REASONS };
