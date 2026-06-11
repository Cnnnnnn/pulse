/**
 * tests/main/library-detect.test.js
 *
 * v2.7.2 (Library Auto-Detect): detect.js orchestrator.
 *
 * 覆盖 (~15 cases):
 *   - 1️⃣ 命中: bundleId 在 known-apps → 返 ok, priority=1
 *   - 1️⃣ 跳过: bundleId 不在 → 1️⃣ 返 not_in_known_apps
 *   - 2️⃣ 启发式触发 (appName 含 code/ide) → 2️⃣ 返条目 (MVP 阶段 ok=false, 留位)
 *   - 2️⃣ 启发式不触发 (appName 普通) → 2️⃣ 无条目
 *   - 3️⃣ brew 命中: cask 猜对 + brew info 返 version → ok
 *   - 3️⃣ brew 失败: cask not found → ok=false reason=cask_not_found
 *   - 3️⃣ brew 跳过: 猜不到 cask → reason=cannot_guess_cask
 *   - 2️⃣3️⃣ 并行: 不互相 block (总耗时 ~max 不是 sum)
 *   - best 优先级: 1️⃣ 赢 > 2️⃣ 赢 > 3️⃣ 赢 > null
 *   - 容错: item 缺字段不抛
 */

import { describe, it, expect, vi } from 'vitest';
const { detectDetector, expandArch, expandArchFields, pickBest } = require('../../src/main/library/detect.js');

describe('detect: 1️⃣ bundleId 静态表', () => {
  it('命中: bundleId 在 known-apps → ok, priority=1, source=known-apps', async () => {
    const r = await detectDetector({
      appName: 'Cursor', bundleName: 'Cursor.app', bundleId: 'com.cursor.cursor',
    });
    expect(r.best).not.toBeNull();
    expect(r.best.priority).toBe(1);
    expect(r.best.type).toBe('cursor_redirect');
    expect(r.results[0].ok).toBe(true);
    expect(r.results[0].source).toBe('known-apps');
  });

  it('1️⃣ 命中时 2️⃣3️⃣ 不跑 (短路)', async () => {
    const r = await detectDetector({
      appName: 'Cursor', bundleName: 'Cursor.app', bundleId: 'com.cursor.cursor',
    });
    // results 应该有且只有 1 条 (priority 1)
    expect(r.results).toHaveLength(1);
    expect(r.results[0].priority).toBe(1);
  });

  it('未命中: 1️⃣ 返 not_in_known_apps, 2️⃣3️⃣ 继续', async () => {
    const r = await detectDetector({
      appName: 'Xsentinel', bundleName: 'Xsentinel.app',
      bundleId: 'com.unknown.xsentinel',
    }, {
      execFileImpl: (cmd, args, opts, cb) => {
        setTimeout(() => cb(null, JSON.stringify({ formulae: [], casks: [] }), ''), 10);
        return { on: () => {} };
      },
    });
    expect(r.results[0].priority).toBe(1);
    expect(r.results[0].ok).toBe(false);
    expect(r.results[0].reason).toBe('not_in_known_apps');
    // 后续 2️⃣3️⃣ 应该跑
    expect(r.results.length).toBeGreaterThan(1);
  });

  it('1️⃣ 字段含 {arch} 替换', async () => {
    const r = await detectDetector({
      appName: 'WorkBuddy', bundleName: 'WorkBuddy.app', bundleId: 'com.codebuddy.workbuddy',
    }, { arch: 'arm64' });
    expect(r.best.fields.url).toContain('arm64');
    expect(r.best.fields.url).not.toContain('{arch}');
  });
});

