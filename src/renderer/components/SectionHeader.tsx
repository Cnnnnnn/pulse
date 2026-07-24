/**
 * src/renderer/components/SectionHeader.tsx
 *
 * 单个 section 标题行: dot + label + count
 */
import type { Section as SectionModel } from "./appTypes.ts";

export function SectionHeader({ section }: { section: SectionModel }) {
  return (
    <div class="section-header">
      <span class="dot" style={{ background: section.dotColor }}></span>
      <span style={{ color: section.color }}>{section.label}</span>
      <span class="count">{section.items.length} 个应用</span>
    </div>
  );
}
