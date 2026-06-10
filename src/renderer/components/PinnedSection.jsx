/**
 * src/renderer/components/PinnedSection.jsx
 *
 * v2.7.0 (My Apps Library, B4): "⭐ 我关注的" 顶部区.
 * v2.7.1: 视觉统一 — 浅蓝底 + 圆角 chip + "只看这些 →" 按钮
 *
 * 只在 library.pinned 非空时挂载. 渲染:
 *   - 顶部: "⭐ 我关注的" 标题
 *   - 主体: pinned 名字列表 (chip 风格, 点 chip 取消 pin)
 *
 * 跟 LibrarySection 不同:
 *   - LibrarySection 是 "未监控的 app 列表" (来源: 扫盘)
 *   - PinnedSection 是 "已加 ⭐ 的 app 名字" (来源: library.pinned)
 *
 * 复用 row 渲染? — 不复用, PinnedSection 只显示名, 不显示 bundle/version/bundleId.
 */

import { libraryConfig, activeFilter } from '../store.js';
import { api } from '../api.js';

export function PinnedSection() {
  const pinned = (libraryConfig.value && libraryConfig.value.pinned) || [];

  if (pinned.length === 0) return null;
  // 仅在 activeFilter === 'all' 时显示 (跟其它 chip 不冲突)
  if (activeFilter.value !== 'all') return null;

  function onUnpin(name) {
    const next = pinned.filter((p) => p !== name);
    api.librarySetPinned(next);
  }

  function onClickFilter() {
    activeFilter.value = 'starred';
  }

  return (
    <div class="pinned-section">
      <div class="pinned-section-header">
        <span class="pinned-section-title">⭐ 我关注的</span>
        <button
          class="pinned-section-filter"
          onClick={onClickFilter}
          title="仅显示我关注的"
        >
          只看这些 →
        </button>
      </div>
      <div class="pinned-section-chips">
        {pinned.map((name) => (
          <span key={name} class="pinned-chip" title={name}>
            <span class="pinned-chip-name">{name}</span>
            <button
              class="pinned-chip-remove"
              onClick={() => onUnpin(name)}
              aria-label={`取消关注 ${name}`}
              title="取消关注"
            >×</button>
          </span>
        ))}
      </div>
    </div>
  );
}
