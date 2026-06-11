/**
 * src/renderer/components/LibrarySection.jsx
 *
 * v2.7.0 (My Apps Library, B4): "未监控" tab 下的内容区.
 * v2.7.1: UI polish — card 化行布局 + 统一 button 风格 + 空状态 icon
 *
 * 渲染:
 *   - 顶部 header: "📦 未监控的应用 29 · 装了新 app 后点 ↻" + "↻ 重新扫描" 按钮
 *   - 卡片化行列表 (12px 16px padding, 1px border, 8px 间距)
 *   - 空状态: 64px 圆 icon + 标题 + 副标题
 *
 * 数据源:
 *   - unmonitoredApps signal (来自 IPC library:list-unmonitored)
 *   - 写操作走 IPC libraryAdd / librarySetIgnored / librarySetPinned
 *
 * detector wizard 不在这里, 单独成 modal (DetectorWizardModal.jsx).
 */

import { useState, useEffect } from 'preact/hooks';
import { unmonitoredApps, libraryConfig, activeFilter } from '../store.js';
import { api } from '../api.js';

export function LibrarySection({ onOpenAutoDetect, onOpenWizard }) {
  const apps = unmonitoredApps.value;
  const pinned = (libraryConfig.value && libraryConfig.value.pinned) || [];
  const ignoredNames = new Set(
    ((libraryConfig.value && libraryConfig.value.ignored) || []).map((i) => i && i.appName).filter(Boolean),
  );

  // 只在 activeFilter === 'unmonitored' 时挂载 (App.jsx 控制), 这里不再判断
  // 但保留防御性 return null
  if (activeFilter.value !== 'unmonitored') return null;

  function onRescan() {
    refreshUnmonitored();
  }

  function onIgnore(item) {
    const currentIgnored = (libraryConfig.value && libraryConfig.value.ignored) || [];
    const next = [...currentIgnored, { appName: item.appName, bundle: item.bundleName }];
    api.librarySetIgnored(next).then((r) => {
      if (r && r.ok) {
        // unmonitored 列表本地更新 (不依赖 store 事件)
        unmonitoredApps.value = unmonitoredApps.value.filter((a) => a.bundlePath !== item.bundlePath);
      }
    });
  }

  function onPinToggle(item) {
    const next = pinned.includes(item.appName)
      ? pinned.filter((p) => p !== item.appName)
      : [...pinned, item.appName];
    api.librarySetPinned(next);
  }

  return (
    <div class="library-section">
      <div class="library-section-header">
        <h2 class="library-section-title">
          <span>📦 未监控的应用</span>
          <span class="library-section-count">· {apps.length} 个</span>
        </h2>
        <div class="library-section-actions">
          <button
            class="btn btn-ghost btn-sm"
            onClick={onRescan}
            title="重新扫描 /Applications 跟 ~/Applications"
          >
            ↻ 重新扫描
          </button>
        </div>
      </div>

      {apps.length === 0 ? (
        <div class="library-empty">
          <div class="library-empty-icon">✓</div>
          <div class="library-empty-title">所有已装 app 都在监控列表</div>
          <div class="library-empty-hint">
            装了新 app 后点"↻ 重新扫描"能看到
          </div>
        </div>
      ) : (
        <div class="library-list">
          {apps.map((item) => {
            const isPinned = pinned.includes(item.appName);
            const isIgnored = ignoredNames.has(item.appName);
            return (
              <div
                key={item.bundlePath}
                class={`library-row${isPinned ? ' is-pinned' : ''}${isIgnored ? ' is-ignored' : ''}`}
              >
                <div class="library-row-main">
                  <div class="library-row-name">{item.appName || item.bundleName}</div>
                  <div class="library-row-meta">
                    {item.bundleName && <span>{item.bundleName}</span>}
                    {item.version && <span>v{item.version}</span>}
                    {item.bundleId && <span>{item.bundleId}</span>}
                  </div>
                </div>
                <div class="library-row-actions">
                  <button
                    class={`btn btn-sm ${isPinned ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => onPinToggle(item)}
                    title={isPinned ? '取消 ⭐' : '加 ⭐'}
                  >
                    {isPinned ? '⭐' : '☆'}
                  </button>
                  <button
                    class="btn btn-primary btn-sm"
                    onClick={() => onOpenAutoDetect && onOpenAutoDetect(item)}
                    title="自动探查 detector + 加入监控"
                  >
                    监控
                  </button>
                  <button
                    class="btn btn-ghost btn-sm"
                    onClick={() => onIgnore(item)}
                    title="加入 ignored, 不再提示"
                    disabled={isIgnored}
                  >
                    {isIgnored ? '已忽略' : '忽略'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 触发 IPC 拉 unmonitored 列表, 写到 unmonitoredApps signal.
 * App.jsx bootstrap 调一次, 之后每次 LibrarySection 的"重新扫描"按钮也调.
 */
export function refreshUnmonitored() {
  if (typeof api.libraryListUnmonitored !== 'function') return;
  api.libraryListUnmonitored().then((r) => {
    if (r && r.ok && Array.isArray(r.unmonitored)) {
      unmonitoredApps.value = r.unmonitored;
    }
  });
}
