/**
 * src/renderer/digest/DigestSection.tsx
 *
 * Phase I1+I5: per-section rendering inside DigestDrawer.
 */
import { DigestSectionIcon } from '../components/icons.tsx';

const LABELS = {
  updates: { title: '可升级应用' },
  hot: { title: '微博热搜' },
  news: { title: 'IT 新闻' },
  funds: { title: '基金变动' },
  ai_usage: { title: 'AI 用量预警' },
};

type DigestKind = keyof typeof LABELS;

interface DigestUpdateItem {
  name: string;
  installed_version?: string;
  latest_version: string;
}
interface DigestHotItem {
  title: string;
}
interface DigestNewsItem {
  title: string;
}
interface DigestFundsItem {
  name: string;
  today_change_pct: number;
}
interface DigestAiUsageItem {
  provider: string;
  percent: number;
}

type DigestItem =
  | DigestUpdateItem
  | DigestHotItem
  | DigestNewsItem
  | DigestFundsItem
  | DigestAiUsageItem;

interface DigestSectionData {
  kind: DigestKind;
  items: DigestItem[];
}

export function DigestSection({ section }: { section: DigestSectionData }) {
  const meta = LABELS[section.kind] || { title: section.kind };
  return (
    <div class={`digest-section digest-section--${section.kind}`}>
      <div class="digest-section__header">
        <span class="digest-section__icon"><DigestSectionIcon kind={section.kind} size={14} /></span>
        <span class="digest-section__title">{meta.title}</span>
      </div>
      <ul class="digest-section__items">
        {section.items.map((it, i) => (
          <li key={`${section.kind}-${i}`}>{renderItem(section.kind, it)}</li>
        ))}
      </ul>
    </div>
  );
}

function renderItem(kind: DigestKind, it: DigestItem): string {
  switch (kind) {
    case 'updates': {
      const u = it as DigestUpdateItem;
      return u.installed_version
        ? `${u.name} ${u.installed_version} → ${u.latest_version}`
        : `${u.name} ${u.latest_version}`;
    }
    case 'hot': {
      const h = it as DigestHotItem;
      return h.title || '';
    }
    case 'news': {
      const n = it as DigestNewsItem;
      return n.title || '';
    }
    case 'funds': {
      const f = it as DigestFundsItem;
      const sign = f.today_change_pct >= 0 ? '+' : '';
      return `${f.name} ${sign}${f.today_change_pct.toFixed(1)}%`;
    }
    case 'ai_usage': {
      const a = it as DigestAiUsageItem;
      return `${a.provider} ${a.percent}%`;
    }
    default:
      return JSON.stringify(it);
  }
}
