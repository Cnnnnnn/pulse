/**
 * src/main/config-store.js
 *
 * v2.7.0 (My Apps Library, B3): 写 config.json (atomic).
 *
 * 之前 readConfig 走 fs.readFileSync + sanitize, 但**写**能力没有. v2.7.0 加这个,
 * 给 library: IPC (add/remove/sortBy/pinned/ignored/tags) 用.
 *
 * 约束:
 *   - 写盘走 atomic write (tmp + rename), 跟 state-store.writeAtomic 同模式
 *   - 写入前用 sanitizeConfig 兜底 (跟 loadConfig 路径一致, 防破坏 schema)
 *   - 不 mutate existing file 之外的字段 — caller 给整个新 config
 *   - 失败 → throw, caller 决定 fallback
 *
 * CommonJS, 跟 src/main/state-store 一致.
 */

const fs = require('fs');
const path = require('path');

const { sanitizeConfig } = require('../config/schema');

/**
 * 把 config 写到磁盘. atomic + sanitize.
 *
 * @param {object} config   整个 config 对象 (会过 sanitize, 所以 caller 可以给 raw)
 * @param {object} [opts]
 * @param {string} [opts.configPath]   默认 '<repoRoot>/config.json' (跟 main/index.js 一致)
 * @param {function} [opts.sanitize]   注入便于测试, 默认 sanitizeConfig
 * @returns {object}                  sanitize 后的 config
 * @throws {Error}  写盘失败
 */
function saveConfig(config, opts = {}) {
  if (config == null || typeof config !== 'object') {
    throw new TypeError('saveConfig: config must be object');
  }
  const configPath = (typeof opts.configPath === 'string' && opts.configPath.length > 0)
    ? opts.configPath
    : path.join(__dirname, '..', '..', 'config.json');
  const sanitize = opts.sanitize || sanitizeConfig;
  const clean = sanitize(config);
  writeAtomic(configPath, clean);
  return clean;
}

/**
 * Atomic write: tmp file + rename. 失败时清理 tmp.
 * 跟 state-store.writeAtomic 同模式, 独立实现避免 cross-module 依赖.
 */
function writeAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* noop */ }
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
    throw err;
  }
}

module.exports = {
  saveConfig,
  // test-only
  writeAtomic,
};
