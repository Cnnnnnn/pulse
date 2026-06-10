/**
 * tests/main/library-scanner.test.js
 *
 * v2.7.0 (My Apps Library, B2): scanner.js 单元测.
 *
 * 覆盖 (~25 cases):
 *   - listAppBundlesIn: 正常 / 空目录 / 不存在 / 无权限 / 含隐藏 / 含非 .app
 *   - readBundleInfo: 正常 plist / plutil fail / parse fail / 字段缺失
 *   - scanInstalledApps: dedupe 两个目录 / 排序 / 默认 dirs / 注入 dirs
 *   - filterUnmonitored: monitored bundle/name / ignored bundle/name / 空 monitored / 缺字段
 */

import { describe, it, expect, vi } from 'vitest';

const {
  scanInstalledApps,
  filterUnmonitored,
  listAppBundlesIn,
  readBundleInfo,
} = require('../../src/main/library/scanner.js');

// ── mock helpers ──────────────────────────────────────────────

/**
 * Mock fs.readdirSync 返 [{name, isDirectory}], 模拟一个扫描目录.
 */
function makeReaddirMock(entries) {
  return (dir) => {
    return entries.map((e) => ({
      name: e.name,
      isDirectory: () => e.isDir,
    }));
  };
}

/**
 * Mock plutilImpl, 返 plist JSON 字符串.
 * plists key 是 bundle-relative (e.g. 'Cursor.app/Contents/Info.plist'), 但
 * scanner 调 plutil 时传的是 absolute path (e.g. '/Applications/Cursor.app/Contents/Info.plist'),
 * 所以匹配要走 endsWith 而不是 in.
 */
function makePlutilMock(plists) {
  return (args) => {
    const plistPath = args[args.length - 1];
    const key = Object.keys(plists).find((k) => plistPath.endsWith(k));
    if (!key) {
      throw new Error(`plutil: no mock for ${plistPath}`);
    }
    return JSON.stringify(plists[key]);
  };
}

/**
 * Mock fsImpl.existsSync — 只让 plist 文件返 true.
 */
function makeFsImplMock(plists) {
  return {
    existsSync: (p) => Object.keys(plists).some((k) => p.endsWith(k)),
  };
}

// ── listAppBundlesIn ──────────────────────────────────────────

describe('scanner.listAppBundlesIn', () => {
  it('正常: 列 .app, 跳过隐藏 + 非 .app', () => {
    const readdir = makeReaddirMock([
      { name: 'Cursor.app', isDir: true },
      { name: 'Kimi.app', isDir: true },
      { name: '.DS_Store', isDir: false },
      { name: '.localized', isDir: true },
      { name: 'README.md', isDir: false },
      { name: 'subdir', isDir: true }, // 不是 .app
    ]);
    const out = listAppBundlesIn('/Applications', { readdirImpl: readdir });
    expect(out).toEqual([
      { bundlePath: '/Applications/Cursor.app', bundleName: 'Cursor.app' },
      { bundlePath: '/Applications/Kimi.app', bundleName: 'Kimi.app' },
    ]);
  });

  it('空目录 → []', () => {
    const readdir = makeReaddirMock([]);
    expect(listAppBundlesIn('/Applications', { readdirImpl: readdir })).toEqual([]);
  });

  it('目录不存在 / readdir 抛 → []', () => {
    const readdir = () => { throw new Error('ENOENT'); };
    expect(listAppBundlesIn('/Applications', { readdirImpl: readdir })).toEqual([]);
  });

  it('目录参数非 string → []', () => {
    expect(listAppBundlesIn(null)).toEqual([]);
    expect(listAppBundlesIn(123)).toEqual([]);
    expect(listAppBundlesIn('')).toEqual([]);
  });
});

// ── readBundleInfo ─────────────────────────────────────────────

