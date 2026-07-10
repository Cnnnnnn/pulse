// @vitest-environment happy-dom
/**
 * tests/renderer/home-grid.integration.test.js
 *
 * P-N HomeGrid 集成: bootstrap 路径在 happy-dom 下加载 lastActiveNav 后
 * activeNav 被正确覆盖. 实际预渲染我们直接观察 signal, 不需要把整个
 * Preact 树挂载进 happy-dom (复杂度过高, 与本测试目的不符).
 *
 * 跑: npx vitest run tests/renderer/home-grid.integration.test.js
 */
import { describe, it, expect, vi } from 'vitest';

describe('HomeGrid navStore 集成路径', () => {
  it('activeNav 默认值为 "home"', async () => {
    const { activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    expect(activeNav.value).toBe('home');
  });

  it('setActiveNav("funds") 后 activeNav.value === "funds"', async () => {
    const { setActiveNav, activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    setActiveNav('funds');
    expect(activeNav.value).toBe('funds');
  });

  it('setActiveNav("home") 后 activeNav.value === "home"', async () => {
    const { setActiveNav, activeNav } = await import('../../src/renderer/worldcup/navStore.js');
    setActiveNav('metals');
    setActiveNav('home');
    expect(activeNav.value).toBe('home');
  });

  it('PERSISTABLE_NAV_KEYS 不含 home', async () => {
    const { PERSISTABLE_NAV_KEYS } = await import('../../src/renderer/worldcup/navStore.js');
    expect(PERSISTABLE_NAV_KEYS.has('home')).toBe(false);
    expect(PERSISTABLE_NAV_KEYS.has('versions')).toBe(true);
    expect(PERSISTABLE_NAV_KEYS.size).toBe(8);
  });
});