/**
 * src/renderer/components/CategoryTabs.jsx
 *
 * Phase A4a (App Categorization): 顶部 8 类 tab 组件.
 */

import { TabList, Tab } from './TabList.jsx';
import { CategoryTabIcon } from './icons.jsx';

export function CategoryTabs({ tabs, active, onSelect }) {
  if (!tabs) return null;
  return (
    <TabList variant="underline" ariaLabel="应用分类">
      {tabs.map((t) => (
        <Tab
          key={t.id}
          variant="underline"
          active={active === t.id}
          onClick={() => onSelect && onSelect(t.id)}
          title={t.title || t.name}
          icon={<CategoryTabIcon id={t.id} />}
          count={t.count}
        >
          {t.name}
        </Tab>
      ))}
    </TabList>
  );
}
