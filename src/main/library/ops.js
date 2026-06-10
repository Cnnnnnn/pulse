/**
 * src/main/library/ops.js
 *
 * v2.7.0 (My Apps Library, B3): 纯函数层的 library mutations.
 *
 * ipc.js 的 library: handlers 都走这个模块, 便于单测 (不依赖 ipcMain).
 * 写盘走 config-store.saveConfig (注入), 推事件由 caller (ipc.js) 负责.
 */

const { sanitizeConfig } = require('../../config/schema');

/**
 * 加 scanned app 进 config.apps. 校验: appName, bundleName, detectors, 重名.
 * 同时从 library.ignored 去掉该 appName (用户 add 意味着想监控了).
 *
 * @param {object} cfg       当前 config
 * @param {object} opts      { appName, bundleName, detectors }
 * @returns {{ok: boolean, config?: object, reason?: string}}
 */
function addApp(cfg, opts) {
  if (!cfg || typeof cfg !== 'object') return { ok: false, reason: 'invalid_cfg' };
  if (!opts || typeof opts !== 'object') return { ok: false, reason: 'invalid_opts' };
  const { appName, bundleName, detectors } = opts;
  if (typeof appName !== 'string' || appName.length === 0) {
    return { ok: false, reason: 'invalid_appName' };
  }
  if (typeof bundleName !== 'string' || bundleName.length === 0) {
    return { ok: false, reason: 'invalid_bundleName' };
  }
  if (!Array.isArray(detectors) || detectors.length === 0) {
    return { ok: false, reason: 'no_detectors' };
  }
  const VALID_TYPES = new Set([
    'brew_formulae', 'brew_local_cask', 'sparkle_appcast',
    'electron_yml', 'electron_zip_probe', 'app_store_lookup',
    'api_json', 'redirect_filename', 'cursor_redirect',
    'qclaw_api', 'app_update_yml',
  ]);
  for (const d of detectors) {
    if (!d || typeof d !== 'object' || !VALID_TYPES.has(d.type)) {
      return { ok: false, reason: 'invalid_detector_type' };
    }
  }
  if (cfg.apps.some((a) => a && a.name === appName)) {
    return { ok: false, reason: 'duplicate_name' };
  }
  if (cfg.apps.some((a) => a && a.bundle === bundleName)) {
    return { ok: false, reason: 'duplicate_bundle' };
  }
  const lib = cfg.library || {};
  const newApps = [...(cfg.apps || []), { name: appName, bundle: bundleName, detectors }];
  const newIgnored = (lib.ignored || []).filter((i) => !i || i.appName !== appName);
  const newLibrary = {
    sortBy: lib.sortBy || 'starred',
    pinned: lib.pinned || [],
    ignored: newIgnored,
    tags: lib.tags || {},
  };
  return { ok: true, config: { ...cfg, apps: newApps, library: newLibrary } };
}

/**
 * 从 config.apps 删一个 app. 不存在 → ok:false, reason:not_found.
 */
function removeApp(cfg, name) {
  if (!cfg || typeof cfg !== 'object') return { ok: false, reason: 'invalid_cfg' };
  if (typeof name !== 'string' || name.length === 0) {
    return { ok: false, reason: 'invalid_name' };
  }
  const apps = cfg.apps || [];
  const newApps = apps.filter((a) => a && a.name !== name);
  if (newApps.length === apps.length) {
    return { ok: false, reason: 'not_found' };
  }
  return { ok: true, config: { ...cfg, apps: newApps } };
}

/**
 * 更新 library.sortBy. 非法值 → ok:false.
 */
function setSortBy(cfg, sortBy) {
  if (!cfg || typeof cfg !== 'object') return { ok: false, reason: 'invalid_cfg' };
  const VALID = new Set(['starred', 'name', 'lastUsed', 'updateStatus']);
  if (typeof sortBy !== 'string' || !VALID.has(sortBy)) {
    return { ok: false, reason: 'unknown_sortBy' };
  }
  const lib = cfg.library || {};
  return {
    ok: true,
    config: {
      ...cfg,
      library: {
        sortBy,
        pinned: lib.pinned || [],
        ignored: lib.ignored || [],
        tags: lib.tags || {},
      },
    },
  };
}

/**
 * 替换整个 pinned 数组. 容错: 非 string 元素 / 非 array → ok:false.
 */
function setPinned(cfg, pinned) {
  if (!cfg || typeof cfg !== 'object') return { ok: false, reason: 'invalid_cfg' };
  if (!Array.isArray(pinned)) return { ok: false, reason: 'invalid_pinned' };
  if (pinned.some((p) => typeof p !== 'string')) return { ok: false, reason: 'non_string_pinned' };
  const lib = cfg.library || {};
  return {
    ok: true,
    config: {
      ...cfg,
      library: {
        sortBy: lib.sortBy || 'starred',
        pinned,
        ignored: lib.ignored || [],
        tags: lib.tags || {},
      },
    },
  };
}

/**
 * 替换整个 ignored 数组. 元素必须是 plain object (appName/bundle).
 */
function setIgnored(cfg, ignored) {
  if (!cfg || typeof cfg !== 'object') return { ok: false, reason: 'invalid_cfg' };
  if (!Array.isArray(ignored)) return { ok: false, reason: 'invalid_ignored' };
  for (const i of ignored) {
    if (!i || typeof i !== 'object') return { ok: false, reason: 'non_object_ignored' };
  }
  const lib = cfg.library || {};
  return {
    ok: true,
    config: {
      ...cfg,
      library: {
        sortBy: lib.sortBy || 'starred',
        pinned: lib.pinned || [],
        ignored,
        tags: lib.tags || {},
      },
    },
  };
}

/**
 * 替换整个 tags map. 容错: 非 plain object → ok:false.
 */
function setTags(cfg, tags) {
  if (!cfg || typeof cfg !== 'object') return { ok: false, reason: 'invalid_cfg' };
  if (tags == null || typeof tags !== 'object' || Array.isArray(tags)) {
    return { ok: false, reason: 'invalid_tags' };
  }
  for (const [k, v] of Object.entries(tags)) {
    if (typeof k !== 'string' || !Array.isArray(v)) {
      return { ok: false, reason: 'invalid_tag_entry' };
    }
  }
  const lib = cfg.library || {};
  return {
    ok: true,
    config: {
      ...cfg,
      library: {
        sortBy: lib.sortBy || 'starred',
        pinned: lib.pinned || [],
        ignored: lib.ignored || [],
        tags,
      },
    },
  };
}

module.exports = {
  addApp,
  removeApp,
  setSortBy,
  setPinned,
  setIgnored,
  setTags,
};
