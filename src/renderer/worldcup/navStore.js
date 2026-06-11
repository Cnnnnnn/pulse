/**
 * src/renderer/worldcup/navStore.js
 *
 * v2.9.0 世界杯专栏 — renderer 端 nav state (2 signal)
 *
 * 拍 6.4 + 6.5: navCollapsed + activeNav
 * 跟 6.6 一致: 完全独立, 不放 v2.6 主体 store
 */

import { signal } from '@preact/signals';

// activeNav: 'worldcup' | 'versions', 默认 'versions' (拍 default_versions)
export const activeNav = signal('versions');
export const navCollapsed = signal(false);

export function setActiveNav(key) {
  if (key === 'worldcup' || key === 'versions') {
    activeNav.value = key;
  }
}

export function toggleNavCollapsed() {
  navCollapsed.value = !navCollapsed.value;
}
