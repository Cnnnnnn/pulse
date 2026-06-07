/**
 * src/renderer/components/WeeklyBanner.jsx
 *
 * Phase 19: 周报式摘要 banner. 顶部展示"过去 7 天的升级统计".
 * 0 升级时不显示. 不喧宾夺主, 只是让用户瞥一眼"最近 app 生态有啥变化".
 */

import { useMemo } from 'preact/hooks';
import { computeWeeklyStats } from '../weekly-stats.js';

function fmtRel(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86400_000)} 天前`;
}

function fmtCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function WeeklyBanner({ state }) {
  const stats = useMemo(() => computeWeeklyStats(state), [state]);
  if (!stats || stats.upgrades === 0) return null;

  const { upgrades, apps, totalChangelogChars, oldest } = stats;
  const appList = apps.slice(0, 3).join('、');
  const more = apps.length > 3 ? ` 等 ${apps.length} 个` : '';
  const charsLabel = totalChangelogChars > 0
    ? `, 共 ${fmtCount(totalChangelogChars)} 字 changelog`
    : '';
  const since = oldest ? ` · 最早 ${fmtRel(oldest)}` : '';

  return (
    <div class="weekly-banner">
      <span class="weekly-banner-icon">📊</span>
      <span class="weekly-banner-text">
        <strong>本周</strong> 有 <strong>{upgrades}</strong> 次版本变化
        {apps.length > 0 && <>（{appList}{more}）</>}
        {charsLabel}
        {since}
      </span>
    </div>
  );
}
