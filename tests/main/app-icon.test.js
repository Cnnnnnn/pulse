/**
 * tests/main/app-icon.test.js
 *
 * Phase 25 v5: sips 读 .icns → PNG Buffer → base64 dataUrl.
 *   Electron 35 arm64 上 nativeImage.createFromBuffer / getFileIcon / createFromPath
 *   全部 SIGTRAP. 唯一稳定的路径: sips CLI → Buffer → 直接 base64.
 *
 * 5 case: sips 成功 / sips 失败 / 找不到 .icns / bundle 缺 / 空路径.
 */
import { describe, it, expect, vi } from 'vitest';
import { getAppIcon, findIcnsPath } from '../../src/main/app-icon.js';

function makeFs(overrides = {}) {
  return {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => ''),
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn(() => {}),
    ...overrides,
  };
}

function makeApp() {
  return { getPath: vi.fn(() => '/tmp') };
}

const fakeSipsOk = { status: 0, stderr: '' };
const fakeSipsFail = { status: 1, stderr: 'sips: cannot open' };

describe('getAppIcon (Phase 25 v5)', () => {
  it('sips PNG buffer → base64 dataUrl', async () => {
    let pngOutPath = null;
    const fs = makeFs({
      readFileSync: (p) => {
        if (p.endsWith('Info.plist')) return '<plist/>'; // plist 缺 CFBundleIconFile
        if (pngOutPath && p === pngOutPath) return Buffer.from('FAKE_PNG_BUFFER');
        return '';
      },
      readdirSync: () => ['icon.icns'],
    });
    const _app = makeApp();
    const _spawn = vi.fn((sipsPath, args) => {
      pngOutPath = args[args.length - 1];
      require('fs').writeFileSync(pngOutPath, 'FAKE_PNG_BUFFER');
      return fakeSipsOk;
    });
    const r = await getAppIcon('/Applications/Cursor.app', { fs, app: _app, spawn: _spawn });
    expect(r).toBe('data:image/png;base64,' + Buffer.from('FAKE_PNG_BUFFER').toString('base64'));
    expect(_spawn).toHaveBeenCalled();
  });

  it('sips 失败 → null', async () => {
    const fs = makeFs({
      readFileSync: () => '<plist/>',
      readdirSync: () => ['icon.icns'],
    });
    const _app = makeApp();
    const r = await getAppIcon('/Applications/Cursor.app', {
      fs, app: _app, spawn: vi.fn(() => fakeSipsFail),
    });
    expect(r).toBeNull();
  });

  it('找不到 .icns → null', async () => {
    const fs = makeFs({
      readFileSync: () => '<plist/>',
      readdirSync: () => ['other.txt', 'a.png'],
    });
    const _app = makeApp();
    const r = await getAppIcon('/Applications/Cursor.app', { fs, app: _app, spawn: vi.fn(() => fakeSipsOk) });
    expect(r).toBeNull();
  });

  it('bundle 不存在 → null', async () => {
    const fs = makeFs({ existsSync: vi.fn(() => false) });
    const _app = makeApp();
    expect(await getAppIcon('/Applications/Gone.app', { fs, app: _app })).toBeNull();
  });

  it('空路径 → null', async () => {
    const fs = makeFs();
    const _app = makeApp();
    expect(await getAppIcon('', { fs, app: _app })).toBeNull();
    expect(await getAppIcon(null, { fs, app: _app })).toBeNull();
  });
});

describe('findIcnsPath (helper)', () => {
  it('Info.plist 拿 CFBundleIconFile', () => {
    const fs = makeFs({
      existsSync: (p) => p.includes('Info.plist') || p.includes('AppIcon.icns'),
      readFileSync: () => '<key>CFBundleIconFile</key><string>AppIcon</string>',
    });
    expect(findIcnsPath('/Applications/X.app', { fs }))
      .toBe('/Applications/X.app/Contents/Resources/AppIcon.icns');
  });

  it('Info.plist 缺字段 → Resources glob', () => {
    const fs = makeFs({
      existsSync: (p) => p.includes('Info.plist') || p.endsWith('Resources'),
      readFileSync: () => '<plist/>',
      readdirSync: () => ['other.txt', 'icon.icns'],
    });
    expect(findIcnsPath('/Applications/X.app', { fs }))
      .toBe('/Applications/X.app/Contents/Resources/icon.icns');
  });

  it('都没 → null', () => {
    const fs = makeFs({
      existsSync: () => false,
      readFileSync: () => '<plist/>',
      readdirSync: () => ['a.png'],
    });
    expect(findIcnsPath('/Applications/X.app', { fs })).toBeNull();
  });
});
