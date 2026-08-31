/**
 * src/renderer/components/AppShell.tsx
 *
 * Phase 9 外壳重构 — 48px 常驻 IconRail (左) + hover 弹 NavDrawer (侧边抽屉) + main 区.
 *
 *  左侧 48px IconRail (常驻, 折叠 0px 也保留 hover 热区)
 *    - 🏠 Home — 回首页 Dashboard
 *    - 3 个 section 图标 (资讯/持仓/系统) — hover IconRail 设 openSection, NavDrawer 弹出
 *  主区: 根据 activeNav 切
 *    - activeNav === 'home' → <Dashboard/> (4 区: Hero / Summary / Tiles / Recent)
 *    - 其它 → <LazyNavPanel nav={nav}/> (按需 lazy load 各 module layout)
 *
 * 跟 Phase 8 主体隔离: 0 共享 view, 各 module layout 独立.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { activeNav, navCollapsed, setActiveNav, goInvest } from '../nav/navStore.ts';
import { IconRail } from './IconRail.tsx';
import { NavDrawer } from './NavDrawer.tsx';
import { Dashboard } from './Dashboard.tsx';
import { LazyNavPanel } from './LazyNavPanel.tsx';
import type { NavSectionId } from '../../shared/nav-keys.ts';
import { remindersOpen, loadReminders } from '../reminders/remindersStore.ts';
import { SearchModal } from '../search/SearchModal.tsx';
import { isSearchOpen, openSearch, closeSearch } from '../search/searchStore.ts';
import { toggleGlobalChat, globalChatOpen } from '../assistant/assistant-store.ts';
import {
  loadGithubProjects,
  loadGithubSettings,
  migrateLegacyGithubToken,
} from '../store/github-projects-store.ts';

export function AppShell({ onCheck }: { onCheck?: () => void }) {
  const nav = activeNav.value;
  const collapsed = navCollapsed.value;

  // ── NavDrawer hover 协同状态机 ──
  // IconRail hover section → 打开; 离开 IconRail+NavDrawer 150ms 后关闭 (hover intent 防误触).
  const [openSection, setOpenSection] = useState<NavSectionId | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleHoverSection(sectionId: NavSectionId | null) {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpenSection(sectionId);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenSection(null), 150);
  }
  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

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
      // ⌘⇧J: 全局 AI 助手
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        toggleGlobalChat();
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
        // 助手抽屉打开时 ⌘F 留给对话内搜索，不抢主页面搜索框
        if (globalChatOpen.value) return;
        e.preventDefault();
        let inputId = 'filter-search-input';
        // P-N+ 「新闻」tab: sub-tab 决定 focus 哪个搜索框
        // (ithome 跟 wechat-hot 各自独立搜索框, 都在 DOM 里)
        if (nav === 'news') {
          const activeSubtab = document.querySelector('.news-layout')?.getAttribute('data-subtab');
          inputId = activeSubtab === 'wechat-hot' ? 'wechat-hot-search-input' : 'ithome-search-input';
        } else if (nav === 'ithome') inputId = 'ithome-search-input';
        else if (nav === 'wechat-hot') inputId = 'wechat-hot-search-input';
        // ponytail 2026-07-13 投资 nav 合并: 合并后 nav 永远 'invest',
        //   一期简化为 focus 基金搜索框 (最常用), 二期按 investPrimary 细分.
        else if (nav === 'invest') inputId = 'fund-search-input';
        const input = document.getElementById(inputId);
        if (input) {
          input.focus();
          try { (input as HTMLInputElement).select(); } catch { /* noop */ }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  // 提前加载 GitHub 收录数据（确保 Dashboard 首次渲染时 githubProjects 已从 localStorage 恢复，
  // 避免 GitHub 卡片短暂闪现"尚未收录"再跳为"已收录 N 个"的竞态）。
  // 同时加载模块设置（density 等）；旧版明文 token 由 migrateLegacyGithubToken 一次性迁入密钥库。
  useEffect(() => {
    loadGithubProjects();
    loadGithubSettings();
    migrateLegacyGithubToken();
  }, []);

  return (
    <div class={`app-shell${collapsed ? ' app-shell-collapsed' : ''}`}>
      <IconRail
        onHoverSection={handleHoverSection}
        onLeaveSection={scheduleClose}
        openSection={openSection}
      />
      <div class={`app-shell-view${nav === 'ai-leaderboard' ? ' app-shell-view--ai-leaderboard' : ''}`}>
        {nav === 'home'
          ? <Dashboard />
          : <LazyNavPanel nav={nav} onCheck={onCheck} />}
      </div>
      <NavDrawer
        section={openSection}
        onEnter={cancelClose}
        onLeave={scheduleClose}
      />
      <SearchModal />
    </div>
  );
}

export default AppShell;
