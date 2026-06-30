/**
 * src/workers/version-source.js
 *
 * Phase 9: per-app "version_sources" 配置的 source dispatcher.
 * 给 detect-worker.js 用, 也单独 vitest 测.
 *
 * Source types:
 *   - "installed_json"  : { type, path? } 读 JSON 的 appVersion
 *   - "plist"           : {}              读 CFBundleShortVersionString
 *   - "regex_file"      : { type, path, pattern } 读文件用 regex 提取
 *
 * 全部结果再过 stripBuildNumber 兜底 (如 "2.5.3.4392" → "2.5.3").
 */

const fs = require('fs');
const { stripBuildNumber } = require('../utils/version-utils');
const { queryRegistryField } = require('./win-registry');

/**
 * 逐段数字比较两版本号大小 (semver-ish).
 * 返回 >0 表示 a 更新, <0 表示 b 更新, 0 相等.
 * 和 detector-chain.compareVersions 同思路, 但这里只是给 regex_file 选最大用,
 * 所以不引入 detector-chain (避免 workers → detectors 的循环依赖风险).
 */
function compareNumeric(a, b) {
  const pa = String(a).split('.').map((s) => parseInt(s, 10) || 0);
  const pb = String(b).split('.').map((s) => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * installed_json: 读 JSON 的 appVersion 字段, 兜底默认路径.
 * @returns {Promise<string|null>}
 */
async function readInstalledJson(src, { bundleId, HOME }) {
  const p = expandHome(
    src.path || (bundleId ? `${HOME}/Library/Application Support/${bundleId}/installed.json` : null),
    HOME
  );
  if (!p) return null;
  const raw = await fs.promises.readFile(p, 'utf-8');
  const j = JSON.parse(raw);
  if (j && typeof j.appVersion === 'string' && j.appVersion.trim()) {
    return stripBuildNumber(j.appVersion.trim());
  }
  return null;
}

/**
 * plist: 从 CFBundleShortVersionString 提取版本号.
 * @returns {string|null}
 */
function readPlist(plistRaw) {
  if (!plistRaw) return null;
  const m = plistRaw.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  return m ? stripBuildNumber(m[1]) : null;
}

/**
 * regex_file: 用正则匹配文件内容, 取所有匹配里版本号最大的那个.
 * 取最大而非第一个, 因为这类文件 (如 ima 的 MMKV) 常常是追加写入,
 * 同一文件里有多条历史记录, 最早版本在前面. 取第一个会把已安装
 * 版本读成最老的 (已修复: 旧实现 raw.match 只取第一个).
 * @returns {Promise<string|null>}
 */
async function readRegexFile(src, HOME) {
  if (!src.path || !src.pattern) return null;
  const p = expandHome(src.path, HOME);
  const raw = await fs.promises.readFile(p, 'utf-8');
  const re = new RegExp(src.pattern, 'g');
  const matches = [...raw.matchAll(re)];
  if (matches.length === 0) return null;
  const hasGroup = matches[0].length > 1;
  let best = null;
  for (const m of matches) {
    const captured = (hasGroup && m[1] != null) ? m[1] : m[0];
    const v = captured.trim();
    if (!v) continue;
    if (best === null || compareNumeric(v, best) > 0) best = v;
  }
  return best ? stripBuildNumber(best) : null;
}

/**
 * registry_version (Windows): 从注册表读 DisplayVersion.
 * @returns {Promise<string|null>}
 */
async function readRegistryVersion(src, { _exec }) {
  if (!src.reg_path) return null;
  const reg = await queryRegistryField(src.reg_path, 'DisplayVersion', {
    _exec,
  });
  return reg ? stripBuildNumber(reg) : null;
}

/**
 * winget_list (Windows): 跑 `winget list --id <id> --exact`, 解析表格取 Version 列.
 * _exec 已是 promise-returning (测试注入); 否则用真实 execFile + promisify.
 * @returns {Promise<string|null>}
 */
async function readWingetList(src, { _exec }) {
  const wingetId = src.winget_id;
  if (!wingetId) return null;
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const pExec = _exec || promisify(execFile);
  try {
    const { stdout } = await pExec(
      'winget',
      ['list', '--id', wingetId, '--exact'],
      { encoding: 'utf-8', timeout: 15000 },
    );
    // 输出形如表格: Name Id Version Available Source
    // 取 Version 列 (第 3 列). 跳过表头行.
    const lines = stdout.split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines) {
      const cols = line.split(/\s{2,}/);
      if (cols.length >= 3 && /^\d/.test(cols[2])) {
        return stripBuildNumber(cols[2].trim());
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * windows_app_yml: 从 app-update.yml 读 version: x.y.z.
 * @returns {Promise<string|null>}
 */
async function readWindowsAppYml(src, { _fs }) {
  if (!src.path) return null;
  const fsMod = _fs || fs;
  try {
    const raw = await fsMod.promises.readFile(src.path, 'utf-8');
    // 跟 electron-yml 的 regex 一致: version: x.y.z
    const m = raw.match(/^\s*version:\s*['"]?([^'"\n]+)['"]?/m);
    return m ? stripBuildNumber(m[1].trim()) : null;
  } catch {
    return null;
  }
}

/**
 * Source-type → reader dispatch table. 每个 reader都是独立的纯逻辑单元,
 * 这样 tryVersionSource 本体只负责参数校验 + try/catch 兜底.
 */
const SOURCE_READERS = {
  installed_json: (src, ctx) => readInstalledJson(src, ctx),
  plist: (src, ctx) => readPlist(ctx.plistRaw),
  regex_file: (src, ctx) => readRegexFile(src, ctx.HOME),
  registry_version: (src, ctx) => readRegistryVersion(src, ctx),
  winget_list: (src, ctx) => readWingetList(src, ctx),
  windows_app_yml: (src, ctx) => readWindowsAppYml(src, ctx),
};

async function tryVersionSource(src, { bundleId, plistRaw, homeDir, _exec, _fs } = {}) {
  if (!src || typeof src !== 'object') return null;
  const HOME = homeDir || process.env.HOME || '/Users/Shared';
  const reader = SOURCE_READERS[src.type];
  if (!reader) return null;
  try {
    return await reader(src, { bundleId, plistRaw, HOME, _exec, _fs });
  } catch {
    return null;
  }
}

function expandHome(p, HOME = process.env.HOME || '/Users/Shared') {
  if (typeof p !== 'string') return p;
  if (p.startsWith('~/')) return HOME + p.slice(1);
  return p;
}

module.exports = { tryVersionSource, expandHome };
