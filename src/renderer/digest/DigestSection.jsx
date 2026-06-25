/**
 * src/renderer/digest/DigestSection.jsx
 *
 * Phase I1+I5: per-section rendering inside DigestDrawer.
 */
import { DigestSectionIcon } from '../components/icons.jsx';

const LABELS = {
  updates: { title: '可升级应用' },
  hot: { title: '微博热搜' },
  news: { title: 'IT 新闻' },
  funds: { title: '基金变动' },
  ai_usage: { title: 'AI 用量预警' },
  worldcup: { title: '今日比赛' },
};

export function DigestSection({ section }) {
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

function renderItem(kind, it) {
  switch (kind) {
    case 'updates':
      return it.installed_version
        ? `${it.name} ${it.installed_version} → ${it.latest_version}`
        : `${it.name} ${it.latest_version}`;
    case 'hot':
      return it.title || '';
    case 'news':
      return it.title || '';
    case 'funds': {
      const sign = it.today_change_pct >= 0 ? '+' : '';
      return `${it.name} ${sign}${it.today_change_pct.toFixed(1)}%`;
    }
    case 'ai_usage':
      return `${it.provider} ${it.percent}%`;
    case 'worldcup':
      return `${it.home} vs ${it.away}`;
    default:
      return JSON.stringify(it);
  }
}