describe('detect: 2️⃣ 启发式', () => {
  it('appName 含 code → 触发 (MVP 阶段 ok=false 留位)', async () => {
    const r = await detectDetector({
      appName: 'XCode Studio', bundleName: 'XCode.app', bundleId: 'com.unknown.xcode',
    }, { execFileImpl: makeBrewFailingMock() });
    const heur = r.results.find((x) => x.priority === 2);
    expect(heur).toBeDefined();
    expect(heur.source).toBe('heuristic');
  });

  it('appName 普通 → 启发式不触发', async () => {
    const r = await detectDetector({
      appName: 'RandomApp', bundleName: 'Random.app', bundleId: 'com.unknown',
    }, { execFileImpl: makeBrewFailingMock() });
    const heur = r.results.find((x) => x.priority === 2);
    expect(heur).toBeUndefined();
  });
});

describe('detect: 3️⃣ brew', () => {
  it('cask 猜对 + brew 返 version → ok, type=brew_formulae', async () => {
    const r = await detectDetector({
      appName: 'Xsentinel', bundleName: 'Xsentinel.app', bundleId: 'com.unknown.xsentinel',
    }, {
      execFileImpl: (cmd, args, opts, cb) => {
        // 验证 brew 探测 cask 'xsentinel' (lowercase)
        expect(args).toContain('xsentinel');
        setTimeout(() => cb(null, JSON.stringify({
          formulae: [], casks: [{ name: 'xsentinel', versions: { stable: '1.16.6' } }],
        }), ''), 10);
        return { on: () => {} };
      },
    });
    const brew = r.results.find((x) => x.priority === 3);
    expect(brew).toBeDefined();
    expect(brew.ok).toBe(true);
    expect(brew.type).toBe('brew_formulae');
    expect(brew.fields.cask).toBe('xsentinel');
    expect(brew.version).toBe('1.16.6');
    expect(r.best.priority).toBe(3);
  });

  it('cask 不存在 → ok=false, reason=cask_not_found', async () => {
    const r = await detectDetector({
      appName: 'Foo', bundleName: 'Foo.app', bundleId: 'com.unknown.foo',
    }, {
      execFileImpl: (cmd, args, opts, cb) => {
        setTimeout(() => cb(null, JSON.stringify({ formulae: [], casks: [] }), ''), 10);
        return { on: () => {} };
      },
    });
    const brew = r.results.find((x) => x.priority === 3);
    expect(brew.ok).toBe(false);
    expect(brew.reason).toBe('cask_not_found');
    expect(r.best).toBeNull();
  });

  it('cask 猜不到 → reason=cannot_guess_cask', async () => {
    // appName + bundleName 都没有, guessCaskName 返 null
    const r = await detectDetector({
      appName: '',
      bundleName: '',
      bundleId: 'com.unknown',
    }, { execFileImpl: makeBrewFailingMock() });
    const brew = r.results.find((x) => x.priority === 3);
    expect(brew).toBeDefined();
    expect(brew.reason).toBe('cannot_guess_cask');
  });

  it('brew ENOENT → reason=brew_not_installed', async () => {
    const err = new Error('ENOENT'); err.code = 'ENOENT';
    const r = await detectDetector({
      appName: 'Foo', bundleName: 'Foo.app', bundleId: 'com.unknown',
    }, {
      execFileImpl: (cmd, args, opts, cb) => {
        setTimeout(() => cb(err, '', ''), 10);
        return { on: () => {} };
      },
    });
    const brew = r.results.find((x) => x.priority === 3);
    expect(brew.reason).toBe('brew_not_installed');
  });
});

describe('detect: 并行 (2️⃣ 跟 3️⃣)', () => {
  it('2️⃣3️⃣ 并行 — 总耗时 ~max(2, 3) 不是 sum', async () => {
    const t0 = Date.now();
    const r = await detectDetector({
      appName: 'Xsentinel', bundleName: 'Xsentinel.app', bundleId: 'com.unknown',
    }, {
      execFileImpl: (cmd, args, opts, cb) => {
        // brew 探测慢 200ms
        setTimeout(() => cb(null, JSON.stringify({
          formulae: [], casks: [{ name: 'xsentinel', versions: { stable: '1.16.6' } }],
        }), ''), 200);
        return { on: () => {} };
      },
    });
    const elapsed = Date.now() - t0;
    // 2️⃣ 启发式 ~0ms, 3️⃣ ~200ms, 并行总耗时 ~200ms (而不是 200ms+0)
    // 给点 buffer, 不能 > 350ms
    expect(elapsed).toBeLessThan(350);
  });

  it('1️⃣ 命中时 2️⃣3️⃣ 不跑 (短路, 已测) + 总耗时 < 50ms', async () => {
    const t0 = Date.now();
    await detectDetector({
      appName: 'Cursor', bundleName: 'Cursor.app', bundleId: 'com.cursor.cursor',
    });
    expect(Date.now() - t0).toBeLessThan(50);
  });
});

