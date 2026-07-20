/**
 * 统一 UI 图标 — Header / 分类 tab / 空态用 inline SVG (stroke 风格 14–24px).
 * UI 层按 id 映射 SVG (CategoryTabIcon); 数据层 category.js 只持 id/name/order.
 */

const defaults = {
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

// ponytail: inline-block + vertical-align: middle 让 SVG 在 inline / text 旁边跟
// 文字 baseline 对齐 (不管父容器是 <button> / <span> / <a>). 不加这两条会
// 出现"图标下沉"或"上浮" (默认 baseline 对齐, SVG 的字形底在 viewBox 22px,
// 文本 x-height 中心在 12px, 自然错位). flex 容器父级靠 align-items:center
// 居中, 这里两条规则对 flex 容器无副作用.
const svgBaseStyle = {
  display: 'inline-block',
  verticalAlign: 'middle',
  flexShrink: 0,
};

function Svg({ size = 16, style, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ ...svgBaseStyle, ...style }}
      {...defaults}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconStar({ filled = false, size = 16 }) {
  return (
    <Svg size={size} fill={filled ? 'currentColor' : 'none'}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </Svg>
  );
}

export function IconBook({ size = 16 }) {
  return (
    <Svg size={size}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </Svg>
  );
}

export function IconPackage({ size = 24 }) {
  return (
    <Svg size={size}>
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
    </Svg>
  );
}

export function IconSearch({ size = 24 }) {
  return (
    <Svg size={size}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  );
}

export function IconCoin({ size = 24 }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M9 9.5h4.5a2 2 0 1 1 0 4H9M9 14.5h5a2 2 0 1 0 0-4H9" />
    </Svg>
  );
}

