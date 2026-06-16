/**
 * src/main/tray.js
 *
 * Tray icon + menu. Phase 28: 切换到 Pulse 品牌 + assets/ PNG.
 *
 * 旧实现用 Buffer 像素生成 ECG 圆环 + 箭头 (不精细, 用户反馈"太丑")。
 * 新实现: 从 assets/ 加载 4 个预渲染 PNG (script: scripts/render-icons.js).
 *   - iconTemplate.png / @2x.png  → 16x16 / 32x32 心电图线
 *   - iconBadge-{1..9,9plus}.png / @2x.png  → 32x16 / 64x32 数字角标
 *
 * 依赖：electron (tray/nativeImage/menu)、detect 状态 (lastResults)。
 */

const { Tray, Menu, nativeImage, nativeTheme, shell } = require('electron');
const path = require('path');

const ASSETS = path.join(__dirname, '..', '..', 'assets');

/**
 * 加载模板图标.
 * - macOS: Apple template image, 走 setTemplateImage(true) 自动适配 light/dark.
 * - Windows: 没有 setTemplateImage 协议, 用两套静态 ICO + nativeTheme 切换.
 *
 * @param {object} [theme] - 注入依赖, 默认走 require('electron').nativeTheme.
 */
function loadTrayIcon(theme) {
  if (process.platform === 'win32') {
    // P4: Windows 端用 ICO + 深浅色两套.
    // nativeTheme.shouldUseDarkColors 反映 OS 当前主题.
    const effectiveTheme = theme || nativeTheme;
    const file = effectiveTheme.shouldUseDarkColors
      ? 'iconTrayDark.ico'
      : 'iconTray.ico';
    const png = nativeImage.createFromPath(path.join(ASSETS, file));
    if (png.isEmpty()) return loadFallbackIcon();
    return png;
  }
  // macOS 现状不变 (template image)
  const png = nativeImage.createFromPath(path.join(ASSETS, 'iconTemplate@2x.png'));
  if (png.isEmpty()) return null;
  png.setTemplateImage(true);
  return png;
}

/** 加载 badge 图标 (count 1-9 → 数字; ≥10 → 9+). */
function loadBadgeIcon(count) {
  const n = Math.max(0, Math.min(99, count | 0));
  const variant = n >= 10 ? '9plus' : String(n);
  const png = nativeImage.createFromPath(path.join(ASSETS, `iconBadge-${variant}@2x.png`));
  return png.isEmpty() ? null : png;
}

/** 最小 fallback PNG (1x1 灰). 资源文件丢失时使用, 避免 tray 完全空白. */
function loadFallbackIcon() {
  // 1x1 transparent PNG
  const buf = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  return nativeImage.createFromBuffer(buf);
}

/**
 * Tray 管理器 — 封装 icon + menu + badge，单一职责。
 * 用法：
 *   const tray = createTrayManager({ getApps, getConfigPath, getConfig, onCheck, onQuit, onOpenPanel, onOpenConfig });
 *   tray.install();
 *   tray.setResults(results);
 *   tray.setBadge(updateCount);
 *   tray.dispose();
 */
function createTrayManager(opts) {
  const getConfig = opts.getConfig || (() => ({ apps: [] }));
  const getConfigPath = opts.getConfigPath || (() => '');
  const onCheck = opts.onCheck || (() => {});
  const onOpenPanel = opts.onOpenPanel || (() => {});
  const onOpenConfig = opts.onOpenConfig || (() => {});
  const onQuit = opts.onQuit || (() => {});

  let tray = null;
  let lastResults = [];

  function install() {
    let icon = loadTrayIcon();
    if (!icon) icon = loadFallbackIcon();
    tray = new Tray(icon);
    tray.setToolTip('Pulse');
    tray.on('click', () => onOpenPanel());
    rebuildMenu();

    // P4: Windows 端监听主题变化, 切换亮/暗两套 ICO.
    // macOS 走 template image 协议, 不需要 listener.
    if (process.platform === 'win32') {
      nativeTheme.on('updated', () => {
        const next = loadTrayIcon();
        if (next && tray) tray.setImage(next);
      });
    }
  }

  function rebuildMenu() {
    if (!tray) return;
    const template = [];

    if (lastResults.length > 0) {
      const updates = lastResults.filter((r) => r.has_update);
      const upToDate = lastResults.filter((r) => r.status === 'up_to_date');
      const other = lastResults.filter(
        (r) => !r.has_update && r.status !== 'up_to_date' && r.status !== 'not_installed'
      );

      if (updates.length > 0) {
        template.push({ label: `── 有更新 (${updates.length}) ──`, enabled: false });
        const cfgApps = (getConfig().apps || []);
        updates.forEach((r) => {
          const ver = r.latest_version ? `${r.installed_version || '?'} → ${r.latest_version}` : '';
          template.push({
            label: `${r.name}  ${ver}`,
            click: () => {
              onOpenPanel();
              const cfg = cfgApps.find((a) => a.name === r.name);
              if (cfg && cfg.download_url) shell.openExternal(cfg.download_url);
            },
          });
        });
        template.push({ type: 'separator' });
      }

      if (upToDate.length > 0) {
        template.push({ label: `── 已是最新 (${upToDate.length}) ──`, enabled: false });
        upToDate.forEach((r) => {
          template.push({ label: `${r.name}  ${r.installed_version || ''}`, enabled: false });
        });
        template.push({ type: 'separator' });
      }

      if (other.length > 0) {
        template.push({ label: `── 需关注 (${other.length}) ──`, enabled: false });
        other.forEach((r) => {
          template.push({ label: `${r.name}  ${r.installed_version || ''}`, enabled: false });
        });
        template.push({ type: 'separator' });
      }
    } else {
      template.push({ label: '尚未检查', enabled: false });
      template.push({ type: 'separator' });
    }

    template.push(
      { label: '打开面板', click: () => onOpenPanel() },
      { label: '检查更新', click: () => onCheck() },
      { type: 'separator' },
      { label: '打开配置文件', click: () => {
          const p = getConfigPath();
          if (p) shell.openPath(p);
          else onOpenConfig();
        } },
      { type: 'separator' },
      { label: '退出', click: () => onQuit() }
    );

    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  function setResults(results) {
    lastResults = Array.isArray(results) ? results : [];
    rebuildMenu();
  }

  function setBadge(updateCount) {
    if (!tray) return;
    if (updateCount > 0) {
      const icon = loadBadgeIcon(updateCount) || loadTrayIcon();
      tray.setImage(icon);
      tray.setToolTip(`Pulse — ${updateCount} 个更新`);
    } else {
      const icon = loadTrayIcon() || loadFallbackIcon();
      icon.setTemplateImage(true);
      tray.setImage(icon);
      tray.setToolTip('Pulse — 已是最新');
    }
  }

  function dispose() {
    if (tray) {
      try { tray.destroy(); } catch { /* noop */ }
      tray = null;
    }
  }

  return { install, setResults, setBadge, dispose };
}

module.exports = {
  createTrayManager,
  // 暴露给测试 (assets 加载 + badge 变体选择)
  _internal: { loadTrayIcon, loadBadgeIcon, loadFallbackIcon, ASSETS },
};
