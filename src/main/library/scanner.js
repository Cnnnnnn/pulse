/**
 * src/main/library/scanner.js
 *
 * v2.7.0 (My Apps Library, B2): 扫 /Applications + ~/Applications, 列所有 .app bundle.
 *
 * 给 IPC library:list-unmonitored 用, 跟 config.json 对比 → 找出"装了但没监控"的 app.
 *
 * 设计:
 *   - 一次扫描返 [{ bundlePath, bundleName, appName, bundleId, version }, ...]
 *   - 全部同步 (I/O 走 plutil 转 json, 单个 .app < 50ms, 50 个 .app 也就 2-3s)
 *   - 容错: plutil 失败 / 字段缺失 / permission denied → 跳过, 不阻塞
 *   - macOS only (依赖 /Applications 约定)
 *
 * 注入:
 *   - plutilImpl: 测试时 mock 不用真 plutil
 *   - readdirImpl / statImpl: 测试时 mock
 *   - now: 注入便于测试
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUTIL_TIMEOUT_MS = 3000;

/**
 * 扫一个目录, 列所有 .app (一级, 不递归 — 装在 /Applications 下面的都是一级)
 * @param {string} dir
 * @param {object} [deps]
 * @returns {Array<{bundlePath: string, bundleName: string}>}
 */
function listAppBundlesIn(dir, deps = {}) {
  const readdirImpl = deps.readdirImpl || fs.readdirSync;
  if (!dir || typeof dir !== 'string') return [];
  try {
    const entries = readdirImpl(dir, { withFileTypes: true });
    const out = [];
    for (const e of entries) {
      // 跳过隐藏 (.DS_Store, .localized, .Trash)
      if (!e || !e.name || e.name.startsWith('.')) continue;
      if (!e.isDirectory && e.isDirectory !== true) continue; // 防御
      if (!e.name.endsWith('.app')) continue;
      out.push({
        bundlePath: path.join(dir, e.name),
        bundleName: e.name,
      });
    }
    return out;
  } catch {
    // 目录不存在 / 无权限 → 返空
    return [];
  }
}

/**
 * 用 plutil 把 Info.plist 转 json, 抽 bundleId + version + display name.
 * @param {string} bundlePath
 * @param {object} [deps]
 * @returns {{bundleId: string, version: string, appName: string}|null}
 */
function readBundleInfo(bundlePath, deps = {}) {
  if (!bundlePath || typeof bundlePath !== 'string') return null;
  const plistPath = path.join(bundlePath, 'Contents', 'Info.plist');
  const fsImpl = deps.fsImpl || fs;
  if (!fsImpl.existsSync(plistPath)) return null;
  const plutilImpl = deps.plutilImpl || ((args) => {
    return execFileSync('plutil', args, { timeout: PLUTIL_TIMEOUT_MS, encoding: 'utf8' });
  });
  let raw;
  try {
    raw = plutilImpl(['-convert', 'json', '-o', '-', plistPath]);
  } catch {
    return null;
  }
  let plist;
  try {
    plist = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!plist || typeof plist !== 'object') return null;
  return {
    bundleId: typeof plist.CFBundleIdentifier === 'string' ? plist.CFBundleIdentifier : '',
    version: typeof plist.CFBundleShortVersionString === 'string'
      ? plist.CFBundleShortVersionString
      : (typeof plist.CFBundleVersion === 'string' ? plist.CFBundleVersion : ''),
    appName: typeof plist.CFBundleDisplayName === 'string'
      ? plist.CFBundleDisplayName
      : (typeof plist.CFBundleName === 'string' ? plist.CFBundleName : ''),
  };
}

/**
 * 主入口: 扫标准位置, 返合并 + 排序的 bundle 列表.
 *
 * 排序: 按 appName asc (locale 无关, 大小写不敏感), 缺 appName 排最后.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.scanDirs]   注入便于测试; 默认 ['/Applications', path.join(homedir, 'Applications')]
 * @param {object}   [opts.deps]       同上
 * @returns {Array<{bundlePath: string, bundleName: string, bundleId: string, version: string, appName: string}>}
 */
