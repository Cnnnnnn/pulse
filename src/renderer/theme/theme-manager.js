/*
 * AppUpdateChecker · 主题管理器
 * ----------------------------------------------------------------------------
 * 提供 system / light / dark 三态切换，写入 <html data-theme>。
 * "跟随系统" 由 JS 解析为具体值（避免 CSS @media 重复 + 支持手动覆盖）。
 *
 * 接入：在渲染入口（src/renderer/index.jsx）import 并调用 initTheme()，
 *      并提供 UI（设置页/托盘菜单）调用 setThemePreference('light'|'dark'|'system')。
 *
 * 持久化：默认用 localStorage；Electron 桌面应用建议改为既有配置模块
 *        （例如 window.electronAPI?.getConfig/setConfig），见下方 CONFIG 注释。
 */

const STORAGE_KEY = 'app-theme-preference'; // 'system' | 'light' | 'dark'
const VALID = ['system', 'light', 'dark'];
const root = typeof document !== 'undefined' ? document.documentElement : null;

/* 若使用 Electron 配置持久化，替换下面两个函数体即可 */
function readPreference() {
  try {
    // 例：return window.electronAPI?.getConfig?.('theme') || 'system';
    return localStorage.getItem(STORAGE_KEY) || 'system';
  } catch {
    return 'system';
  }
}

function writePreference(mode) {
  try {
    // 例：window.electronAPI?.setConfig?.('theme', mode);
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function systemPrefersDark() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** 把用户偏好解析成具体主题 */
function resolve(mode) {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode === 'dark' ? 'dark' : 'light';
}

/** 把解析后的具体主题写到 <html data-theme> */
function apply(mode) {
  if (!root) return;
  root.setAttribute('data-theme', resolve(mode));
  root.setAttribute('data-theme-source', mode); // 供 UI 显示当前模式
}

/** 读取当前偏好（'system' | 'light' | 'dark'） */
export function getThemePreference() {
  const m = readPreference();
  return VALID.includes(m) ? m : 'system';
}

/** 设置偏好并立即生效，返回生效的偏好值 */
export function setThemePreference(mode) {
  const m = VALID.includes(mode) ? mode : 'system';
  writePreference(m);
  apply(m);
  return m;
}

/** 切换：在 light <-> dark 间切换（system 视为按其当前解析值切换） */
export function toggleTheme() {
  const current = root ? root.getAttribute('data-theme') : 'light';
  return setThemePreference(current === 'dark' ? 'light' : 'dark');
}

/** 初始化：应用已保存偏好，并监听系统外观变化（仅 system 模式下响应） */
export function initTheme() {
  const mode = getThemePreference();
  apply(mode);

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getThemePreference() === 'system') apply('system');
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler); // 旧版 Chromium
  }
}

export default { initTheme, getThemePreference, setThemePreference, toggleTheme };
