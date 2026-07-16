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
import { activeNav, navCollapsed, setActiveNav, goInvest } from '../worldcup/navStore.js';
import { SideNav } from './SideNav.jsx';
import { LazyNavPanel } from './LazyNavPanel.jsx';
import { HomeGrid } from './HomeGrid.jsx';
import { remindersOpen, loadReminders } from '../reminders/remindersStore.js';
import { SearchModal } from '../search/SearchModal.jsx';
import { isSearchOpen, openSearch, closeSearch } from '../search/searchStore.js';
import { loadGithubProjects } from '../store/github-projects-store.js';

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
        // ponytail 2026-07-13 投资 nav 合并: ⌘⇧F 跳到投资 nav 基金子模块
        goInvest('funds');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        // ponytail 2026-07-13: ⌘⇧M 跳到投资 nav 贵金属子模块
        goInvest('metals');
        return;
      }
      // A3: Cmd+K / Ctrl+K 全文搜索
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (isSearchOpen.value) closeSearch();
        else openSearch();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        let inputId = 'filter-search-input';
        // P-N+ 「新闻」tab: sub-tab 决定 focus 哪个搜索框
        // (ithome 跟 wechat-hot 各自独立搜索框, 都在 DOM 里)
        if (nav === 'news') {
          const activeSubtab = document.querySelector('.news-layout')?.getAttribute('data-subtab');
          inputId = activeSubtab === 'wechat-hot' ? 'wechat-hot-search-input' : 'ithome-search-input';
        } else if (nav === 'ithome') inputId = 'ithome-search-input';
        else if (nav === 'wechat-hot') inputId = 'wechat-hot-search-input';
        else if (nav === 'worldcup') inputId = 'worldcup-search-input';
        // ponytail 2026-07-13 投资 nav 合并: 合并后 nav 永远 'invest',
        //   一期简化为 focus 基金搜索框 (最常用), 二期按 investPrimary 细分.
        else if (nav === 'invest') inputId = 'fund-search-input';
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

  // 提前加载 GitHub 收录数据（确保 HomeGrid 首次渲染时 githubProjects 已从 localStorage 恢复，
  // 避免 GitHub 卡片短暂闪现"尚未收录"再跳为"已收录 N 个"的竞态）。
  useEffect(() => {
    loadGithubProjects();
  }, []);

  return (
    <div class={`app-shell${collapsed ? ' app-shell-collapsed' : ''}${nav === 'home' ? ' app-shell-home' : ''}`}>
      {nav !== 'home' && <SideNav />}
      <div class="app-shell-view">
        {nav === 'home'
          ? <HomeGrid />
          : <LazyNavPanel nav={nav} onCheck={onCheck} />}
      </div>
      <SearchModal />
    </div>
  );
}

export default AppShell;
