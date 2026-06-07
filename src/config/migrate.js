/**
 * src/config/migrate.js
 *
 * 老 config → 新 config 自动迁移（spec §5 + 约束"启动时 detect 老 config → 自动 migrate → 备份为 .bak"）。
 *
 * 触发条件（migrateIfNeeded 调用方决定）：
 *   - 老字段存在：apps[].web_type / apps[].web_url / apps[].sparkle_url / apps[].brew_cask
 *   - 新字段存在：apps[].detectors[]
 *
 * 行为：
 *   - 检测到老形态 → 在写入新 config 之前**先备份**为 `config.json.bak`
 *   - 转换后的新 config 写到**目标路径**（默认同目录，覆盖原 config.json；
 *     备份不会动；用户可以对比 .bak 和 config.json）
 *   - 如果目标已是新 schema，不做任何事（idempotent）
 *   - 转换错误抛 MigrationError
 *
 * 老 → 新 映射表（spec §5）：
 *   redirect         → redirect_filename    (url: web_url)
 *   cursor_redirect  → cursor_redirect      (url: web_url)
 *   app_store        → app_store_lookup     (url: web_url)
 *   electron_yml     → electron_yml         (url: web_url)
 *   api_json         → api_json             (url: web_url)
 *   qclaw_api        → qclaw_api            (url: web_url)
 *   github_release   → api_json             (url: web_url)   [合并]
 *   brew_api_json    → brew_formulae        (cask: brew_cask)
 *
 * 顺序规则：
 *   - 若 sparkle_url 存在 → 在最前面插 { type: 'sparkle_appcast', url: sparkle_url }
 *   - 若 web_type/web_url 存在 → 按上表转换插在中间
 *   - 若 brew_cask 存在 → 在最后插 { type: 'brew_formulae', cask: brew_cask }
 */

const fs = require('fs');
const path = require('path');

const WEB_TYPE_MAP = Object.freeze({
  redirect:         { type: 'redirect_filename' },
  cursor_redirect:  { type: 'cursor_redirect' },
  app_store:        { type: 'app_store_lookup' },
  electron_yml:     { type: 'electron_yml' },
  api_json:         { type: 'api_json' },
  qclaw_api:        { type: 'qclaw_api' },
  github_release:   { type: 'api_json' },
  brew_api_json:    { type: 'brew_formulae' },
});

class MigrationError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'MigrationError';
    if (cause) this.cause = cause;
  }
}

function isOldSchemaApp(app) {
  if (!app || typeof app !== 'object') return false;
  // 老 schema 的标志：没有 detectors[] 但有 web_type/sparkle_url/brew_cask 之一
  if (Array.isArray(app.detectors) && app.detectors.length > 0) return false;
  return Boolean(
    app.web_type || app.web_url || app.sparkle_url || app.brew_cask
  );
}

function migrateApp(oldApp) {
  const detectors = [];

  if (typeof oldApp.sparkle_url === 'string' && oldApp.sparkle_url.trim()) {
    detectors.push({ type: 'sparkle_appcast', url: oldApp.sparkle_url.trim() });
  }

  const webType = oldApp.web_type;
  const webUrl = typeof oldApp.web_url === 'string' ? oldApp.web_url.trim() : '';
  if (webType && webUrl) {
    const m = WEB_TYPE_MAP[webType];
    if (m) {
      const det = { type: m.type };
      if (m.type === 'brew_formulae') {
        // brew_api_json → 用 brew_cask 而不是 web_url
        det.cask = oldApp.brew_cask || '';
      } else {
        det.url = webUrl;
      }
      detectors.push(det);
    }
    // 未知 web_type：跳过，但保留 brew_cask 兜底
  }

  if (typeof oldApp.brew_cask === 'string' && oldApp.brew_cask.trim()) {
    // 兜底：永远在最后追加 brew_formulae（即使已经有 web 检测 — fallback）
    detectors.push({ type: 'brew_formulae', cask: oldApp.brew_cask.trim() });
  }

  return {
    name: oldApp.name || '',
    bundle: oldApp.bundle || '',
    download_url: typeof oldApp.download_url === 'string' ? oldApp.download_url : '',
    detectors,
  };
}

