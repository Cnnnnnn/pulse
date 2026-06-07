/**
 * src/renderer/components/Section.jsx
 *
 * 一个 section 容器: SectionHeader + N 个 AppRow
 *
 * section.items 是 name[] —— AppRow 自己从 resultSignals 拿最新数据。
 * 这样当 resultsBySection 重算（applyProgress 触发）但 item 列表本身没变时，
 * Preact 的 diff 不会重复创建 AppRow 实例；AppRow 内部用 .value 订阅自己
 * 的 signal，spec §7 "11 个 progress → 只重渲染那 1 个 row" 就成立。
 */

import { SectionHeader } from './SectionHeader.jsx';
import { AppRow } from './AppRow.jsx';

export function Section({ section }) {
  return (
    <div class="section" data-section={section.key}>
      <SectionHeader section={section} />
      {section.items.map((name) => (
        <AppRow key={name} name={name} />
      ))}
    </div>
  );
}
