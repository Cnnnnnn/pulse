/**
 * src/renderer/platform-body-class.js
 *
 * P4: 按 platformInfo 给 document.body 加 class.
 * mac → body.platform-mac (现有 macOS 样式生效)
 * win → body.platform-win (Win10 纯色 fallback, Win11 acrylic 由 Electron 处理)
 *
 * 幂等: 多次调用不堆叠 class, 平台切换时旧 class 移除.
 * SSR / 非浏览器环境 (typeof document === 'undefined') 安全早返.
 */
export function applyPlatformBodyClass() {
  if (typeof document === 'undefined') return;

  const platform =
    (typeof window !== 'undefined'
      && window.platformInfo
      && window.platformInfo.platform) || 'darwin';

  // 清理旧 class
  document.body.classList.remove('platform-mac', 'platform-win');

  // 加新 class
  const cls = platform === 'win32' ? 'platform-win' : 'platform-mac';
  document.body.classList.add(cls);
}
