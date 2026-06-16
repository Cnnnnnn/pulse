/**
 * tests/integration/version-source.test.js
 *
 * Phase 9: per-app "version_sources" dispatcher 单测.
 * 测三个 source type: installed_json, plist, regex_file.
 * 关键 case: 末段是 build 号 (>1000) → stripBuildNumber 兜底.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { tryVersionSource, expandHome } from '../../src/workers/version-source.js';

describe('tryVersionSource', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-source-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('installed_json', () => {
    it('读 appVersion 字段 (Marvis 模式)', async () => {
      const p = path.join(tmpDir, 'installed.json');
      fs.writeFileSync(p, JSON.stringify({ appVersion: '1.0.10050' }));
      const v = await tryVersionSource(
        { type: 'installed_json', path: p },
        { homeDir: tmpDir }
      );
      expect(v).toBe('1.0.10050');
    });

    it('appVersion 末段是 build 号 → stripBuildNumber 剥掉', async () => {
      const p = path.join(tmpDir, 'installed.json');
      fs.writeFileSync(p, JSON.stringify({ appVersion: '2.5.3.4392' }));
      const v = await tryVersionSource(
        { type: 'installed_json', path: p },
        { homeDir: tmpDir }
      );
      expect(v).toBe('2.5.3');
    });

    it('未配 path 但有 bundleId → 默认到 ~/Library/Application Support/{bundleId}/installed.json', async () => {
      const dir = path.join(tmpDir, 'Library', 'Application Support', 'com.test.app');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'installed.json'), JSON.stringify({ appVersion: '5.0.0' }));
      const v = await tryVersionSource(
        { type: 'installed_json' },
        { bundleId: 'com.test.app', homeDir: tmpDir }
      );
      expect(v).toBe('5.0.0');
    });

    it('appVersion 不是 string → null', async () => {
      const p = path.join(tmpDir, 'installed.json');
      fs.writeFileSync(p, JSON.stringify({ appVersion: 123 }));
      const v = await tryVersionSource(
        { type: 'installed_json', path: p },
        { homeDir: tmpDir }
      );
      expect(v).toBeNull();
    });

    it('文件不存在 → null (不 throw)', async () => {
      const v = await tryVersionSource(
        { type: 'installed_json', path: path.join(tmpDir, 'missing.json') },
        { homeDir: tmpDir }
      );
      expect(v).toBeNull();
    });
  });

  describe('plist', () => {
    it('读 CFBundleShortVersionString', async () => {
      const plistXml = `<?xml version="1.0"?>
<plist>
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.test.app</string>
  <key>CFBundleShortVersionString</key>
  <string>3.2.1</string>
  <key>CFBundleVersion</key>
  <string>999</string>
</dict>
</plist>`;
      const v = await tryVersionSource(
        { type: 'plist' },
        { plistRaw: plistXml, homeDir: tmpDir }
      );
      expect(v).toBe('3.2.1');
    });

    it('plistRaw 为空 → null', async () => {
      const v = await tryVersionSource(
        { type: 'plist' },
        { plistRaw: null, homeDir: tmpDir }
      );
      expect(v).toBeNull();
    });

    it('plist 没有 CFBundleShortVersionString → null', async () => {
      const plistXml = `<plist><dict><key>foo</key><string>bar</string></dict></plist>`;
      const v = await tryVersionSource(
        { type: 'plist' },
        { plistRaw: plistXml, homeDir: tmpDir }
      );
      expect(v).toBeNull();
    });
  });

  describe('regex_file', () => {
    it('IMA 真实场景: 从 MMKV 文件提取 appVersion 字段', async () => {
      const mmkvPath = path.join(tmpDir, 'mmkv.bin');
      // 模拟 MMKV 二进制里的 telemetry 段: appVersion":"2.5.3.4392"
      const content = `{"pullParams":{"properties":{"appVersion":"2.5.3.4392","bundleId":"com.tencent.imamac"}}}`;
      fs.writeFileSync(mmkvPath, content);
      const v = await tryVersionSource(
        {
          type: 'regex_file',
          path: mmkvPath,
          pattern: 'appVersion\\D{0,4}([0-9.]+)',
        },
        { homeDir: tmpDir }
      );
      expect(v).toBe('2.5.3'); // stripBuildNumber 剥掉 4392
    });

    it('MMKV 多版本时取最大的 (追加写入场景)', async () => {
      // 同一个文件里多次 appVersion 出现, 已装版本是文件里最大的 (追加写入
      // 把新版本写到文件末尾). 取最大 + stripBuildNumber 剥 build counter.
      const p = path.join(tmpDir, 'mmkv.bin');
      const content = `appVersion":"2.5.2.4342" ... appVersion":"2.5.3.4392"`;
      fs.writeFileSync(p, content);
      const v = await tryVersionSource(
        {
          type: 'regex_file',
          path: p,
          pattern: 'appVersion\\D{0,4}([0-9.]+)',
        },
        { homeDir: tmpDir }
      );
      expect(v).toBe('2.5.3'); // 最大的 2.5.3.4392 → stripBuildNumber → 2.5.3
    });

    it('没 capture group → 用整段 match', async () => {
      const p = path.join(tmpDir, 'x.txt');
      fs.writeFileSync(p, 'current-version: 7.8.9');
      const v = await tryVersionSource(
        { type: 'regex_file', path: p, pattern: 'current-version:\\s*\\S+' },
        { homeDir: tmpDir }
      );
      expect(v).toBe('current-version: 7.8.9');
    });

    it('regex 不匹配 → null', async () => {
      const p = path.join(tmpDir, 'x.txt');
      fs.writeFileSync(p, 'no version here');
      const v = await tryVersionSource(
        { type: 'regex_file', path: p, pattern: 'version[=:]([0-9.]+)' },
        { homeDir: tmpDir }
      );
      expect(v).toBeNull();
    });

    it('path 不存在 → null (不 throw)', async () => {
      const v = await tryVersionSource(
        {
          type: 'regex_file',
          path: path.join(tmpDir, 'missing'),
          pattern: 'foo',
        },
        { homeDir: tmpDir }
      );
      expect(v).toBeNull();
    });

    it('没传 pattern → null', async () => {
      const p = path.join(tmpDir, 'x.txt');
      fs.writeFileSync(p, 'whatever');
      const v = await tryVersionSource(
        { type: 'regex_file', path: p },
        { homeDir: tmpDir }
      );
      expect(v).toBeNull();
    });
  });

  describe('error handling', () => {
    it('未知 type → null', async () => {
      const v = await tryVersionSource({ type: 'unknown' }, { homeDir: tmpDir });
      expect(v).toBeNull();
    });

    it('src 是 null → null', async () => {
      const v = await tryVersionSource(null, { homeDir: tmpDir });
      expect(v).toBeNull();
    });

    it('regex 语法错 → catch 返回 null', async () => {
      const p = path.join(tmpDir, 'x.txt');
      fs.writeFileSync(p, 'whatever');
      const v = await tryVersionSource(
        { type: 'regex_file', path: p, pattern: '([' },  // 不闭合的 group
        { homeDir: tmpDir }
      );
      expect(v).toBeNull();
    });
  });
});

describe('expandHome', () => {
  it('~/foo → $HOME/foo', () => {
    expect(expandHome('~/foo', '/Users/test')).toBe('/Users/test/foo');
  });
  it('普通路径 → 原样', () => {
    expect(expandHome('/abs/path', '/Users/test')).toBe('/abs/path');
  });
  it('null / 非 string → 原样', () => {
    expect(expandHome(null, '/Users/test')).toBe(null);
    expect(expandHome(undefined, '/Users/test')).toBe(undefined);
  });
  it('~user/foo → 不展开 (只展开 ~/)', () => {
    expect(expandHome('~user/foo', '/Users/test')).toBe('~user/foo');
  });
});
