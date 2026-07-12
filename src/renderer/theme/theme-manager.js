/*
 * AppUpdateChecker · 主题管理器
 * ----------------------------------------------------------------------------
 * 提供 system / light / dark 三态切换，写入 <html data-theme>。
 * "跟随系统" 由 JS 解析成具体值 (避免 CSS @media 重复 + 支持手动覆盖).
 *
 * system 解析优先用主进程 nativeTheme (Electron `nativeTheme.shouldUseDarkColors`),
 * 它跟 OS 真实外观一致, 在 macOS "自动" 模式下跟随时段切换.
 * renderer 的 matchMedia('(prefers-color-scheme: dark)') 在 Electron 里可能
 * 不准确, fallback 才用.
 *
 * 接入：在渲染入口（src/renderer/index.jsx）import 并调用 initTheme()，
 *      并提供 UI（设置页/托盘菜单）调用 setThemePreference('light'|'dark'|'system')。
 *
 * ponytail: 持久化 localStorage 仍是单一真相, 主进程 IPC 仅用于 system 解析 +
 *           跨 renderer 同步; 主进程在重启时是空 cache, 所以 theme:get 必须
 *           由 renderer 在 setThemePreference 时主动 push 过去 (theme:set IPC).
 */

const STORAGE_KEY = "app-theme-preference"; // 'system' | 'light' | 'dark'
const VALID = ["system", "light", "dark"];
const root =
  typeof document !== "undefined" ? document.documentElement : null;

/* 若使用 Electron 配置持久化，替换下面两个函数体即可 */
function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "system";
  } catch {
    return "system";
  }
}

function writePreference(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/* ponytail: system 解析优先用主进程 (Electron nativeTheme), 因为它在
   macOS Auto / Win 高对比度模式下比 renderer 的 matchMedia 准.
   没拿到 IPC 时才退到 matchMedia. 同步返回 boolean,
   调用方在异步初始化后会再 refresh 一次. */
let systemDarkOverride = null; // null = 未初始化, true/false = 解析后
function getSystemDark() {
  if (systemDarkOverride !== null) return systemDarkOverride;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 把用户偏好解析成具体主题 */
function resolve(mode) {
  if (mode === "system") return getSystemDark() ? "dark" : "light";
  return mode === "dark" ? "dark" : "light";
}

/** 把解析后的具体主题写到 <html data-theme>; 广播给订阅者 */
function apply(mode) {
  if (!root) return;
  root.setAttribute("data-theme", resolve(mode));
  root.setAttribute("data-theme-source", mode); // 供 UI 显示当前模式
  notify(mode);
}

/* ─── 订阅者 (SettingsPage 用) ─────────────────────────────── */
const subscribers = new Set();
function notify(mode) {
  for (const cb of subscribers) {
    try {
      cb(mode);
    } catch {
      /* 订阅者错误不影响其它 */
    }
  }
}

/**
 * 订阅偏好变化 (initTheme 调用 apply 或 setThemePreference 时触发).
 * 返回 unsubscribe.
 */
export function subscribeTheme(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** 读取当前偏好（'system' | 'light' | 'dark'） */
export function getThemePreference() {
  const m = readPreference();
  return VALID.includes(m) ? m : "system";
}

/**
 * 设置偏好并立即生效, 异步同步给主进程 (跨 renderer 一致).
 * 返回生效的偏好值.
 */
export function setThemePreference(mode) {
  const m = VALID.includes(mode) ? mode : "system";
  writePreference(m);
  apply(m);
  // ponytail: 让主进程记住偏好, 后续 nativeTheme 变化能正确广播到 renderer.
  // 不 await — UI 不阻塞; 失败也无副作用 (localStorage 已是真相).
  try {
    if (
      typeof window !== "undefined" &&
      window.metalsApi &&
      typeof window.metalsApi.themeSet === "function"
    ) {
      window.metalsApi.themeSet(m).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  return m;
}

/** 切换：在 light <-> dark 间切换（system 视为按其当前解析值切换） */
export function toggleTheme() {
  const current = root ? root.getAttribute("data-theme") : "light";
  return setThemePreference(current === "dark" ? "light" : "dark");
}

/**
 * 初始化：应用已保存偏好, 异步拉主进程 system 状态校正,
 * 监听系统外观变化（仅 system 模式下响应）。
 */
export function initTheme() {
  const mode = getThemePreference();
  apply(mode);

  if (typeof window === "undefined") return;

  // ponytail: 启动时主动从主进程拉 system 真实状态, 校正 matchMedia 不准的情况.
  if (window.metalsApi && typeof window.metalsApi.themeGet === "function") {
    window.metalsApi
      .themeGet()
      .then((res) => {
        if (!res) return;
        if (typeof res.resolved === "string") {
          // 优先用主进程的解析 (nativeTheme.shouldUseDarkColors).
          systemDarkOverride = res.resolved === "dark";
          if (getThemePreference() === "system") {
            // 重新解析 + apply + 通知
            apply("system");
          }
        }
        // 主进程如果没记录偏好, push 当前 localStorage 过去, 同步.
        if (res.mode !== getThemePreference()) {
          window.metalsApi.themeSet(getThemePreference()).catch(() => {});
        }
      })
      .catch(() => {});
  }

  // 订阅主进程 theme:changed (其它 renderer 或系统切换触发)
  if (
    window.metalsApi &&
    typeof window.metalsApi.onThemeChanged === "function"
  ) {
    try {
      window.metalsApi.onThemeChanged(({ mode, resolved }) => {
        if (mode === "system" && typeof resolved === "string") {
          systemDarkOverride = resolved === "dark";
        }
        if (getThemePreference() === "system") apply("system");
      });
    } catch {
      /* ignore */
    }
  }

  // 兜底: renderer matchMedia 监听 (没 IPC 时)
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      // 仅当没有 IPC override 时用 matchMedia
      if (systemDarkOverride !== null) return;
      if (getThemePreference() === "system") apply("system");
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else if (mq.addListener) mq.addListener(handler);
  }
}

export default {
  initTheme,
  getThemePreference,
  setThemePreference,
  toggleTheme,
  subscribeTheme,
};