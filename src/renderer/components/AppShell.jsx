/**
 * src/renderer/components/AppShell.jsx
 *
 * v2.9.0 Shell 布局 + v2.9.1 拆 2 独立顶部 + v2.10+ 加 3rd (Funds)
 *
 *  左侧 180px (或 40 折叠) SideNav
 *  右侧 main 区: 根据 activeNav 切 3 个完全独立 layout
 *
 *    [版本检查] tab:
 *      顶部: Header (含 检查更新 按钮) + FilterBar (搜索 + 4 status tab)
 *      main:  v2.6 phase 切 (Skeleton / ResultsView / ErrorBanner) + WeeklyBanner
 *
 *    [世界杯] tab:
 *      顶部: WorldcupHeader (品牌 + [赛程] / [球队] 子 tab + 搜索框)
 *      main:  WorldcupView (赛程) / WorldcupTeamsView (球队)
 *
 *    [基金管理] tab (v2.10+):
 *      顶部: FundHeader (总览卡片 + 工具栏 + 搜索框)
 *      Tab:   持仓 | 盈亏记录
 *      main:  FundList + CategoryTabs | FundPnlHistory
 *
 * 跟 v2.6 主体隔离: 0 共享 view, 各自 Header / 搜索 / 切.
 */

import { useEffect } from 'preact/hooks';
import { activeNav, navCollapsed, setActiveNav } from '../worldcup/navStore.js';
import { SideNav } from './SideNav.jsx';
import { VersionsLayout } from './VersionsLayout.jsx';
import { WorldcupLayout } from '../worldcup/WorldcupLayout.jsx';
import { FundLayout } from '../funds/FundLayout.jsx';
import { MetalLayout } from '../metals/MetalLayout.jsx';
import { NewsLayout } from '../ithome/NewsLayout.jsx';
import { WechatHotLayout } from '../wechat-hot/components/WechatHotLayout.jsx';
import { AIUsageLayout } from './AIUsageLayout.jsx';
import { remindersOpen, loadReminders } from '../reminders/remindersStore.js';

export function AppShell({ onCheck }) {
  const nav = activeNav.value;
  const collapsed = navCollapsed.value;

  // Cmd+F 拦截: 切到对应搜索框
  // Cmd+Shift+F: 跳到基金管理栏目
  // Cmd+Shift+M: 跳到贵金属栏目
  useEffect(() => {
    function onKey(e) {
      // ⌘⇧R: 打开 RemindersModal (走新建态)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (!remindersOpen.value) {
          loadReminders();
          remindersOpen.value = true;
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setActiveNav('funds');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        setActiveNav('metals');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        let inputId = 'filter-search-input';
        if (nav === 'ithome') inputId = 'ithome-search-input';
        else if (nav === 'wechat-hot') inputId = 'wechat-hot-search-input';
        else if (nav === 'worldcup') inputId = 'worldcup-search-input';
        else if (nav === 'funds') inputId = 'fund-search-input';
        const input = document.getElementById(inputId);
        if (input) {
          input.focus();
          try { input.select(); } catch { /* noop */ }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  return (
    <div class={`app-shell${collapsed ? ' app-shell-collapsed' : ''}`}>
      <SideNav />
      <div class="app-shell-view">
        {nav === 'ithome'
          ? <NewsLayout />
          : nav === 'wechat-hot'
            ? <WechatHotLayout />
            : nav === 'worldcup'
              ? <WorldcupLayout />
              : nav === 'funds'
                ? <FundLayout />
                : nav === 'metals'
                  ? <MetalLayout />
                  : nav === 'ai-usage'
                    ? <AIUsageLayout />
                    : <VersionsLayout onCheck={onCheck} />}
      </div>
    </div>
  );
}

export default AppShell;