describe('scanner.readBundleInfo', () => {
  it('正常 plist → 返 {bundleId, version, appName}', () => {
    const plists = {
      'Cursor.app/Contents/Info.plist': {
        CFBundleIdentifier: 'com.cursor.Cursor',
        CFBundleShortVersionString: '3.6.31',
        CFBundleDisplayName: 'Cursor',
      },
    };
    const info = readBundleInfo('/Applications/Cursor.app', {
      plutilImpl: makePlutilMock(plists),
      fsImpl: makeFsImplMock(plists),
    });
    expect(info).toEqual({
      bundleId: 'com.cursor.Cursor',
      version: '3.6.31',
      appName: 'Cursor',
    });
  });

  it('缺 CFBundleDisplayName → 退回 CFBundleName', () => {
    const plists = {
      'X.app/Contents/Info.plist': {
        CFBundleIdentifier: 'com.x',
        CFBundleShortVersionString: '1.0',
        CFBundleName: 'X',
      },
    };
    const info = readBundleInfo('/Applications/X.app', {
      plutilImpl: makePlutilMock(plists),
      fsImpl: makeFsImplMock(plists),
    });
    expect(info.appName).toBe('X');
  });

  it('version 缺 CFBundleShortVersionString → 退回 CFBundleVersion', () => {
    const plists = {
      'X.app/Contents/Info.plist': {
        CFBundleIdentifier: 'com.x',
        CFBundleVersion: '2026.6',
      },
    };
    const info = readBundleInfo('/Applications/X.app', {
      plutilImpl: makePlutilMock(plists),
      fsImpl: makeFsImplMock(plists),
    });
    expect(info.version).toBe('2026.6');
  });

  it('Info.plist 不存在 → null', () => {
    const info = readBundleInfo('/Applications/Nonexistent.app', {
      plutilImpl: makePlutilMock({}),
      fsImpl: { existsSync: () => false },
    });
    expect(info).toBe(null);
  });

  it('plutil 抛错 (损坏 plist / 权限) → null', () => {
    const info = readBundleInfo('/Applications/Broken.app', {
      plutilImpl: () => { throw new Error('plutil failed'); },
      fsImpl: { existsSync: () => true },
    });
    expect(info).toBe(null);
  });

  it('plutil 返的不是 JSON → null', () => {
    const info = readBundleInfo('/Applications/Broken.app', {
      plutilImpl: () => 'not json',
      fsImpl: { existsSync: () => true },
    });
    expect(info).toBe(null);
  });

  it('plist 缺字段 → 空字符串', () => {
    const plists = {
      'Empty.app/Contents/Info.plist': {},
    };
    const info = readBundleInfo('/Applications/Empty.app', {
      plutilImpl: makePlutilMock(plists),
      fsImpl: makeFsImplMock(plists),
    });
    expect(info).toEqual({ bundleId: '', version: '', appName: '' });
  });

  it('bundlePath 非 string → null', () => {
    expect(readBundleInfo(null)).toBe(null);
    expect(readBundleInfo('')).toBe(null);
    expect(readBundleInfo(123)).toBe(null);
  });
});

// ── scanInstalledApps ─────────────────────────────────────────

describe('scanner.scanInstalledApps', () => {
  it('默认扫 /Applications + ~/Applications, dedupe + 排序', () => {
    const plists = {
      'A.app/Contents/Info.plist': { CFBundleIdentifier: 'com.a', CFBundleShortVersionString: '1.0', CFBundleDisplayName: 'A' },
      'B.app/Contents/Info.plist': { CFBundleIdentifier: 'com.b', CFBundleShortVersionString: '1.0', CFBundleDisplayName: 'B' },
    };
    // 模拟: /Applications 装 A, ~/Applications 装 B, ~/Applications 也有 A (重复 dedupe)
    const readdirByDir = {
      '/Applications': makeReaddirMock([
        { name: 'A.app', isDir: true },
      ]),
      [require('path').join(require('os').homedir(), 'Applications')]: makeReaddirMock([
        { name: 'A.app', isDir: true }, // dedupe target
        { name: 'B.app', isDir: true },
      ]),
    };
    const readdirImpl = (dir) => {
      if (readdirByDir[dir]) return readdirByDir[dir](dir);
      throw new Error('ENOENT ' + dir);
    };
    const out = scanInstalledApps({
      deps: { readdirImpl, plutilImpl: makePlutilMock(plists), fsImpl: makeFsImplMock(plists) },
    });
    expect(out).toHaveLength(2);
    expect(out[0].appName).toBe('A');
    expect(out[1].appName).toBe('B');
  });

  it('注入 scanDirs 覆盖默认', () => {
    const plists = {
      'X.app/Contents/Info.plist': { CFBundleIdentifier: 'com.x', CFBundleShortVersionString: '1.0', CFBundleDisplayName: 'X' },
    };
    const readdirImpl = makeReaddirMock([{ name: 'X.app', isDir: true }]);
    const out = scanInstalledApps({
      scanDirs: ['/custom/Apps'],
      deps: { readdirImpl, plutilImpl: makePlutilMock(plists), fsImpl: makeFsImplMock(plists) },
    });
    expect(out).toHaveLength(1);
    expect(out[0].bundlePath).toBe('/custom/Apps/X.app');
  });

  it('plist 失败的 bundle → 跳过, 不阻塞其它', () => {
    const plists = {
      'A.app/Contents/Info.plist': { CFBundleIdentifier: 'com.a', CFBundleShortVersionString: '1.0', CFBundleDisplayName: 'A' },
      // B.app plist 缺失 → 跳过
    };
    const readdirImpl = makeReaddirMock([
      { name: 'A.app', isDir: true },
      { name: 'B.app', isDir: true },
    ]);
    const out = scanInstalledApps({
      scanDirs: ['/Applications'],
      deps: { readdirImpl, plutilImpl: makePlutilMock(plists), fsImpl: makeFsImplMock(plists) },
    });
    expect(out).toHaveLength(1);
    expect(out[0].appName).toBe('A');
  });

  it('appName 缺 → 退回 bundleName 去 .app 后缀', () => {
    const plists = {
      'NoDisplayName.app/Contents/Info.plist': {
        CFBundleIdentifier: 'com.nodisplay',
        CFBundleShortVersionString: '1.0',
        // CFBundleDisplayName / CFBundleName 都没有
      },
    };
    const readdirImpl = makeReaddirMock([{ name: 'NoDisplayName.app', isDir: true }]);
    const out = scanInstalledApps({
      scanDirs: ['/Applications'],
      deps: { readdirImpl, plutilImpl: makePlutilMock(plists), fsImpl: makeFsImplMock(plists) },
    });
    expect(out).toHaveLength(1);
    expect(out[0].appName).toBe('NoDisplayName'); // 去掉 .app
  });

  it('空目录 / 目录不存在 → 返 []', () => {
    const readdirImpl = () => { throw new Error('ENOENT'); };
    const out = scanInstalledApps({
      scanDirs: ['/nope'],
      deps: { readdirImpl },
    });
    expect(out).toEqual([]);
  });
});

