/**
 * src/renderer/command-palette-store.js
 *
 * Cmd+K 全局命令面板 state. 不自动 reset (用户中断搜索再打开能恢复).
 */
import { signal } from "@preact/signals";

export const paletteOpen = signal(false);
export const paletteQuery = signal("");
export const paletteResults = signal([]);
export const paletteSelectedIndex = signal(0);

export function openPalette() { paletteOpen.value = true; }
export function closePalette() { paletteOpen.value = false; }
export function setPaletteQuery(q) { paletteQuery.value = q; }
export function setPaletteResults(arr) { paletteResults.value = arr; }
export function setPaletteSelectedIndex(n) {
  paletteSelectedIndex.value = Math.max(0, n);
}
