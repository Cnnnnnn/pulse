/**
 * src/renderer/hooks/useIcon.js
 *
 * App 图标 hook —— 模块级缓存 + 单 row 局部更新。
 *
 * 设计：
 *  - 顶层 iconCache Map<bundle, base64dataURL>，跨 row 共享，跨 check 共享。
 *  - hook 返回 src 或 null（未加载完）。
 *  - 第一次见到的 bundle 才发 IPC getAppIcon；后续命中缓存，瞬时返回。
 *  - 组件卸载时把 in-flight 的 promise 标记 cancelled，避免 setState on unmounted。
 *
 * 这是单 row 局部更新的关键 —— 同一个 AppAvatar 在 result signal 变化时
 * 会重渲染，但 useIcon 拿到的是已缓存的 src，不会再发 IPC。
 */

import { useState, useEffect } from 'preact/hooks';
import { api } from '../api.js';

// Inline 避免 esbuild 拖入 node:path 依赖 (renderer 不该打 path 模块).
// P4: 加平台守卫 — win32 上返 null, 防止拼出 /Applications/Cursor.exe 错路径.
//     useIcon 不会在 Windows 真跑 (windows.js getAppIcon 走真实 .exe 路径 +
//     app.getFileIcon), 这是防御性 coding.
export function resolveAppBundlePath(bundle) {
  if (!bundle || typeof bundle !== 'string') return null;
  const trimmed = bundle.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed;
  if (
    typeof window !== 'undefined'
    && window.platformInfo
    && window.platformInfo.platform === 'win32'
  ) {
    return null;
  }
  return `/Applications/${trimmed}`;
}

const iconCache = new Map();       // bundle → dataURL
const inflight = new Map();        // bundle → Promise (避免重复请求)

/**
 * 把 config 里的 bundle (e.g. "Cursor.app") 拼成 macOS 全路径.
 */
function bundleToPath(bundle) {
  return resolveAppBundlePath(bundle);
}

/**
 * @param {string} bundle - .app bundle name (如 'Cursor.app') 或全路径
 * @param {string} name   - app name (用于头像首字母 + fallback 渐变)
 * @returns {{ src: string|null, nameInitial: string, nameColor: string }}
 */
export function useIcon(bundle, name) {
  const [src, setSrc] = useState(() => iconCache.get(bundle) || null);

  useEffect(() => {
    if (!bundle) return undefined;

    const path = bundleToPath(bundle);
    if (!path) return undefined;

    // 命中缓存 → 立即设值
    if (iconCache.has(path)) {
      const cached = iconCache.get(path);
      if (cached !== src) setSrc(cached);
      return undefined;
    }

    // 已有 in-flight 请求 → 复用
    let promise = inflight.get(path);
    if (!promise) {
      promise = Promise.resolve(api.getAppIcon(path))
        .then((result) => {
          // IPC 返 { dataUrl } | { error }, 取 dataUrl
          if (result && typeof result.dataUrl === 'string') return result.dataUrl;
          return null;
        })
        .catch(() => null);
      inflight.set(path, promise);
    }

    let cancelled = false;
    promise.then((dataUrl) => {
      inflight.delete(path);
      if (cancelled) return;
      if (dataUrl) {
        iconCache.set(path, dataUrl);
        setSrc(dataUrl);
      }
    });

    return () => { cancelled = true; };
    // 故意不依赖 src：避免 src 变化触发二次 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);

  return {
    src,
    nameInitial: name ? name.charAt(0).toUpperCase() : '?',
    nameColor: nameColor(name || ''),
  };
}

// ─── 名字→渐变色（跟旧 renderer.js nameColor 保持一致）────
const COLORS = [
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #fccb90, #d57eeb)',
  'linear-gradient(135deg, #f6d365, #fda085)',
  'linear-gradient(135deg, #5ee7df, #b490ca)',
  'linear-gradient(135deg, #c3cfe2, #f5f7fa)',
  'linear-gradient(135deg, #0c3483, #a2b6df)',
];

function nameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

/** 测试用：清空模块级缓存 */
export function _clearIconCache() {
  iconCache.clear();
  inflight.clear();
}

/** 测试用：直接设 cache 项, 跳过 IPC. bundle 是 "Cursor.app" 这种短名 (hook 内部会拼路径). */
export function _setIconForTest(bundle, dataUrl) {
  const path = bundleToPath(bundle);
  if (path) iconCache.set(path, dataUrl);
}
