/**
 * src/main/rollback.js
 *
 * 2026-06-14: App rollback · one-click restore from backup.
 *
 *   - isAppRunning(bundleName)        → pgrep -f <bundle>
 *   - killAppGraceful(appName, opts)  → osascript quit → 5s wait → pkill -9
 *   - doRollback(opts)                → kill + trash current + cp backup + 回调
 *
 * 设计:
 *   - 纯模块: doRollback 只负责"读 target, 写 target" + 触发回调. 不写 state.json,
 *     state 由 caller (IPC handler) 通过 onUpdateInstalled / onRecheck 等回调写入.
 *     这样 rollback 跟 state-store / version-history 解耦 — 模块依赖单一职责.
 *   - cp 前 rm (跟 backup.js I-1 修复一致): fsp.cp 默认合并而非覆盖,
 *     .app bundle 里有残留文件会导致 launchd / LSOpenURLs 撞车.
 *   - in-flight lock via Set: 同 app 两次回滚并发 → 第二个返回 in_progress.
 *     try/finally 保证清理 (即使 trash / cp throw).
 *   - kill 是 best-effort: 不在跑就直接当 ok; 真删 .app 之前再 ensure 一次.
 *
 * 不在 worker: cp / trash 都是 IO, 但单 app 单 user, 串行已经够用.
 */
const fs = require("fs");
const fsp = fs.promises;
const { execFile } = require("child_process");
const { promisify } = require("util");
const { shell } = require("electron");
const { createLogger } = require("./log");

const log = createLogger("rollback");
const pExecFile = promisify(execFile);

// in-flight lock: prevent two rollbacks of the same app racing
const inFlight = new Set();

/**
 * 用 pgrep -f 检查 .app 是否在跑. procName 不带 .app 后缀
 * (pgrep -f 匹配命令行, 不是 bundle id).
 * @param {string} bundleName
 * @returns {Promise<boolean>}
 */
async function isAppRunning(bundleName) {
  const procName = bundleName.replace(/\.app$/, "");
  try {
    const { stdout } = await pExecFile("pgrep", ["-f", procName]);
    return stdout.trim().length > 0;
  } catch {
    // pgrep 没匹配到时 exit code = 1, 抛异常 — 这就是 "没在跑"
    return false;
  }
}

/**
 * 优雅退出 app: 先 osascript quit 给用户保存机会, 5s 后还活着就 kill -9.
 * @param {string} appName
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=5000]
 * @returns {Promise<{ok, reason}>}
 */
async function killAppGraceful(appName, { timeoutMs = 5000 } = {}) {
  const wasRunning = await isAppRunning(appName);
  if (!wasRunning) return { ok: true, reason: "not_running" };
  try {
    await pExecFile("osascript", ["-e", `tell application "${appName}" to quit`]);
  } catch (err) {
    log.warn(`killAppGraceful: osascript quit failed: ${err && err.message}`);
  }
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!(await isAppRunning(appName))) {
      return { ok: true, reason: "quit" };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  // 超时, kill -9
  try {
    await pExecFile("pkill", ["-9", "-f", appName]);
  } catch (err) {
    log.warn(`killAppGraceful: pkill -9 failed: ${err && err.message}`);
  }
  return { ok: true, reason: "killed" };
}

/**
 * @param {object} opts
 * @param {string} opts.appName
 * @param {string} opts.bundleName
 * @param {string} opts.targetAppPath      e.g. /Applications/Cursor.app
 * @param {string} opts.backupPath         e.g. .../backups/Cursor.app/3.6.30.app
 * @param {string} opts.rollbackToVersion
 * @param {string} opts.currentInstalledVersion
 * @param {function} [opts.onUpdateInstalled]  (newVer) => void
 * @param {function} [opts.onActivity]  ({kind, ref, label}) => void
 * @param {function} [opts.onRecheck]  (appName) => void
 * @param {function} [opts.onBroadcast]  (event, payload) => void
 * @returns {Promise<{ok, reason?, error?}>}
 */
async function doRollback(opts) {
  const {
    appName, bundleName, targetAppPath, backupPath,
    rollbackToVersion, currentInstalledVersion,
    onUpdateInstalled = () => {},
    onActivity = () => {},
    onRecheck = () => {},
    onBroadcast = () => {},
  } = opts || {};

  if (!appName || !bundleName || !targetAppPath || !backupPath) {
    return { ok: false, reason: "invalid_args" };
  }
  if (!fs.existsSync(backupPath)) {
    return { ok: false, reason: "backup_missing" };
  }

  // in-flight lock
  if (inFlight.has(appName)) {
    return { ok: false, reason: "in_progress" };
  }
  inFlight.add(appName);
  try {
    // 1. 杀 app
    await killAppGraceful(appName, { timeoutMs: 5000 });

    // 2. trash 当前 (如果存在)
    if (fs.existsSync(targetAppPath)) {
      try {
        await shell.trashItem(targetAppPath);
      } catch (err) {
        log.warn(`doRollback: trashItem failed for ${targetAppPath}: ${err && err.message}`);
        // trash 失败 → 手动 rm (跟 backup I-1 修复一致: cp 前清 target)
        fs.rmSync(targetAppPath, { recursive: true, force: true });
      }
    }

    // 3. cp 备份到目标 (rm + cp 防止 merge; 跟 backup I-1 修复一致)
    if (fs.existsSync(targetAppPath)) {
      fs.rmSync(targetAppPath, { recursive: true, force: true });
    }
    await fsp.cp(backupPath, targetAppPath, { recursive: true });

    // 4. 更新 state
    try { onUpdateInstalled(rollbackToVersion); } catch (err) {
      log.warn(`doRollback: onUpdateInstalled threw: ${err && err.message}`);
    }

    // 5. recent activity
    try {
      onActivity({
        kind: "app-rollback",
        ref: appName,
        label: `${appName} 已回滚到 ${rollbackToVersion}`,
      });
    } catch (err) {
      log.warn(`doRollback: onActivity threw: ${err && err.message}`);
    }

    // 6. recheck
    try { onRecheck(appName); } catch (err) {
      log.warn(`doRollback: onRecheck threw: ${err && err.message}`);
    }

    // 7. 广播
    try { onBroadcast("version-history-updated", { appName }); } catch (err) {
      log.warn(`doRollback: onBroadcast threw: ${err && err.message}`);
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "threw",
      error: (err && err.message) || String(err),
    };
  } finally {
    inFlight.delete(appName);
  }
}

module.exports = { doRollback, isAppRunning, killAppGraceful };