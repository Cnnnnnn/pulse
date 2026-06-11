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
 */

import { useState } from 'preact/hooks';
import { activeNav, navCollapsed, setActiveNav, toggleNavCollapsed } from '../worldcup/navStore.js';

const NAV_ITEMS = [
  { key: 'worldcup', icon: '🏆', label: '世界杯', tooltip: '2026 世界杯赛程' },
  { key: 'versions', icon: '🔄', label: '版本检查', tooltip: 'App 版本监控 (v2.6 主体)' },
];

export function SideNav() {
  const collapsed = navCollapsed.value;
  const current = activeNav.value;

  return (
    <nav class={`side-nav${collapsed ? ' side-nav-collapsed' : ''}`}>
      <div class="side-nav-header">
        <button
          class="side-nav-toggle"
          onClick={() => toggleNavCollapsed()}
          title={collapsed ? '展开' : '折叠'}
          aria-label={collapsed ? '展开' : '折叠'}
        >
          ☰
        </button>
      </div>
      <ul class="side-nav-list">
        {NAV_ITEMS.map((item) => {
          const isActive = current === item.key;
          return (
            <li key={item.key} class={`side-nav-item${isActive ? ' side-nav-item-active' : ''}`}>
              <button
                class="side-nav-button"
                onClick={() => setActiveNav(item.key)}
                title={collapsed ? item.tooltip : ''}
                aria-label={item.label}
              >
                <span class="side-nav-icon">{item.icon}</span>
                {!collapsed && <span class="side-nav-label">{item.label}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default SideNav;
