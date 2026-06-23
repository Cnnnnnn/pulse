/**
 * src/main/backup.js
 *
 * 2026-06-14: App rollback · backup 旧版 .app 到 userData/backups.
 *
 *   - getBackupDir(bundleName, { userDataDir })       → userDataDir/backups/<bundle>
 *   - backupBundleVersion(bundleName, version, opts)  → cp source → target,
 *                                                      返 { ok, backupPath?, sizeBytes?, reason?, error? }
 *   - pruneOldBackups(bundleName, { userDataDir, keep }) → 保留最近 keep 个, 删最旧
 *   - deleteBackup(bundleName, version, opts)         → 删指定版本, 返释放字节数
 *
 * 设计:
 *   - 纯模块, 不依赖 electron; caller 传 userDataDir (test 时给 tmp)
 *   - fsp.cp 在目标已存在时合并内容 — cp 前先 rmSync, 防止旧文件残留
 *   - 失败全部 best-effort, 不 throw (调用方 bulk-upgrade / IPC 已经 catch)
 *   - log 用主进程的 log 通道 (createLogger('backup'))
 */
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { promisify } = require("util");
const { execFile } = require("child_process");
const pExecFile = promisify(execFile);
const { createLogger } = require("./log");

const log = createLogger("backup");
const pExecFileSafe = (file, args) =>
  pExecFile(file, args).catch((err) => ({ stdout: "", stderr: err && err.message }));

function getBackupDir(bundleName, { userDataDir }) {
  return path.join(userDataDir, "backups", bundleName);
}

async function dirSize(p) {
  // du -sk 给出 KB, 转 byte. macOS 自带. 失败 → 0.
  const { stdout } = await pExecFileSafe("du", ["-sk", p]);
  const kb = parseInt((stdout || "").split("\t")[0], 10);
  return Number.isFinite(kb) ? kb * 1024 : 0;
}

/**
 * 复制源 .app → backups/<bundle>/<version>.app.
 * @param {string} bundleName       e.g. 'Cursor.app'
 * @param {string} version          e.g. '3.6.31'
 * @param {object} opts
 * @param {string} opts.userDataDir
 * @param {string} opts.sourceAppPath   /Applications/Cursor.app
 * @returns {Promise<
 *   | {ok:true,  backupPath:string, sizeBytes:number}
 *   | {ok:false, reason:'source_missing'|'cp_failed', error?:string}
 * >}
 */
async function backupBundleVersion(bundleName, version, opts) {
  const { userDataDir, sourceAppPath } = opts || {};
  if (!sourceAppPath || !fs.existsSync(sourceAppPath)) {
    return { ok: false, reason: "source_missing" };
  }
  const target = path.join(getBackupDir(bundleName, { userDataDir }), `${version}.app`);
  try {
    // fsp.cp 在目标已存在时合并 → 先 rm 确保干净 target
    fs.rmSync(target, { recursive: true, force: true });
    await fsp.cp(sourceAppPath, target, { recursive: true });
    const sizeBytes = await dirSize(target);
    return { ok: true, backupPath: target, sizeBytes };
  } catch (err) {
    return {
      ok: false,
      reason: "cp_failed",
      error: err && err.message ? err.message : String(err),
    };
  }
}

/**
 * 保留最近 keep 个备份 (按版本号字符串升序 → 字典序), 删最旧.
 * 失败 → log warn, 不影响主流程 (locked bundle 暂留, 下次 prune 再尝试).
 * @param {string} bundleName
 * @param {object} opts
 * @param {string} opts.userDataDir
 * @param {number} [opts.keep=2]
 */
function pruneOldBackups(bundleName, { userDataDir, keep = 2 }) {
  const dir = getBackupDir(bundleName, { userDataDir });
  if (!fs.existsSync(dir)) return;
  const entries = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".app"))
    .sort(); // 升序: 字符串字典序最旧在前
  const toRemove = entries.slice(0, Math.max(0, entries.length - keep));
  for (const name of toRemove) {
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch (err) {
      log.warn(
        `pruneOldBackups: failed to remove ${path.join(dir, name)}: ${err && err.message}`,
      );
    }
  }
}

/**
 * 删指定版本备份, 返释放字节数 (估算, 来自 walk 阶段).
 * @param {string} bundleName
 * @param {string} version
 * @param {object} opts
 * @param {string} opts.userDataDir
 * @returns {number} 释放字节数; 路径不存在 → 0
 */
function deleteBackup(bundleName, version, { userDataDir }) {
  const target = path.join(getBackupDir(bundleName, { userDataDir }), `${version}.app`);
  if (!fs.existsSync(target)) return 0;
  // Step 1: walk target 算 size
  let freed = 0;
  try {
    const walk = (p) => {
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        for (const child of fs.readdirSync(p)) walk(path.join(p, child));
      } else {
        freed += st.size;
      }
    };
    walk(target);
  } catch (err) {
    log.warn(`deleteBackup: size walk failed for ${target}: ${err && err.message}`);
    return freed;
  }
  // Step 2: rmSync 实际删
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (err) {
    log.warn(`deleteBackup: rmSync failed for ${target}: ${err && err.message}`);
    return freed;
  }
  return freed;
}

module.exports = {
  getBackupDir,
  backupBundleVersion,
  pruneOldBackups,
  deleteBackup,
};