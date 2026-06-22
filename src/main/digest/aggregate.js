/**
 * src/main/digest/aggregate.js
 *
 * Phase I1+I5: pure aggregator — given state + opts, return
 *   { date: 'YYYY-MM-DD', sections: [{kind, items}], lines: [string] }
 *
 * - sections: full data for drawer UI (no cap)
 * - lines:   ≤ MAX_LINES strings for push notification (truncated to 60 chars)
 *
 * Each section kind is built independently with try/catch; one failing source
 * does NOT break others. Order is fixed via SECTION_ORDER for stable priority.
 */

const MAX_LINES = 6;

const SECTION_ORDER = ['updates', 'hot', 'news', 'funds', 'ai_usage', 'worldcup'];

const MAX_LINE_LEN = 60;
const UPDATES_CAP = 3;
const HOT_CAP = 3;
const NEWS_CAP = 1;
const FUNDS_CAP = 2;
const AI_USAGE_CAP = 1;
const WORLDUP_CAP = 1;
const AI_USAGE_THRESHOLD_PCT = 80;
const FUND_DELTA_THRESHOLD_PCT = 1;

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function truncate(s, max = MAX_LINE_LEN) {
  if (typeof s !== 'string') s = String(s || '');
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function safe(fn, fallback) {
  try {
    const r = fn();
    return r == null ? fallback : r;
  } catch {
    return fallback;
  }
}

function sectionUpdates(apps) {
  if (!apps || typeof apps !== 'object') return null;
  const items = [];
  for (const a of Object.values(apps)) {
    if (a && a.has_update && a.name) {
      items.push({
        name: a.name,
        latest_version: a.latest_version || '',
        installed_version: a.installed_version || '',
      });
      if (items.length >= UPDATES_CAP) break;
    }
  }
  return items.length ? { kind: 'updates', items } : null;
}

function sectionHot(wechatHot) {
  if (!wechatHot || !Array.isArray(wechatHot.items)) return null;
  const items = wechatHot.items.slice(0, HOT_CAP).filter((x) => x && x.title);
  return items.length ? { kind: 'hot', items } : null;
}

function sectionNews(ithome) {
  if (!ithome || !Array.isArray(ithome.articles)) return null;
  const first = ithome.articles.find((x) => x && x.title);
  return first ? { kind: 'news', items: [{ title: first.title, url: first.url || '' }] } : null;
}

function sectionFunds(funds) {
  if (!funds || !Array.isArray(funds.holdings)) return null;
  const items = [];
  for (const h of funds.holdings) {
    if (
      h && h.code &&
      typeof h.today_change_pct === 'number' &&
      Math.abs(h.today_change_pct) > FUND_DELTA_THRESHOLD_PCT
    ) {
      items.push({
        code: h.code,
        name: h.name || h.code,
        today_change_pct: h.today_change_pct,
      });
      if (items.length >= FUNDS_CAP) break;
    }
  }
  return items.length ? { kind: 'funds', items } : null;
}

function sectionAiUsage(aiUsage) {
  if (!aiUsage || !aiUsage.providers || typeof aiUsage.providers !== 'object') return null;
  const items = [];
  for (const [provider, snap] of Object.entries(aiUsage.providers)) {
    if (
      snap && typeof snap.percent === 'number' &&
      snap.percent > AI_USAGE_THRESHOLD_PCT
    ) {
      items.push({ provider, percent: snap.percent });
      if (items.length >= AI_USAGE_CAP) break;
    }
  }
  return items.length ? { kind: 'ai_usage', items } : null;
}

function sectionWorldcup(wc) {
  if (!wc || !Array.isArray(wc.today)) return null;
  const first = wc.today[0];
  return first ? { kind: 'worldcup', items: [{ home: first.home, away: first.away, kickoff: first.kickoff }] } : null;
}

function lineFor(s) {
  if (!s || !s.items || !s.items.length) return null;
  const first = s.items[0];
  switch (s.kind) {
    case 'updates':
      return first.installed_version
        ? `• ${first.name} ${first.installed_version} → ${first.latest_version}`
        : `• ${first.name} ${first.latest_version}`;
    case 'hot':
      return `• 热搜: ${truncate(first.title, 50)}`;
    case 'news':
      return `• 新闻: ${truncate(first.title, 50)}`;
    case 'funds': {
      const sign = first.today_change_pct >= 0 ? '+' : '';
      return `• 基金: ${first.name} ${sign}${first.today_change_pct.toFixed(1)}%`;
    }
    case 'ai_usage':
      return `• AI 用量: ${first.provider} ${first.percent}%`;
    case 'worldcup':
      return `• 比赛: ${first.home} vs ${first.away}`;
    default:
      return null;
  }
}

/**
 * Pure aggregator.
 * @param {object} state  shape: {apps, wechatHot, ithome_news, funds, ai_usage, worldcup}
 * @param {object} [opts]
 * @param {Date}   [opts.now=new Date()]
 * @returns {{date: string, sections: Array<{kind, items}>, lines: string[]}}
 */
function aggregate(state, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const s = state || {};

  const builders = [
    () => sectionUpdates(s.apps),
    () => sectionHot(s.wechatHot),
    () => sectionNews(s.ithome_news),
    () => sectionFunds(s.funds),
    () => sectionAiUsage(s.ai_usage),
    () => sectionWorldcup(s.worldcup),
  ];

  const sections = [];
  for (const build of builders) {
    const section = safe(build, null);
    if (section) sections.push(section);
  }

  const lines = [];
  for (const section of sections) {
    const line = lineFor(section);
    if (line && lines.length < MAX_LINES) {
      lines.push(truncate(line));
    }
    if (lines.length >= MAX_LINES) break;
  }

  return { date: ymd(now), sections, lines };
}

module.exports = { aggregate, MAX_LINES, SECTION_ORDER, MAX_LINE_LEN, ymd };
