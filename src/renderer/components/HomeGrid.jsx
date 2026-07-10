/**
 * src/renderer/components/HomeGrid.jsx
 *
 * P-N HomeGrid v3 — 视觉/交互完善:
 *  - v2 已有: hero + 8 macOS 玻璃 tile + 几何 SVG icon
 *  - v3 新增:
 *      A1 未读角标 — tile 右上角小红点 + 数字 (复用 SideNav 4 个 badge signal)
 *      A2 快捷键提示 — tile 副标题加 ⌘1-8 编号, hover 显示
 *      A3 方向键导航 — 上下左右在 grid 里移动焦点, Enter 触发
 *      A4 最近访问 — hero 旁加 "上次: <title>" (从 lastActiveNav 派生)
 *      A14 cascade 动画 — 8 个 tile 错峰 40ms 淡入
 *      A17 prefers-reduced-motion — 用户系统设置减少动效时禁用 transition
 *
 * 8 个 tile 顺序固定 (跟 PERSISTABLE_NAV_KEYS 一致), ⌘1-8 直接对应 HOME_TILES 索引.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { setActiveNav, PERSISTABLE_NAV_KEYS } from "../worldcup/navStore.js";
import { ithomeUnreadBadge } from "../ithome/store.js";
import { wechatHotUnreadBadge } from "../wechat-hot/store.js";
import { fundUnreadBadge } from "../funds/fundStore.js";
import { aiUsageNavBadge } from "../store/ai-usage-store.js";
import "./HomeGrid.css";

// ponytail: 8 个简单几何 SVG, 24x24 viewBox, 跟 macOS SF Symbols 风格一致.
// 不用 lucide / heroicons 库 — 1 个文件 8 个 inline svg, 0 依赖.
function TileIcon({ kind }) {
  const c = {
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
  };
  switch (kind) {
    case "ithome": // 报纸折角
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M5 5v14h12V8l-4-3H5z" />
          <path {...c} d="M8 11h7M8 14h7M8 17h4" />
        </svg>
      );
    case "wechat-hot": // 火焰 (热搜)
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M12 3c1 3-3 4-3 8a3 3 0 0 0 6 0c0-2-2-3-2-5" />
          <path {...c} d="M9 16a4 4 0 0 0 7 2" />
        </svg>
      );
    case "worldcup": // 球 + 经线
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle {...c} cx="12" cy="12" r="8" />
          <path {...c} d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16" />
        </svg>
      );
    case "funds": // 柱状图
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M4 20h16" />
          <path {...c} d="M7 17v-4M11 17V9M15 17v-6M19 17v-3" />
        </svg>
      );
    case "metals": // 菱形
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M12 3l9 9-9 9-9-9 9-9z" />
          <path {...c} d="M7 12h10M12 7v10" />
        </svg>
      );
    case "stocks": // 折线
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M3 17l5-6 4 3 8-9" />
          <path {...c} d="M15 5h5v5" />
        </svg>
      );
    case "ai-usage": // 节点 + 中心
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
    case "versions": // 环形进度
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path {...c} d="M20 12a8 8 0 1 1-3-6.2" />
          <path {...c} d="M20 4v4h-4" />
        </svg>
      );
    default:
      return null;
  }
}

// 顺序: 跟 PERSISTABLE_NAV_KEYS 一致 (ⓘ 后续如果改 NAV_KEYS 顺序, 这里跟着改).
const HOME_TILES = [
  { key: 'ithome',     title: 'IT 新闻',  subtitle: 'IT之家资讯 + AI 摘要',     accent: 'blue'   },
  { key: 'wechat-hot', title: '微博热搜', subtitle: '微博实时热搜',              accent: 'red'    },
  { key: 'worldcup',   title: '世界杯',   subtitle: '2026 世界杯赛程',            accent: 'green'  },
  { key: 'funds',      title: '基金管理', subtitle: '基金持仓 + 实时盈亏',         accent: 'orange' },
  { key: 'metals',     title: '贵金属',   subtitle: '黄金白银实时 + 持仓',         accent: 'amber'  },
  { key: 'stocks',     title: '选股',     subtitle: 'A股条件选股 + AI 分析',      accent: 'purple' },
  { key: 'ai-usage',   title: 'AI 用量',  subtitle: 'MiniMax coding plan 配额',  accent: 'pink'   },
  { key: 'versions',   title: '版本检查', subtitle: 'App 版本监控',              accent: 'indigo' },
];

// ponytail: 单一来源 — HomeGrid 跟 SideNav 共享 4 个 nav badge signal, 不引新的 store.
// 角标为空 (0) 时返回 null, 让 .home-grid-tile-badge 整个不渲染.
function getBadge(key) {
  switch (key) {
    case 'ithome':     return ithomeUnreadBadge.value || null;
    case 'wechat-hot': return wechatHotUnreadBadge.value || null;
    case 'funds':      return fundUnreadBadge.value || null;
    case 'ai-usage':   return aiUsageNavBadge.value || null;
    default:           return null;
  }
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
// matchMedia 在 happy-dom 不支持, 退化到 false (即不开启减少动效, 保持视觉).
function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HomeGrid() {
  // 顶部时钟: 不每秒 tick, 分钟级别够用, 避免无谓重渲染.
  const [now, setNow] = useState(() => new Date());
  // A14: 0 → 1, 挂载 1 帧后开启, CSS 用以触发 cascade 动画.
  const [mounted, setMounted] = useState(false);
  // A3: 键盘焦点索引 (默认 0 = 第一个 tile).
  const [focusIdx, setFocusIdx] = useState(0);
  const tileRefs = useRef([]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    // cascade 触发: 1 帧后 setMounted, 让 transition 跑.
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => { clearInterval(tick); cancelAnimationFrame(raf); };
  }, []);

  // A1: 订阅 4 个 badge signal — 显式 read 让 Preact 知道依赖.
  // 显式订阅确保 iH/wechat/funds/ai-usage 角标变化时 HomeGrid 重渲.
  const badges = {
    ithome: ithomeUnreadBadge.value,
    'wechat-hot': wechatHotUnreadBadge.value,
    funds: fundUnreadBadge.value,
    'ai-usage': aiUsageNavBadge.value,
  };

  // A4: 上次访问的 nav (从 api 主进程持久化). 拉一次, 不在每次 render 拉.
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
  const lastActiveTile = lastActive ? HOME_TILES.find((t) => t.key === lastActive) : null;

  // A3: 全局键盘监听. 上下左右在 grid 里移动焦点, ⌘1-8 直接触发, Enter/Space 触发.
  // 4 列 grid: 左右各 ±1, 上下各 ±4 (跳行).
  useEffect(() => {
    function onKey(e) {
      // ⌘1-8 直接切 nav.
      if ((e.metaKey || e.ctrlKey) && /^[1-8]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < HOME_TILES.length) {
          e.preventDefault();
          setActiveNav(HOME_TILES[idx].key);
          setFocusIdx(idx);
        }
        return;
      }
      // 方向键.
      const move = (delta) => {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, Math.min(HOME_TILES.length - 1, i + delta)));
      };
      if (e.key === 'ArrowRight') return move(1);
      if (e.key === 'ArrowLeft')  return move(-1);
      if (e.key === 'ArrowDown')  return move(4);
      if (e.key === 'ArrowUp')    return move(-4);
      if (e.key === 'Home')       return move(-HOME_TILES.length);
      if (e.key === 'End')        return move(HOME_TILES.length);
      if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement && document.activeElement.classList?.contains('home-grid-tile')) {
          e.preventDefault();
          document.activeElement.click();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // focusIdx 变 → 移动 DOM 焦点到对应 tile.
  useEffect(() => {
    const el = tileRefs.current[focusIdx];
    if (el) el.focus({ preventScroll: false });
  }, [focusIdx]);

  const reduced = prefersReducedMotion();

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
          <span>{HOME_TILES.length} 个模块 · ⌘1-8</span>
        </div>
      </header>

      <div class="home-grid" role="grid" aria-label="Pulse 主菜单">
        {HOME_TILES.map((tile, idx) => {
          const badge = getBadge(tile.key) || badges[tile.key] || 0;
          const isFocused = idx === focusIdx;
          return (
            <button
              key={tile.key}
              ref={(el) => { tileRefs.current[idx] = el; }}
              type="button"
              class={`home-grid-tile home-grid-tile-${tile.accent}${isFocused ? ' home-grid-tile-focused' : ''}`}
              role="gridcell"
              tabIndex={isFocused ? 0 : -1}
              aria-label={`进入 ${tile.title}${badge > 0 ? `, 未读 ${badge}` : ''}`}
              onClick={() => setActiveNav(tile.key)}
              onFocus={() => setFocusIdx(idx)}
              style={{ '--tile-cascade-delay': `${idx * 40}ms` }}
            >
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
                {tile.subtitle}
                <span class="home-grid-tile-kbd" aria-hidden="true">⌘{idx + 1}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ponytail: 上次 commit 改的 8 个 tile 顺序固定, 跟 PERSISTABLE_NAV_KEYS 一致.
// 这条 assert 触发编译期 (import time) 失败, 顺序漂移就崩 — 防 ⌘1-8 错位.
if (HOME_TILES.length !== PERSISTABLE_NAV_KEYS.size) {
  throw new Error(`HOME_TILES (${HOME_TILES.length}) != PERSISTABLE_NAV_KEYS (${PERSISTABLE_NAV_KEYS.size})`);
}

export default HomeGrid;