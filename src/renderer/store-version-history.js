/**
 * src/renderer/store-version-history.js
 *
 * 2026-06-14: App rollback · renderer-side state for VersionHistoryDrawer.
 *
 * Signals:
 *   - versionHistoryOpen: bool          drawer 是否打开
 *   - versionHistoryApp: string|null    当前正在看哪个 app
 *   - versionHistoryEntries: Array      当前 app 的回滚候选 (newest first)
 *   - versionHistoryTotalSize: number   全部 app 备份占盘 bytes
 *   - versionHistoryLoading: bool       fetch 中
 *   - versionHistoryInFlight: Set       正在执行 rollback/delete 的 app/version 集合
 *
 * 设计:
 *   - 独立 signal store, 不污染 store.js. 跟 diagnostics-store 同样套路.
 *   - 拉数据走 api.getVersionHistory(name) — 走 preload bridge (Task 8 暴露).
 *   - rollback/delete 也走 api.rollbackApp / api.deleteBackup.
 *   - 订阅 version-history-updated 事件 (Task 9 wire up):
 *     drawer 打开时 listener 才需要; 关闭时清掉.
 *   - inFlight 跟踪: 单个 (app, version) 锁, 避免用户连点两次.
 */
import { signal } from "@preact/signals";

export const versionHistoryOpen = signal(false);
export const versionHistoryApp = signal(null);
export const versionHistoryEntries = signal([]);
export const versionHistoryTotalSize = signal(0);
export const versionHistoryLoading = signal(false);
const _inFlight = new Set();
export const versionHistoryInFlight = signal(new Set());

function setInFlight(key, on) {
  const next = new Set(_inFlight);
  if (on) next.add(key);
  else next.delete(key);
  versionHistoryInFlight.value = next;
}

export function openVersionHistory(appName) {
  versionHistoryOpen.value = true;
  versionHistoryApp.value = appName;
  versionHistoryEntries.value = [];
  versionHistoryTotalSize.value = 0;
}

export function closeVersionHistory() {
  versionHistoryOpen.value = false;
  versionHistoryApp.value = null;
  versionHistoryEntries.value = [];
}

export function isInFlight(appName, version) {
  return _inFlight.has(`${appName}::${version}`);
}

/**
 * 拉一个 app 的 history. 没 api (测试环境) → safe noop.
 * @param {string} appName
 */
export async function fetchVersionHistory(appName) {
  if (!appName) return;
  const api = typeof window !== "undefined" ? window.api : null;
  if (!api || typeof api.getVersionHistory !== "function") return;
  versionHistoryLoading.value = true;
  try {
    const r = await api.getVersionHistory(appName);
    if (r && r.ok) {
      versionHistoryEntries.value = r.entries || [];
      versionHistoryTotalSize.value = typeof r.totalSizeBytes === "number" ? r.totalSizeBytes : 0;
    }
  } catch {
    // ignore — 失败保持旧 entries
  } finally {
    versionHistoryLoading.value = false;
  }
}

/**
 * 触发回滚. in-flight 锁 + 错误时保留 entries 状态.
 * @param {string} appName
 * @param {string} version
 * @returns {Promise<{ok, reason?, error?}>}
 */
export async function doRollback(appName, version) {
  if (!appName || !version) return { ok: false, reason: "invalid_args" };
  const key = `${appName}::${version}`;
  if (_inFlight.has(key)) return { ok: false, reason: "in_progress" };
  const api = typeof window !== "undefined" ? window.api : null;
  if (!api || typeof api.rollbackApp !== "function") {
    return { ok: false, reason: "no_api" };
  }
  setInFlight(key, true);
  try {
    const r = await api.rollbackApp(appName, version);
    return r || { ok: false, reason: "no_response" };
  } catch (err) {
    return { ok: false, reason: "threw", error: (err && err.message) || String(err) };
  } finally {
    setInFlight(key, false);
  }
}

/**
 * 删备份 + 删 state entry.
 * @param {string} appName
 * @param {string} version
 */
export async function deleteBackup(appName, version) {
  if (!appName || !version) return { ok: false, reason: "invalid_args" };
  const key = `${appName}::${version}`;
  if (_inFlight.has(key)) return { ok: false, reason: "in_progress" };
  const api = typeof window !== "undefined" ? window.api : null;
  if (!api || typeof api.deleteBackup !== "function") {
    return { ok: false, reason: "no_api" };
  }
  setInFlight(key, true);
  try {
    const r = await api.deleteBackup(appName, version);
    if (r && r.ok) {
      versionHistoryEntries.value = versionHistoryEntries.value.filter(
        (e) => e.to !== version,
      );
    }
    return r || { ok: false, reason: "no_response" };
  } catch (err) {
    return { ok: false, reason: "threw", error: (err && err.message) || String(err) };
  } finally {
    setInFlight(key, false);
  }
}