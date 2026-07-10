/**
 * src/renderer/components/SideNav.jsx
 *
 * v2.9.0 — 左侧导航 (180↔40 可折叠, 你拍 shell_collapsible_leftnav)
 *
 * 2 nav item:
 *   - 世界杯 (WorldcupTabIcon)
 *   - IconRefresh 版本检查
 *
 * 顶部 IconMenu 汉堡切换折叠
 * store.activeNav (signal) 驱动 WorldcupView / ResultsView 切换
 * store.navCollapsed 驱动 180↔40 宽度
 *
 * 跟 v2.6 主体 0 共享 nav state (除汉堡自己用)
 *
 * v2.24.2 顶部加 IconRefresh 全局刷新按钮 (折叠时仍显示为图标),
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
import { IconChevronDown, IconMenu, IconRefresh, IconSettings } from './icons.jsx';
import { navigateTo } from '../route-store.js';

// Phase v1: 4 个动态 nav tab 跟 tray 菜单 prefs 同步 (菜单栏 + 主面板 tab 联动).
// nav key → prefs segment key. 不在 map 里的 nav 始终显示 (spec 明确不动).
const NAV_TO_PREFS_SEGMENT = {
  'versions': 'updates',
  'ai-usage': 'ai_usage',
  'worldcup': 'worldcup',
  'metals': 'metals',
};

const NAV_ITEMS = [
  { key: 'ithome',    label: 'IT 新闻', tooltip: 'IT之家资讯 + AI 摘要' },
  { key: 'wechat-hot',label: '微博热搜', tooltip: '微博实时热搜 · 手动刷新' },
  { key: 'worldcup',  label: '世界杯', tooltip: '2026 世界杯赛程' },
  { key: 'funds',     label: '基金管理', tooltip: '基金持仓 + 实时盈亏 (v2.10+)' },
  { key: 'metals',    label: '贵金属', tooltip: '黄金白银实时价格 + 持仓盈亏' },
  { key: 'stocks',    label: '选股', tooltip: 'A股条件选股 + 个股 AI 分析 (Phase 32 合并)' },
  { key: 'ai-usage',  label: 'AI coding plan 用量', tooltip: 'Minimax coding plan 配额 (v2.13)' },
  { key: 'versions',  label: '版本检查', tooltip: 'App 版本监控 (v2.6 主体)' },
];

export function SideNav() {
  const collapsed = navCollapsed.value;
  const current = activeNav.value;
  const trayPrefs = trayMenuPrefs.value;

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

  // activeNav 隐藏后: 自动切第一个可见 (避免"点不出来"的死锁).
  // 跳过 'home' — HomeGrid 是显示态而不是 panel, 不在 NAV_KEYS_LIST,
  // 用户主动点 🏠 去的, 不应该被 effect 弹回.
  useEffect(() => {
    if (current === 'home') return;
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
  // P-N: HomeGrid 模式 SideNav 只保留顶部 brand + icons 一行, 隐藏列表/底部/抽屉 —
  // HomeGrid 本身就是 8 个模块入口, SideNav 列表重复, footer 设置/隐藏抽屉也用不上.
  const isHome = current === 'home';

  return (
    <nav class={`side-nav${collapsed ? ' side-nav-collapsed' : ''}${isHome ? ' side-nav-home-mode' : ''}`}>
      <div class="side-nav-header">
        {!collapsed && (
          <div class="side-nav-brand" aria-hidden="true">
            <span class="side-nav-brand-mark">P</span>
            <span class="side-nav-brand-name">Pulse</span>
          </div>
        )}
        <div class="side-nav-header-actions">
          {!isHome && REFRESHABLE_NAV_KEYS.has(activeNav.value) && (
            <button
              type="button"
              class="side-nav-refresh-btn"
              onClick={() => refreshActiveNav(activeNav.value)}
              title="刷新当前栏目"
              aria-label="刷新当前栏目"
            >
              <IconRefresh size={16} />
            </button>
          )}
          <button
            class="side-nav-toggle"
            onClick={() => toggleNavCollapsed()}
            title={collapsed ? '展开' : '折叠'}
            aria-label={collapsed ? '展开' : '折叠'}
          >
            <IconMenu size={16} />
          </button>
          <button
            type="button"
            class="side-nav-toggle"
            onClick={() => setActiveNav('home')}
            title="首页"
            aria-label="首页"
          >
            🏠
          </button>
        </div>
      </div>
      {!isHome && allHidden && !collapsed && (
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
      {!isHome && (
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
      )}
      {!isHome && (
        <div class="side-nav-footer">
          {/* P11: 设置入口 (VersionsLayout → settings 路由) — 之前只能 Cmd+K 搜, 用户找不到.
              P15: AI 配置统一在设置页「AI 配置」tab, 不再有独立 SideNav AI 按钮. */}
          <button
            type="button"
            class="side-nav-button side-nav-settings-btn"
            onClick={() => { setActiveNav('versions'); navigateTo('settings'); }}
            title={collapsed ? '设置 (主题 / 跟随系统)' : ''}
            aria-label="设置"
            data-testid="side-nav-settings-btn"
          >
            <span class="side-nav-icon" aria-hidden="true"><IconSettings size={18} /></span>
            {!collapsed && <span class="side-nav-label">设置</span>}
          </button>
          {!collapsed && hiddenNavItems.length > 0 && (
            <button
              type="button"
              class="side-nav-hidden-toggle"
              onClick={() => setHiddenDrawerOpen(true)}
              data-testid="side-nav-hidden-toggle"
            >
              <span class="side-nav-icon" aria-hidden="true"><IconChevronDown size={14} /></span>
              <span class="side-nav-label">已隐藏 ({hiddenNavItems.length})</span>
            </button>
          )}
        </div>
      )}
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
