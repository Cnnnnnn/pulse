/**
 * tests/renderer/worldcup/navStore.lastActiveNav.test.js
 *
 * P-N HomeGrid 落点 — setActiveNav 落盘行为. mock api.
 * 跑: npx vitest run tests/renderer/worldcup/navStore.lastActiveNav.test.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const saveCalls = [];
vi.mock('../../../src/renderer/api.js', () => ({
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
    const navStore = await import('../../../src/renderer/worldcup/navStore.js');
    // 重置 activeNav 到一个不影响副作用的 nav
    navStore.setActiveNav('versions');
    saveCalls.length = 0;
  });

  it('setActiveNav("home") 不调 saveLastActiveNav (home 是显示态)', async () => {
    const { setActiveNav } = await import('../../../src/renderer/worldcup/navStore.js');
    setActiveNav('home');
    // 给 microtask 一点机会
    await Promise.resolve();
    await Promise.resolve();
    expect(saveCalls).toEqual([]);
  });

  it('setActiveNav("funds") 调 saveLastActiveNav("funds")', async () => {
    const { setActiveNav } = await import('../../../src/renderer/worldcup/navStore.js');
    setActiveNav('funds');
    await Promise.resolve();
    await Promise.resolve();
    expect(saveCalls).toEqual(['funds']);
  });

  it('setActiveNav("metals") 调 saveLastActiveNav("metals")', async () => {
    const { setActiveNav } = await import('../../../src/renderer/worldcup/navStore.js');
    setActiveNav('metals');
    await Promise.resolve();
    await Promise.resolve();
    expect(saveCalls).toEqual(['metals']);
  });

  it('saveLastActiveNav reject 不影响 activeNav (fire-and-forget 语义)', async () => {
    const failingApi = await import('../../../src/renderer/api.js');
    failingApi.api.saveLastActiveNav = vi.fn(() => Promise.reject(new Error('disk full')));
    const { setActiveNav, activeNav } = await import('../../../src/renderer/worldcup/navStore.js');
    setActiveNav('ai-usage');
    await Promise.resolve();
    await Promise.resolve();
    expect(activeNav.value).toBe('ai-usage'); // 仍然切换成功
  });
});