describe('detect: best 选择', () => {
  it('都失败 → best=null', async () => {
    const r = await detectDetector({
      appName: 'X', bundleName: 'X.app', bundleId: 'com.unknown',
    }, {
      execFileImpl: (cmd, args, opts, cb) => {
        setTimeout(() => cb(null, JSON.stringify({ formulae: [], casks: [] }), ''), 10);
        return { on: () => {} };
      },
    });
    expect(r.best).toBeNull();
  });

  it('1️⃣ 命中, 2️⃣3️⃣ 没跑 — best 是 1️⃣', async () => {
    const r = await detectDetector({
      appName: 'Cursor', bundleName: 'Cursor.app', bundleId: 'com.cursor.cursor',
    });
    expect(r.best.priority).toBe(1);
  });

  it('1️⃣ 跳, 3️⃣ 命中 — best 是 3️⃣', async () => {
    const r = await detectDetector({
      appName: 'Xsentinel', bundleName: 'Xsentinel.app', bundleId: 'com.unknown',
    }, {
      execFileImpl: (cmd, args, opts, cb) => {
        setTimeout(() => cb(null, JSON.stringify({
          formulae: [], casks: [{ name: 'xsentinel', versions: { stable: '1.16.6' } }],
        }), ''), 10);
        return { on: () => {} };
      },
    });
    expect(r.best.priority).toBe(3);
    expect(r.best.type).toBe('brew_formulae');
  });
});

describe('detect: 容错', () => {
  it('item 缺字段不抛', async () => {
    const r = await detectDetector({});
    expect(r.results).toBeDefined();
    expect(r.best).toBeNull();
  });
  it('item=null 不抛', async () => {
    const r = await detectDetector(null);
    expect(r).toBeDefined();
  });
});

describe('detect helpers: expandArch', () => {
  it('替换 {arch}', () => {
    expect(expandArch('https://x.com/{arch}/v', 'arm64')).toBe('https://x.com/arm64/v');
  });
  it('替换 {arch_short}', () => {
    expect(expandArch('https://x.com/{arch_short}/v', 'arm64')).toBe('https://x.com/aarch64/v');
    expect(expandArch('https://x.com/{arch_short}/v', 'x64')).toBe('https://x.com/x64/v');
  });
  it('无占位符 → 原样', () => {
    expect(expandArch('https://x.com/v', 'arm64')).toBe('https://x.com/v');
  });
  it('空字符串 / 非 string', () => {
    expect(expandArch('', 'arm64')).toBe('');
    expect(expandArch(null, 'arm64')).toBe(null);
  });
});

describe('detect helpers: expandArchFields', () => {
  it('map 每个 value 替换', () => {
    const out = expandArchFields({ url: 'https://x/{arch}/v', cask: 'cursor' }, 'arm64');
    expect(out.url).toBe('https://x/arm64/v');
    expect(out.cask).toBe('cursor');
  });
  it('空 map / null → 空对象', () => {
    expect(expandArchFields(null, 'arm64')).toEqual({});
    expect(expandArchFields(undefined, 'arm64')).toEqual({});
    expect(expandArchFields({}, 'arm64')).toEqual({});
  });
});

function makeBrewFailingMock() {
  return (cmd, args, opts, cb) => {
    setTimeout(() => cb(null, JSON.stringify({ formulae: [], casks: [] }), ''), 10);
    return { on: () => {} };
  };
}
