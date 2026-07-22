# 游戏收集模块 · 统一游戏风格 UI 设计系统

> **文档类型**：设计系统 + 组件架构（UI Designer 交付物，Phase 1 / 原型确认前）
> **日期**：2026-07-21
> **范围**：`src/renderer/games/`（收藏 / 心愿单视图为主，折扣/免费/比价视图风格同步对齐）
> **目标**：在现有 Apple/oklch 设计体系之上，建立「统一游戏收藏」范式——图鉴式收集、统一交互模式、进度可视化、克制的游戏感动效，且组件可复用、可扩展新游戏类型/品类。

---

## 0. 设计原则（克制原生风）

沿用 `docs/ui-design-system.md` 真源令牌（oklch / `color-mix` / 禁止裸 hex / tabular-nums / 44px 触控 / `prefers-reduced-motion`），**不引入第二种视觉语言**。游戏感通过「收集状态的仪式感」表达，而非强渐变/霓虹：

| 原则 | 落地 |
|------|------|
| 单一令牌真源 | 全部复用 `styles.css` 的 `--accent-*` / `--gray-*` / `--brand-*`，收藏专属令牌仅在 `games.css` 内新增，零裸 hex |
| 收集即反馈 | 每次「收集」都有可感知的微观闭环：卡牌归位动画 + 焦点光晕 + （移动端）`navigator.vibrate` + 解锁 toast |
| 稀有度用色不喧宾 | 稀有度以「细发光描边 + 角标」表达，大面不铺色，保持高级克制 |
| 进度即叙事 | 完成度用「环形进度 + 数字」双编码；分类（收藏夹/标签）自带目标进度条 |
| 状态可扫读 | 已收集（鲜活）/ 未收集（ghost+锁）双态对比强烈，一眼区分 |
| 可扩展 | 数据驱动的 `collectionRegistry`，新增游戏类型/品类 = 加一条注册项，视图层零改动 |

---

## 1. 设计令牌（在现有体系上扩展）

### 1.1 直接复用（不重复定义）
`--accent-primary` `--color-success/warning/danger` `--gray-*` `--brand-steam/epic/xbox/playstation/switch` `--space-*` `--radius-*` `--shadow-*` `--font-size-*` `--focus-ring` `--text-primary/secondary/tertiary`。

### 1.2 收藏专属令牌（`games.css` 内新增，主题感知）
```css
:root {
  /* 稀有度语义色（克制、低饱和、感知均匀，复用全局 hue 区间） */
  --rarity-common:    var(--gray-400);
  --rarity-rare:      oklch(62% 0.13 255);   /* 冷蓝，呼应 --accent-primary */
  --rarity-epic:      oklch(56% 0.16 295);   /* 靛紫 */
  --rarity-legendary: oklch(78% 0.15 75);   /* 暖金，呼应 --accent-orange 但更柔 */

  /* 收集态光泽（描边/光晕，主题感知：浅色压暗、深色直引） */
  --collect-glow: color-mix(in oklch, var(--rarity-color, var(--accent-primary)) 55%, transparent);
  --collect-glow-soft: color-mix(in oklch, var(--rarity-color, var(--accent-primary)) 22%, transparent);

  /* 未收集 ghost 态 */
  --ghost-bg: color-mix(in oklch, var(--bg-secondary) 70%, transparent);
  --ghost-fg: var(--text-tertiary);

  /* 收集进度环 */
  --ring-track: var(--border);
  --ring-fill: var(--accent-primary);

  /* 解锁 toast */
  --toast-bg: var(--bg-modal);
  --toast-border: color-mix(in oklch, var(--accent-primary) 30%, var(--border));

  /* 视图切换分段控件 */
  --segment-bg: var(--bg-secondary);
  --segment-active: var(--surface);
}
:root[data-theme="dark"] {
  --collect-glow: var(--rarity-color, var(--accent-primary));
  --collect-glow-soft: color-mix(in oklch, var(--rarity-color, var(--accent-primary)) 28%, transparent);
}
```

---

## 2. 组件架构（registry 驱动、可复用、可扩展）

> 核心思想：视图层不认识「具体游戏」，只认识 `collectionRegistry` 描述的结构。新增「游戏类型 / 收集品类」只改数据，不改组件。

### 2.1 数据层 — `collectionRegistry`（新增概念，纯数据 + 纯函数）
```js
// src/renderer/games/collectionRegistry.js
export const COLLECTION_TYPES = {
  allPlatforms: {
    id: "allPlatforms",
    label: "全平台图鉴",
    icon: "🎮",                       // 原型占位；落地时换单色 SVG
    accent: "var(--accent-primary)",
    // 目录：可收集项的「全集」（图鉴来源）。来自 wishlist + 推荐目录合并
    catalog: (wishlist, catalogSource) => [...],
    rarityTiers: DEFAULT_RARITY_TIERS,
    // 进度度量：已收集 / 总数
    progress: (collected, total) => ({ collected, total, pct: total ? collected/total : 0 }),
  },
  steamPicks: { id: "steamPicks", label: "Steam 精选", icon: "💻", accent: "var(--brand-steam)", ... },
  epicFree:   { id: "epicFree",   label: "Epic 限免",  icon: "🎁", accent: "var(--brand-epic)",   ... },
};
```
视图通过 `COLLECTION_TYPES[activeType]` 取配置 → 渲染目录、稀有度档、进度口径。**加一个新类型 = 加一个对象，组件不动。**

