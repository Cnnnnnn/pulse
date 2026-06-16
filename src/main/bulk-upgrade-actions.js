/**
 * src/main/bulk-upgrade-actions.js
 *
 * Bulk Upgrade: 把 app item 映射成可执行 action.
 * 纯函数 — 给定 item 返回 action 描述, 真正执行交给 bulk-upgrade.js.
 *
 * 字段来源 (per spec §8):
 *   - source:     'brew_formulae' | 'sparkle_appcast' | 'app_store_lookup' | 'electron_yml' | ...
 *   - cask:       仅 brew 用, 来自 detectors[].cask
 *   - bundleName: 用于 open 路径 (/Applications/<bundleName>.app)
 *   - trackId:    仅 app_store 用, 来自 app_store_lookup 提取
 *
 * Action 形状:
 *   { type: 'brew', cmd, args }
 *   { type: 'open', path }
 *   { type: 'mas', trackId, fallbackUrl }
 *   { type: 'winget', id }
 *   { type: 'none', reason }
 */

const APP_DIR = '/Applications';

/**
 * @param {object} item
 * @param {string} item.id
 * @param {string} item.name
 * @param {string} item.source
 * @param {string} [item.cask]        brew only
 * @param {string} [item.bundleName]  for 'open' actions
 * @param {number} [item.trackId]     app_store only
 * @param {string} [item.wingetId]    winget only (camelCase, primary)
 * @param {string} [item.winget_id]   winget only (snake_case, fallback for legacy items)
 * @returns {object} action
 */
function getActionForApp(item) {
  if (!item || typeof item !== 'object') {
    return { type: 'none', reason: 'invalid item' };
  }
  const src = item.source;

  // Brew cask: run `brew upgrade --cask <cask>`
  if (src === 'brew_formulae' || src === 'brew_local_cask') {
    if (!item.cask || typeof item.cask !== 'string') {
      return { type: 'none', reason: 'brew: missing cask' };
    }
    return {
      type: 'brew',
      cmd: 'brew',
      args: ['upgrade', '--cask', item.cask],
    };
  }

  // App Store: open macappstore:// deep link, fallback https://
  if (src === 'app_store_lookup') {
    const tid = item.trackId;
    if (typeof tid !== 'number' || !Number.isFinite(tid) || tid <= 0) {
      return { type: 'none', reason: 'app_store: missing trackId' };
    }
    return {
      type: 'mas',
      trackId: tid,
      fallbackUrl: `https://apps.apple.com/app/id${tid}`,
    };
  }

  // Sparkle: 优先用 release_url (enclosure url, 指向该版本 .zip 下载).
  //   这是 Phase 22 加的: 之前只 shell.openPath 启动 app, 实际不触发 Sparkle
  //   updater, 用户反馈 "升级提示还在". 现在直接开下载页让用户手动装.
  if (src === 'sparkle_appcast') {
    if (item.releaseUrl && typeof item.releaseUrl === 'string') {
      return { type: 'open_url', url: item.releaseUrl, reason: 'sparkle download' };
    }
    // 没 release_url → fallback 到 open app (碰运气)
    const bn = item.bundleName || item.name;
    if (!bn || typeof bn !== 'string') {
      return { type: 'none', reason: 'sparkle: missing bundleName and no release_url' };
    }
    return { type: 'open', path: buildAppPath(bn) };
  }

  // Electron auto-updater: open the app, let its built-in updater fire
  if (
    src === 'electron_yml' ||
    src === 'qclaw_api' ||
    src === 'app_update_yml' ||
    src === 'api_json'
  ) {
    const bn = item.bundleName || item.name;
    if (!bn || typeof bn !== 'string') {
      return { type: 'none', reason: `${src}: missing bundleName` };
    }
    return {
      type: 'open',
      path: buildAppPath(bn),
    };
  }

  // Windows: winget_show → `winget upgrade --id <id>` (spec §3)
  // winget_id 字段可能用 snake_case 或 camelCase (renderer 侧 item 命名历史)
  if (src === 'winget_show') {
    const wid = (typeof item.wingetId === 'string' && item.wingetId.trim())
      || (typeof item.winget_id === 'string' && item.winget_id.trim())
      || '';
    if (!wid) {
      return { type: 'none', reason: 'winget: missing id' };
    }
    return { type: 'winget', id: wid };
  }

  // redirect_filename / cursor_redirect / 其它: 走 redirect 到 download 页
  // 没法自动升级, 跳过
  return {
    type: 'none',
    reason: `source '${src || 'unknown'}' has no auto-upgrade`,
  };
}

/**
 * /Applications/<bundleName>.app — 简单拼接, 不做 normalize.
 * bundleName 通常已带或不带 .app; 兼容两种.
 */
function buildAppPath(bundleName) {
  let bn = String(bundleName).trim();
  if (!bn) return '';
  if (!bn.endsWith('.app')) bn += '.app';
  return `${APP_DIR}/${bn}`;
}

module.exports = {
  getActionForApp,
  buildAppPath, // exported for tests
};
