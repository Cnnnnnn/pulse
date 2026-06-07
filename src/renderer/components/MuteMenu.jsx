/**
 * src/renderer/components/MuteMenu.jsx
 *
 * Phase 27: 右键菜单 — 让用户静音 / 取消静音一个 app.
 *
 * 形态: Preact 自渲染的浮动 div, 不用 Electron 原生 Menu.
 *   - 跟整体样式一致, 测试不依赖 Electron.
 *   - 点击菜单项后, 走 store.setMute / clearMute → IPC → 主进程 state.json.
 *
 * Props:
 *   - x, y:  菜单位置 (相对 viewport)
 *   - appName: 当前右键的 app name
 *   - isMuted: 当前是否已静音 (boolean, 父组件读 store isMuted 算)
 *   - muteUntil: 已静音的话, until timestamp; 0 = 永远
 *   - onClose: 关闭回调 (Esc / 点击外部 / 选项点击后)
 *   - onAction: (action) => void   给父组件一个 hook, 可选. 不用也行 (内部已调 setMute/clearMute).
 *
 * 行为:
 *   - 渲染: 一行 icon + label
 *   - 边界处理: 视口边缘时 clamp 到不超出 (translateX/Y 修正)
 *   - Esc 关闭 / 点外面关闭 / 选完关闭
 *
 * 测试覆盖 (tests/renderer/mute-menu.test.jsx):
 *   - 非 muted 状态: 渲染 4 选项 (7/30/90/forever)
 *   - muted 状态: 渲染 "取消静音" + "查看到期"
 *   - 点选项 → 调 setMute / clearMute + onClose
 *   - Esc → onClose
 */

import { useEffect, useRef, useState, useLayoutEffect } from 'preact/hooks';
import { setMute, clearMute } from '../store.js';

const MUTE_OPTIONS = [
  { label: '7 天',     seconds: 7 * 24 * 3600 },
  { label: '30 天',    seconds: 30 * 24 * 3600 },
  { label: '90 天',    seconds: 90 * 24 * 3600 },
  { label: '永远',     seconds: 0 },
];

function formatUntil(untilMs) {
  if (!untilMs) return '永远';
  const d = new Date(untilMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MuteMenu({ x, y, appName, isMuted, muteUntil, onClose, onAction }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [busy, setBusy] = useState(false);

  // 视口边缘 clamp — 避免菜单超出屏幕
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + r.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - r.width - 8);
    }
    if (top + r.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - r.height - 8);
    }
    setPos({ left, top });
  }, [x, y]);

  // Esc 关闭 + 点击外部关闭
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose && onClose();
      }
    }
    function onClick(e) {
      // 点菜单内部不关
      if (ref.current && ref.current.contains(e.target)) return;
      onClose && onClose();
    }
    window.addEventListener('keydown', onKey);
    // 用 mousedown 让右键第二次开能正常触发 (click 在 menu 还没挂上时)
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  async function pickDuration(seconds) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await setMute(appName, seconds);
      if (r && r.ok && onAction) onAction({ type: 'mute', seconds });
    } finally {
      setBusy(false);
      onClose && onClose();
    }
  }

  async function onClear() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await clearMute(appName);
      if (r && r.ok && onAction) onAction({ type: 'unmute' });
    } finally {
      setBusy(false);
      onClose && onClose();
    }
  }

  return (
    <div
      ref={ref}
      class="mute-menu"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div class="mute-menu-header">
        <span class="mute-menu-icon">{isMuted ? '🔇' : '🔔'}</span>
        <span class="mute-menu-app">{appName}</span>
        {isMuted && <span class="mute-menu-status">已静音至 {formatUntil(muteUntil)}</span>}
      </div>
      <div class="mute-menu-divider" />
      {isMuted ? (
        <button
          class="mute-menu-item mute-menu-item--unmute"
          onClick={onClear}
          disabled={busy}
          role="menuitem"
        >
          <span class="mute-menu-item-icon">🔔</span>
          取消静音
        </button>
      ) : (
        MUTE_OPTIONS.map((opt) => (
          <button
            key={opt.seconds}
            class="mute-menu-item"
            onClick={() => pickDuration(opt.seconds)}
            disabled={busy}
            role="menuitem"
          >
            <span class="mute-menu-item-icon">🔇</span>
            静音 {opt.label}
          </button>
        ))
      )}
    </div>
  );
}