### 2.2 组件树（统一交互模式）
```
CollectionPage                 // 收藏视图根（接 registry）
├─ CollectionHeader            // 标题 + CompletionRing + 统计(已收集/总数/稀有度分布) + 类型切换
├─ CollectionToolbar           // 搜索 + 状态筛选(all/collected/uncollected) + ViewToggle(网格/列表) + 主题
├─ CollectionRail              // 分类筛选栏（收藏夹/标签，带目标进度条）—— 复用 CollectionSidebar 范式
├─ CollectibleGrid / CollectibleList   // 同一数据，两种布局（ViewToggle 切换）
│   └─ CollectibleCard         // 已收集(鲜活+稀有度微光) / 未收集(ghost+锁)
│        ├─ rarity ring/glow
│        ├─ CollectButton（收集/取消，触发动画+触觉+toast）
│        └─ CardMenu（备注/评分/稀有度/标签/合并 —— 复用现有 CardMenu）
├─ CompletionRing              // SVG 环形进度（双编码：环 + 百分比）
├─ RarityDistribution          // 稀有度分布条（复用 StatsOverview 分布）
├─ UnlockToastStack            // 解锁成就/徽章的 toast（游戏感动效）
└─ EmptyState / SkeletonGrid    // 三态齐全，复用现有 games-state / skeleton
```

### 2.3 复用与新增清单
| 复用（已存在，不改语义） | 新增 / 调整 |
|---|---|
| `GameCard` 的缩略图/平台左条/备注评分菜单/`CardMenu` | `GameCard` 增加 `collected`/`rarity` 视觉层 + `CollectButton` |
| `CollectionSidebar`（收藏夹/标签 + 目标进度） | 升为 `CollectionRail`，接 registry 的类型切换 |
| `StatsOverview`（总数/总值/稀有度分布） | 新增 `CompletionRing`、状态筛选 `all/collected/uncollected` |
| `ProgressBar` | 直接复用于收藏夹目标 + 解锁进度 |
| `badges.js` / `achievementsEngine.js` / `eventsEngine.js` | 直接复用：解锁 → `UnlockToastStack` |
| `gamesStore` 的 `wishlist`/`folders`/`tags`/`rarityTiers`/`setEntryRarity` | 新增 `activeCollectionType` 信号 + `collectionRegistry.js` |

---

## 3. 统一交互模式

### 3.1 收集闭环（核心仪式感）
1. 未收集卡显示 **ghost + 锁 + 「收集」按钮**。
2. 点击「收集」→ 卡牌 `is-collecting` 动画（缩放回弹 + 稀有度光晕迸发 + 对勾浮现）→ 落定为已收集鲜活态。
3. 同步：`navigator.vibrate?.(12)`（移动端触觉，**桌面静默无副作用**）；更新进度环与计数（`aria-live="polite"`）。
4. 若本次收集触发阈值（如「传说」达成 / 满 10 款）→ 顶部滑入 `UnlockToast`（成就/徽章名 + 图标 + 微光）。
5. 全部 `prefers-reduced-motion` 下退化为瞬时态，无动画、无振动。

### 3.2 视图切换（网格 ⇄ 列表）
`ViewToggle`（分段控件，`role="tablist"`/`aria-pressed`）切换 `CollectibleGrid` / `CollectibleList`。列表态：缩略图缩为左 64px 方图，信息横排，稀有度以色块+文字，适合大目录快速扫读。

### 3.3 分类筛选（统一语义）
`CollectionRail` 与现有 `CollectionSidebar` 同构：全部 / 收藏夹（含 `count/target` 进度条）/ 标签（含已收数）。点选即筛选，激活态统一为「实心填充」（`--accent-primary` 反白），与平台 Tab 同一选中语言。

---

## 4. 进度可视化系统

| 维度 | 组件 | 表达 |
|------|------|------|
| 总完成度 | `CompletionRing`（SVG 环）+ 数字 `%` | 双编码，环用 `stroke-dashoffset`，尊重主题色 |
| 已/未收集 | `CollectibleCard` 双态 | 已收集鲜亮 + 稀有度微光；未收集 ghost + 锁 |
| 稀有度 | `RarityDistribution` 条 + 卡角标 + 卡发光描边 | 颜色复用 §1.2 稀有度令牌 |
| 分类目标 | `CollectionRail` 进度条 | 收藏夹 `count/target` 复用 `ProgressBar` |
| 成就/徽章 | `UnlockToastStack` + `BadgeWall`/`AchievementsPanel` | 解锁时游戏化 toast |

---

## 5. 游戏感动效 & 触觉反馈（克制、可降级）

