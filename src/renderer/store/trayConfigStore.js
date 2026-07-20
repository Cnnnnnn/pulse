/**
 * src/renderer/trayConfigStore.js
 *
 * Phase v1: tray 配置 modal 的信号状态.
 *
 * 拥有两个真相:
 *  - trayConfigOpen:    modal 是否打开 (main IPC 推信号)
 *  - trayMenuPrefs:     当前生效的 prefs (供 SideNav 过滤 nav tab 用)
 *
 * main 拥有「modal 是否打开」的真相 — IPC 推 open / close signal 时设值.
 * Esc / 遮罩 / 取消 / 保存 都通过 ipcRenderer.send('tray:close-config')
 * 回到 main, main 不 push close 时 renderer 自己 close 不一致 (避免双向所有权).
 *
 * 但作为兜底 (e.g. preload listener 加载失败), closeTrayConfig() 仍可本地直接调用.
 */
import { signal } from "@preact/signals";
import { DEFAULT_PREFS } from "@main/tray-menu-prefs.js";

export const trayConfigOpen = signal(false);

// 默认全开,bootstrap 时被 main 拉的 prefs 覆盖.
export const trayMenuPrefs = signal(DEFAULT_PREFS);

export function openTrayConfig() {
  trayConfigOpen.value = true;
}

export function closeTrayConfig() {
  trayConfigOpen.value = false;
}

/**
 * main → renderer 推 prefs 后调用 (bootstrap 拉一次 + savePrefs 成功后再推一次).
 * 渲染端 SideNav 订阅 trayMenuPrefs 过滤 nav tab.
 * @param {{version:number, segments: Record<string, boolean>}} prefs
 */
export function applyTrayPrefsFromMain(prefs) {
  if (!prefs || typeof prefs !== "object" || !prefs.segments) return;
  trayMenuPrefs.value = prefs;
}
