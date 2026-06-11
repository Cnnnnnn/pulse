/**
 * src/renderer/worldcup/store.js
 *
 * v2.9.0 世界杯专栏 — renderer store (3 signal, 0 跟 v2.6 主体共享)
 *
 * 拍准 6.6: 跟版本检查 主体 完全独立, 不共享 store / signal
 */

import { signal } from '@preact/signals';

// 3 signal
// worldcupMatches: { name, groups, matches }  (parsed data) | null (未拉取)
// worldcupLoading: boolean
// worldcupError:   string | null
export const worldcupMatches = signal(null);
export const worldcupLoading = signal(false);
export const worldcupError = signal(null);

/**
 * 拉取 + 解析 + 写 store. 失败置 error.
 * @returns {Promise<boolean>} true=成功
 */
export async function loadWorldcupFixtures() {
  if (worldcupLoading.value) return false; // 并发守卫
  worldcupLoading.value = true;
  worldcupError.value = null;
  try {
    if (typeof window === 'undefined' || !window.api || typeof window.api.worldcupFetchFixtures !== 'function') {
      worldcupError.value = 'worldcup IPC 不可用';
      return false;
    }
    const r = await window.api.worldcupFetchFixtures();
    if (!r || !r.ok) {
      worldcupError.value = (r && r.reason) || '加载失败';
      return false;
    }
    worldcupMatches.value = r.data || null;
    return true;
  } catch (err) {
    worldcupError.value = (err && err.message) || '加载异常';
    return false;
  } finally {
    worldcupLoading.value = false;
  }
}

export function clearWorldcupError() {
  worldcupError.value = null;
}
