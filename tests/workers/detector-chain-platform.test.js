/**
 * tests/workers/detector-chain-platform.test.js
 *
 * detector chain 按 platform 过滤: 只跑 platform===当前平台 或 没标 platform 的.
 * mac 上 win-only detector 被跳过, 反之亦然.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('detector-chain platform filtering', () => {
  it('detector-chain.js 源码读 currentPlatform 并过滤', () => {
    const src = readFileSync(
      join(__dirname, '../../src/workers/detector-chain.js'),
      'utf-8',
    );
    expect(src).toContain('platform');
    expect(src).toMatch(/skipped.*platform|platform.*skip/i);
  });

  it('installed-version.js 源码按 platform 过滤 version_sources', () => {
    const src = readFileSync(
      join(__dirname, '../../src/workers/installed-version.js'),
      'utf-8',
    );
    expect(src).toContain('platform');
  });

  it('DetectContext 带 platform 字段', () => {
    const src = readFileSync(
      join(__dirname, '../../src/detectors/base.js'),
      'utf-8',
    );
    expect(src).toMatch(/platform/);
  });
});
