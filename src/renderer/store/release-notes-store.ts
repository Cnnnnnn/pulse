/**
 * src/renderer/release-notes-store.js
 *
 * ON: 渲染端状态. 4 个 signal:
 *   - open (boolean): wizard 是否显示
 *   - entryPath ('auto' | 'manual'): 入口, 决定关闭时是否 mark-seen
 *   - payload (object | null): { version, changelogMd, slides }
 *   - loading (boolean): 拉取中 (本期未实际使用, 留作 future)
 *
 * Header Trigger 读 entryPath + payload 决定红点:
 *   entryPath='auto' && payload !== null → 显示 NEW
 * manual 路径不写已看, 不影响红点.
 *
 * 4 个 signal 拆开 (而非合并 state), 是为了避免 payload 变 (拉新数据) 误触发
 * 其他 useEffect; 跟 AppShell 里 digestDrawerOpen / watchlistOpen 单 boolean 风格一致.
 */

import { signal } from '@preact/signals';

export const releaseNotesOpen = signal(false);
export const releaseNotesEntryPath = signal('auto'); // 'auto' | 'manual'
export const releaseNotesPayload = signal(null);
export const releaseNotesLoading = signal(false);

/**
 * 打开 wizard. 在 bootstrap (auto) 或 Header click (manual) 时调.
 * @param {'auto' | 'manual'} entryPath
 * @param {object} payload { version, changelogMd, slides }
 */
export function openReleaseNotes(entryPath, payload) {
  releaseNotesEntryPath.value = entryPath;
  releaseNotesPayload.value = payload;
  releaseNotesOpen.value = true;
}

/**
 * 关闭 wizard. 总是清 open, 不动 entryPath / payload (call 后续 clear)。
 * entryPath 由 mark-seen 完成后由 caller 清, 避免 race.
 */
export function closeReleaseNotes() {
  releaseNotesOpen.value = false;
}

/**
 * 全清 (wizard 关闭后清 payload, 防止下次 open 时看到老 data).
 */
export function clearReleaseNotes() {
  releaseNotesOpen.value = false;
  releaseNotesEntryPath.value = 'auto';
  releaseNotesPayload.value = null;
  releaseNotesLoading.value = false;
}

/** Test-only reset. */
export function __resetForTest() {
  clearReleaseNotes();
}
