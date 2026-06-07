/**
 * src/renderer/App.jsx
 *
 * 根组件 —— 顶层布局 + 4 个状态视图 (idle / running / done / error) 切换。
 *
 * 数据流：
 *   - bootstrap (index.jsx) 调 getConfig → apps.value = cfg.apps
 *                       调 triggerCheck → resetCheck → checkUpdates() →
 *                       (中途) 多次 applyProgress → finishCheck
 *   - 本组件只读 signals 不写
 *
 * Phase 22: BulkUpgradeModal 挂到根, 跟其他 UI 一起受 bulkUpgradeModalOpen 控制.
 *
 * Phase 23: 挂 FilterBar (search + tab 过滤), Cmd+F 拦截聚焦 search input.
 */

import { useEffect } from 'preact/hooks';
import { checkStatus, results, checkStartTime, checkDuration, cachedState } from './store.js';
import { Header } from './components/Header.jsx';
import { FilterBar } from './components/FilterBar.jsx';
import { Skeleton } from './components/Skeleton.jsx';
import { ResultsView } from './components/ResultsView.jsx';
import { ErrorBanner } from './components/ErrorBanner.jsx';
import { WeeklyBanner } from './components/WeeklyBanner.jsx';
import { BulkUpgradeModal } from './components/BulkUpgradeModal.jsx';

export function App({ onCheck }) {
  const status = checkStatus.value;

  // Phase 23: 全局拦截 Cmd+F (mac) / Ctrl+F, 聚焦 search input.
  // Electron 默认 "在页面查找" 跟我们的 search 重叠, 主动抢过来.
  useEffect(() => {
    function onKey(e) {
      // e.key === 'f' (大小写都匹配 'f' / 'F'), 配合 metaKey 或 ctrlKey
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        const input = document.getElementById('filter-search-input');
        if (input) {
          input.focus();
          // 选中已有内容, 方便用户直接覆盖
          try { input.select(); } catch { /* noop */ }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div id="app">
      <div id="titlebar"></div>
      <Header onCheck={onCheck} />
      <FilterBar />
      <main id="content">
        {/* Phase 19: 周报式摘要 banner, 0 升级时不显示. 在 results 出现后再挂, 避免骨架期空白 */}
        {results.value.size > 0 && <WeeklyBanner state={cachedState.value} />}
        {/*
          Phase 7 bugfix: 之前 'running' 状态只渲染 Skeleton, 即便部分 results 已到也看不见.
          改成 "有 results 就立刻展示, 没 results 才显示 Skeleton".
          这样卡在 Kimi 之类的慢检测上, 其它 10 个 app 的结果会一个个出来.
        */}
        {results.value.size === 0 && status === 'running' && <Skeleton />}
        {results.value.size > 0 && <ResultsView />}
        {status === 'idle'    && <ResultsView />}
        {status === 'error'   && (
          <>
            <ErrorBanner onRetry={onCheck} />
            <ResultsView />
          </>
        )}
      </main>
      <footer id="footer">
        <span id="check-time">{footerTime()}</span>
        <div class="footer-right">
          <button class="btn btn-ghost btn-sm" onClick={onOpenConfig}>打开配置</button>
        </div>
      </footer>
      <BulkUpgradeModal />
    </div>
  );
}

function footerTime() {
  if (checkStatus.value === 'running' && checkStartTime.value) {
    return `检查中... ${formatTime(new Date(checkStartTime.value))} 开始`;
  }
  if (checkDuration.value != null) {
    return `上次检查: ${formatTime(new Date(Date.now() - checkDuration.value))} · 用时 ${(checkDuration.value / 1000).toFixed(1)}s`;
  }
  return '';
}

function formatTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function onOpenConfig() {
  // 打开 config 文件由主进程处理；这里发个事件让 bootstrap 绑
  window.dispatchEvent(new CustomEvent('app:open-config'));
}
