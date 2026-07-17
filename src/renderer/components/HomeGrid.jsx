/**
 * src/renderer/components/HomeGrid.jsx
 *
 * P-N HomeGrid v6 — 投资 nav 合并:
 *  - v1: 8 tile 平铺.
 *  - v2: hero + 8 macOS 玻璃 tile + 几何 SVG icon.
 *  - v3: 未读角标 / 快捷键 / 键盘导航 / 最近访问 / cascade / a11y.
 *  - v4: 实时状态 / 收藏 / 拖拽重排.
 *  - v5 (2026-07-10): IT 新闻 + 微博热搜 合并成 1 个 'news' tile, 7 个 tile.
 *      'news' tile 副标题显示合并状态 ("今日 N 条 · M 热搜"),
 *      角标为两源之和.
 *  - v6 (2026-07-13): funds + metals + stocks 合并成 1 个 'invest' tile, 5 个 tile.
 *      'invest' tile 副标题按 investPrimary 切, 优先基金今日盈亏, 降级金属价, 兜底 "—".
 *  - v7 (2026-07-16): 加 'github' tile (GitHub 优秀项目收录).
 *
 * tile 顺序受 prefs.order 控制; ⌘1-N 按用户视角顺序对应
 * (favorites 优先 + 余下按 prefs.order).
 * 启动期 assert: HOME_TILES.length === PERSISTABLE_NAV_KEYS.size 防顺序漂移.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { setActiveNav, goInvest, PERSISTABLE_NAV_KEYS } from "../worldcup/navStore.js";
import { ithomeUnreadBadge, ithomeArticles, ithomeDayStats } from "../ithome/store.js";
import { wechatHotUnreadBadge, wechatHotItems, wechatHotLastFetched } from "../wechat-hot/store.js";
import { fundUnreadBadge, totalMetrics, holdings } from "../funds/fundStore.js";
import { aiUsageNavBadge, aiUsageSnapshot, aiUsageActiveProvider } from "../store/ai-usage-store.js";
import { githubProjects } from "../store/github-projects-store.js";
import { worldcupMatches } from "../worldcup/store.js";
import { matchKickoffUtcMs } from "../worldcup/match-utils.js";
import { quoteCache, fxCache } from "../metals/metalStore.js";
import { comparePoolCount } from "../stocks/comparePool.js";
import { results as stocksResults } from "../stocks/stockStore.js";
import { results as checkResults, apps as checkApps } from "../store.js";
import { todayShanghaiDateKey, articlesForDate } from "../ithome/news-utils.js";
import { formatTime } from "../wechat-hot/utils.js";
import {
  loadPrefs,
  savePrefs,
  reorderItems,
  toggleFavorite,
  listFavorites,
  isFavorite,
} from "./sidenav-prefs.js";
import "./HomeGrid.css";

// ponytail: 5 个简单几何 SVG, 24x24 viewBox, 跟 macOS SF Symbols 风格一致.
// 不用 lucide / heroicons 库 — 1 个文件 5 个 inline svg, 0 依赖.
function TileIcon({ kind }) {
  const c = {
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
  };
  switch (kind) {
    case "news":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M5 5v14h12V8l-4-3H5z" />
          <path {...c} d="M8 11h7M8 14h7M8 17h4" />
        </svg>
      );
    case "worldcup":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle {...c} cx="12" cy="12" r="8" />
          <path {...c} d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16" />
        </svg>
      );
    case "invest":
      // ponytail 2026-07-13: 投资 nav 合并 funds/metals/stocks → 单 icon.
      //   复用原 funds 柱状图风格, 加 stocks 趋势叠加 → 表达"综合投资看板"语义.
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M4 20h16" />
          <path {...c} d="M7 17v-4M11 17V9M15 17v-6" />
          <path {...c} d="M3 13l4-2 3 1 5-4 5 3" />
        </svg>
      );
    case "ai-usage":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle {...c} cx="12" cy="12" r="3" />
          <circle {...c} cx="5" cy="6" r="1.6" />
          <circle {...c} cx="19" cy="6" r="1.6" />
          <circle {...c} cx="5" cy="18" r="1.6" />
          <circle {...c} cx="19" cy="18" r="1.6" />
          <path {...c} d="M6.5 7l4 4M17.5 7l-4 4M6.5 17l4-4M17.5 17l-4-4" />
        </svg>
      );
    case "versions":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M20 12a8 8 0 1 1-3-6.2" />
          <path {...c} d="M20 4v4h-4" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
        </svg>
      );
    case "games":
      // 手柄/控制器图标 — 表达"游戏优惠聚合"语义.
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M7 8h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.2 2L14 18H10l-1.8-3A3 3 0 0 1 3 13v-1a4 4 0 0 1 4-4z" />
          <path {...c} d="M7.5 11v2.5M6.25 12.25h2.5M15.5 11.5h.01M17.5 13.5h.01" />
        </svg>
      );
    default:
      return null;
  }
}

// ponytail: HOME_TILES 现在作为 "tile 元数据 lookup" — 渲染顺序由
// prefs.order + favorites 决定 (computeOrderedTiles).
// v7 (2026-07-16): 加 github tile → 6 个.
const HOME_TILES = [
  { key: 'news',      title: '新闻',     subtitle: 'IT 资讯 + 微博热搜',         accent: 'blue'   },
  { key: 'worldcup',  title: '世界杯',   subtitle: '2026 世界杯赛程',            accent: 'green'  },
  { key: 'invest',    title: '投资',     subtitle: '基金 + 贵金属 + 选股',       accent: 'orange' },
  { key: 'ai-usage',  title: 'AI 用量',  subtitle: 'Minimax coding plan 配额',  accent: 'pink'   },
  { key: 'versions',  title: '版本检查', subtitle: 'App 版本监控',              accent: 'indigo' },
  { key: 'github',    title: 'GitHub 收录', subtitle: '优秀开源项目收录与管理',   accent: 'purple' },
  { key: 'games',     title: '游戏优惠',  subtitle: '各平台折扣 / 免费活动 / 热门榜', accent: 'red'   },
];
const TILE_BY_KEY = Object.fromEntries(HOME_TILES.map((t) => [t.key, t]));

// v4: 派生渲染顺序. 收藏优先 (按 favorites 数组顺序) + 余下按 prefs.order.
// 不在 prefs.order 的 key 兜底按 HOME_TILES 顺序追加.
function computeOrderedTiles(prefs) {
  const order = Array.isArray(prefs?.order) ? prefs.order : HOME_TILES.map((t) => t.key);
  const hidden = new Set(Array.isArray(prefs?.hidden) ? prefs.hidden : []);
  const favs = listFavorites(prefs); // 已过滤 NAV_KEYS
  const out = [];
  const seen = new Set();
  for (const k of favs) {
    if (!hidden.has(k) && TILE_BY_KEY[k] && !seen.has(k)) {
      out.push(TILE_BY_KEY[k]);
      seen.add(k);
    }
  }
  for (const k of order) {
    if (!seen.has(k) && !hidden.has(k) && TILE_BY_KEY[k]) {
      out.push(TILE_BY_KEY[k]);
      seen.add(k);
    }
  }
  // 兜底: 上面都没覆盖的 (prefs 损坏 / 新加 module) 按 HOME_TILES 顺序追加.
  for (const t of HOME_TILES) {
    if (!seen.has(t.key) && !hidden.has(t.key)) {
      out.push(t);
      seen.add(t.key);
    }
  }
  return out;
}

// ponytail: 单一来源 — HomeGrid 跟 SideNav 共享 nav badge signal, 不引新的 store.
// 'news' 角标 = ithome + wechat-hot 之和 (合并后). 角标为 0 时返回 null, .home-grid-tile-badge 不渲染.
function getBadge(key) {
  switch (key) {
    case 'news':
      return (ithomeUnreadBadge.value || 0) + (wechatHotUnreadBadge.value || 0) || null;
    case 'invest':   return fundUnreadBadge.value || null;
    case 'ai-usage': return aiUsageNavBadge.value || null;
    default:         return null;
  }
}

// v5: 'news' status 合并 IT 新闻 (今日文章数) + 微博热搜 (条数·更新时间).
// 冷启动空数据时 status="—".
function getStatus(key) {
  switch (key) {
    case 'news': {
      const today = todayShanghaiDateKey();
      const newsCount = ithomeDayStats.value?.[today]?.count
        ?? articlesForDate(ithomeArticles.value, today).length
        ?? 0;
      const hotCount = wechatHotItems.value?.length ?? 0;
      const parts = [];
      if (newsCount > 0) parts.push(`今日 ${newsCount} 条`);
      if (hotCount > 0) parts.push(`${hotCount} 热搜`);
      if (parts.length === 0) return '—';
      return parts.join(' · ');
    }
    case 'worldcup': {
      const matches = worldcupMatches.value?.matches ?? [];
      if (matches.length === 0) return '—';
      const now = Date.now();
      const live = matches.find((m) => m?.score?.status === 'live');
      if (live) {
        const ft = live.score?.ft ?? [0, 0];
        const clock = live.score?.clock ?? '';
        return `live ${live.team1} ${ft[0]}-${ft[1]} ${live.team2}${clock ? ' ' + clock : ''}`;
      }
      const upcoming = matches
        .map((m) => ({ m, ms: m && matchKickoffUtcMs(m) }))
        .filter((x) => x.ms > now)
        .sort((a, b) => a.ms - b.ms);
      const today = todayShanghaiDateKey();
      const todays = upcoming.filter(({ m }) => m.date === today);
      if (todays.length > 0) {
        const n = todays.length;
        const first = todays[0].m;
        const firstMs = todays[0].ms;
        const hhmm = formatBjHHMM(firstMs);
        return `今日 ${n} 场 · ${hhmm} ${shortTeam(first.team1)} vs ${shortTeam(first.team2)}`;
      }
      if (upcoming.length > 0) {
        const first = upcoming[0].m;
        const firstMs = upcoming[0].ms;
        const md = formatBjMD(firstMs);
        const hhmm = formatBjHHMM(firstMs);
        return `下一场 ${md} ${hhmm} ${shortTeam(first.team1)} vs ${shortTeam(first.team2)}`;
      }
      const finals = matches
        .filter((m) => m?.score?.status === 'final')
        .sort((a, b) => (matchKickoffUtcMs(b) || 0) - (matchKickoffUtcMs(a) || 0));
      if (finals.length > 0) {
        const last = finals[0];
        const ft = last.score?.ft ?? [0, 0];
        return `已结束 · ${last.team1} ${ft[0]}:${ft[1]} ${last.team2}`;
      }
      return '—';
    }
    case 'invest': {
      // ponytail 2026-07-13: 投资 nav 合并 — status 按 investPrimary 切.
      //   三路 (funds → metals → stocks) 都参与; 第一路有结果就用, 否则下探.
      //   对比池 count 是跨子模块的统一指标, 永远会显示 (除非都没数据).
      const pool = comparePoolCount.value || 0;
      if (holdings.value && holdings.value.length > 0) {
        const pnl = totalMetrics.value?.todayProfit ?? 0;
        const sign = pnl >= 0 ? '+' : '−';
        return `基金 今日 ${sign}¥${Math.abs(pnl).toFixed(2)} · 对比池 ${pool}`;
      }
      const q = quoteCache.value?.data?.AU9999;
      if (q) return `黄金 ¥${q.price.toFixed(2)}/克 · 对比池 ${pool}`;
      const sCount = stocksResults.value?.length || 0;
      if (sCount > 0) return `选股 ${sCount} 条 · 对比池 ${pool}`;
      return '—';
    }
    case 'ai-usage': {
      const provider = aiUsageActiveProvider.value;
      const snap = aiUsageSnapshot.value?.[provider];
      const w = snap?.windows?.weekly
        ?? snap?.windows?.['5h']
        ?? null;
      if (w?.usedPercent != null && w.usedPercent >= 0) {
        return `已用 ${Math.round(w.usedPercent)}%`;
      }
      if (w?.remaining != null && w.total > 0) {
        const used = Math.round((1 - w.remaining / w.total) * 100);
        return `已用 ${used}%`;
      }
      return '—';
    }
    case 'versions': {
      const results = checkResults.value;
      const total = results instanceof Map ? results.size : 0;
      const updatable = total > 0
        ? Array.from(results.values()).filter((r) => r && r.has_update).length
        : 0;
      const appsCount = checkApps.value?.length ?? 0;
      if (total === 0 && appsCount === 0) return '未配置应用';
      return `${updatable}/${total} 可更新`;
    }
    case 'github': {
      const n = githubProjects.value?.length ?? 0;
      return n > 0 ? `已收录 ${n} 个` : '尚未收录';
    }
    case 'games':
      return 'Steam / Epic 实时 · 主机示例';
    default:
      return null;
  }
}

// ponytail: 小组 helper — 派生时复用, 不引外部 locale util.
function shortTeam(name) {
  if (!name) return '';
  const space = name.indexOf(' ');
  if (space < 0 || space > 8) return name.slice(0, 8);
  return name.slice(0, space);
}
function formatBjHHMM(ms) {
  if (!ms) return '--:--';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatBjMD(ms) {
  if (!ms) return '--/--';
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function fmtTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(d) {
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${weekdays[d.getDay()]}`;
}

// ponytail: A17 prefers-reduced-motion 检测, 全局 1 次缓存.
function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HomeGrid() {
  const [now, setNow] = useState(() => new Date());
  const [mounted, setMounted] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const tileRefs = useRef([]);
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [draggingKey, setDraggingKey] = useState(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => { clearInterval(tick); cancelAnimationFrame(raf); };
  }, []);

  // v6: 订阅 badge / status 源. 显式 read 让 Preact 知道依赖.
  void ithomeUnreadBadge.value;
  void wechatHotUnreadBadge.value;
  void fundUnreadBadge.value;
  void aiUsageNavBadge.value;
  void githubProjects.value;
  const newsBadge = (ithomeUnreadBadge.value || 0) + (wechatHotUnreadBadge.value || 0);
  const badges = {
    news: newsBadge,
    invest: fundUnreadBadge.value,
    'ai-usage': aiUsageNavBadge.value,
  };

  // A4: 上次访问的 nav (从 api 主进程持久化).
  const [lastActive, setLastActive] = useState(null);
  useEffect(() => {
    let alive = true;
    if (typeof window !== 'undefined' && window.api?.getLastActiveNav) {
      window.api.getLastActiveNav()
        .then(({ lastActiveNav }) => { if (alive && lastActiveNav) setLastActive(lastActiveNav); })
        .catch(() => { /* noop */ });
    }
    return () => { alive = false; };
  }, []);
  const lastActiveTile = lastActive ? TILE_BY_KEY[lastActive] : null;

  // A3: 全局键盘监听. ⌘1-N 直接触发. 上下左右在 grid 里移动焦点.
  const orderedTiles = computeOrderedTiles(prefs);
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && /^[1-6]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < orderedTiles.length) {
          e.preventDefault();
          // ponytail 2026-07-13 投资 nav 合并: funds/metals/stocks tile 落到正确子模块
          //   (非默认的 'funds'), 通过 goInvest 设 investPrimary. 其他 tile 走原 setActiveNav.
          const tileKey = orderedTiles[idx].key;
          if (tileKey === "funds" || tileKey === "metals" || tileKey === "stocks") {
            goInvest(tileKey);
          } else {
            setActiveNav(tileKey);
          }
          setFocusIdx(idx);
        }
        return;
      }
      const move = (delta) => {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, Math.min(orderedTiles.length - 1, i + delta)));
      };
      if (e.key === 'ArrowRight') return move(1);
      if (e.key === 'ArrowLeft')  return move(-1);
      if (e.key === 'ArrowDown')  return move(4);
      if (e.key === 'ArrowUp')    return move(-4);
      if (e.key === 'Home')       return move(-orderedTiles.length);
      if (e.key === 'End')        return move(orderedTiles.length);
      if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement && document.activeElement.classList?.contains('home-grid-tile')) {
          e.preventDefault();
          document.activeElement.click();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orderedTiles.length]);

  useEffect(() => {
    const el = tileRefs.current[focusIdx];
    if (el) el.focus({ preventScroll: false });
  }, [focusIdx]);

  function handleToggleFavorite(key, e) {
    e.stopPropagation();
    e.preventDefault();
    const next = toggleFavorite(prefs, key);
    setPrefs(next);
    savePrefs(next);
  }

  function handleDragStart(key, e) {
    setDraggingKey(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  }
  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  function handleDrop(toKey, e) {
    e.preventDefault();
    const fromKey = draggingKey || e.dataTransfer.getData('text/plain');
    setDraggingKey(null);
    if (!fromKey || fromKey === toKey) return;
    const cur = (prefs.order && prefs.order.length > 0) ? prefs.order : HOME_TILES.map((t) => t.key);
    if (!cur.includes(fromKey)) cur.push(fromKey);
    if (!cur.includes(toKey)) return;
    const next = reorderItems({ ...prefs, order: cur }, fromKey, toKey, 'after');
    setPrefs(next);
    savePrefs(next);
  }
  function handleDragEnd() {
    setDraggingKey(null);
  }

  const reduced = prefersReducedMotion();
  const favCount = listFavorites(prefs).length;

  return (
    <div class={`home-grid-root${mounted ? ' home-grid-mounted' : ''}${reduced ? ' home-grid-reduced' : ''}`}>
      <header class="home-hero">
        <div class="home-hero-mark" aria-hidden="true">P</div>
        <div class="home-hero-text">
          <div class="home-hero-greeting">
            {greeting()}
            <span class="home-hero-time">{fmtTime(now)}</span>
          </div>
          <div class="home-hero-date">
            {fmtDate(now)}
            {lastActiveTile && (
              <span class="home-hero-last">
                <span class="home-hero-last-sep" aria-hidden="true">·</span>
                上次: {lastActiveTile.title}
              </span>
            )}
          </div>
        </div>
        <div class="home-hero-meta" aria-hidden="true">
          <span class="home-hero-dot" />
          <span>
            {orderedTiles.length} 个模块 · ⌘1-{orderedTiles.length}
            {favCount > 0 && <span class="home-hero-fav">· ★ {favCount}</span>}
          </span>
        </div>
      </header>

      <div class="home-grid" role="grid" aria-label="Pulse 主菜单">
        {orderedTiles.map((tile, idx) => {
          const badge = getBadge(tile.key) || badges[tile.key] || 0;
          const isFocused = idx === focusIdx;
          const isFav = isFavorite(prefs, tile.key);
          const isDragging = draggingKey === tile.key;
          const status = getStatus(tile.key);
          return (
            <button
              key={tile.key}
              ref={(el) => { tileRefs.current[idx] = el; }}
              type="button"
              class={`home-grid-tile home-grid-tile-${tile.accent}${isFocused ? ' home-grid-tile-focused' : ''}${isFav ? ' home-grid-tile-fav' : ''}${isDragging ? ' home-grid-tile-dragging' : ''}`}
              role="gridcell"
              tabIndex={isFocused ? 0 : -1}
              draggable
              aria-label={`进入 ${tile.title}${badge > 0 ? `, 未读 ${badge}` : ''}${status ? `, ${status}` : ''}${isFav ? ', 已收藏' : ''}`}
              onClick={() => {
                // ponytail 2026-07-13: 投资 tile 走 goInvest (设 primary + active).
                if (tile.key === "funds" || tile.key === "metals" || tile.key === "stocks") {
                  goInvest(tile.key);
                } else {
                  setActiveNav(tile.key);
                }
              }}
              onFocus={() => setFocusIdx(idx)}
              onDragStart={(e) => handleDragStart(tile.key, e)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(tile.key, e)}
              onDragEnd={handleDragEnd}
              style={{ '--tile-cascade-delay': `${idx * 40}ms` }}
            >
              <span
                class={`home-grid-tile-fav-btn${isFav ? ' is-fav' : ''}`}
                role="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={(e) => handleToggleFavorite(tile.key, e)}
                title={isFav ? '取消收藏' : '收藏'}
              >
                {isFav ? '★' : '☆'}
              </span>
              <span class="home-grid-tile-icon" aria-hidden="true">
                <TileIcon kind={tile.key} />
              </span>
              {badge > 0 && (
                <span class="home-grid-tile-badge" aria-hidden="true">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
              <span class="home-grid-tile-title">{tile.title}</span>
              <span class="home-grid-tile-subtitle">
                {status ? <span class="home-grid-tile-status">{status}</span> : tile.subtitle}
                <span class="home-grid-tile-kbd" aria-hidden="true">⌘{idx + 1}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ponytail: tile 顺序受 HOME_TILES 控制, 跟 PERSISTABLE_NAV_KEYS 一致.
// 这条 assert 触发编译期 (import time) 失败, 顺序漂移就崩 — 防 ⌘1-5 错位.
if (HOME_TILES.length !== PERSISTABLE_NAV_KEYS.size) {
  throw new Error(`HOME_TILES (${HOME_TILES.length}) != PERSISTABLE_NAV_KEYS (${PERSISTABLE_NAV_KEYS.size})`);
}

export default HomeGrid;
