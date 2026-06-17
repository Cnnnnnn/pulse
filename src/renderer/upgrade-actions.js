/**
 * src/renderer/upgrade-actions.js
 *
 * 触发单个 app 的升级流程: 通过已有 IPC 调主进程升级, 弹确认 modal.
 * 由 tray-focus 在 action === 'upgrade' 时调用.
 *
 * Task A3: stub — 只 toast 提示用户去面板操作.
 * Task A4: 替换为真弹 BulkUpgradeModal 调起升级.
 */
import { taggedLog } from "./log.js";
import { showToast } from "./store.js";

const log = taggedLog("[upgrade-actions]");

/**
 * 触发单个 app 升级.
 * Task A3: stub — toast 提示.
 * Task A4: 替换为 bulk upgrade flow.
 * @param {string} appName
 */
export async function requestUpgrade(appName) {
  if (!appName) return;
  log.info(`requestUpgrade (stub): ${appName}`);
  showToast(`请从面板升级 ${appName} (Task A4 实现 modal)`, "info", 5000);
}