| 动效 | 实现 | 降级 |
|------|------|------|
| 收集回弹 | `transform: scale()` + `cubic-bezier(.34,1.56,.64,1)`（弹性） | reduced-motion → 无 |
| 稀有度光晕迸发 | 卡 `::after` 径向 `box-shadow` 关键帧 | reduced-motion → 静态描边 |
| 稀有度微光（传说） | 极轻 `box-shadow` 呼吸（仅 legendary，周期 4s） | reduced-motion → 关 |
| 解锁 toast | 从顶部 `translateY` + 淡入，停留 2.6s 后滑出 | reduced-motion → 直接出现/消失 |
| 触觉反馈 | `navigator.vibrate?.(12)`（守卫，桌面无操作） | 不支持则跳过 |

**性能**：仅动 `transform`/`opacity`/`box-shadow`（GPU 友好）；毛玻璃（`backdrop-filter`）沿用现有滚动去 blur 策略（`.is-scrolling` 时关）；`contain: layout style paint` 加在卡片容器。

---

## 6. 响应式策略

| 断点 | 布局 |
|------|------|
| `≥1024px` | Rail（左 240px）+ Main（网格 `auto-fill minmax(180px,1fr)`） |
| `640–1023px` | Rail 收为顶部横向 chips；网格 `minmax(160px,1fr)` |
| `<640px` | Rail 抽屉/折叠；网格单列或双列；Toolbar 纵向堆叠；进度环与统计并排紧凑；footer 左对齐防溢出 |

网格列宽复用现有 `clamp(160px, 22vw, 220px)`，列表态固定行高。所有触控 ≥44px。

---

## 7. 可扩展性（新增游戏类型 / 收集品类）

新增一个游戏类型或收集品类，**只需在 `collectionRegistry.js` 注册一项**：
```js
export const COLLECTION_TYPES = {
  // …既有…
  switchExclusives: {
    id: "switchExclusives", label: "Switch 独占", icon: "🎮",
    accent: "var(--brand-switch)",
    catalog: (wishlist) => wishlist.filter(e => e.platform === "switch"),
    rarityTiers: DEFAULT_RARITY_TIERS,
  },
};
```
- 视图层（`CollectionPage`/`CollectibleCard`/`CompletionRing`）对类型**无硬编码**，全部经 registry 取配置。
- 稀有度档位可每类型自定义（覆盖 `DEFAULT_RARITY_TIERS`）。
- 进度口径（`progress` 函数）可每类型自定义（按数量 / 按价值 / 按成就）。
- 主题/令牌/动效全站共享，新增类型自动获得统一视觉与游戏感。

---

## 8. Phase 2 落地文件映射（确认后实施）

| 文件 | 改动 |
|------|------|
| `src/renderer/games/collectionRegistry.js` | **新建**：类型注册表 + 目录/进度纯函数 |
| `src/renderer/games/gamesStore.js` | 新增 `activeCollectionType` 信号 + `setCollectionType`；收藏动作接触觉/解锁钩子 |
| `src/renderer/games/CollectionPage.jsx` | 接 registry，组合 Header/Toolbar/Rail/Grid\|List |
| `src/renderer/games/CollectionHeader.jsx` | **新建**：标题 + CompletionRing + 统计 + 类型切换 |
| `src/renderer/games/CompletionRing.jsx` | **新建**：SVG 环形进度 |
| `src/renderer/games/CollectionToolbar.jsx` | **新建**：搜索 + 状态筛选 + ViewToggle |
| `src/renderer/games/CollectibleCard.jsx` | **新建**（或 `GameCard` 扩展）：双态 + 稀有度微光 + CollectButton |
| `src/renderer/games/CollectibleGrid.jsx` / `CollectibleList.jsx` | **新建**：同数据双布局 |
| `src/renderer/games/CollectionRail.jsx` | 由 `CollectionSidebar` 升级，接类型切换 |
| `src/renderer/games/UnlockToastStack.jsx` | **新建**：解锁 toast（接 badges/achievements 引擎） |
| `src/renderer/games/games.css` | 新增 §1.2 令牌 + 收集/ghost/ring/toast/view-toggle 样式 |
| `tests/renderer/collection-*.test.jsx` | 新增 registry / 收集闭环 / 视图切换 / 进度计算单测 |

**零新增依赖、零新增 IPC、无网络出口**（延续 P1 硬约束）；单测基线（1355）不回退。

---

## 9. 验收清单（Design QA）
- [ ] 浅/深主题下所有收藏专属色满足 WCAG AA（4.5:1 文字 / 3:1 UI），无裸 hex
- [ ] 网格 ⇄ 列表切换功能 + 焦点/键盘可达（`role`/`aria` 完整）
- [ ] 已收集 / 未收集双态对比强烈且可扫读
- [ ] 收集动作：动画 + （移动端）触觉 + 进度环/计数更新 + 解锁 toast，桌面静默无副作用
- [ ] `prefers-reduced-motion` 下全部动效降级、无振动
- [ ] 窄屏（<640px）无横向溢出、Toolbar 可操作、Rail 可用
- [ ] 新增一个 collection 类型仅改 registry，视图层零改动

---

## 10. 数据契约 / 集成映射（真实数据模型对齐）

> 本节基于对现有源码的核查（`src/renderer/games/*`、`docs/design-games-collection-p1.md`），明确 `collectionRegistry` 如何对接**真实**游戏数据。凡标注「⚠️ 纠正」者，均为对早期假设的修正。

