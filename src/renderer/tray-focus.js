/**
 * src/renderer/tray-focus.js
 *
 * 接收主进程推的 tray:focus 事件, 做三件事:
 *   1) 切到对应 tab (activeNav)
 *   2) 等布局 mount (~80ms) 后 scrollIntoView 目标 row
 *   3) 如果 action === 'upgrade', 调 requestUpgrade (Task A3 是 stub, Task A4 替换)
 *
 * 当前只实现 IconRefresh 检查更新段 (Task A3); 其他段 (B/C/D) 在各自任务里扩展.
 */
import { setActiveNav } from "./worldcup/navStore.js";
import { requestUpgrade } from "./upgrade-actions.js";
import { taggedLog } from "./log.js";

const log = taggedLog("[tray-focus]");

let _subscribed = false;

/**
 * 启动期订阅. 幂等.
 * @param {{ onTrayFocus?: Function }} api - window.api (preload 暴露)
 */
export function subscribeTrayFocus(api) {
  if (_subscribed) return;
  _subscribed = true;
  if (api && typeof api.onTrayFocus === "function") {
    api.onTrayFocus(handleFocus);
  }
}

async function handleFocus(data) {
  if (!data) return;
  log.info("handleFocus", data);

  // 1) 切 tab
  if (data.tab === "versions") {
    setActiveNav("versions");
  }
  // 其他 tab 在 B/C/D 任务里加分支

  // 2) 等布局 mount
  await new Promise((r) => setTimeout(r, 80));

  // 3) 滚到目标
  if (data.tab === "versions" && data.rowName) {
    await scrollToRowName(data.rowName);
  }

  // 4) 弹 modal (升级确认)
  if (data.action === "upgrade" && data.rowName) {
    try {
      await requestUpgrade(data.rowName);
    } catch (err) {
      log.warn("requestUpgrade failed:", err && err.message);
    }
  }
}

async function scrollToRowName(name) {
  // AppRow 渲染带 data-name (Pulse 现状) 或 data-app-name (Task A3 兼容)
  const escaped = String(name || "").replace(/"/g, '\\"');
  const el = document.querySelector(`[data-app-name="${escaped}"]`)
    || document.querySelector(`.app-row[data-name="${escaped}"]`);
  if (el && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    log.warn(`scrollToRowName: no element for "${name}"`);
  }
}
