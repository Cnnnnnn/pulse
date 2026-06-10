/**
 * tests/config/library-schema.test.js
 *
 * v2.7.0 (My Apps Library, B1): library 块 sanitize + 兼容老 config.
 *
 * 覆盖 (~25 cases):
 *   - sanitizeLibrary 老 raw 缺字段 → DEFAULT
 *   - sortBy 合法/非法值
 *   - pinned: dedupe / 非 string / 超长截断
 *   - ignored: dedupe / 非 string / 超长截断
 *   - tags: 自由文本 / 大小写去重 / 空白 trim / 超长截断 / 单 app 上限 / 总 tag 上限
 *   - sanitizeConfig 顶层: 老 config 无 library 字段 → DEFAULT; 有 library 字段 → sanitize 后挂上
 *   - sanitizeConfig 老 config (含 apps + notifications + aiSessions) library 字段不破坏其它字段
 */

import { describe, it, expect } from 'vitest';
const { sanitizeLibrary, defaultLibrary, sanitizeConfig, validateConfig } = require('../../src/config/schema.js');

describe('library schema — sanitizeLibrary (standalone)', () => {
  it('raw undefined / null / 非 object → DEFAULT', () => {
    expect(sanitizeLibrary(undefined)).toEqual({ sortBy: 'starred', pinned: [], ignored: [], tags: {} });
    expect(sanitizeLibrary(null)).toEqual({ sortBy: 'starred', pinned: [], ignored: [], tags: {} });
    expect(sanitizeLibrary('string')).toEqual({ sortBy: 'starred', pinned: [], ignored: [], tags: {} });
    expect(sanitizeLibrary(42)).toEqual({ sortBy: 'starred', pinned: [], ignored: [], tags: {} });
    expect(sanitizeLibrary([])).toEqual({ sortBy: 'starred', pinned: [], ignored: [], tags: {} });
  });

  it('defaultLibrary() 返纯净新对象, 跟 sanitize 兼容', () => {
    const a = defaultLibrary();
    const b = defaultLibrary();
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // 新引用
    a.pinned.push('X');
    expect(b.pinned).toEqual([]); // 不污染
    expect(sanitizeLibrary(a)).toEqual(a); // 已经是合法格式 → 透传
  });

  it('sortBy: 合法值透传, 非法值 → "starred"', () => {
    for (const v of ['starred', 'name', 'lastUsed', 'updateStatus']) {
      expect(sanitizeLibrary({ sortBy: v }).sortBy).toBe(v);
    }
    for (const v of ['hacked', 'STARRED', '', null, 0, {}, []]) {
      expect(sanitizeLibrary({ sortBy: v }).sortBy).toBe('starred');
    }
  });

  it('pinned: dedupe + 保留首次出现 + 跳过非 string + 跳过空字符串', () => {
    const r = sanitizeLibrary({ pinned: ['A', 'B', 'A', '', null, 42, 'C', 'B'] });
    expect(r.pinned).toEqual(['A', 'B', 'C']);
  });

  it('pinned: 超 200 截断', () => {
    const big = Array.from({ length: 300 }, (_, i) => `app${i}`);
    expect(sanitizeLibrary({ pinned: big }).pinned).toHaveLength(200);
    expect(sanitizeLibrary({ pinned: big }).pinned[0]).toBe('app0');
    expect(sanitizeLibrary({ pinned: big }).pinned[199]).toBe('app199');
  });

  it('pinned: 缺字段 → []', () => {
    expect(sanitizeLibrary({}).pinned).toEqual([]);
    expect(sanitizeLibrary({ pinned: 'not array' }).pinned).toEqual([]);
    expect(sanitizeLibrary({ pinned: null }).pinned).toEqual([]);
  });

  it('ignored: { appName, bundle } 对象数组, dedupe by appName, string 元素容错丢弃', () => {
    const r = sanitizeLibrary({
      ignored: [
        { appName: 'Foo', bundle: 'Foo.app' },
        { appName: 'Bar', bundle: 'Bar.app' },
        { appName: 'Foo', bundle: 'Foo.app' }, // dup appName → skip
        'just-a-string',                       // 非 object → skip
        null,                                  // null → skip
        { appName: '', bundle: 'Empty.app' },  // appName 空 + bundle 非空 → still kept (at least bundle)
        { appName: 'Baz', bundle: '' },        // bundle 空, appName 非空 → still kept
        { appName: '', bundle: '' },           // 都空 → skip
      ],
    });
    expect(r.ignored).toEqual([
      { appName: 'Foo', bundle: 'Foo.app' },
      { appName: 'Bar', bundle: 'Bar.app' },
      { appName: '', bundle: 'Empty.app' },
      { appName: 'Baz', bundle: '' },
    ]);
  });

  it('ignored: 超 500 截断', () => {
    const big = Array.from({ length: 600 }, (_, i) => ({ appName: `app${i}`, bundle: `app${i}.app` }));
    expect(sanitizeLibrary({ ignored: big }).ignored).toHaveLength(500);
    expect(sanitizeLibrary({ ignored: big }).ignored[0]).toEqual({ appName: 'app0', bundle: 'app0.app' });
  });

  it('tags: 严格大小写 — Dev / dev / DEV 是 3 个独立 tag', () => {
    const r = sanitizeLibrary({
      tags: {
        Cursor: ['Dev', 'dev', 'DEV', 'AI', 'ai', '  tools  '],
      },
    });
    // 严格大小写: 全部独立; 空白 trim; 'AI' / 'ai' 都保留
    expect(r.tags).toEqual({ Cursor: ['Dev', 'dev', 'DEV', 'AI', 'ai', 'tools'] });
  });

  it('tags: 单 app 超 10 tag 截断 (前 10)', () => {
    const r = sanitizeLibrary({
      tags: { Cursor: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] },
    });
    expect(r.tags.Cursor).toHaveLength(10);
    expect(r.tags.Cursor[0]).toBe('a');
    expect(r.tags.Cursor[9]).toBe('j');
  });

  it('tags: 单 tag 超 32 字符截断丢弃 (整个 tag 丢, 不裁切)', () => {
    const long = 'a'.repeat(33);
    const ok = 'a'.repeat(32);
    const r = sanitizeLibrary({ tags: { Cursor: [long, ok] } });
    expect(r.tags.Cursor).toEqual([ok]);
  });

  it('tags: 总 tag 数超 50 → 后续 app 跳过', () => {
    // 6 app × 9 tag = 54, 截到 50 (前 5 个 app full + 第 6 个剩 5)
    const tags = {};
    for (let i = 0; i < 6; i++) tags[`app${i}`] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const r = sanitizeLibrary({ tags });
    const total = Object.values(r.tags).reduce((s, l) => s + l.length, 0);
    expect(total).toBe(50);
    // 顺序按 Object.entries, 前 5 app full, 第 6 个 5
    expect(r.tags.app0).toHaveLength(9);
    expect(r.tags.app4).toHaveLength(9);
    expect(r.tags.app5).toHaveLength(5);
  });

  it('tags: 非 string / 非 array 元素 / 非 object 顶层 → {}', () => {
    expect(sanitizeLibrary({ tags: null }).tags).toEqual({});
    expect(sanitizeLibrary({ tags: 'string' }).tags).toEqual({});
    expect(sanitizeLibrary({ tags: { A: 'not array' } }).tags).toEqual({});
    expect(sanitizeLibrary({ tags: { A: null } }).tags).toEqual({});
    expect(sanitizeLibrary({ tags: { A: 42 } }).tags).toEqual({});
  });

  it('tags: 整个 entry 元素都空 → 该 app 不出现 (而不是 [])', () => {
    const r = sanitizeLibrary({ tags: { Cursor: ['', '   ', null, 42] } });
    expect(r.tags).toEqual({});
  });

  it('完整合法 raw → 全字段透传', () => {
    const r = sanitizeLibrary({
      sortBy: 'lastUsed',
      pinned: ['Cursor', 'Figma'],
      ignored: [{ appName: 'Old', bundle: 'Old.app' }],
      tags: { Cursor: ['Dev', 'dev', 'AI'] },
    });
    expect(r).toEqual({
      sortBy: 'lastUsed',
      pinned: ['Cursor', 'Figma'],
      ignored: [{ appName: 'Old', bundle: 'Old.app' }],
      // 严格大小写: Dev / dev / AI 全部独立保留
      tags: { Cursor: ['Dev', 'dev', 'AI'] },
    });
  });
});

