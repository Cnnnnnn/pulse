/**
 * src/renderer/components/SectionHeader.jsx
 *
 * 单个 section 标题行: dot + label + count
 */

export function SectionHeader({ section }) {
  return (
    <div class="section-header">
      <span class="dot" style={{ background: section.dotColor }}></span>
      <span style={{ color: section.color }}>{section.label}</span>
      <span class="count">{section.items.length} 个应用</span>
    </div>
  );
}
