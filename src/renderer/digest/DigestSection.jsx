/**
 * src/renderer/digest/DigestSection.jsx
 *
 * Phase I1+I5: per-section rendering inside DigestDrawer.
 */
const LABELS = {
  updates: { title: '可升级应用', icon: '⬆' },
  hot: { title: '微博热搜', icon: '🔥' },
  news: { title: 'IT 新闻', icon: '📰' },
  funds: { title: '基金变动', icon: '💹' },
  ai_usage: { title: 'AI 用量预警', icon: '⚠' },
  worldcup: { title: '今日比赛', icon: '⚽' },
};

export function DigestSection({ section }) {
  const meta = LABELS[section.kind] || { title: section.kind, icon: '•' };
  return (
    <div class={`digest-section digest-section--${section.kind}`}>
      <div class="digest-section__header">
        <span class="digest-section__icon">{meta.icon}</span>
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
