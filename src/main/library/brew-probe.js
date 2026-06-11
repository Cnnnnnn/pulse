/**
 * src/main/library/brew-probe.js
 *
 * v2.7.2 (Library Auto-Detect): brew 试探 wrapper.
 *
 * 优先级 3️⃣: 猜 cask name → `brew info --cask --json=v2` → 拿 latest version.
 *
 * 设计:
 *   - 0 配置 0 网络 (brew 是本地的)
 *   - 失败吞掉 (cask 不存在 / brew 没装 / timeout) → 返 null, 不抛
 *   - cask 名称猜法: appName lowercase, 空格/标点替 '-'
 *
 * 注入: execFileImpl + timeout 便于测试.
 *
 * CommonJS, 跟 src/main/library 一致.
 */

const { execFile } = require('child_process');
const os = require('os');

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * 猜 cask name 从 appName / bundleName.
 * 'Xsentinel' / 'Xsentinel.app' → 'xsentinel'
 * 'X-Sentinel Pro.app' → 'x-sentinel-pro'
 * 'WorkBuddy' → 'workbuddy' (lowercase)
 *
 * @param {object} item  scanned app { appName, bundleName, ... }
 * @returns {string|null}  猜的 cask name, 都不行返 null
 */
function guessCaskName(item) {
  if (!item || typeof item !== 'object') return null;
  const candidates = [
    item.appName,
    (item.bundleName || '').replace(/\.app$/, ''),
  ];
  for (const c of candidates) {
    if (typeof c !== 'string' || c.length === 0) continue;
    const cleaned = c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (cleaned.length > 0 && cleaned.length <= 64) return cleaned;
  }
  return null;
}

/**
 * 跑 brew info 试探.
 *
 * @param {string} cask  猜的 cask name
 * @param {object} [opts]
 * @param {Function} [opts.execFileImpl]  注入便于测试
 * @param {number}   [opts.timeout]      默认 5000ms
 * @returns {Promise<{ok: boolean, version?: string, reason?: string, probeMs: number}>}
 *   - ok=true: brew info 返回了该 cask, version = versions.stable
 *   - ok=false: cask 不存在 / brew 未装 / timeout / parse 失败
 */
async function probeBrewCask(cask, opts = {}) {
  const t0 = Date.now();
  if (typeof cask !== 'string' || cask.length === 0) {
    return { ok: false, reason: 'invalid_cask', probeMs: 0 };
  }
  const exec = opts.execFileImpl || execFile;
  const timeout = (typeof opts.timeout === 'number' && opts.timeout > 0) ? opts.timeout : DEFAULT_TIMEOUT_MS;

  let stdout = '';
  try {
    stdout = await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, val) => { if (!settled) { settled = true; fn(val); } };
      const child = exec(
        'brew',
        ['info', '--cask', cask, '--json=v2'],
        { timeout, encoding: 'utf8' },
        (err, out, errOut) => {
          if (err) return finish(reject, err);
          finish(resolve, out || '');
        },
      );
      child.on('error', (e) => finish(reject, e));
    });
  } catch (err) {
    return {
      ok: false,
      reason: classifyBrewError(err),
      probeMs: Date.now() - t0,
    };
  }

  let json;
  try {
    json = JSON.parse(stdout);
  } catch {
    return { ok: false, reason: 'parse_failed', probeMs: Date.now() - t0 };
  }

  // brew info --json=v2 返 { formulae: [], casks: [{...}] }
  const casks = (json && Array.isArray(json.casks)) ? json.casks : [];
  if (casks.length === 0) {
    return { ok: false, reason: 'cask_not_found', probeMs: Date.now() - t0 };
  }
  const c = casks[0];
  const version = (c && c.versions && typeof c.versions.stable === 'string') ? c.versions.stable : '';
  if (!version) {
    return { ok: false, reason: 'no_version', probeMs: Date.now() - t0 };
  }
  return { ok: true, version, probeMs: Date.now() - t0 };
}

function classifyBrewError(err) {
  if (!err) return 'unknown';
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();
  if (code === 'ENOENT') return 'brew_not_installed';
  if (msg.includes('no available formula') || msg.includes('not found')) return 'cask_not_found';
  return err.code ? `spawn_error_${err.code}` : 'spawn_failed';
}

module.exports = {
  guessCaskName,
  probeBrewCask,
  classifyBrewError,
  DEFAULT_TIMEOUT_MS,
};
