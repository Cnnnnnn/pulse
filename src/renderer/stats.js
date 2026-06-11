/**
 * src/renderer/stats.js
 *
 * v2.8.1 (F1 Stats 自我统计): 4 段纯函数, 从 state.json 算指标.
 *
 * 跟 weekly-stats.js 平行, 不重叠 (weekly-stats 算 7d changelog,
 * 这里 S3 算 30d / 90d 复用 weekly-stats, 加 S1/S2/S4 新指标).
 *
 * 数据源全在 state.json — 0 联网, 0 副作用, 0 缓存.
 *
 * 形态:
 *   - S1 计数: { total, updatable, weekUpgrades, pinned, ignored }
 *   - S2 源分布: { source: count } (e.g. { brew_formulae: 3, electron_yml: 4 })
 *   - S3 升级历史: 复用 weekly-stats.js, 加 30d/90d tabs
 *   - S4 Mute 活跃: { active, permanent, expired }
 */

import { computeWeeklyStats } from './weekly-stats.js';

// ─── S1: 总计数 ──────────────────────────────────────
//
// state.json.apps.<name>.{ status, ts } + libraryConfig.{ pinned, ignored }
//
// 5 标:
//   - total: 已监控 app 总数
//   - updatable: status === 'has_update' 数
//   - weekUpgrades: 过去 7 天 changelog_history 升级数 (复用 weekly-stats)
//   - pinned: config.pinned 数组长度
//   - ignored: config.ignored 数组长度
//
// @param {object} state   stateStore.load() 结果
// @param {object} libraryConfig  { pinned: [appName], ignored: [{appName, bundle}] }
// @returns {object}
export function computeCounters(state, libraryConfig) {
  const appsMap = (state && state.apps) || {};
  const appsArr = Object.values(appsMap).filter(Boolean);

  const total = appsArr.length;
  const updatable = appsArr.filter((a) => a.status === 'has_update').length;

  const weekStats = computeWeeklyStats(state);
  const weekUpgrades = weekStats ? weekStats.upgrades : 0;

  const pinned = (libraryConfig && Array.isArray(libraryConfig.pinned))
    ? libraryConfig.pinned.length
    : 0;
  const ignored = (libraryConfig && Array.isArray(libraryConfig.ignored))
    ? libraryConfig.ignored.length
    : 0;

  return { total, updatable, weekUpgrades, pinned, ignored };
}

// ─── S2: 源 detector 分布 ────────────────────────────
//
// state.json.apps.<name>.source (Phase 12 写入)
//
// @param {object} state
// @returns {object}  e.g. { brew_formulae: 3, electron_yml: 4, sparkle_appcast: 2 }
//                    按 count desc 排序 (e.g. [ ['electron_yml', 4], ['brew_formulae', 3], ... ])
export function computeSourceBreakdown(state) {
  const appsMap = (state && state.apps) || {};
  const counts = {};
  for (const app of Object.values(appsMap)) {
    if (!app) continue;
    const src = app.source || 'unknown';
    counts[src] = (counts[src] || 0) + 1;
  }
  // 排序: count desc, 同 count 字母序
  return Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => (b.count - a.count) || a.source.localeCompare(b.source));
}

// ─── S3: 升级历史 (30d / 90d) ────────────────────────
//
// 复用 computeWeeklyStats (传不同 windowMs), 跟 weekly-stats.js 保持单一真值.
//
// @param {object} state
// @param {object} [opts]
// @param {number[]} [opts.windowDays]  默认 [7, 30, 90]
// @param {number} [opts.now=Date.now()]
// @returns {Array<{ windowDays, upgrades, apps, totalChangelogChars, oldest }>}
export function computeUpgradeHistory(state, opts = {}) {
  const days = Array.isArray(opts.windowDays) ? opts.windowDays : [7, 30, 90];
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  return days.map((d) => {
    const windowMs = d * 24 * 60 * 60 * 1000;
    const r = computeWeeklyStats(state, { windowMs, now });
    return {
      windowDays: d,
      upgrades: r.upgrades,
      apps: r.apps,
      totalChangelogChars: r.totalChangelogChars,
      oldest: r.oldest,
    };
  });
}

// ─── S4: Mute 活跃 ──────────────────────────────────
//
// state.json.mutes.<name> = { until: <ms epoch | 0>, reason }
//
// 3 标:
//   - active: 当前仍 mute 中 (until > now)
//   - permanent: until === 0 (永远)
//   - expired: 过期未清 (until <= now, 留作历史)
//
// @param {object} state
// @param {object} [opts]
// @param {number} [opts.now=Date.now()]
// @returns {{ active: number, permanent: number, expired: number, total: number, list: Array }}
export function computeMuteStats(state, opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const mutes = (state && state.mutes) || {};
  let active = 0;
  let permanent = 0;
  let expired = 0;
  const list = [];

  for (const [name, m] of Object.entries(mutes)) {
    if (!m) continue;
    const until = typeof m.until === 'number' ? m.until : 0;
    const isPermanent = until === 0;
    const isExpired = !isPermanent && until <= now;
    const isActive = !isExpired; // permanent 也算 active

    if (isPermanent) permanent += 1;
    if (isExpired) expired += 1;
    if (isActive) active += 1;

    list.push({
      name,
      until,
      reason: m.reason || '',
      state: isExpired ? 'expired' : (isPermanent ? 'permanent' : 'active'),
    });
  }

  return { active, permanent, expired, total: list.length, list };
}
