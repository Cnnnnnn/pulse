/**
 * tests/renderer/worldcup/navStore.lastActiveNav.test.js
 *
 * P-N HomeGrid 落点 — setActiveNav 落盘行为. mock api.
 * 跑: npx vitest run tests/renderer/worldcup/navStore.lastActiveNav.test.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const saveCalls = [];
vi.mock('../../../src/renderer/api.ts', () => ({
  api: {
    saveLastActiveNav: (key) => {
      saveCalls.push(key);
      return Promise.resolve();
    },
  },
}));

describe('setActiveNav 落盘白名单', () => {
  beforeEach(async () => {
    saveCalls.length = 0;
    // 动态 import 确保 vi.mock 先注入
    const navStore = await import('../../../src/renderer/nav/navStore.ts');
    // 重置 activeNav 到一个不影响副作用的 nav
    navStore.setActiveNav('versions');
    saveCalls.length = 0;
  });

  it('setActiveNav("home") 不调 saveLastActiveNav (home 是显示态)', async () => {
    const { setActiveNav } = await import('../../../src/renderer/nav/navStore.ts');
    setActiveNav('home');
    // 给 microtask 一点机会
    await Promise.resolve();
    await Promise.resolve();
    expect(saveCalls).toEqual([]);
  });

  it('setActiveNav("funds") alias → "invest" → saveLastActiveNav("invest")', async () => {
    const { setActiveNav } = await import('../../../src/renderer/nav/navStore.ts');
    setActiveNav('funds');
    await Promise.resolve();
    await Promise.resolve();
    expect(saveCalls).toEqual(['invest']);
  });

  it('setActiveNav("metals") alias → "invest" → saveLastActiveNav("invest")', async () => {
    const { setActiveNav } = await import('../../../src/renderer/nav/navStore.ts');
    setActiveNav('metals');
    await Promise.resolve();
    await Promise.resolve();
    expect(saveCalls).toEqual(['invest']);
  });

  it('saveLastActiveNav reject 不影响 activeNav (fire-and-forget 语义)', async () => {
    const failingApi = await import('../../../src/renderer/api.ts');
    failingApi.api.saveLastActiveNav = vi.fn(() => Promise.reject(new Error('disk full')));
    const { setActiveNav, activeNav } = await import('../../../src/renderer/nav/navStore.ts');
    setActiveNav('ai-usage');
    await Promise.resolve();
    await Promise.resolve();
    expect(activeNav.value).toBe('ai-usage'); // 仍然切换成功
  });
});