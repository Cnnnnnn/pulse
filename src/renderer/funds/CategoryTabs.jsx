/**
 * src/renderer/funds/CategoryTabs.jsx
 *
 * 6 个分类 tab: 全部 / 股票 / 债券 / 货币 / QDII / 其他
 * 数字键 1-6 切换 (跟 Worldcup 数字键切子 tab 对齐).
 */

import { useEffect } from 'preact/hooks';
import { activeCategory, categoryCounts, setActiveCategory } from './fundStore.js';
import { TabList, Tab } from '../components/TabList.jsx';
import { CategoryTabIcon } from '../components/icons.jsx';

const TABS = [
  { id: 'all',   name: '全部',   title: '全部基金' },
  { id: 'stock', name: '股票',   title: '股票型基金' },
  { id: 'bond',  name: '债券',   title: '债券型基金' },
  { id: 'money', name: '货币',   title: '货币型基金' },
  { id: 'qdii',  name: 'QDII',   title: '海外配置 (QDII)' },
  { id: 'other', name: '其他',   title: '混合 / 其他' },
];

export function CategoryTabs() {
  // 数字键 1-6 切换
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = parseInt(e.key, 10);
      if (!Number.isFinite(n) || n < 1 || n > TABS.length) return;
      const target = document.activeElement;
      // 输入框 / textarea 里不切
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        // 搜索框允许 1-6 (但实际体验上可能影响输入, 暂时禁用)
        return;
      }
      setActiveCategory(TABS[n - 1].id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const counts = categoryCounts.value;
  const active = activeCategory.value;

  return (
    <TabList variant="underline" ariaLabel="基金分类">
      {TABS.map((t) => (
        <Tab
          key={t.id}
          variant="underline"
          active={active === t.id}
          onClick={() => setActiveCategory(t.id)}
          title={t.title}
          icon={<CategoryTabIcon id={t.id} domain="fund" />}
          count={counts[t.id] || 0}
        >
          {t.name}
        </Tab>
      ))}
    </TabList>
  );
}

export default CategoryTabs;