/**
 * src/ai-sessions/storage.js
 *
 * Phase B1a (AI Sessions Daily Digest): safeStorage helper + digest storage helpers.
 *
 * B1 scope: 抽象 + safeStorage wrapper, 不依赖具体业务 (B4 + B6 才会用).
 *   - isAvailable():  探测 safeStorage 在当前平台是否可用 (Linux 无 keyring 时返 false)
 *   - saveApiKey(providerId, apiKey): 用 safeStorage.encryptString 加密, 写
 *                            app.getPath('userData')/ai-keys/<providerId>.bin
 *   - loadApiKey(providerId):        读 + decrypt
 *   - clearApiKey(providerId):        unlink
 *
 * safeStorage 在 Linux 无 keyring 时 (e.g. CI), encryptString 会 throw. 这里包
 * try/catch, 不可用时返 null + log warn (spec §7 边界).
 *
 * 5 个 providerId: 'openai' | 'anthropic' | 'deepseek' | 'minimax' | 'ollama'
 *   (ollama 通常不需要 key, 但 config 里也允许存, 万一未来 ollama 加 auth)
 *
 * B4 + B6 才会真正调 (DailyDigestRunner + Settings modal).
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const fs = require('fs');
const path = require('path');
const { SILENT_LOG } = require('./session-log');

/**
 * Lazy require electron.避免 main process启动时强制加载.
 *实际 safeStorage 在 B6 + B4调,启动期不需要.
 *
 * 测试注入: __setSafeStorageForTest({ encryptString, decryptString, isEncryptionAvailable })
 * __setUserDataDirForTest('/tmp/xxx') —跳过 electron require
 */
let _safeStorageOverride = null;
let _userDataDirOverride = null;

function __setSafeStorageForTest(safeStorage) {
 _safeStorageOverride = safeStorage || null;
}
function __setUserDataDirForTest(dir) {
 _userDataDirOverride = dir || null;
}
function __resetForTest() {
 _safeStorageOverride = null;
 _userDataDirOverride = null;
}

function _tryGetSafeStorage() {
 if (_safeStorageOverride) return _safeStorageOverride;
 try {
 // eslint-disable-next-line global-require
 return require('electron').safeStorage;
 } catch {
 return null;
 }
}

function _tryGetUserDataDir() {
 if (_userDataDirOverride) return _userDataDirOverride;
 try {
 // eslint-disable-next-line global-require
 const { app } = require('electron');
 return app.getPath('userData');
 } catch {
 return null;
 }
}

/**
 * @returns {boolean} true if safeStorage 可用
 */
function isAvailable() {
  const ss = _tryGetSafeStorage();
  if (!ss) return false;
  // Linux 不可用 (无 keyring) — safeStorage.isEncryptionAvailable() 返 false
  if (typeof ss.isEncryptionAvailable === 'function') {
    return Boolean(ss.isEncryptionAvailable());
  }
  return true;
}

function _keyPath(providerId) {
  if (typeof providerId !== 'string' || !/^[a-z0-9_-]+$/i.test(providerId)) {
    throw new TypeError(`invalid providerId: ${providerId}`);
  }
  const userData = _tryGetUserDataDir();
  if (!userData) {
    throw new Error('userData dir unavailable (not in Electron main process?)');
  }
  return path.join(userData, 'ai-keys', `${providerId}.bin`);
}

/**
 * 加密 + 写 API key.
 * @param {string} providerId   'openai' | 'anthropic' | 'deepseek' | 'minimax' | 'ollama'
 * @param {string} apiKey
 * @returns {boolean}            success
 */
function saveApiKey(providerId, apiKey, log = SILENT_LOG) {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new TypeError('saveApiKey: apiKey must be non-empty string');
  }
  const ss = _tryGetSafeStorage();
  if (!ss) {
    log.warn('safeStorage unavailable (not in Electron), cannot save API key');
    return false;
  }
  if (typeof ss.isEncryptionAvailable === 'function' && !ss.isEncryptionAvailable()) {
    log.warn(`safeStorage encryption unavailable on this platform, refusing to save plain-text key (providerId=${providerId}). Use env var instead.`);
    return false;
  }
  const file = _keyPath(providerId);
  const dir = path.dirname(file);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* noop */ }
  const buf = ss.encryptString(apiKey);
  fs.writeFileSync(file, buf, { mode: 0o600 });
  return true;
}

/**
 *读 + 解密 API key.
 * @param {string} providerId
 * @returns {string|null} 解密后 key,不可用 / 不存在 /损坏 → null
 */
function loadApiKey(providerId, log = SILENT_LOG) {
 const ss = _tryGetSafeStorage();
 if (!ss) return null;
 if (typeof ss.isEncryptionAvailable === 'function' && !ss.isEncryptionAvailable()) return null;
 const file = _keyPath(providerId);
 if (!fs.existsSync(file)) return null;
 try {
 const buf = fs.readFileSync(file);
 const plain = ss.decryptString(buf);
 if (typeof plain !== 'string') return null;
 return plain;
 } catch (err) {
 log.warn(`loadApiKey failed for ${providerId}: ${err.message}`);
 return null;
 }
}



/**
 * 删 API key file.
 * @param {string} providerId
 * @returns {boolean}
 */
function clearApiKey(providerId, log = SILENT_LOG) {
  const file = _keyPath(providerId);
  try {
    fs.unlinkSync(file);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    log.warn(`clearApiKey failed for ${providerId}: ${err.message}`);
    return false;
  }
}

module.exports = {
 isAvailable,
 saveApiKey,
 loadApiKey,
 clearApiKey,
 // 测试用 (B6a):注入 safeStorage / userData dir,避免依赖 Electron runtime
 __setSafeStorageForTest,
 __setUserDataDirForTest,
 __resetForTest,
};