### 10.1 关键纠正（务必先读）
- **不存在 `collected` / `owned` 布尔旗标**。在真实模型里，`wishlist` 信号（gamesStore `wishlist` L110）**本身就是「已收集」集合**：某条目在 wishlist 中 = 已收集；不在 = 未收集。本设计系统的「已收集 / 未收集」双态，其语义落点为 **`catalog`（图鉴全集）与 `wishlist`（已收集子集）的差集**。
- **不存在 `releaseDate` 字段**，也不存在 `group` 独立字段——`group` 等价于 `folderId`（按收藏夹归类）。
- **「事件引擎」不是 pub/sub 发射器**：`eventsEngine.js` 的 `evaluateEvents(entries, configs, prev, now)` 是限时**活动**求值纯函数，输出 `{[id]:{claimed, completed, progress}}`。全应用唯一的真实订阅触发点是 gamesStore `initCollectionEngines`（L1372）里的 `effect()` 监听 `wishlist` 信号变更后重算三引擎。
- **全局「完成度 %」不存在**：百分比仅出现在两处——`folder.target` 进度、成就/活动 `current/threshold`。因此本系统的完成度环 / 里程碑必须挂在 `collectionRegistry` 的 `progress()` 钩子上按「类型维度」计算，而非假设存在全局字段。

### 10.2 字段映射表

| collectionRegistry 概念 | 真实数据源（文件 / 信号） | 对接说明 |
|---|---|---|
| `type.catalog()` 输入 `wishlist` | `wishlist` signal（gamesStore L110） | 已收集条目集合（WishlistEntry[]） |
| `type.catalog()` 输入 `catalogSource` | 可选外部目录（如 Steam 库 / 已知游戏库） | 原型用 `CATALOG` 模拟；真实可接 catalogSource |
| 条目 `id / title / platform / rarity / rating / tags / folderId` | `WishlistEntry`（types.js `normalizeEntry` L80）同名/同义字段 | **直接复用**，零转换 |
| 条目 `thumb` | `WishlistEntry.thumb`（string\|null） | 落地时接缩略图；为空走品牌色块兜底（保持 no-external-asset） |
| 条目 `rarity` | `WishlistEntry.rarity`（string\|null，存档位 id 如 `"legendary"`） | null = 未分级 |
| `collected` 标志 | 由 `wishlist` 中是否含该条目 id 推导 | **无独立布尔**；收集动作 = 写入 wishlist |
| `rarityTiers` | `rarityTiers` signal（DEFAULT_RARITY_TIERS，rarityTiers.js L22） | 顺序 common(1)→rare(2)→epic(3)→legendary(4)，用户可 CRUD |
| 稀有度色 | 档位 `color`：common=`--text-secondary`、rare=`--color-success`、epic=`--color-info`、legendary=`--color-warning` | ⚠️ 与 §1.2 新增的 `--rarity-*` 令牌需**对齐**：建议 §1.2 令牌改为指向这些既有变量（`--rarity-common: var(--text-secondary)` 等），避免双源漂移 |
| `progress(collected, total)` | 按类型维度算 `pct` | 真实无全局 %；里程碑挂此输出 |
| 解锁 `badges` | `badgesEarned` signal（badges.js `evaluateBadges` L164） | 8 条内置规则 `{id,name,desc,icon,test(ctx)}`，派生于条目上下文 |
| 成就 | `achievementsProgress` signal（achievementsEngine.js `evaluateAchievements`） | 维度∈`tag\|folder\|platform\|rarity\|merged`，`current≥threshold` 即解锁 |
| 活动 | `eventsProgress` signal（eventsEngine.js `evaluateEvents`） | 限时窗口 `[startAt,endAt]`，`isEventActive` 判定 |
| 分类 `folder` | `folders` signal（types.js `normalizeFolder` L132：`{id,name,target,createdAt,order}`） | 条目经 `entry.folderId === folder.id` 关联 |
| 分类 `tag` | `tags` signal（types.js `normalizeTag` L152：`{id,name,createdAt}`） | 条目经 `entry.tags[]` 存**标签名**（筛选用 `tag.name`） |
| 当前筛选 | `activeCollectionFilter` signal（`{type:'folder'\|'tag'\|null, id}`） | 侧栏点选即写此信号 |
| 目标进度 | `folder.target` + 该 folderId 条目计数 | 复刻 CollectionSidebar L30：`pct=round(count/target*100)` |
| 统计 | `computeCollectionStats`（types.js L251）→ `{total,totalValue,totalSaved}` | 合并条目按 `mergedMembers` 展开 |

### 10.3 示例注册项（对齐真实字段）

