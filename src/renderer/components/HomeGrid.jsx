/**
 * src/renderer/components/HomeGrid.jsx
 *
 * P-N HomeGrid v2 — 首屏桌面式 grid, 8 个顶级 nav 平铺, 加 hero 区.
 * 不引用 NAV_ITEMS (避免双向耦合); HOME_TILES 独立维护.
 *
 * 设计:
 *  - Hero 区: 品牌 mark + 动态 greeting (上午/下午/晚上) + 当前时间.
 *  - Tile: macOS 玻璃质感 + 几何 SVG icon (取代 emoji, 跨平台一致).
 *  - 8 个 tile 颜色: 各自一个 accent 色 (蓝/红/绿/橙/紫/粉/青/靛).
 */
import { useEffect, useState } from "preact/hooks";
import { setActiveNav } from "../worldcup/navStore.js";
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

const HOME_TILES = [
  { key: 'ithome',     title: 'IT 新闻',  subtitle: 'IT之家资讯 + AI 摘要',  accent: 'blue'   },
  { key: 'wechat-hot', title: '微博热搜', subtitle: '微博实时热搜',           accent: 'red'    },
  { key: 'worldcup',   title: '世界杯',   subtitle: '2026 世界杯赛程',         accent: 'green'  },
  { key: 'funds',      title: '基金管理', subtitle: '基金持仓 + 实时盈亏',      accent: 'orange' },
  { key: 'metals',     title: '贵金属',   subtitle: '黄金白银实时 + 持仓',      accent: 'amber'  },
  { key: 'stocks',     title: '选股',     subtitle: 'A股条件选股 + AI 分析',   accent: 'purple' },
  { key: 'ai-usage',   title: 'AI 用量',  subtitle: 'MiniMax coding plan 配额', accent: 'pink'   },
  { key: 'versions',   title: '版本检查', subtitle: 'App 版本监控',           accent: 'indigo' },
];

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

export function HomeGrid() {
  // 顶部时钟: 不每秒 tick, 分钟级别够用, 避免无谓重渲染.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div class="home-grid-root">
      <header class="home-hero">
        <div class="home-hero-mark" aria-hidden="true">P</div>
        <div class="home-hero-text">
          <div class="home-hero-greeting">
            {greeting()}
            <span class="home-hero-time">{fmtTime(now)}</span>
          </div>
          <div class="home-hero-date">{fmtDate(now)}</div>
        </div>
        <div class="home-hero-meta" aria-hidden="true">
          <span class="home-hero-dot" />
          <span>{HOME_TILES.length} 个模块</span>
        </div>
      </header>

      <div class="home-grid" role="grid" aria-label="Pulse 主菜单">
        {HOME_TILES.map((tile) => (
          <button
            key={tile.key}
            type="button"
            class={`home-grid-tile home-grid-tile-${tile.accent}`}
            role="gridcell"
            aria-label={`进入 ${tile.title}`}
            onClick={() => setActiveNav(tile.key)}
          >
            <span class="home-grid-tile-icon" aria-hidden="true">
              <TileIcon kind={tile.key} />
            </span>
            <span class="home-grid-tile-title">{tile.title}</span>
            <span class="home-grid-tile-subtitle">{tile.subtitle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default HomeGrid;
