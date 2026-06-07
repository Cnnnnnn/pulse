/**
 * src/main/tray.js
 *
 * Tray 像素生成 + 菜单构建（spec §6 + 约束"保留 tray 像素生成逻辑 visual OK"）。
 * 跟旧 main.js 里的 createTray / rebuildTrayMenu / updateTrayBadge / drawDigit
 * 视觉输出一致；不做任何"美化"——用户已经接受这个图标好几个月。
 *
 * 依赖：electron（tray/nativeImage/menu）、detect 状态（lastResults）。
 */

const { Tray, Menu, nativeImage, shell } = require('electron');

/**
 * 16x16 基础图标：外圆 + 上箭头 + 箭杆。
 * 严格按 main.js 旧实现复制，buffer 一致。
 */
function createTrayIcon() {
  const W = 16, H = 16;
  const pixels = Buffer.alloc(W * H * 4, 0);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const cx = x - 7.5, cy = y - 7.5;
      const dist = Math.sqrt(cx * cx + cy * cy);

      if (dist <= 7 && dist >= 5.5) {
        pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 220;
      } else if (y >= 3 && y <= 7 && x >= 5 && x <= 10) {
        const row = y - 3;
        const halfW = row + 1;
        const center = 7.5;
        if (Math.abs(x - center) < halfW) {
          pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 200;
        }
      } else if (y >= 7 && y <= 12 && x >= 7 && x <= 8) {
        pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 200;
      }
    }
  }

  try {
    return nativeImage.createFromBuffer(pixels, { width: W, height: H });
  } catch {
    return nativeImage.createFromBuffer(createMinimalPng());
  }
}

function createMinimalPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
}

/** 3x5 数字位图（与旧实现一致） */
function drawDigit(n, x, y) {
  if (x < 0 || x > 2 || y < 0 || y > 4) return false;
  const digits = {
    0: [0b111, 0b101, 0b101, 0b101, 0b111],
    1: [0b010, 0b110, 0b010, 0b010, 0b111],
    2: [0b111, 0b001, 0b111, 0b100, 0b111],
    3: [0b111, 0b001, 0b111, 0b001, 0b111],
    4: [0b101, 0b101, 0b111, 0b001, 0b001],
    5: [0b111, 0b100, 0b111, 0b001, 0b111],
    6: [0b111, 0b100, 0b111, 0b101, 0b111],
    7: [0b111, 0b001, 0b010, 0b010, 0b010],
    8: [0b111, 0b101, 0b111, 0b101, 0b111],
    9: [0b111, 0b101, 0b111, 0b001, 0b111],
  };
  const d = n <= 9 ? n : 9;
  const pattern = digits[d] || digits[0];
  return (pattern[y] >> (2 - x)) & 1;
}

/** 带红色数字角标的 32x16 图标 */
function createBadgeIcon(updateCount) {
  const W = 32, H = 16;
  const pixels = Buffer.alloc(W * H * 4, 0);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = (y * W + x) * 4;
      const cx = x - 7.5, cy = y - 7.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist <= 7 && dist >= 5.5) {
        pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 220;
      } else if (y >= 3 && y <= 7 && x >= 5 && x <= 10) {
        const halfW = (y - 3) + 1;
        if (Math.abs(x - 7.5) < halfW) {
          pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 200;
        }
      } else if (y >= 7 && y <= 12 && x >= 7 && x <= 8) {
        pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 200;
      }
    }
  }

  const bx = 25, by = 8, br = 6;
  for (let y = 0; y < H; y++) {
    for (let x = 16; x < W; x++) {
      const idx = (y * W + x) * 4;
      const dist = Math.sqrt((x - bx) ** 2 + (y - by) ** 2);
      if (dist <= br) {
        pixels[idx] = 255; pixels[idx+1] = 59; pixels[idx+2] = 48; pixels[idx+3] = 255;
      }
      if (dist <= br - 2) {
        const nx = x - (bx - 1), ny = y - (by - 2);
        if (drawDigit(updateCount, nx, ny)) {
          pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255; pixels[idx+3] = 255;
        }
      }
    }
  }

  return nativeImage.createFromBuffer(pixels, { width: W, height: H });
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
    const icon = createTrayIcon();
    if (!icon || icon.isEmpty()) {
      const fallback = nativeImage.createFromBuffer(createMinimalPng());
      tray = new Tray(fallback);
    } else {
      icon.setTemplateImage(true);
      tray = new Tray(icon);
    }
    tray.setToolTip('AppUpdateChecker');
    tray.on('click', () => onOpenPanel());
    rebuildMenu();
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
      tray.setImage(createBadgeIcon(updateCount));
      tray.setToolTip(`AppUpdateChecker — ${updateCount} 个更新`);
    } else {
      const icon = createTrayIcon();
      if (icon && !icon.isEmpty()) {
        icon.setTemplateImage(true);
        tray.setImage(icon);
      }
      tray.setToolTip('AppUpdateChecker — 已是最新');
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
  // 内部 pixel helpers 暴露给测试
  _internal: { createTrayIcon, createBadgeIcon, drawDigit, createMinimalPng },
};
