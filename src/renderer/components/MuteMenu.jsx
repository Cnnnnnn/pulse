/**
 * src/renderer/components/MuteMenu.jsx
 *
 * Phase 27 + 29: 右键菜单 — 让用户静音 / 取消静音一个 app.
 *
 * Phase 29: 选项按 tier-aware 排序 + 推荐项加 ✨推荐 标签.
 *   - 5 个固定选项 (1/7/30/90/永远) 不变
 *   - 按 lastOpenedApps[name] 算 tier (hot/warm/cold/unknown)
 *   - 推荐项置顶高亮 (1天 for hot, 7天 for warm/unknown, 30天 for cold)
 *   - 永远 永远在 last
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
 *   - lastOpened: { ms, source } | null (用于算 tier)
 *   - onClose: 关闭回调
 *   - onAction: (action) => void
 *
 * 测试覆盖 (tests/renderer/mute-menu.test.jsx):
 *   - 5 选项基本渲染
 *   - tier=hot → 1 天置顶 + recommended
 *   - tier=warm → 7 天置顶
 *   - tier=cold → 30 天置顶
 *   - forever 永远 last
 *   - muted 状态: 取消静音按钮
 *   - 点选项 → setMute / clearMute + onClose
 *   - Esc / outside-click 关闭
 */

import { useEffect, useRef, useState, useLayoutEffect } from 'preact/hooks';
import { setMute, clearMute, getLocalTier } from '../store.js';

const BASE_OPTIONS = [
  { label: '1 天',     seconds: 1 * 24 * 3600 },
  { label: '7 天',     seconds: 7 * 24 * 3600 },
  { label: '30 天',    seconds: 30 * 24 * 3600 },
  { label: '90 天',    seconds: 90 * 24 * 3600 },
  { label: '永远',     seconds: 0 },
];

const RECOMMENDED = {
  hot: 1 * 86400,
  warm: 7 * 86400,
  cold: 30 * 86400,
  unknown: 7 * 86400,
};

function rankOptions(tier) {
  const rec = RECOMMENDED[tier] ?? RECOMMENDED.unknown;
  return BASE_OPTIONS.map((o) => ({ ...o, recommended: o.seconds === rec }))
    .sort((a, b) => {
      if (a.seconds === 0) return 1;
      if (b.seconds === 0) return -1;
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return a.seconds - b.seconds;
    });
}

const TIER_LABELS = {
  hot: '热',
  warm: '温',
  cold: '冷',
  unknown: '未知',
};

function formatUntil(untilMs) {
  if (!untilMs) return '永远';
  const d = new Date(untilMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MuteMenu({ x, y, appName, isMuted, muteUntil, lastOpened = null, onClose, onAction }) {
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

  // Phase 29: 按 tier 排 5 个选项
  const tier = lastOpened ? getLocalTier(lastOpened.ms) : 'unknown';
  const ranked = rankOptions(tier);

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
        ranked.map((opt) => (
          <button
            key={opt.seconds}
            class={`mute-menu-item${opt.recommended ? ' mute-menu-item--recommended' : ''}`}
            onClick={() => pickDuration(opt.seconds)}
            disabled={busy}
            role="menuitem"
          >
            <span class="mute-menu-item-icon">{opt.recommended ? '✨' : '🔇'}</span>
            静音 {opt.label}
            {opt.recommended && <span class="mute-menu-recommended-tag">推荐</span>}
          </button>
        ))
      )}
    </div>
  );
}

// 测试需要
export { rankOptions, RECOMMENDED, TIER_LABELS, BASE_OPTIONS };
