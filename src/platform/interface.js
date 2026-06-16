/**
 * src/platform/interface.js
 *
 * 平台抽象层接口契约 — 纯 JSDoc, 不含实现.
 * macos.js / windows.js 必须实现这 6 个方法.
 *
 * 设计原则 (spec §1):
 *   - 业务代码只依赖这个接口, 绝不直接 if (process.platform === ...)
 *   - detector (在线版本检测) 不在这里, 只管 "本地" 的事
 *   - macOS 端零行为变更: macos.js 委托给现有模块
 */

/**
 * 解析 app 安装路径.
 * @param {string} bundle — config 里的 bundle 字段 (mac: "Cursor.app"; win: win_bundle "Cursor")
 * @param {object} [appCfg] — 完整 app config (win 端可能需要 win_bundle / reg_path)
 * @returns {string|null} 绝对路径, 未安装返回 null
 */
function resolveAppPath(bundle, appCfg) {}

/**
 * 读已装版本.
 * @param {object} appCfg — { bundle, version_sources, win_bundle, ... }
 * @returns {Promise<string|null>}
 */
async function getInstalledVersion(appCfg) {}

/**
 * 拿 app 图标 dataUrl.
 * @param {string} appPath — resolveAppPath 的返回值
 * @returns {Promise<string|null>} base64 dataUrl
 */
async function getAppIcon(appPath) {}

/**
 * 产出升级动作描述.
 * @param {object} appCfg
 * @param {object} detectResult — buildDetectResult 的输出 (含 source, cask, trackId, ...)
 * @returns {object} action — { type, ... } 或 { type: 'none', reason }
 */
function getUpgradeAction(appCfg, detectResult) {}

/**
 * 执行升级动作.
 * @param {object} action — getUpgradeAction 的返回值
 * @returns {Promise<{output?: string}>}
 */
async function execUpgrade(action) {}

/**
 * 窗口视觉参数 (传给 new BrowserWindow).
 * @returns {object} BrowserWindow 构造选项子集
 */
function getWindowOptions() {}

module.exports = {
  // 契约文档, 导出空对象占位; 真正实现在 macos.js / windows.js
  resolveAppPath,
  getInstalledVersion,
  getAppIcon,
  getUpgradeAction,
  execUpgrade,
  getWindowOptions,
};
