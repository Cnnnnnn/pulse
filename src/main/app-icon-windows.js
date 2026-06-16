/**
 * src/main/app-icon-windows.js
 *
 * P4: Windows 端 app-icon 实现 — 走 Electron native API.
 *
 * macOS 端 (src/main/app-icon.js) 走 sips CLI, 因为 Electron 35 nativeImage
 * 在 macOS arm64 有 SIGTRAP GC race (Phase 25 踩过的坑). Windows 没这个
 * bug, 直接用 app.getFileIcon().toDataURL() 即可.
 *
 * 跟 macOS 端同构:
 *   - _iconCache: path → dataUrl (正缓存, 不缓存失败)
 *   - _inflight: path → Promise (并发去重)
 *   - 失败 → null (不抛), 允许下次重试 (用户装新 app 后探测)
 */

const { app } = require('electron');

const _iconCache = new Map();
const _inflight = new Map();

/**
 * @param {string} exePath - e.g. 'C:\\Program Files\\Cursor\\Cursor.exe'
 * @returns {Promise<string|null>} - base64 dataUrl 或 null
 */
async function getAppIcon(exePath) {
  if (typeof exePath !== 'string' || !exePath) {
    return null;
  }

  // 1) 命中正缓存
  if (_iconCache.has(exePath)) {
    return _iconCache.get(exePath);
  }

  // 2) 已有 in-flight 请求
  if (_inflight.has(exePath)) {
    return _inflight.get(exePath);
  }

  // 3) 真正调一次
  const promise = _loadIconUncached(exePath);
  _inflight.set(exePath, promise);
  try {
    const result = await promise;
    if (result) _iconCache.set(exePath, result);
    return result;
  } finally {
    _inflight.delete(exePath);
  }
}

async function _loadIconUncached(exePath) {
  try {
    const icon = await app.getFileIcon(exePath, { size: 'large' });
    if (!icon || icon.isEmpty()) return null;
    const dataUrl = icon.toDataURL();
    return typeof dataUrl === 'string' && dataUrl.length > 0 ? dataUrl : null;
  } catch {
    return null;
  }
}

function _clearIconCache() {
  _iconCache.clear();
  _inflight.clear();
}

module.exports = { getAppIcon, _clearIconCache };