describe('library schema — sanitizeConfig 顶层 (兼容老 config)', () => {
  it('老 config (无 library 字段) → library: DEFAULT', () => {
    const cfg = sanitizeConfig({
      check_on_launch: true,
      apps: [
        { name: 'Cursor', bundle: 'Cursor.app', detectors: [{ type: 'brew_formulae', cask: 'cursor' }] },
      ],
    });
    expect(cfg.library).toEqual({ sortBy: 'starred', pinned: [], ignored: [], tags: {} });
  });

  it('老 config (空对象) → library: DEFAULT + apps: []', () => {
    const cfg = sanitizeConfig({});
    expect(cfg.library).toEqual({ sortBy: 'starred', pinned: [], ignored: [], tags: {} });
    expect(cfg.apps).toEqual([]);
  });

  it('老 config (null) → 兜底 (跟原 sanitizeConfig 兜底合约一致, library 字段 caller 端 fallback)', () => {
    const cfg = sanitizeConfig(null);
    expect(cfg).toEqual({ check_on_launch: true, apps: [] });
    // 注释: 顶层块 (library / aiSessions / notifications) 在 null 兜底路径下不返,
    //       caller 端各自走 fallback — 这是 sanitizeConfig 的设计哲学, B1 不动它.
  });

  it('新 config (有 library 字段) → library 挂上, 其它字段不破坏', () => {
    const cfg = sanitizeConfig({
      check_on_launch: false,
      apps: [
        { name: 'Cursor', bundle: 'Cursor.app', detectors: [{ type: 'brew_formulae', cask: 'cursor' }] },
      ],
      notifications: { quiet_hours_start: '22:00', quiet_hours_end: '08:00', cooldown_hours: 12, check_interval_hours: 6 },
      aiSessions: { enabled: true, provider: 'deepseek' },
      library: {
        sortBy: 'name',
        pinned: ['Cursor'],
        ignored: [{ appName: 'Old', bundle: 'Old.app' }],
        tags: { Cursor: ['dev', 'ai'] },
      },
    });
    expect(cfg.check_on_launch).toBe(false);
    expect(cfg.apps).toHaveLength(1);
    expect(cfg.apps[0].name).toBe('Cursor');
    expect(cfg.notifications.quiet_hours_start).toBe('22:00');
    expect(cfg.aiSessions.enabled).toBe(true);
    expect(cfg.aiSessions.provider).toBe('deepseek');
    expect(cfg.library).toEqual({
      sortBy: 'name',
      pinned: ['Cursor'],
      ignored: [{ appName: 'Old', bundle: 'Old.app' }],
      tags: { Cursor: ['dev', 'ai'] },
    });
  });

  it('validateConfig 不拒 library 字段 (best-effort, 不深验证)', () => {
    // validate 阶段不深验证 library, 由 sanitize 兜底
    const v = validateConfig({
      apps: [
        { name: 'Cursor', bundle: 'Cursor.app', detectors: [{ type: 'brew_formulae', cask: 'cursor' }] },
      ],
      library: { sortBy: 'hacked', pinned: 'not array' },
    });
    expect(v.errors).toEqual([]); // library 不产生 errors
  });

  it('library 字段 sanitize 错误不影响整体 config valid', () => {
    const cfg = sanitizeConfig({
      apps: [
        { name: 'Cursor', bundle: 'Cursor.app', detectors: [{ type: 'brew_formulae', cask: 'cursor' }] },
      ],
      library: 'broken',
    });
    expect(cfg.apps).toHaveLength(1);
    expect(cfg.library).toEqual({ sortBy: 'starred', pinned: [], ignored: [], tags: {} });
  });
});