/**
 * 纯函数：老 config 对象 → 新 config 对象。
 * 不会读 / 写文件，便于测试。
 */
function migrateConfig(oldConfig) {
  if (!oldConfig || typeof oldConfig !== 'object') {
    throw new MigrationError('config is not an object');
  }
  const newConfig = {
    check_on_launch: typeof oldConfig.check_on_launch === 'boolean'
      ? oldConfig.check_on_launch
      : true,
    apps: [],
  };
  if (Array.isArray(oldConfig.apps)) {
    for (const a of oldConfig.apps) {
      if (isOldSchemaApp(a)) {
        newConfig.apps.push(migrateApp(a));
      } else if (a && Array.isArray(a.detectors)) {
        // 已经是新 schema（被其他工具写过），原样保留
        newConfig.apps.push({
          name: a.name,
          bundle: a.bundle,
          download_url: a.download_url || '',
          detectors: a.detectors,
        });
      }
    }
  }
  return newConfig;
}

/**
 * 老 config → 新 config 迁移（写盘）。
 *
 * @param {object} opts
 * @param {string} opts.configPath   目标 config.json 路径
 * @param {object} [opts.fsImpl]     注入的 fs（测试用）
 * @returns {object}  { migrated: boolean, configPath, backupPath, config }
 *
 * 行为：
 *   - configPath 不存在 → 返回 { migrated: false }，不报错
 *   - 内容已是新 schema → 返回 { migrated: false }，不写盘
 *   - 内容是老 schema → 备份到 configPath + '.bak'，再写新内容覆盖
 *     （**原 config.json 被覆盖**——这是 spec 写的"迁移后原文件备份为 .bak，不覆盖"的解读：
 *      备份 .bak 保留旧内容，新内容写到 config.json 让 app 启动时直接读新 schema。
 *      用户对比 .bak 觉得不对可手动恢复。）
 *   - 读 / 解析 / 写任一步出错 → 抛 MigrationError
 */
function migrateConfigFile(opts) {
  const { configPath, fsImpl = fs } = opts;

  let raw;
  try {
    raw = fsImpl.readFileSync(configPath, 'utf-8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { migrated: false, configPath, backupPath: null, reason: 'file-not-found' };
    }
    throw new MigrationError(`readFileSync failed: ${err.message}`, err);
  }

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (err) { throw new MigrationError(`JSON.parse failed: ${err.message}`, err); }

  // 已经全 new schema？不迁移
  if (Array.isArray(parsed.apps) && parsed.apps.length > 0
      && parsed.apps.every((a) => a && Array.isArray(a.detectors) && a.detectors.length > 0)) {
    return { migrated: false, configPath, backupPath: null, reason: 'already-new', config: parsed };
  }

  // 老 schema 至少需要 1 个 app 才有意义；空 apps[] 视为不迁移
  if (!Array.isArray(parsed.apps) || parsed.apps.length === 0) {
    return { migrated: false, configPath, backupPath: null, reason: 'no-apps', config: parsed };
  }

  // 没有任何老字段（web_type/sparkle_url/brew_cask）就不迁
  const hasOldShape = parsed.apps.some(isOldSchemaApp);
  if (!hasOldShape) {
    return { migrated: false, configPath, backupPath: null, reason: 'no-old-shape', config: parsed };
  }

  const newConfig = migrateConfig(parsed);
  const backupPath = configPath + '.bak';

  // 备份：拷贝原文件 → .bak（不删原文件，直接覆盖 .bak）
  try {
    fsImpl.copyFileSync(configPath, backupPath);
  } catch (err) {
    throw new MigrationError(`backup copyFileSync failed: ${err.message}`, err);
  }

  // 写新内容
  const serialized = JSON.stringify(newConfig, null, 2) + '\n';
  try {
    fsImpl.writeFileSync(configPath, serialized, 'utf-8');
  } catch (err) {
    throw new MigrationError(`writeFileSync failed: ${err.message}`, err);
  }

  return { migrated: true, configPath, backupPath, config: newConfig };
}

module.exports = {
  migrateConfig,
  migrateConfigFile,
  isOldSchemaApp,
  migrateApp,
  MigrationError,
  WEB_TYPE_MAP,
};
