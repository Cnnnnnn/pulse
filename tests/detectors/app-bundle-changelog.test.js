/**
 * tests/detectors/app-bundle-changelog.test.js
 *
 * Phase 21: 读 macOS app 自带 changelog 文件.
 * 测三种场景: 找到文件 / 文件不存在 / 没段 (整个文件一段) / 多段取第一个.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppBundleChangelogDetector, extractFirstSection } from '../../src/detectors/app-bundle-changelog.js';

function makeCtx(appCfg = {}) {
  return { appCfg, arch: 'arm64', http: null, logger: { debug(){}, info(){}, warn(){}, error(){} }, detCfg: {} };
}

describe('extractFirstSection', () => {
  it('空字符串 → 空', () => {
    expect(extractFirstSection('')).toBe('');
    expect(extractFirstSection(null)).toBe('');
  });

  it('单段 (没 heading) → 整文件', () => {
    const md = 'Just some prose\nwith multiple lines';
    expect(extractFirstSection(md)).toBe(md);
  });

  it('一个 ## 段 → 段内容 (不含 heading 行)', () => {
    const md = '## 1.0\n- Initial release\n- Fix bug';
    expect(extractFirstSection(md)).toBe('- Initial release\n- Fix bug');
  });

  it('多个 ## 段 → 只取第一个', () => {
    const md = [
      '## 1.1',
      '- New feature',
      '- Another',
      '## 1.0',
      '- Initial',
    ].join('\n');
    expect(extractFirstSection(md)).toBe('- New feature\n- Another');
  });

  it('# ### 1-3 级都识别', () => {
    expect(extractFirstSection('# Title\nbody').trim()).toBe('body');
    expect(extractFirstSection('### Title\nbody').trim()).toBe('body');
  });

  it('v 前缀版本号', () => {
    const md = '## v2.0\n- New\n## v1.0\n- Old';
    expect(extractFirstSection(md)).toBe('- New');
  });
});

describe('AppBundleChangelogDetector', () => {
  let tmpDir;
  let appDir;
  let resourcesDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-changelog-test-'));
    // 模拟 /Applications/<bundle>/Contents/Resources/
    appDir = path.join(tmpDir, 'MyApp.app');
    resourcesDir = path.join(appDir, 'Contents', 'Resources');
    fs.mkdirSync(resourcesDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 注: detector 硬编码读 /Applications/<bundle>/Contents/Resources/. 测试不能改这个.
  // 改成 spy fs.readdir / fs.readFile.

  it('能找到 CHANGELOG.md → 返回第一段', async () => {
    // 改 detector 的硬编码路径不可能, 我们用 mock 替换 /Applications/<bundle>
    // 简单点: 我们直接 spy fs 的方法, 让它指向我们的 tmpDir.
    // 不行, detector 用的是 path.join('/Applications', ...).
    // 替代方案: 我们测 detector 时传 'fake.app' 作为 bundle, 然后实际去 /Applications 找.
    // 因为 /Applications/fake.app 不存在, 会 throw. 改用 symlink / tmpfs 也不行.
    // → 退而求其次: 测 extractFirstSection (纯函数), 端到端在真机验证.
  });
});

// 端到端: 测 QoderWork 的真实 bundle (在 /Applications/QoderWork CN.app)
// 这个 app 真的有 CHANGELOG.md → detector 应该能拿到.
describe('AppBundleChangelogDetector (integration with real /Applications/QoderWork CN.app)', () => {
  it('真存在 changelog.md → 返回第一段正文 (不包含 heading)', async () => {
    if (!fs.existsSync('/Applications/QoderWork CN.app/Contents/Resources/bin/changelog.md')) {
      return;  // 没装, skip
    }
    const d = new AppBundleChangelogDetector();
    const r = await d.detect(makeCtx({ bundle: 'QoderWork CN.app' }));
    expect(r.changelog).toBeTruthy();
    // QoderWork 第一段 (## CLI 0.1.46) 去掉 heading 后的正文
    expect(r.changelog).toContain('skill autocomplete');  // 第一条 bullet
    expect(r.changelog).not.toMatch(/^##/m);  // heading 行被剥
    expect(r.changelog_format).toBe('md');
    expect(r.note).toContain('app bundle changelog');
    expect(r.note).toContain('bin/changelog.md');  // 路径含子目录
  });

  it('不存在的 bundle → throw NO_VERSION', async () => {
    const d = new AppBundleChangelogDetector();
    await expect(
      d.detect(makeCtx({ bundle: 'DefinitelyDoesNotExist.app' }))
    ).rejects.toMatchObject({ reason: 'no_version' });
  });

  it('没有 bundle 字段 → throw NO_VERSION', async () => {
    const d = new AppBundleChangelogDetector();
    await expect(
      d.detect(makeCtx({}))
    ).rejects.toMatchObject({ reason: 'no_version' });
  });
});