function scanInstalledApps(opts = {}) {
  const homedir = os.homedir();
  const scanDirs = (Array.isArray(opts.scanDirs) && opts.scanDirs.length > 0)
    ? opts.scanDirs
    : ['/Applications', path.join(homedir, 'Applications')];
  const deps = opts.deps || {};

  // 1) 列 .app bundles (dedupe by bundleName — 同一 .app 名只保留第一次扫描到的)
  //    用 bundleName 而非 bundlePath 是因为 /Applications/A.app 跟 ~/Applications/A.app 是不同
  //    绝对路径但同名 .app, 我们只想看到一次. 用户的"真"位置在第一次扫到的 dir 里.
  const bundleMap = new Map();
  for (const dir of scanDirs) {
    const list = listAppBundlesIn(dir, deps);
    for (const b of list) {
      if (!bundleMap.has(b.bundleName)) bundleMap.set(b.bundleName, b);
    }
  }

  // 2) 读 plist info
  const out = [];
  for (const b of bundleMap.values()) {
    const info = readBundleInfo(b.bundlePath, deps);
    if (!info) continue;
    out.push({
      bundlePath: b.bundlePath,
      bundleName: b.bundleName,
      bundleId: info.bundleId,
      version: info.version,
      appName: info.appName || b.bundleName.replace(/\.app$/, ''),
    });
  }

  // 3) 排序: appName asc (case-insensitive), 缺 appName 排最后
  out.sort((a, b) => {
    const an = (a.appName || '').toLowerCase();
    const bn = (b.appName || '').toLowerCase();
    if (!an && bn) return 1;
    if (an && !bn) return -1;
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  return out;
}

/**
 * 给 caller (IPC) 用的"未监控"过滤. 拿 config + scan 结果, 返已装但 config 里没的.
 *
 * 匹配规则 (3 个 key 互相 OR):
 *   - bundleName (e.g. "Cursor.app") 严格匹配 config apps[].bundle
 *   - appName   (e.g. "Cursor")      严格匹配 config apps[].name
 *   - bundleId  (e.g. "com.cursor.Cursor") 不直接匹配, 但 scanner 拿不到 bundleId 时
 *                                       也能用 bundle name 兜底
 *
 * @param {Array} scanned   scanInstalledApps() 结果
 * @param {Array} monitored config.apps 数组
 * @param {Array} [ignored] library.ignored 对象数组 (跟 user v2.7.0 决策: {appName, bundle})
 * @returns {Array} scanned 中被过滤掉"已在 config" 和 "在 ignored" 的项
 */
function filterUnmonitored(scanned, monitored, ignored) {
  if (!Array.isArray(scanned)) return [];
  const monitoredBundles = new Set();
  const monitoredNames = new Set();
  if (Array.isArray(monitored)) {
    for (const a of monitored) {
      if (!a || typeof a !== 'object') continue;
      if (typeof a.bundle === 'string' && a.bundle.length > 0) monitoredBundles.add(a.bundle);
      if (typeof a.name === 'string' && a.name.length > 0) monitoredNames.add(a.name);
    }
  }
  const ignoredBundles = new Set();
  const ignoredNames = new Set();
  if (Array.isArray(ignored)) {
    for (const i of ignored) {
      if (!i || typeof i !== 'object') continue;
      if (typeof i.bundle === 'string' && i.bundle.length > 0) ignoredBundles.add(i.bundle);
      if (typeof i.appName === 'string' && i.appName.length > 0) ignoredNames.add(i.appName);
    }
  }
  return scanned.filter((s) => {
    if (!s) return false;
    if (monitoredBundles.has(s.bundleName)) return false;
    if (monitoredNames.has(s.appName)) return false;
    if (ignoredBundles.has(s.bundleName)) return false;
    if (ignoredNames.has(s.appName)) return false;
    return true;
  });
}

module.exports = {
  scanInstalledApps,
  filterUnmonitored,
  // test-only
  listAppBundlesIn,
  readBundleInfo,
  PLUTIL_TIMEOUT_MS,
};