```js
// collectionRegistry.js —— 接真实信号，而非 mock
import { wishlist, folders, tags, rarityTiers, badgesEarned,
         achievementsProgress, eventsProgress } from "../gamesStore.js";
import { DEFAULT_RARITY_TIERS } from "./rarityTiers.js";
import { computeCollectionStats } from "./types.js";

export const COLLECTION_TYPES = {
  allPlatforms: {
    id: "allPlatforms",
    label: "全平台图鉴",
    icon: "🎮",
    accent: "var(--accent-primary)",
    // catalog：图鉴全集 = 已收集(wishlist) ∪ 未收集(catalogSource 差集)
    catalog: (wishlistItems, catalogSource = []) => {
      const have = new Set(wishlistItems.map(e => e.id));
      const source = [...wishlistItems.map(toCollectible),
                      ...catalogSource.filter(g => !have.has(g.id)).map(toCollectible)];
      return source;
    },
    rarityTiers: DEFAULT_RARITY_TIERS,   // 复用用户可 CRUD 的档位
    // 完成度：按本类型维度计算（真实无全局 %）
    progress: (collected, total) => ({ collected, total, pct: total ? collected / total : 0 }),
  },
  // 新增类型：仅加一项，视图层零改动（见 §7）
};

// WishlistEntry → Collectible 的纯映射（字段直接对接 10.2）
function toCollectible(e) {
  return {
    id: e.id, title: e.title, platform: e.platform,
    rarity: e.rarity ?? "common", rating: e.rating ?? 0,
    tags: e.tags ?? [], folderId: e.folderId ?? null,
    collected: /* 由 wishlist 推导，无独立布尔 */ true,
  };
}
```

### 10.4 Phase 2 集成注意
- 收集动作在真实实现中是「写入 `wishlist` 信号」；`effect()` 会自动重算 badges/achievements/events 三引擎 → 解锁 toast 直接订阅 `badgesEarned` 变化即可，无需自建事件总线。
- 价格相关展示复用既有 `addedPrice / currentPrice / currentCurrency / currency` 与 `savedOf`（types.js L237），不新增价格字段。
- 复用既有埋点 `metrics`（`wishlist.add` / `rarity.set` 等）承载收集行为统计，避免新增遥测键。

---

## 11. 体验状态（空 / 加载 / 错误 / 里程碑）

> 这四种态在真实 App 中必现，Phase 1 原型与文档此前未覆盖。统一处理规范如下。

### 11.1 空收藏态（Empty）
- **触发**：当前类型 / 筛选下 `catalog` 结果为空（如新建收藏夹尚无条目）。
- **组件**：`CollectionEmpty` —— 居中图标（🗂️）+ 标题「这个图鉴还是空的」+ 副文案（引导去收集）+ 主按钮「去添加」（`btn--primary`）。
- **可达性**：容器 `role="status"`；按钮 `min-height:44px`。

### 11.2 加载骨架（Loading）
- **触发**：`catalogSource` 异步拉取 / 首屏渲染前。
- **组件**：`CollectibleSkeleton` × N（与卡片同尺寸），`shimmer` 动画（`@keyframes shimmer` 渐变位移）。
- **降级**：`prefers-reduced-motion` / `data-reduced-motion` 下 shimmer 静止为静态低对比底色。
- **数量**：网格按当前列数渲染 8–12 个骨架，避免布局跳动（CLS）。

### 11.3 错误态（Error）
- **触发**：`catalogSource` 拉取失败 / 解锁引擎（`evaluateBadges` 等）抛错被 `try/catch` 兜住。
- **组件**：`CollectionError` —— 警告图标（⚠️）+ 「加载失败了」+ 原因（脱敏）+ 「重试」按钮（调用数据源重试）。
- **原则**：错误不阻断已收集内容的展示；仅错误区块替换列表区，Header/Rail 保持可用。

### 11.4 里程碑庆祝（Milestone）
- **触发**：`progress().pct` 跨越 **25% / 50% / 75% / 100%** 阈值（仅在「未→已」方向跨越时庆祝，去重）。
- **组件**：`MilestoneCelebration` —— 全屏轻量遮罩（半透明 + 中心奖章卡）+ 撒落光点（CSS `@keyframes` 粒子，无外部资源）+ 文案「🎉 全平台图鉴完成度 50%！」。2.4s 后自动消散，可点击关闭。
- **动效克制**：光点数量 12–16、幅度小；`prefers-reduced-motion` 下仅显示静态奖章卡 + 文案，无粒子。
- **关联**：与解锁 toast 并存不冲突（badge 是「成就达成」，milestone 是「进度跨越」），二者经 `aria-live` 分别播报。

---

## 12. 无障碍实现规范（WCAG AA，实测可降级）

> §9 仅列验收项，本节给出**可落地的实现契约**，原型中已实测（见交互原型顶栏「无障碍」开关）。

### 12.1 键盘导航
- 卡片为可聚焦单元：`role="article"` + `tabindex="0"`；**Enter / Space** 触发收集/取消（与鼠标 `click` 同路径 `toggleCollect`）。
- 类型切换 `role="tablist"` / `tab` + `aria-selected`；视图切换 `role="tablist"` + `aria-pressed`；筛选 chips `role="group"`。
- 焦点顺序：类型 → 视图/主题 → 侧栏（收藏夹/标签）→ 工具栏（搜索/状态）→ 卡片网格。保持 DOM 顺序与视觉一致。