// ── filterUnmonitored ─────────────────────────────────────────

describe('scanner.filterUnmonitored', () => {
  const SCAN = [
    { bundleName: 'Cursor.app', bundlePath: '/Applications/Cursor.app', appName: 'Cursor', bundleId: 'com.cursor', version: '3.6' },
    { bundleName: 'Kimi.app',   bundlePath: '/Applications/Kimi.app',   appName: 'Kimi',   bundleId: 'com.kimi',   version: '1.0' },
    { bundleName: 'Foo.app',    bundlePath: '/Applications/Foo.app',    appName: 'Foo',    bundleId: 'com.foo',    version: '1.0' },
  ];

  it('monitored bundle 命中 → 过滤掉', () => {
    const out = filterUnmonitored(SCAN, [{ name: 'Cursor', bundle: 'Cursor.app' }], []);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.bundleName)).toEqual(['Kimi.app', 'Foo.app']);
  });

  it('monitored appName 命中 → 过滤掉', () => {
    const out = filterUnmonitored(SCAN, [{ name: 'Kimi', bundle: 'kimi-other.app' }], []);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.appName)).toEqual(['Cursor', 'Foo']);
  });

  it('ignored 命中 (bundle) → 过滤掉', () => {
    const out = filterUnmonitored(SCAN, [], [{ appName: 'Unknown', bundle: 'Cursor.app' }]);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.bundleName)).toEqual(['Kimi.app', 'Foo.app']);
  });

  it('ignored 命中 (appName) → 过滤掉', () => {
    const out = filterUnmonitored(SCAN, [], [{ appName: 'Foo', bundle: '' }]);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.appName)).toEqual(['Cursor', 'Kimi']);
  });

  it('monitored + ignored 组合', () => {
    const out = filterUnmonitored(
      SCAN,
      [{ name: 'Cursor', bundle: 'Cursor.app' }],
      [{ appName: 'Foo', bundle: '' }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].appName).toBe('Kimi');
  });

  it('空 monitored / 缺字段 → 全部返', () => {
    expect(filterUnmonitored(SCAN, [], [])).toHaveLength(3);
    expect(filterUnmonitored(SCAN, null, null)).toHaveLength(3);
    expect(filterUnmonitored(SCAN, undefined, undefined)).toHaveLength(3);
  });

  it('monitored 缺 name/bundle 字段 → 容错', () => {
    const out = filterUnmonitored(SCAN, [null, {}, { name: 42 }, { bundle: 42 }], []);
    expect(out).toHaveLength(3); // 全部返
  });

  it('scanned 非 array → []', () => {
    expect(filterUnmonitored(null, [], [])).toEqual([]);
    expect(filterUnmonitored('string', [], [])).toEqual([]);
  });
});
