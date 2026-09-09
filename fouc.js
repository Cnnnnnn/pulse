/**
 * fouc.js — 同步写 data-theme，避免 CSS 加载前闪白/闪黑。
 * 从 index.html 内联抽出，配合 CSP script-src 'self'（不允许 inline）。
 */
(function () {
  try {
    var key = 'app-theme-preference';
    var mode = localStorage.getItem(key) || 'system';
    var dark = mode === 'dark' ||
      (mode === 'system' && window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-source', mode);
  } catch (e) {}
})();
