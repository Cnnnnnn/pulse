/**
 * src/shared/nav-keys.ts
 *
 * 导航单一真源 (Single Source of Truth).
 * 主进程 + renderer 共享 import — 消除"加/删一个 nav 要同步改 8 个地方"的并行注册表.
 *
 * Phase 9 (外壳+导航+视觉重设):
 *   - 旧分布: navStore.NAV_KEYS / NAV_KEYS_LIST / PERSISTABLE_NAV_KEYS +
 *             SideNav.NAV_ITEMS + HomeGrid.HOME_TILES + LazyNavPanel.LOADERS +
 *             icons.NAV_ICON + state-store.PERSISTABLE_NAV_VALUES (8 处并行).
 *   - 现在: 本文件一份; 其余全部派生.
 *
 * 设计约束:
 *   - 纯数据 only (无 import, 无 signal, 无 dynamic import) — 主进程 require 不应
 *     被牵引入 renderer 的 preact/lazy 依赖.
 *   - lazy loader (dynamic import) 仍留 renderer 侧 (LazyNavPanel), 只在 renderer 内对齐
 *     registry 的 key 集合.
 *   - icon name 是字符串 key (不是组件), renderer 侧 icons.tsx 把 name → 组件.
 */

// ─── 类型 ──────────────────────────────────────────

export type NavKey =
  | 'home'
  | 'news'
  | 'invest'
  | 'ai-usage'
  | 'versions'
  | 'github'
  | 'ai-leaderboard'
  | 'movies'
  | 'concerts';

export type NavSectionId = 'news' | 'holdings' | 'system' | 'entertainment';

/** 模块元数据 (不含 lazy — renderer 专属) */
export interface NavRegistryEntry {
  key: Exclude<NavKey, 'home'>;
  label: string;
  tooltip: string;
  accent: 'blue' | 'green' | 'orange' | 'pink' | 'indigo' | 'purple' | 'red' | 'teal';
  /** 图标 name — renderer icons.tsx 把 name 映射到组件 */
  icon:
    | 'news'
    | 'coin'
    | 'medal'
    | 'bar-chart'
    | 'refresh'
    | 'layers'
    | 'star'
    | 'film'
    | 'ticket';
  /** 归属分组 */
  section: NavSectionId;
  /** 首页磁贴标题 (短); 缺省用 label */
  homeTitle?: string;
  /** 首页磁贴副标题 (短) */
  subtitle: string;
  /** 跟 tray menu prefs 联动的 segment key; undefined = 固定可见 */
  prefsSegment?: string;
}

export interface NavSection {
  id: NavSectionId;
  label: string;
}

// ─── 分组 (IA 重构: 8 平铺 → 3 section) ──────────────

export const NAV_SECTIONS: NavSection[] = [
  { id: 'news', label: '资讯' },
  { id: 'holdings', label: '持仓' },
  { id: 'system', label: '系统' },
  { id: 'entertainment', label: '娱乐' },
];

// ─── 模块 registry (顺序 = 默认侧栏/磁贴顺序) ────────

export const NAV_REGISTRY: NavRegistryEntry[] = [
  {
    key: 'news',
    label: '新闻',
    tooltip: 'IT 资讯 + 微博热搜 (合并 tab)',
    accent: 'blue',
    icon: 'news',
    section: 'news',
    subtitle: 'IT 资讯 + 微博热搜',
  },
  {
    key: 'ai-leaderboard',
    label: 'AI 榜单',
    tooltip: '大模型排名 / 性价比 / 速度',
    accent: 'teal',
    icon: 'bar-chart',
    section: 'news',
    subtitle: '大模型排名 / 性价比 / 速度',
  },
  {
    key: 'github',
    label: 'GitHub 收录',
    tooltip: 'GitHub 优秀项目收录与管理 (v2.80)',
    accent: 'purple',
    icon: 'layers',
    section: 'news',
    subtitle: '优秀开源项目收录与管理',
  },
  {
    key: 'movies',
    label: '电影',
    tooltip: '热映 / 即将上映 (v2.81)',
    accent: 'pink',
    icon: 'film',
    section: 'entertainment',
    homeTitle: '电影',
    subtitle: '热映 / 即将上映',
  },
  {
    key: 'concerts',
    label: '演出票价',
    tooltip: '演唱会实时票价监控 (v2.82)',
    accent: 'red',
    icon: 'ticket',
    section: 'entertainment',
    homeTitle: '演出票',
    subtitle: '演唱会实时票价监控',
  },
  {
    key: 'invest',
    label: '投资',
    tooltip: '基金 + 贵金属 + 选股 (合并 tab)',
    accent: 'orange',
    icon: 'coin',
    section: 'holdings',
    subtitle: '基金 + 贵金属 + 选股',
  },
  {
    key: 'ai-usage',
    label: 'AI coding plan 用量',
    tooltip: 'Minimax coding plan 配额 (v2.13)',
    accent: 'pink',
    icon: 'bar-chart',
    section: 'holdings',
    homeTitle: 'AI 用量',
    subtitle: 'Minimax coding plan 配额',
    prefsSegment: 'ai_usage',
  },
  {
    key: 'versions',
    label: '版本检查',
    tooltip: 'App 版本监控 (v2.6 主体)',
    accent: 'indigo',
    icon: 'refresh',
    section: 'system',
    subtitle: 'App 版本监控',
    prefsSegment: 'updates',
  },
];

// ─── 派生集合 (下游直接 import, 不再各自维护) ────────

/** 所有可持久化的顶级 panel key (不含 'home' — home 是显示态, 不落盘) */
export const NAV_KEYS_LIST: Exclude<NavKey, 'home'>[] = NAV_REGISTRY.map((e) => e.key);

/** PERSISTABLE_NAV_KEYS 的 Set 版 (持久化白名单) */
export const PERSISTABLE_NAV_KEYS: ReadonlySet<string> = new Set(NAV_KEYS_LIST);

/** activeNav 全部合法值 (含 'home') */
export const ALL_NAV_KEYS: ReadonlySet<string> = new Set(['home', ...NAV_KEYS_LIST]);

/** legacy key → 当前 key (兼容旧落盘 / 旧调用点) */
export const LEGACY_NAV_ALIAS: Record<string, NavKey> = {
  ithome: 'news',
  'wechat-hot': 'news',
  funds: 'invest',
  metals: 'invest',
  stocks: 'invest',
};

/** nav key → tray prefs segment (不在此表的 nav 固定可见) */
export const NAV_TO_PREFS_SEGMENT: Record<string, string> = Object.fromEntries(
  NAV_REGISTRY.filter((e) => e.prefsSegment).map((e) => [e.key, e.prefsSegment as string]),
);

/** 主进程 state-store 持久化白名单 (含 legacy key — load 旧落盘仍合法) */
export const PERSISTABLE_NAV_VALUES: ReadonlySet<string> = new Set([
  ...NAV_KEYS_LIST,
  ...Object.keys(LEGACY_NAV_ALIAS),
]);

/** registry lookup map */
export const NAV_REGISTRY_BY_KEY: Record<string, NavRegistryEntry> = Object.fromEntries(
  NAV_REGISTRY.map((e) => [e.key, e]),
);

/**
 * 按 section 取 nav keys (section 内保持 registry 顺序).
 * 用于侧栏分组渲染.
 */
export function navKeysBySection(sectionId: NavSectionId): Exclude<NavKey, 'home'>[] {
  return NAV_REGISTRY.filter((e) => e.section === sectionId).map((e) => e.key);
}