### 12.2 屏幕阅读器播报
- 收集/取消动作写入**独立 `aria-live="polite"` 视觉隐藏区**：`已收藏《Hades II》` / `已取消收藏《Hades II》`。
- 解锁 toast 容器 `aria-live="polite"` + `role="status"`；里程碑遮罩 `role="alert"`（断言级，读屏必播）。
- 完成度环旁 `cl-ring-label` 含可读文本 `已收集 9 / 16`，SVG 环 `aria-hidden="true"`（避免读屏重复）。

### 12.3 焦点管理
- 统一焦点环：`--focus-ring`（color-mix 主题感知），所有交互控件 `:focus-visible` 应用，offset 2px。
- 视图/类型切换后**焦点不丢失**：切换按钮保持 `:focus`，不强行 `focus()` 跳走。
- 错误态「重试」按钮获得焦点（error 出现后 `focus()` 到重试键），便于键盘用户立即操作。

### 12.4 动效降级（实测开关）
- 原型顶栏提供 **「动效」开关**，写 `html[data-reduced-motion="true"]`；CSS 用
  `@media (prefers-reduced-motion: reduce), [data-reduced-motion="true"]` 双条件禁用全部 `animation`/`transition`。
- 降级时：`collect-pop`/`glow-burst`/`rarity-breathe`/`shimmer`/里程碑粒子**全部静止**；`navigator.vibrate` 守卫跳过（桌面本就静默）。
- 文案缩放：所有字号用 `rem`，支持浏览器 200% 缩放不破版。

---

## 13. 多类型皮肤派生（统一游戏类型 UI 的可扩展性证明）

> 用户核心诉求是「不同游戏类型一套 UI」。同一套组件 + 同一套令牌，**仅覆写少量视觉变量**即可派生出风格迥异的皮肤，证明系统可扩展而不分裂。

### 13.1 皮肤机制
- 皮肤 = 一组**令牌覆写**，挂在 `html[data-skin="<id>"]` 上，仅改：强调色相、圆角、发光强度、字体气质、缩略图处理。
- **布局 / 间距 / 组件结构 / 交互逻辑完全不变** —— 这是「统一」的硬约束。

### 13.2 三套示范皮肤（原型可切换）
| 皮肤 id | 气质 | 关键覆写 |
|---|---|---|
| `minimal`（默认） | 克制原生、Apple 风 | 圆角 10–14px、`--glow-intensity:0.22`、系统字体、缩略图柔和渐变 |
| `neon`（霓虹街机） | 街机厅、赛博 | 圆角 16px、强调色相偏移至品红/青、`--glow-intensity:0.6`、缩略图高饱和霓虹渐变、卡片悬停发光 |
| `retro`（复古像素） | 8-bit、怀旧 | 圆角 0、硬边框、`--glow-intensity:0`、等宽像素字体、缩略图纯色块 + 像素描边、无渐变 |

### 13.3 落地建议
- 皮肤变量集中在 `games.css` 的 `[data-skin="..."]` 块；新增皮肤 = 加一个块，**不改任何组件**。
- 皮肤与「类型」正交：同一 `allPlatforms` 类型可套任意皮肤（如「复古像素」版全平台图鉴）。
- 默认跟随系统 `prefers-color-scheme`；用户可在设置里固定皮肤。

---

## 14. Phase 2 落地状态（2026-07-22 · 首切片已实现）

> 已落地一个**可运行、可测试、零回归**的垂直切片，验证 §7「数据驱动可扩展」架构真实可行。

### 14.1 已新建 / 修改文件
| 文件 | 状态 | 说明 |
|------|------|------|
| `src/renderer/games/collectionRegistry.js` | **新建** | 类型注册表 + 纯函数（catalogOf/progressOf/rarityDistribution/rarityCoverage/targetCoverage/crossedMilestones/isRanked/clampPct）。零 store 依赖，可单测。 |
| `src/renderer/games/gamesStore.js` | **修改** | 增量：import registry；新增 `activeCollectionType` / `collectionView` 信号 + `setCollectionType` / `setCollectionView`；`deriveCollectionView()` 选择器（类型→筛选→搜索→稀有度排序串联）；re-export 纯函数。未改任何既有逻辑。 |
| `src/renderer/games/CompletionRing.jsx` | **新建** | SVG 完成度环（role=img + aria-label，reduced-motion 降级）。 |
| `src/renderer/games/CollectibleCard.jsx` | **新建** | 双态卡片（已分级微光 / 未分级 ghost）+ 键盘可达收集按钮 + ⋯ 复用 NoteRatingModal。 |
| `src/renderer/games/CollectionHeader.jsx` | **新建** | 类型切换（注册表驱动）+ 完成度环 + 稀有度分布 + 视图切换 segmented。 |
| `src/renderer/games/CollectionView.jsx` | **新建** | 视图容器：组合 Header + 网格/列表双布局，接 `toggleFavorite` / `openNoteRating`。 |
| `src/renderer/games/GamesPage.jsx` | **修改** | wishlist 模式旧 `games-grid(GameCard)` 替换为 `<CollectionView />`（侧栏/统计/徽章墙等保留）。 |
| `src/renderer/games/games.css` | **修改** | 追加 §1.2 风格令牌与组件样式（全 oklch / var / color-mix，禁裸 hex，尊重 prefers-reduced-motion）。 |
| `tests/renderer/collection-registry.test.js` | **新建** | 注册表纯函数单测（node 环境）。 |
| `tests/renderer/collection-components.test.jsx` | **新建** | CompletionRing / CollectibleCard / CollectionView 渲染与交互（happy-dom）。 |

