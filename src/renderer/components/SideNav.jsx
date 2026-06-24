/**
 * src/renderer/components/SideNav.jsx
 *
 * v2.9.0 — 左侧导航 (180↔40 可折叠, 你拍 shell_collapsible_leftnav)
 *
 * 2 nav item:
 *   - 🏆 世界杯
 *   - 🔄 版本检查
 *
 * 顶部 ☰ 汉堡切换折叠
 * store.activeNav (signal) 驱动 WorldcupView / ResultsView 切换
 * store.navCollapsed 驱动 180↔40 宽度
 *
 * 跟 v2.6 主体 0 共享 nav state (除汉堡自己用)
 *
 * v2.24.2 顶部加 ↻ 全局刷新按钮 (折叠时仍显示为图标),
 *   按 activeNav 派发到 nav-refresh.js registry.
 */

import { useEffect, useState } from 'preact/hooks';
import {
  activeNav,
  navCollapsed,
  setActiveNav,
  toggleNavCollapsed,
  effectiveVisibleItems,
} from '../worldcup/navStore.js';
import { openAISettings, needsConfig, aiSessionsConfig, aiKeyStatus } from '../store.js';
import { ithomeUnreadBadge } from '../ithome/store.js';
import { wechatHotUnreadBadge } from '../wechat-hot/store.js';
import { fundUnreadBadge } from '../funds/fundStore.js';
import { aiUsageNavBadge } from '../store/ai-usage-store.js';
import { refreshActiveNav, REFRESHABLE_NAV_KEYS } from '../nav-refresh.js';
import { trayMenuPrefs } from '../trayConfigStore.js';
import {
  loadPrefs,
  savePrefs,
  listHidden,
  hideItem,
  restoreItem,
  reorderItems,
  moveToTop,
  moveToBottom,
} from './sidenav-prefs.js';
import { SideNavItem } from './SideNavItem.jsx';
import { HiddenItemsDrawer } from './HiddenItemsDrawer.jsx';

// Phase v1: 4 个动态 nav tab 跟 tray 菜单 prefs 同步 (菜单栏 + 主面板 tab 联动).
// nav key → prefs segment key. 不在 map 里的 nav 始终显示 (spec 明确不动).
const NAV_TO_PREFS_SEGMENT = {
  'versions': 'updates',
  'ai-usage': 'ai_usage',
  'worldcup': 'worldcup',
  'metals': 'metals',
};

const NAV_ITEMS = [
  { key: 'ithome',    icon: '📰', label: 'IT 新闻', tooltip: 'IT之家资讯 + AI 摘要' },
  { key: 'wechat-hot',icon: '🔥', label: '微博热搜', tooltip: '微博实时热搜 · 手动刷新' },
  { key: 'worldcup',  icon: '🏆', label: '世界杯', tooltip: '2026 世界杯赛程' },
  { key: 'funds',     icon: '💰', label: '基金管理', tooltip: '基金持仓 + 实时盈亏 (v2.10+)' },
  { key: 'metals',    icon: '🥇', label: '贵金属', tooltip: '黄金白银实时价格 + 持仓盈亏' },
  { key: 'ai-usage',  icon: '📊', label: 'AI coding plan 用量', tooltip: 'Minimax coding plan 配额 (v2.13)' },
  { key: 'versions',  icon: '🔄', label: '版本检查', tooltip: 'App 版本监控 (v2.6 主体)' },
];

