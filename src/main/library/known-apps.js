/**
 * src/main/library/known-apps.js
 *
 * v2.7.2 (Library Auto-Detect): bundleId 静态表 → 反查 detector.
 *
 * 优先级 1️⃣ (4 层优先链里最快的), 0 网络 0 配置.
 * 大小写不敏感 (macOS bundleId 实际是 lowercase, 但外部来源偶有大小写差异).
 *
 * 形态: { [bundleId_lower]: { type, fields } }
 *   - type: src/main/library/ops.js VALID_TYPES 里的合法 detector type
 *   - fields: detector 需要的字段 (url / cask / path)
 *
 * 跟 v2.7.0 config.json 11 个 app 对齐 — 用户已经监控的 11 个, 加几个历史 bundleId.
 */

const KNOWN_APPS = {
  // Cursor
  'com.cursor.cursor':         { type: 'cursor_redirect',    fields: {} },

  // Kimi
  'com.moonshot.kimi':         { type: 'redirect_filename',  fields: { url: 'https://appsupport.moonshot.cn/api/app/pkg/latest/macos/download' } },

  // ima.copilot
  'com.tencent.imamac':        { type: 'app_store_lookup',   fields: { url: 'https://itunes.apple.com/lookup?id=6737188438&country=cn' } },

  // MiniMax Code (跟 config.json url 同步, 真实文件下载)
  'com.minimax.minimaxcode':   { type: 'electron_yml',       fields: { url: 'https://filecdn.minimax.chat/public/minimax-agent-prod/release/latest-mac.yml' } },
  'com.minimax.code':          { type: 'electron_yml',       fields: { url: 'https://filecdn.minimax.chat/public/minimax-agent-prod/release/latest-mac.yml' } },

  // WorkBuddy (Codebuddy 出品, 跟 config.json url 同步)
  'com.codebuddy.workbuddy':   { type: 'api_json',           fields: { url: 'https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-{arch}' } },

  // QClaw (QQ 系, config.json 用 qclaw_api 探测)
  'com.qclaw.app':             { type: 'qclaw_api',          fields: { url: 'https://jprx.m.qq.com/data/4066/forward' } },
  'com.tencent.qclaw':         { type: 'qclaw_api',          fields: { url: 'https://jprx.m.qq.com/data/4066/forward' } },

  // Marvis (也是 QQ 系, 跟 Kimi 一样 redirect)
  'com.electronlark.lark':     { type: 'redirect_filename',  fields: { url: 'https://marvis.qq.com/download/dmg' } },

  // QoderWork (Qoder IDE, 跟 MiniMax Code 走 electron_yml; url 暂留 TODO, v2.8.0 已 commit fixture 待填)
  'com.qoder.qoderwork':      { type: 'electron_yml',       fields: {} },  // TODO: 待真机 fixture 填 url

  // Codex (Codex CLI 桌面, sparkle_appcast — 跟 config 同步)
  'com.openai.codex':          { type: 'sparkle_appcast',    fields: {} },
  'com.openai.codexbar':       { type: 'sparkle_appcast',    fields: {} },
  'com.codebuddy.codexbar':    { type: 'sparkle_appcast',    fields: {} },
  'com.codebuddy.ccswitch':    { type: 'sparkle_appcast',    fields: {} },
};

/**
 * 大小写不敏感反查.
 *
 * @param {string} bundleId  (e.g. 'com.cursor.Cursor' or 'COM.Cursor.CURSOR')
 * @returns {{type: string, fields: object}|null}  null = 未命中, 进优先级 2
 */
function lookupKnownApp(bundleId) {
  if (typeof bundleId !== 'string' || bundleId.length === 0) return null;
  const key = bundleId.toLowerCase();
  return KNOWN_APPS[key] || null;
}

/**
 * 列出所有已知 bundleId (调试用, e.g. UI 提示 "支持 X 个 app")
 * @returns {string[]}
 */
function listKnownBundleIds() {
  return Object.keys(KNOWN_APPS);
}

module.exports = {
  KNOWN_APPS,
  lookupKnownApp,
  listKnownBundleIds,
};
