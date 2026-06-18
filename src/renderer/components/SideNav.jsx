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

import { activeNav, navCollapsed, setActiveNav, toggleNavCollapsed } from '../worldcup/navStore.js';
import { openAISettings, needsConfig, aiSessionsConfig, aiKeyStatus } from '../store.js';

const NAV_ITEMS = [
  { key: 'ithome',    icon: '📰', label: 'IT 新闻', tooltip: 'IT之家资讯 + AI 摘要' },
  { key: 'wechat-hot',icon: '📈', label: '微信热搜', tooltip: '微信热点话题 + AI 摘要' },
  { key: 'worldcup',  icon: '🏆', label: '世界杯', tooltip: '2026 世界杯赛程' },
  { key: 'funds',     icon: '💰', label: '基金管理', tooltip: '基金持仓 + 实时盈亏 (v2.10+)' },
  { key: 'metals',    icon: '🥇', label: '贵金属', tooltip: '黄金白银实时价格 + 持仓盈亏' },
  { key: 'ai-usage',  icon: '📊', label: 'AI coding plan 用量', tooltip: 'Minimax coding plan 配额 (v2.13)' },
  { key: 'versions',  icon: '🔄', label: '版本检查', tooltip: 'App 版本监控 (v2.6 主体)' },
];

export function SideNav() {
  const collapsed = navCollapsed.value;
  const current = activeNav.value;
  // 显式订阅 config / key 信号, 避免 needsConfig 误判后 UI 不刷新
  void aiSessionsConfig.value;
  void aiKeyStatus.value;
  const aiNeedsSetup = needsConfig();

  return (
    <nav class={`side-nav${collapsed ? ' side-nav-collapsed' : ''}`}>
      <div class="side-nav-header">
        {!collapsed && (
          <div class="side-nav-brand" aria-hidden="true">
            <span class="side-nav-brand-mark">P</span>
            <span class="side-nav-brand-name">Pulse</span>
          </div>
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
      <ul class="side-nav-list">
        {NAV_ITEMS.map((item) => {
          const isActive = current === item.key;
          return (
            <li
              key={item.key}
              class={`side-nav-item${isActive ? ' side-nav-item-active' : ''}`}
              data-nav={item.key}
            >
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
      </div>
    </nav>
  );
}

export default SideNav;
