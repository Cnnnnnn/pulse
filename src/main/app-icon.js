/**
 * src/main/app-icon.js
 *
 * Phase 25: 读 macOS .app bundle 的真实图标, 转成 PNG dataUrl.
 *
 * 策略: 解析 .app/Contents/Info.plist 拿 CFBundleIconFile, 用 macOS `sips` CLI
 *   把 .icns 转 PNG buffer, 再 base64 成 dataUrl. 完全绕过 Electron nativeImage
 *   (arm64 + Electron 35 的 nativeImage.getFileIcon / createFromBuffer 都有 SIGTRAP).
 *
 * 之前踩的坑 (历程):
 *   - v1 nativeImage.createFromPath(bundlePath) 返 app 自己的 icon (错, 跟 .app path 解码无关)
 *   - v2 app.getFileIcon('large').resize().toDataURL() — SIGTRAP (NativeImage GC race)
 *   - v3 app.getFileIcon('normal').toDataURL() — Promise (在 main process 是 async) 上
 *     调 .toDataURL() 返 undefined, 然后 PNG 全部 1634 字节 placeholder (async bug)
 *   - v4 nativeImage.createFromPath(.icns) — Electron 不支持 .icns, 11 个都 image empty
 *   - v5 (现在): sips CLI 把 .icns 转 PNG buffer, 直接 base64
 *
 * 平台: 仅 macOS (依赖 sips).
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { mainLog } = require('./log');

/**
 * @param {string} bundlePath  e.g. '/Applications/Cursor.app'
 * @param {object} [deps]       测试用 (fs / spawn / app / sipsPath)
 * @returns {Promise<string|null>}  base64 dataUrl 或 null
 */
async function getAppIcon(bundlePath, deps = {}) {
  const _bundle = bundlePath;
  const fsMod = deps.fs || fs;
  const _app = deps.app || app;
  const _spawn = deps.spawn || spawnSync;
  const _sipsPath = deps.sipsPath || '/usr/bin/sips';

  try {
    if (typeof _bundle !== 'string' || !_bundle) {
      mainLog.warn('[app-icon] empty path');
      return null;
    }
    if (!fsMod.existsSync(_bundle)) {
      mainLog.warn('[app-icon] bundle not exists', { path: _bundle });
      return null;
    }

    // sips 路径: 找 .icns → sips 转 PNG buffer → base64
    const icnsPath = findIcnsPath(_bundle, { fs: fsMod });
    if (!icnsPath) {
      mainLog.warn('[app-icon] no .icns found', { path: _bundle });
      return null;
    }
    const pngBuf = convertIcnsToPngWithDeps(icnsPath, { fs: fsMod, spawn: _spawn, sipsPath: _sipsPath, app: _app });
    if (!pngBuf) {
      mainLog.warn('[app-icon] sips returned null', { path: _bundle, icnsPath });
      return null;
    }
    const dataUrl = `data:image/png;base64,${pngBuf.toString('base64')}`;
    mainLog.info('[app-icon] ok', { path: _bundle, len: dataUrl.length });
    return dataUrl;
  } catch (err) {
    mainLog.warn('[app-icon] error', { path: _bundle, msg: err && err.message });
    return null;
  }
}

/**
 * 找 .icns 文件 (Info.plist 优先, Resources 兜底).
 */
function findIcnsPath(bundlePath, deps) {
  // 1. Info.plist
  const plistPath = path.join(bundlePath, 'Contents', 'Info.plist');
  try {
    if (deps.fs.existsSync(plistPath)) {
      const buf = deps.fs.readFileSync(plistPath, 'utf-8');
      const m = buf.match(/<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/);
      if (m) {
        let name = m[1].trim();
        if (!name.toLowerCase().endsWith('.icns')) name += '.icns';
        const full = path.join(bundlePath, 'Contents', 'Resources', name);
        if (deps.fs.existsSync(full)) return full;
      }
    }
  } catch { /* noop */ }
  // 2. Resources glob
  const resDir = path.join(bundlePath, 'Contents', 'Resources');
  try {
    if (deps.fs.existsSync(resDir)) {
      const entries = deps.fs.readdirSync(resDir);
      const icns = entries.find((f) => f.toLowerCase().endsWith('.icns'));
      if (icns) return path.join(resDir, icns);
    }
  } catch { /* noop */ }
  return null;
}

/**
 * 用 sips 把 .icns 转 PNG buffer (可注入 spawn 走测试).
 */
function convertIcnsToPngWithDeps(icnsPath, deps) {
  try {
    const out = path.join(deps.app.getPath('temp'), `appicon-${process.pid}-${Date.now()}.png`);
    const r = deps.spawn(deps.sipsPath, [
      '-s', 'format', 'png',
      '-z', '256', '256',
      icnsPath,
      '--out', out,
    ], { encoding: 'utf-8', timeout: 5000 });
    if (r.status !== 0) {
      mainLog.warn('[app-icon] sips failed', { icnsPath, stderr: (r.stderr || '').slice(0, 200) });
      return null;
    }
    const buf = deps.fs.readFileSync(out);
    try { deps.fs.unlinkSync(out); } catch { /* noop */ }
    return buf;
  } catch (err) {
    mainLog.warn('[app-icon] sips error', { msg: err && err.message });
    return null;
  }
}

module.exports = { getAppIcon, findIcnsPath };