export function IconBell({ size = 16 }) {
  return (
    <Svg size={size}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

export function IconClock({ size = 16 }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Svg>
  );
}

export function IconList({ size = 14 }) {
  return (
    <Svg size={size}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </Svg>
  );
}

export function IconBot({ size = 14 }) {
  return (
    <Svg size={size}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M12 8V5" />
      <circle cx="9" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconWrench({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Svg>
  );
}

export function IconGlobe({ size = 14 }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  );
}

export function IconMessage({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

export function IconPalette({ size = 14 }) {
  return (
    <Svg size={size}>
      <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </Svg>
  );
}

export function IconNote({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </Svg>
  );
}

export function IconSettings({ size = 14 }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </Svg>
  );
}

export function IconLayers({ size = 14 }) {
  return (
    <Svg size={size}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </Svg>
  );
}

export function IconTrendingUp({ size = 14 }) {
  return (
    <Svg size={size}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </Svg>
  );
}

export function IconBarChart({ size = 14 }) {
  return (
    <Svg size={size}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </Svg>
  );
}

const APP_CATEGORY_ICON = {
  all: IconList,
  ai: IconBot,
  dev: IconWrench,
  browser: IconGlobe,
  comms: IconMessage,
  media: IconPalette,
  notes: IconNote,
  system: IconSettings,
  other: IconPackage,
};

const FUND_CATEGORY_ICON = {
  all: IconLayers,
  stock: IconTrendingUp,
  bond: IconBarChart,
  money: IconCoin,
  qdii: IconGlobe,
  other: IconPackage,
};

/** 分类 tab / 行内标签 — 按 category id 渲染 SVG */
export function CategoryTabIcon({ id, domain = 'app', size = 14 }) {
  const map = domain === 'fund' ? FUND_CATEGORY_ICON : APP_CATEGORY_ICON;
  const Icon = map[id] || IconPackage;
  return <Icon size={size} />;
}

export function IconCalendar({ size = 14 }) {
  return (
    <Svg size={size}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </Svg>
  );
}

export function IconUsers({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

export function IconFootball({ size = 14 }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </Svg>
  );
}

export function IconTrophy({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 4H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3" />
      <path d="M17 4h3a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3" />
    </Svg>
  );
}

export function IconMedal({ size = 20 }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="8" r="6" />
      <path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12" />
    </Svg>
  );
}

const WORLDCUP_TAB_ICON = {
  fixtures: IconCalendar,
  teams: IconUsers,
  scorers: IconFootball,
  bracket: IconTrophy,
};

export function WorldcupTabIcon({ tabKey, size = 14 }) {
  const Icon = WORLDCUP_TAB_ICON[tabKey] || IconFootball;
  return <Icon size={size} />;
}

export function IconRefresh({ size = 16, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </Svg>
  );
}

export function IconMenu({ size = 16 }) {
  return (
    <Svg size={size}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </Svg>
  );
}

export function IconNews({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16" />
      <path d="M4 10h16" />
      <path d="M10 6h8" />
      <path d="M10 14h8" />
      <path d="M10 18h5" />
    </Svg>
  );
}

export function IconFlame({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </Svg>
  );
}

export function IconChevronUp({ size = 14 }) {
  return (
    <Svg size={size}>
      <polyline points="18 15 12 9 6 15" />
    </Svg>
  );
}

export function IconChevronDown({ size = 14 }) {
  return (
    <Svg size={size}>
      <polyline points="6 9 12 15 18 9" />
    </Svg>
  );
}

export function IconTrash({ size = 14 }) {
  return (
    <Svg size={size}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

export function IconEdit({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

export function IconAlert({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Svg>
  );
}

export function IconLoader({ size = 14 }) {
  return (
    <Svg size={size}>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </Svg>
  );
}

const NAV_ICON = {
  ithome: IconNews,
  news: IconNews,
  'wechat-hot': IconFlame,
  worldcup: IconTrophy,
  funds: IconCoin,
  invest: IconCoin,
  metals: IconMedal,
  'ai-usage': IconBarChart,
  'ai-leaderboard': IconBarChart,
  versions: IconRefresh,
  github: IconLayers,
};

export function NavIcon({ navKey, size = 18 }) {
  const Icon = NAV_ICON[navKey] || IconPackage;
  return <Icon size={size} />;
}

const WATCHLIST_TYPE_ICON = {
  app: IconStar,
  fund: IconCoin,
  keyword: IconSearch,
  metal: IconMedal,
};

export function WatchlistTypeIcon({ type, size = 14 }) {
  const Icon = WATCHLIST_TYPE_ICON[type] || IconStar;
  return <Icon size={size} />;
}

const FUND_TAB_ICON = {
  holdings: IconList,
  pnl: IconTrendingUp,
};

export function FundTabIcon({ tabId, size = 14 }) {
  const Icon = FUND_TAB_ICON[tabId] || IconList;
  return <Icon size={size} />;
}

export function PinIcon({ filled = false, size = 14 }) {
  return <IconStar filled={filled} size={size} />;
}

export function IconInfo({ size = 14 }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </Svg>
  );
}

export function IconCheck({ size = 14 }) {
  return (
    <Svg size={size}>
      <polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

export function IconX({ size = 14 }) {
  return (
    <Svg size={size}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}

export function IconSparkles({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M12 3l1.2 4.2L17 8.5l-3.8 1.3L12 14l-1.2-4.2L7 8.5l3.8-1.3L12 3z" />
      <path d="M5 14l.8 2.8L8.5 18l-2.7.9L5 22l-.8-3.1L1.5 18l2.7-.9L5 14z" />
    </Svg>
  );
}

export function IconShare({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </Svg>
  );
}

export function IconSun({ size = 14 }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Svg>
  );
}

export function IconVolumeOff({ size = 14 }) {
  return (
    <Svg size={size}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </Svg>
  );
}

export function IconArrowUp({ size = 14 }) {
  return (
    <Svg size={size}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </Svg>
  );
}

export function IconWand({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M15 4V2M15 8V6M17 6h2M13 6h2" />
      <path d="M7 21l4-4 9-9a2.12 2.12 0 0 0-3-3l-9 9-4 4z" />
    </Svg>
  );
}

export function IconMoreHorizontal({ size = 14 }) {
  return (
    <Svg size={size}>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** 置顶（Pin）图标 — 用于把常用项目钉在列表顶部。 */
export function IconPin({ size = 16 }) {
  return (
    <Svg size={size}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </Svg>
  );
}

export function IconRotateCcw({ size = 14 }) {
  return (
    <Svg size={size}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </Svg>
  );
}

export function IconBan({ size = 14 }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </Svg>
  );
}

export function IconDot({ size = 14 }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconFlag({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </Svg>
  );
}

export function IconMapPin({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </Svg>
  );
}

export function IconLock({ size = 14 }) {
  return (
    <Svg size={size}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  );
}

/**
 * 队旗渲染: 有 ISO code → 彩色真实国旗 SVG (4:3, 来自 flags.jsx);
 * 无 code → 通用 IconFlag 占位. 国旗必须用真实配色, 不走 stroke/currentColor.
 */
import { FLAG_SVGS } from "../worldcup/flags.jsx";

export function TeamFlag({ code, size = 16, className }) {
  const key = code ? String(code).toUpperCase() : null;
  const label = key;
  const flagSvg = key ? FLAG_SVGS[key] : null;
  if (flagSvg) {
    // 真实国旗: 独立 <svg>, viewBox 4:3, 彩色填充. 跟 stroke 风格 IconSvg 隔离.
    return (
      <span
        class={className}
        title={label || undefined}
        aria-label={label ? `球队 ${label}` : undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width={size}
          height={Math.round((size * 3) / 4)}
          viewBox="0 0 60 40"
          role="img"
          style={{ display: "block", borderRadius: "1px" }}
        >
          {flagSvg}
        </svg>
      </span>
    );
  }
  // fallback: 通用旗子图标 (无 code 或 code 未收录)
  return (
    <span
      class={className}
      title={label || undefined}
      aria-label={label ? `球队 ${label}` : undefined}
    >
      <IconFlag size={size} />
    </span>
  );
}

const TOAST_TYPE_ICON = {
  info: IconInfo,
  warn: IconAlert,
  error: IconX,
  success: IconCheck,
};

export function ToastTypeIcon({ type = 'info', size = 14 }) {
  const Icon = TOAST_TYPE_ICON[type] || IconInfo;
  return <Icon size={size} />;
}

const SEARCH_SOURCE_ICON = {
  news: IconNews,
  'ai-task': IconBot,
  reminder: IconClock,
  fund: IconBarChart,
  app: IconRefresh,
};

export function SearchSourceIcon({ source, size = 14 }) {
  if (!source) return <IconPackage size={size} />;
  const Icon = SEARCH_SOURCE_ICON[source] || IconPackage;
  return <Icon size={size} />;
}

const DIGEST_SECTION_ICON = {
  updates: IconArrowUp,
  hot: IconFlame,
  news: IconNews,
  funds: IconTrendingUp,
  ai_usage: IconAlert,
  worldcup: IconFootball,
};

export function DigestSectionIcon({ kind, size = 14 }) {
  const Icon = DIGEST_SECTION_ICON[kind] || IconDot;
  return <Icon size={size} />;
}

const RECENT_ACTIVITY_ICON = {
  'app-upgrade': IconArrowUp,
  'app-check': IconRefresh,
  'reminder-create': IconClock,
  'reminder-update': IconEdit,
  'reminder-fire': IconBell,
  'reminder-done': IconCheck,
  'reminder-dismissed': IconX,
  'worldcup-match-view': IconFootball,
  'worldcup-insight': IconWand,
  'fund-view': IconCoin,
  'fund-add': IconCoin,
  'fund-update': IconEdit,
  'fund-remove': IconX,
  'fund-nav-fetch': IconRefresh,
  'ithome-view': IconNews,
  'ithome-favorite': IconStar,
  'ithome-summary': IconSparkles,
  'settings-open': IconSettings,
};

export function RecentActivityIcon({ kind, size = 14 }) {
  const Icon = RECENT_ACTIVITY_ICON[kind] || IconDot;
  return <Icon size={size} />;
}

const PROMPT_SECTION_ICON = {
  ithome_summary: IconNews,
  worldcup_prematch: IconTrophy,
  worldcup_postmatch: IconTrophy,
  upgrade_advice: IconSparkles,
  changelog_summary: IconSparkles,
  category_classify: IconPackage,
  daily_digest_summary: IconList,
};

export function PromptSectionIcon({ promptKey, size = 14 }) {
  const Icon = PROMPT_SECTION_ICON[promptKey] || IconBot;
  return <Icon size={size} />;
}

const BULK_STATUS_ICON = {
  pending: IconDot,
  running: IconRefresh,
  done: IconCheck,
  failed: IconX,
  skipped: IconBan,
  cancelled: IconBan,
};

export function BulkStatusIcon({ status, size = 12 }) {
  const Icon = BULK_STATUS_ICON[status] || IconDot;
  return <Icon size={size} />;
}

export function PnlSignIcon({ value, size = 14 }) {
  if (value > 0) return <IconCheck size={size} />;
  if (value < 0) return <IconX size={size} />;
  return null;
}

export function IconThumbsUp({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M7 10v12" />
      <path d="M15.5 11.5a2.5 2.5 0 0 0-2.5-2.5H12v-2.5a2.5 2.5 0 0 0-5 0V14" />
      <path d="M3 14h4.5" />
    </Svg>
  );
}

export function IconThumbsDown({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M17 14V2" />
      <path d="M8.5 12.5a2.5 2.5 0 0 1 2.5 2.5H12v2.5a2.5 2.5 0 0 1-5 0V10" />
      <path d="M21 10h-4.5" />
    </Svg>
  );
}

export function IconCommand({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </Svg>
  );
}

export function IconGrid({ size = 14 }) {
  return (
    <Svg size={size}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </Svg>
  );
}

export function IconCopy({ size = 14 }) {
  return (
    <Svg size={size}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

/* GitHub octocat mark（实心，用于卡片/行的仓库图标） */
export function IconGithub({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      style={svgBaseStyle}
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/* 「更新」tab 图标 — 标签/版本标记语义 */
export function IconTag({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.29H4a1 1 0 0 0-1 1v5.59A2 2 0 0 0 3.54 11l9.58 9.59a2 2 0 0 0 2.83 0l4.64-4.64a2 2 0 0 0 0-2.54z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </Svg>
  );
}

/* 外部链接箭头 — 跳转 release 页 */
export function IconExternalLink({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </Svg>
  );
}
