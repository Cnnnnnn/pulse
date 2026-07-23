/**
 * src/main/self-updater.ts
 *
 * P52 — Pulse 自身更新封装.
 *
 * 分两层:
 *  - 纯函数层 (本文件): reduceUpdateState 把 autoUpdater 事件映射到状态机,
 *    compareVersions 版本比较. 可单测, 无副作用.
 *  - 接线层 (bootstrap/schedulers.js): require electron-updater, 订阅事件,
 *    dispatch action, 暴露 IPC. 不可单测, smoke test + 手动验证.
 *
 * 半自动档 (phase 1): 检测+下载+提示手动确认安装. mac 未签名时
 * quitAndInstall 需用户交互. autoInstallOnAppQuit = false 不自动装.
 */
"use strict";

const INITIAL_UPDATE_STATE = {
  // idle | checking | available | downloading | downloaded | error
  status: "idle",
  available: false,
  version: null,
  releaseNotes: null,
  downloadPercent: 0,
  readyToInstall: false,
  error: null,
  lastCheckedAt: null,
};

/**
 * Semver 主体比较 (忽略 -beta / -rc 等预发布后缀).
 * 输入 "2.47.0-beta", "2.46.0" → 1 (remote > local)
 * 输入 "2.46.0", "2.46.0" → 0
 * 输入 "2.45.0", "2.46.0" → -1
 *
 * @param {string} remote  GitHub Release 上的 version
 * @param {string} local   app.getVersion()
 * @returns {number} 1 / 0 / -1
 */
export function compareVersions(remote: string, local: string): number {
  // 简单语义版本比较, 去掉预发布后缀比主体
  const norm = (v: string) =>
    String(v || "")
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const r = norm(remote);
  const l = norm(local);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return 1;
    if ((r[i] || 0) < (l[i] || 0)) return -1;
  }
  return 0;
}

/**
 * Reducer: autoUpdater 事件 → 状态. 纯函数.
 * 事件 type: CHECKING | UPDATE_AVAILABLE | UPDATE_NOT_AVAILABLE |
 *            DOWNLOAD_PROGRESS | UPDATE_DOWNLOADED | ERROR
 *
 * @param {object} state  上一次状态 (必传 INITIAL_UPDATE_STATE)
 * @param {object} action { type, version?, releaseNotes?, percent?, message? }
 * @returns {object} 新状态 (新对象, 不 mutate state)
 */
export function reduceUpdateState(state: any, action: any): any {
  if (!state || typeof state !== "object") return INITIAL_UPDATE_STATE;
  if (!action || typeof action !== "object") return state;
  switch (action.type) {
    case "CHECKING":
      return { ...state, status: "checking", error: null };
    case "UPDATE_AVAILABLE":
      return {
        ...state,
        status: "available",
        available: true,
        version: action.version || null,
        releaseNotes: action.releaseNotes || null,
        lastCheckedAt: Date.now(),
      };
    case "UPDATE_NOT_AVAILABLE":
      return {
        ...INITIAL_UPDATE_STATE,
        lastCheckedAt: Date.now(),
      };
    case "DOWNLOAD_PROGRESS":
      return {
        ...state,
        status: "downloading",
        downloadPercent:
          typeof action.percent === "number"
            ? action.percent
            : state.downloadPercent,
      };
    case "UPDATE_DOWNLOADED":
      return {
        ...state,
        status: "downloaded",
        readyToInstall: true,
        downloadPercent: 100,
      };
    case "ERROR":
      return { ...state, status: "error", error: action.message || "unknown" };
    default:
      return state;
  }
}

module.exports = {
  INITIAL_UPDATE_STATE,
  reduceUpdateState,
  compareVersions,
};