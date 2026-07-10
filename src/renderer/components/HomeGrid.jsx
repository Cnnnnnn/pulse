/**
 * src/renderer/components/HomeGrid.jsx
 *
 * P-N HomeGrid — 首屏桌面式 grid, 8 个顶级 nav 平铺.
 * 不引用 NAV_ITEMS (避免双向耦合); HOME_TILES 独立维护.
 */
import { setActiveNav } from "../worldcup/navStore.js";
import "./HomeGrid.css";

// ponytail: emoji 兜底图标. 不画 8 个新 SVG, 不加 icon 库依赖.
// 后续要替换成 SVG 直接改这一处 map.
const ICON_EMOJI = {
  'ithome': '📰',
  'wechat-hot': '🔥',
  'worldcup': '⚽',
  'funds': '💼',
  'metals': '🏅',
  'stocks': '📈',
  'ai-usage': '🤖',
  'versions': '🔄',
};

const HOME_TILES = [
  { key: 'ithome',     title: 'IT 新闻',  subtitle: 'IT之家资讯 + AI 摘要',     },
  { key: 'wechat-hot', title: '微博热搜', subtitle: '微博实时热搜',              },
  { key: 'worldcup',   title: '世界杯',   subtitle: '2026 世界杯赛程',            },
  { key: 'funds',      title: '基金管理', subtitle: '基金持仓 + 实时盈亏',         },
  { key: 'metals',     title: '贵金属',   subtitle: '黄金白银实时 + 持仓',         },
  { key: 'stocks',     title: '选股',     subtitle: 'A股条件选股 + AI 分析',      },
  { key: 'ai-usage',   title: 'AI 用量',  subtitle: 'MiniMax coding plan 配额', },
  { key: 'versions',   title: '版本检查', subtitle: 'App 版本监控',              },
];

export function HomeGrid() {
  return (
    <div class="home-grid" role="grid" aria-label="Pulse 主菜单">
      {HOME_TILES.map((tile) => (
        <button
          key={tile.key}
          type="button"
          class="home-grid-tile"
          role="gridcell"
          aria-label={`进入 ${tile.title}`}
          onClick={() => setActiveNav(tile.key)}
        >
          <span class="home-grid-tile-icon" aria-hidden="true">
            {ICON_EMOJI[tile.key] ?? '•'}
          </span>
          <span class="home-grid-tile-title">{tile.title}</span>
          <span class="home-grid-tile-subtitle">{tile.subtitle}</span>
        </button>
      ))}
    </div>
  );
}

export default HomeGrid;
