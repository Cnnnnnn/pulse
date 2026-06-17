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
 * 构造 tray context menu 的 template 数组 (纯函数, 无 Electron Tray 副作用).
 *
 * v2.22 Task A1: 从 rebuildMenu 抽出, 方便单测. 无行为变化 — 仍是
 *   - 有更新 / 已是最新 / 需关注 三段 (现状保留)
 *   - 无结果 → "尚未检查" 占位
 *   - 底部 4 个 action: 打开面板 / 检查更新 / 打开配置文件 / 退出
 *
 * 后续 Task A2-A4 会在此函数里按段替换内容; callback 注入已经预留
 * onFocusUpdate (A2 用). aiUsage / worldcup / metals 字段已收, 待
 * B2/C2/D1 在函数体内插入对应段.
 *
 * @param {object} opts
 * @param {Array}  [opts.results=[]]      - detect 返回的 app 状态列表
 * @param {object} [opts.aiUsage=null]    - A2/B2 任务: AI 配额状态
 * @param {object} [opts.worldcup=null]   - C2 任务: 世界杯比分
 * @param {object} [opts.metals=null]     - D1 任务: 贵金属行情
 * @param {Function} [opts.onOpenPanel]   - 点击 "打开面板" 时调用
 * @param {Function} [opts.onCheck]       - 点击 "检查更新" 时调用
 * @param {Function} [opts.onOpenConfig]  - 配置文件无路径时回退回调
 * @param {Function} [opts.onQuit]        - 点击 "退出" 时调用
 * @param {Function} [opts.onFocusUpdate] - A2 任务: 聚焦到某条 update
 * @param {Function} [opts.getConfigPath] - 返回配置文件绝对路径
 * @param {Function} [opts.getConfig]     - 返回配置对象 (含 apps 数组)
 * @returns {Array} Electron Menu template 数组
 */
function buildMenu(opts) {
  const {
    results = [],
    aiUsage = null,
    worldcup = null,
    metals = null,
    onOpenPanel = () => {},
    onCheck = () => {},
    onOpenConfig = () => {},
    onQuit = () => {},
    onFocusUpdate = () => {},
    getConfigPath = () => '',
    getConfig = () => ({ apps: [] }),
  } = opts;
  const template = [];

  // ─── 🔄 检查更新 (v2.22 Task A2: 内容预览) ───
  if (results.length > 0) {
    const updates = results.filter((r) => r.has_update);
    const upToDate = results.filter((r) => r.status === 'up_to_date');

    if (updates.length > 0) {
      template.push({
        label: `── 🔄 检查更新 (${updates.length} 待升级) ──`,
        enabled: false,
      });
      updates.forEach((r) => {
        const ver = r.latest_version
          ? `${r.installed_version || '?'} → ${r.latest_version}`
          : '';
        template.push({
          label: `${r.name}  ${ver}  ⬆️ 升级`,
          click: () => {
            onFocusUpdate({ rowName: r.name, action: 'upgrade' });
          },
        });
      });
      template.push({ type: 'separator' });
    } else if (upToDate.length > 0) {
      // 没有更新时显示总览 (1 行)
      template.push({
        label: `── 🔄 检查更新 · 全部最新 (${upToDate.length}) ──`,
        enabled: false,
      });
      template.push({
        label: '  点击"检查更新"手动刷新',
        enabled: false,
      });
      template.push({ type: 'separator' });
    }
  } else {
    template.push({
      label: '── 🔄 检查更新 · 尚未检查 ──',
      enabled: false,
    });
    template.push({ type: 'separator' });
  }

  // ─── TODO A2-A4: 各模块段插入这里 ───
  // 占位: A1 仅抽出函数, 不动内容
  // (aiUsage / worldcup / metals 在 B2/C2/D1 任务里加段)
  void aiUsage;
  void worldcup;
  void metals;

  // ─── 底部 action (不变) ───
  template.push(
    { label: '打开面板', click: () => onOpenPanel() },
    { label: '检查更新', click: () => onCheck() },
    { type: 'separator' },
    {
      label: '打开配置文件',
      click: () => {
        const p = getConfigPath();
        if (p) require('electron').shell.openPath(p);
        else onOpenConfig();
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => onQuit() }
  );
  return template;
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
    const template = buildMenu({
      results: lastResults,
      getConfig: getConfig,
      onOpenPanel,
      onCheck,
      onOpenConfig,
      onQuit,
      getConfigPath,
    });
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
  // 暴露给测试 (assets 加载 + badge 变体选择 + menu template 纯函数)
  _internal: { loadTrayIcon, loadBadgeIcon, loadFallbackIcon, buildMenu, ASSETS },
};