### 14.2 关键语义落地（对齐 §10 纠正）
- **完成度口径**：真实无 master catalog，故 `progress` 取两种真实可达口径——① 稀有度分级覆盖（已分级/总数）；② 文件夹目标覆盖（条目数/target）。`all` 类型 = 分级覆盖；`unranked` 类型 = 反相（清零未分级项）；`legendary` 类型 = 仅传说档位。
- **收集动作**：卡片收集按钮接 `toggleFavorite`（写/移 wishlist），`effect()` 自动重算 badges/achievements/events → 现有引擎无需改动即联动。
- **类型扩展证明**：注册表已含 all / 5 平台 / 待分级 / 传说 共 8 类，新增类型 = 加一项，组件零改动（CollectionHeader 自动出现新入口）。

### 14.3 验证结果
- `npm run build:renderer`：esbuild 通过，新文件正常打包。
- `npx vitest run`：**460 文件 / 4751 通过 / 4 跳过，零回归**（含 2 个新测试文件 27 例）。

### 14.4 后续可选（未在本切片范围）
- 窄屏 Rail 抽屉化（当前收藏侧栏在窄屏已自适应，未做抽屉）。
- 解锁庆祝 / 里程碑 / 多皮肤 / 骨架 / thumb —— **已于 Phase 2.5 落地，见 §15**。

---

## 15. Phase 2.5 落地：解锁庆祝 / 里程碑粒子 / 多皮肤 / 加载骨架 / 真实 thumb

用户确认的后续五项增强，已全部落地并验证（2026-07-22）。

### 15.1 新增 / 修改文件
| 文件 | 状态 | 说明 |
|------|------|------|
| `src/renderer/games/gamesStore.js` | **修改** | 新增信号 `unlockToasts` / `milestoneFx` / `collectionSkin` / `collectionLoading`；纯函数 `computeUnlocked` / `detectNewUnlocks` / `currentCompletionPct`；动作 `setCollectionSkin` / `pushUnlockToast` / `dismissUnlockToast` / `clearMilestoneFx`；`setCollectionType`/`setCollectionView` 触发 280ms 加载态；`initCollectionEngines` 追加「解锁检测」+「里程碑检测」两个 effect（首次运行仅建基线，不弹窗/不喷粒子）。 |
| `src/renderer/games/UnlockToastStack.jsx` | **新建** | 解锁庆祝 toast 栈：读取 `unlockToasts`，`role=status` + `aria-live=polite` 播报，4s 自动消失 / 手动关闭，reduced-motion 关滑入。 |
| `src/renderer/games/MilestoneFx.jsx` | **新建** | 里程碑粒子动效：越过 25/50/75/100% 喷 16 颗粒子 + 中心文案，1.4s 自动清除；reduced-motion 转静态横幅。 |
| `src/renderer/games/CollectionView.jsx` | **修改** | `data-skin` 驱动多皮肤；`collectionLoading` 空态下展示骨架；挂载 `UnlockToastStack` + `MilestoneFx`；`reducedMotion` 透传至卡片/环/FX；渲染层对非法 skin 自动回退 minimal。 |
| `src/renderer/games/CollectionHeader.jsx` | **修改** | 新增 `SkinToggle`（极简/霓虹/复古）；`reducedMotion` 透传至完成度环。 |
| `src/renderer/games/CollectibleCard.jsx` | **修改** | 新增 `CollectibleThumb` 子组件：真实 `entry.thumb` 接入 + `onError` 回退 emoji 占位（底色取稀有度色派生），与 `GameCard.GameThumb` 一致。 |
| `src/renderer/games/games.css` | **修改** | 追加 `.skin-toggle`、`.unlock-toast*` + 滑入关键帧、`.milestone-fx*` + 粒子/弹入关键帧、`.collectible-card.is-skeleton` + shimmer 关键帧、`[data-skin=neon]` / `[data-skin=retro]` 气质覆写；`prefers-reduced-motion` 降级全部动效。全 oklch / var / color-mix，禁裸 hex。 |
| `tests/renderer/collection-fx.test.jsx` | **新建** | 解锁/里程碑纯函数 + 引擎 effect 异步（toast / 粒子）+ 骨架渲染 + 皮肤 data-skin + thumb 渲染与容错 + 皮肤按钮。12 例。 |
| `tests/renderer/collection-components.test.jsx` | **修改** | `resetAll` 重置新信号（collectionSkin / collectionLoading / unlockToasts / milestoneFx）。 |

