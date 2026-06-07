/**
 * src/renderer/components/AppAvatar.jsx
 *
 * App 头像: 优先用真图标 (来自 IPC 缓存)，否则用首字母渐变块。
 * 有真图标时: 透明背景, 图标自身就是前景.
 * useIcon 内部维护模块级缓存 —— 同一个 bundle 只发一次 IPC。
 */

import { useIcon } from '../hooks/useIcon.js';

export function AppAvatar({ bundle, name }) {
  const { src, nameInitial, nameColor } = useIcon(bundle, name);

  if (src) {
    return (
      <div class="app-avatar app-avatar--icon">
        <img src={src} alt="" />
      </div>
    );
  }
  return (
    <div class="app-avatar app-avatar--letter" style={{ background: nameColor }}>
      <span>{nameInitial}</span>
    </div>
  );
}