export function SideNav() {
  const collapsed = navCollapsed.value;
  const current = activeNav.value;
  const trayPrefs = trayMenuPrefs.value;
  // 显式订阅 config / key 信号, 避免 needsConfig 误判后 UI 不刷新
  void aiSessionsConfig.value;
  void aiKeyStatus.value;
  const aiNeedsSetup = needsConfig();

  // I6: 未读角标 — 显式订阅确保 UI 刷新 (ithome + wechat-hot)
  void ithomeUnreadBadge.value;
  void wechatHotUnreadBadge.value;
  void fundUnreadBadge.value;
  void aiUsageNavBadge.value;
  const navBadges = {
    ithome: ithomeUnreadBadge.value,
    'wechat-hot': wechatHotUnreadBadge.value,
    funds: fundUnreadBadge.value,
    'ai-usage': aiUsageNavBadge.value,
  };

  // Phase I3: nav 重排 + 隐藏 (localStorage 持久化)
  const [sidenavPrefs, setSidenavPrefs] = useState(() => loadPrefs());
  const [hiddenDrawerOpen, setHiddenDrawerOpen] = useState(false);

  // 跟 trayMenuPrefs 同步 (tray 菜单关掉的 nav 也算不可见)
  // Phase I3 v1: 直接用 effectiveVisibleItems (navStore.js 已实现)
  const visibleKeys = effectiveVisibleItems(sidenavPrefs).filter((key) => {
    const segKey = NAV_TO_PREFS_SEGMENT[key];
    if (!segKey) return true;
    return trayPrefs.segments[segKey] !== false;
  });
  const visibleNavItems = visibleKeys
    .map((key) => NAV_ITEMS.find((item) => item.key === key))
    .filter(Boolean);
  const hiddenNavItems = listHidden(sidenavPrefs)
    .map((key) => NAV_ITEMS.find((item) => item.key === key))
    .filter(Boolean);

  // activeNav 隐藏后: 自动切第一个可见 (避免"点不出来"的死锁)
  useEffect(() => {
    if (visibleKeys.length > 0 && !visibleKeys.includes(current)) {
      setActiveNav(visibleKeys[0]);
    }
  }, [sidenavPrefs, trayPrefs, visibleKeys.join(','), current]);

  function applyPrefs(next) {
    setSidenavPrefs(next);
    savePrefs(next);
  }

  function handleReorder(fromKey, toKey, position) {
    applyPrefs(reorderItems(sidenavPrefs, fromKey, toKey, position));
  }
  function handleHide(key) {
    applyPrefs(hideItem(sidenavPrefs, key));
  }
  function handleMoveTop(key) {
    applyPrefs(moveToTop(sidenavPrefs, key));
  }
  function handleMoveBottom(key) {
    applyPrefs(moveToBottom(sidenavPrefs, key));
  }
  function handleRestore(key) {
    applyPrefs(restoreItem(sidenavPrefs, key));
  }

  const allHidden = visibleNavItems.length === 0;

  return (
    <nav class={`side-nav${collapsed ? ' side-nav-collapsed' : ''}`}>
      <div class="side-nav-header">
        {!collapsed && (
          <div class="side-nav-brand" aria-hidden="true">
            <span class="side-nav-brand-mark">P</span>
            <span class="side-nav-brand-name">Pulse</span>
          </div>
        )}
        <div class="side-nav-header-actions">
          {REFRESHABLE_NAV_KEYS.has(activeNav.value) && (
            <button
              type="button"
              class="side-nav-refresh-btn"
              onClick={() => refreshActiveNav(activeNav.value)}
              title="刷新当前栏目"
              aria-label="刷新当前栏目"
            >
              <span aria-hidden="true">↻</span>
            </button>
          )}
          <button
            class="side-nav-toggle"
            onClick={() => toggleNavCollapsed()}
            title={collapsed ? '展开' : '折叠'}
            aria-label={collapsed ? '展开' : '折叠'}
          >
            ☰
          </button>
        </div>
      </div>
      {allHidden && !collapsed && (
        <div class="side-nav-empty-banner">
          已隐藏全部 nav 项 ·{' '}
          <button
            type="button"
            class="side-nav-empty-banner__link"
            onClick={() => setHiddenDrawerOpen(true)}
          >
            点这里恢复
          </button>
        </div>
      )}
      <ul class="side-nav-list">
        {visibleNavItems.map((item) => {
          const isActive = current === item.key;
          return (
            <SideNavItem
              key={item.key}
              item={item}
              active={isActive}
              collapsed={collapsed}
              badge={navBadges[item.key] || 0}
              draggable={!collapsed}
              onSelect={setActiveNav}
              onReorder={handleReorder}
              onHide={handleHide}
              onMoveTop={handleMoveTop}
              onMoveBottom={handleMoveBottom}
            />
          );
        })}
      </ul>
      <div class="side-nav-footer">
        <button
          type="button"
          class={`side-nav-button side-nav-ai-btn${aiNeedsSetup ? ' side-nav-ai-btn-needs-setup' : ''}`}
          onClick={() => openAISettings(true)}
          title={collapsed ? 'Pulse 共享 AI 配置' : ''}
          aria-label="Pulse 共享 AI 配置"
        >
          <span class="side-nav-icon">🤖</span>
          {!collapsed && <span class="side-nav-label">AI 配置</span>}
          {aiNeedsSetup && <span class="side-nav-setup-dot" aria-hidden="true" />}
        </button>
        {!collapsed && hiddenNavItems.length > 0 && (
          <button
            type="button"
            class="side-nav-hidden-toggle"
            onClick={() => setHiddenDrawerOpen(true)}
            data-testid="side-nav-hidden-toggle"
          >
            <span class="side-nav-icon" aria-hidden="true">▾</span>
            <span class="side-nav-label">已隐藏 ({hiddenNavItems.length})</span>
          </button>
        )}
      </div>
      <HiddenItemsDrawer
        open={hiddenDrawerOpen}
        hiddenItems={hiddenNavItems}
        onRestore={handleRestore}
        onClose={() => setHiddenDrawerOpen(false)}
      />
    </nav>
  );
}

export default SideNav;