### 15.2 关键设计点
- **解锁庆祝**：订阅 wishlist，复用既有 `evaluateBadges` / `evaluateAchievements` / `evaluateEvents` 求「已点亮集合」，与上一拍 diff，新解锁项推 toast（徽章名 / 成就名 / 活动标题）。首次运行仅建基线，避免挂载即刷屏。
- **里程碑**：`currentCompletionPct()` 复用 `deriveCollectionView` 完成度口径（含文件夹目标），越过 `type.milestone` 阈值（默认 25/50/75/100%）置 `milestoneFx`，组件喷粒子。
- **多皮肤**：`[data-skin=...]` 仅覆写收藏视图子树的「气质变量」（霓虹：青色辉光 + 环形/卡片描边；复古：等宽字体 + 硬边 + 位移投影），基础令牌与其余模块不受影响，新增皮肤 = 加一段 CSS。
- **加载骨架**：类型/视图切换触发 280ms `collectionLoading`；空态下展示 8 张 shimmer 骨架，非空切换不遮挡内容（避免闪烁/误伤既有测试）。
- **真实 thumb**：`entry.thumb`（来自 deals 收藏时写入）直接渲染，`onError` 优雅降级为 emoji，绝不破版。

### 15.3 验证结果
- `npm run build:renderer`：esbuild 通过，新文件正常打包。
- `npx vitest run`：**461 文件 / 4763 通过 / 4 跳过，零回归**（含 `collection-fx.test.jsx` 12 例 + `collection-components.test.jsx` 微调）。

---

## 16. Phase 2.6 落地：窄屏侧栏抽屉 + 解锁历史面板

Phase 2.5 收尾时列出的两条「后续可选」已全部落地并验证（2026-07-22）。

### 16.1 新增 / 修改文件
| 文件 | 状态 | 说明 |
|------|------|------|
| `src/renderer/games/gamesStore.js` | **修改** | 新增信号 `collectionSidebarOpen` / `unlockHistoryOpen` / `unlockHistory`；动作 `setCollectionSidebarOpen` / `toggleCollectionSidebar` / `setUnlockHistoryOpen` / `toggleUnlockHistory` / `clearUnlockHistory` / `pushUnlockHistory`；`UNLOCK_HISTORY_KEY` + `loadUnlockHistory` / `_persistUnlockHistory`；解锁检测 effect 在推 toast 同时 `pushUnlockHistory`。 |
| `src/renderer/games/GamesLayout.jsx` | **修改** | mount 时 `loadUnlockHistory()`。 |
| `src/renderer/games/GamesPage.jsx` | **修改** | `collection-layout` 加抽屉 toggle（☰ 分类）+ overlay + `is-drawer-open` 类；Esc 关闭抽屉。 |
| `src/renderer/games/CollectionSidebar.jsx` | **修改** | `<aside>` 加 `id="collection-sidebar"`（供抽屉 `aria-controls` 锚定）。 |
| `src/renderer/games/CollectionHeader.jsx` | **修改** | 头部 controls 加「🏆 历史」按钮（打开 `unlockHistoryOpen`）。 |
| `src/renderer/games/UnlockHistoryPanel.jsx` | **新建** | 解锁历史面板：`role=dialog` + `aria-modal`；列表（最新在前，含类别徽标 + 相对时间）；空态引导；遮罩点击 / ✕ / Esc 关闭。 |
| `src/renderer/games/CollectionView.jsx` | **修改** | 挂载 `UnlockHistoryPanel`。 |
| `src/renderer/games/games.css` | **修改** | 追加 `.collection-drawer-toggle` / `.collection-drawer-overlay`（桌面隐藏）+ `@media(max-width:720px)` 下侧栏 off-canvas 抽屉（translateX + visibility + 遮罩）+ `.unlock-history*` 面板样式；`prefers-reduced-motion` 降级抽屉动效。全 oklch / var / color-mix，禁裸 hex。 |
| `tests/renderer/collection-fx.test.jsx` | **修改** | resetAll 补 `collectionSidebarOpen`/`unlockHistoryOpen`/`unlockHistory`；新增解锁历史 3 例（引擎写入 + 面板空态/列表/关闭态）+ 历史按钮断言。 |
| `tests/renderer/collection-components.test.jsx` | **修改** | resetAll 补新信号；新增 `CollectionSidebar` 拥有 `id=collection-sidebar` 测试。 |

### 16.2 关键设计点
- **窄屏抽屉**：桌面端 `collection-layout` 维持双栏、侧栏常显；≤720px 时侧栏变 `position:fixed` off-canvas（translateX(-100%) + visibility:hidden 移出 tab 序），toggle 显形、点开弹遮罩，`is-drawer-open` 滑入；Esc / 点遮罩关闭；桌面端 Toggle/Overlay `display:none` 完全不干扰宽屏。
- **解锁历史**：复用 Phase 2.5 的解锁检测 diff，新解锁项**同时**推 toast 与写入 `unlockHistory`（上限 50、持久化 localStorage）；面板按时间倒序展示徽章/成就/活动，空态有引导文案；与庆祝 toast 互不阻塞（toast 4s 即消，历史常驻可回看）。

### 16.3 验证结果
- `npm run build:renderer`：esbuild 通过。
- `npx vitest run`：**461 文件 / 4767 通过 / 4 跳过，零回归**（Phase 2.6 净增 4 例：历史写入 + 面板 3 例 + 侧栏锚点 1 例）。

---

_UI Designer · 像素君 · 2026-07-22（Phase 2.6：窄屏侧栏抽屉 + 解锁历史面板）_
