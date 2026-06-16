/**
 * src/workers/win-registry.js
 *
 * Windows 注册表查询 — 读 DisplayVersion / InstallLocation.
 *
 * 两个层级:
 *   1) queryRegistryField(regPath, field) — 指定精确 key 路径, 读单个字段
 *   2) queryAllUninstallKeys(displayName) — 全局扫描 3 个 Uninstall 根, 按 DisplayName 匹配
 *
 * 命令: reg query "HKLM\...\{GUID}" /v DisplayVersion
 *   (reg 是 Windows 内置 CLI, 非 Windows 上跑会 ENOENT → 返回 null)
 *
 * 依赖注入: opts._exec 用于测试 mock. 生产环境用 child_process.execFile.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');

const pExecFile = promisify(execFile);

// 3 个 Uninstall 根 (系统 64 位 / 系统 32 位 / 用户级)
const UNINSTALL_ROOTS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

/**
 * 解析 reg query 的 stdout 成 { FieldName: value } map.
 * reg 输出形如:
 *   HKEY_...\{GUID}
 *       DisplayName    REG_SZ    Cursor
 *       DisplayVersion    REG_SZ    1.0.0
 */
function parseRegOutput(output) {
  const fields = {};
  if (!output || typeof output !== 'string') return fields;
  // 匹配 "    FieldName    REG_TYPE    value"
  const re = /^\s+(\S+)\s+REG_\S+\s+(.+)$/gm;
  let m;
  while ((m = re.exec(output)) !== null) {
    const name = m[1];
    let value = m[2].trim();
    // REG_MULTI_SZ 用 \0 分隔, 取第一段
    if (value.includes('\\0')) value = value.split('\\0')[0];
    fields[name] = value;
  }
  return fields;
}

/**
 * 查指定 reg key 的指定字段.
 * @param {string} regPath  e.g. 'HKCU\\SOFTWARE\\...\\{GUID}'
 * @param {string} field    e.g. 'DisplayVersion'
 * @param {object} [opts]   { _exec } 测试注入
 * @returns {Promise<string|null>}
 */
async function queryRegistryField(regPath, field, opts = {}) {
  if (!regPath || !field) return null;
  const exec = opts._exec || pExecFile;
  try {
    const { stdout } = await exec(
      'reg',
      ['query', regPath, '/v', field],
      { encoding: 'utf-8', timeout: 5000 },
    );
    const fields = parseRegOutput(stdout);
    return fields[field] || null;
  } catch {
    return null;
  }
}

/**
 * 全局扫描 3 个 Uninstall 根, 按 DisplayName 匹配 app 名.
 * 返回 { version, installLocation } 或 null.
 *
 * @param {string} displayName  e.g. 'Cursor' (跟注册表 DisplayName 比较)
 * @param {object} [opts]       { _exec }
 * @returns {Promise<{version: string, installLocation: string}|null>}
 */
async function queryAllUninstallKeys(displayName, opts = {}) {
  if (!displayName) return null;
  const exec = opts._exec || pExecFile;
  for (const root of UNINSTALL_ROOTS) {
    try {
      const { stdout } = await exec(
        'reg',
        ['query', root, '/s'],
        { encoding: 'utf-8', timeout: 15000 },
      );
      // /s 递归输出所有子 key. 按空行切段, 每段一个 key block.
      const blocks = stdout.split(/\r?\n\r?\n/);
      for (const block of blocks) {
        const fields = parseRegOutput(block);
        if (
          fields.DisplayName &&
          fields.DisplayName.toLowerCase().includes(
            displayName.toLowerCase(),
          )
        ) {
          return {
            version: fields.DisplayVersion || null,
            installLocation: fields.InstallLocation || null,
          };
        }
      }
    } catch {
      // reg 不存在或 key 无权限 → 跳过这个根
    }
  }
  return null;
}

module.exports = {
  parseRegOutput,
  queryRegistryField,
  queryAllUninstallKeys,
  UNINSTALL_ROOTS,
};
