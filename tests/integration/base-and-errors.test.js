/**
 * tests/integration/base-and-errors.test.js
 *
 * 基础类（Detector/DetectContext/DetectorResult/DetectorError）的 smoke test。
 */
import { describe, it, expect } from 'vitest';
import { Detector, DetectContext, DetectorResult } from '../../src/detectors/base.js';
import { DetectorError, REASONS } from '../../src/detectors/errors.js';

describe('DetectorError', () => {
  it('reason 字段保留 + message 携带 reason', () => {
    const e = new DetectorError({ detector: 'BrewFormulaeDetector', reason: 'timeout', note: 'foo' });
    expect(e).toBeInstanceOf(Error);
    expect(e.reason).toBe('timeout');
    expect(e.detector).toBe('BrewFormulaeDetector');
    expect(e.message).toContain('timeout');
    expect(e.message).toContain('foo');
  });

  it('带 httpStatus 时 message 也写出来', () => {
    const e = new DetectorError({ detector: 'X', reason: REASONS.HTTP_4XX, httpStatus: 404 });
    expect(e.message).toContain('HTTP 404');
  });

  it('7 个 reason 取值固定 (Phase 6 加 too_large)', () => {
    expect(Object.values(REASONS).sort()).toEqual(
      ['http_4xx', 'http_5xx', 'network', 'no_version', 'parse', 'timeout', 'too_large'].sort()
    );
  });
});

describe('DetectContext', () => {
  it('url / timeout 走 detCfg 优先', () => {
    const ctx = new DetectContext({
      appCfg: {},
      arch: 'arm64',
      http: {},
      logger: {},
      detCfg: { url: 'https://cfg', timeout: 1234 },
    });
    expect(ctx.url).toBe('https://cfg');
    expect(ctx.timeout).toBe(1234);
  });
  it('detCfg 缺值时返回空串 / null', () => {
    const ctx = new DetectContext({ appCfg: {}, arch: 'x64', http: {}, logger: {} });
    expect(ctx.url).toBe('');
    expect(ctx.timeout).toBeNull();
  });
});

describe('Detector base', () => {
  it('detect() 抛 not implemented', async () => {
    await expect(new Detector().detect({})).rejects.toThrow(/not implemented/);
  });
  it('timeout 默认 8000', () => {
    expect(new Detector().timeout).toBe(8000);
    expect(new Detector({ timeout: 3000 }).timeout).toBe(3000);
  });
});

describe('DetectorResult', () => {
  it('构造字段都在', () => {
    const r = new DetectorResult({ version: '1.0', source: 'X', confidence: 'medium', note: 'n' });
    expect(r.version).toBe('1.0');
    expect(r.confidence).toBe('medium');
    expect(r.note).toBe('n');
  });
});
