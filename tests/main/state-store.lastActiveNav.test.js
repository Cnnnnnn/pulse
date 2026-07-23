/**
 * tests/main/state-store.lastActiveNav.test.js
 *
 * P-N HomeGrid 落点 — state-store load/save 纯函数测试.
 * 跑: npx vitest run tests/main/state-store.lastActiveNav.test.js
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmpDir;
let statePath;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'pulse-nav-test-'));
  statePath = join(tmpDir, 'state.json');
});

const cleanup = () => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} };

describe('loadLastActiveNav', () => {
  it('缺字段 / 状态文件不存在 → 返回 null', async () => {
    const { loadLastActiveNav } = await import('../../src/main/state-store.ts');
    expect(loadLastActiveNav(statePath)).toBeNull();
    cleanup();
  });

  it('字段值 "home" → 返回 null (不污染)', async () => {
    const fs = await import('fs');
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, last_active_nav: 'home' }));
    const { loadLastActiveNav } = await import('../../src/main/state-store.ts');
    expect(loadLastActiveNav(statePath)).toBeNull();
    cleanup();
  });

  it('字段值合法 (e.g. "funds") → 返回该值', async () => {
    const fs = await import('fs');
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, last_active_nav: 'funds' }));
    const { loadLastActiveNav } = await import('../../src/main/state-store.ts');
    expect(loadLastActiveNav(statePath)).toBe('funds');
    cleanup();
  });

  it('字段值未知 key → 返回 null', async () => {
    const fs = await import('fs');
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, last_active_nav: 'something-bogus' }));
    const { loadLastActiveNav } = await import('../../src/main/state-store.ts');
    expect(loadLastActiveNav(statePath)).toBeNull();
    cleanup();
  });
});

describe('saveLastActiveNav', () => {
  it('非法 key 抛 TypeError', async () => {
    const { saveLastActiveNav } = await import('../../src/main/state-store.ts');
    expect(() => saveLastActiveNav('home', statePath)).toThrow(TypeError);
    expect(() => saveLastActiveNav('', statePath)).toThrow(TypeError);
    expect(() => saveLastActiveNav(null, statePath)).toThrow(TypeError);
    cleanup();
  });

  it('合法 key 写盘 → reload 可读到', async () => {
    const { saveLastActiveNav, loadLastActiveNav } = await import('../../src/main/state-store.ts');
    saveLastActiveNav('metals', statePath);
    expect(loadLastActiveNav(statePath)).toBe('metals');
    cleanup();
  });

  it('写 last_active_nav 不影响 active_category 等其它字段', async () => {
    const fs = await import('fs');
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1, apps: {}, active_category: 'ai', last_opened: { foo: 1 },
    }));
    const { saveLastActiveNav, loadLastActiveNav } = await import('../../src/main/state-store.ts');
    saveLastActiveNav('worldcup', statePath);
    const reloaded = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(reloaded.active_category).toBe('ai');
    expect(reloaded.last_opened).toEqual({ foo: 1 });
    expect(reloaded.last_active_nav).toBe('worldcup');
    cleanup();
  });
});
