/**
 * src/renderer/trayConfigStore.js
 *
 * Phase v1: tray 配置 modal 的信号状态.
 *
 * main 拥有「modal 是否打开」的真相 — IPC 推 open / close signal 时设值.
 * Esc / 遮罩 / 取消 / 保存 都通过 ipcRenderer.send('tray:close-config')
 * 回到 main, main 不 push close 时 renderer 自己 close 不一致 (避免双向所有权).
 *
 * 但作为兜底 (e.g. preload listener 加载失败), closeTrayConfig() 仍可本地直接调用.
 */
import { signal } from "@preact/signals";

export const trayConfigOpen = signal(false);

export function openTrayConfig() {
  trayConfigOpen.value = true;
}

export function closeTrayConfig() {
  trayConfigOpen.value = false;
}
