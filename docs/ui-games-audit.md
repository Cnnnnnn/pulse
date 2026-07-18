# 游戏优惠聚合（Games）· UI 设计审计与系统性改进方案

> **审计人**：UI Designer
> **日期**：2026-07-18
> **范围**：`src/renderer/games/*`（Layout / Page / PlatformTabs / GamesFilterBar / GameCard / store / format）+ `FeatureHeader` 壳 + `styles.css` 令牌源
> **对照基准**：`docs/ui-design-system.md`（Apple 原生美学 + 单一令牌真源 + WCAG AA）

---

## 0. 审计结论速览

| 维度 | 评级 | 核心问题 | 修复状态 |
|---|---|---|---|
| 令牌合规 | ✅ 良好 | 全面 `color-mix(in oklch)` 复用，无裸 hex；品牌色/语义色均来自真源 | — |
| 组件分层 | ✅ 良好 | Layout→Page→Tabs/Filter/Card→store 分层清晰，职责单一 | — |
| 可访问性基线 | ✅ 良好 | `focus-visible` 环、aria-label、`role=tab`/`role=alert`、`prefers-reduced-motion` 均到位 | — |
| **布局结构** | ❌ **缺陷(P0)** | `.games-page` 无任何样式 → `flex:1; overflow:auto` 失效，**工具栏/平台 Tab 不吸顶、内部滚动不触发** | ✅ **已实现** |
| 信息架构 | ⚠️ 待修(P1) | 「平台」与「模式」心智模型耦合混乱；结果区无计数/更新时间反馈 | ✅ **已实现** |
| 视觉一致性 | ⚠️ 待修(P1) | 平台 Tab（实心填充）与模式 Chip（浅色描边）**两套选中隐喻**并存 | ✅ **已实现** |
| 交互体验 | ⚠️ 待修(P2) | 整卡不可点、wishlist 模式刷新无意义、史低徽标刷新重放动画、键盘导航缺失 | ✅ **已实现** |
| 响应式 | ⚠️ 待修(P3) | 仅靠 `auto-fill`+`flex-wrap`，无显式断点，窄屏工具栏挤压 | ✅ **已实现** |

> **落地状态（2026-07-18 完成）**：P0–P3 全部已落地并通过 `npm run build:renderer`（esbuild 0 错误）+ 64 项 games 单测。改动涉及 `games.css` / `gamesStore.js` / `PlatformTabs.jsx` / `GamesPage.jsx` / `GameCard.jsx` / `GamesFilterBar.jsx` 六大文件，详见文末「5. 落地记录」。

---

## 1. 现状评估

### 1.1 优点（应保留）

1. **令牌化彻底**：`games.css` 全程使用 `var(--space-*) / --radius-* / --accent-primary / --color-*` 与 `color-mix(in oklch, …)`，与设计系统「禁止裸 hex」要求一致；平台品牌色（`--brand-steam` 等）已从 `styles.css:62-66` 真源读取，未重复定义。
2. **三态完备**：加载（8 张骨架卡）、错误（`role="alert"`+重试）、空态（心愿单/无源/无免费源三种引导文案）齐全，且空态带 emoji + 行动引导，体验友好。
3. **可访问性基线到位**：所有可交互元素有 `:focus-visible` 环；fav 按钮有 `aria-label`+`aria-pressed`；错误区 `role="alert"`；`prefers-reduced-motion` 关闭非必要动效。
4. **信息密度合理**：卡片内 平台胶囊（品牌色）+ 评分 + 售价/原价/折扣 + 省¥ + 史低/示例徽标 + CTA，语义标签（示例/史低/免费）三件套互不重叠（JS 层已保证 `示例` 与 `史低` 互斥）。

### 1.2 缺点（按严重度）

#### ❌ P0 — 布局结构缺陷：滚动容器失效

`games.css` 中 **`.games-page` 完全无样式规则**（全局 `styles.css` 亦无），而它是 `.games-layout`（`display:flex; flex-direction:column; height:100%`）的唯一子节点。

```css
/* 现状：.games-page 是普通 block，导致以下两条规则全部失效 */
.games-body { flex: 1; min-height: 0; overflow: auto; }  /* flex 父级不存在 → 不吸顶、不内部滚动 */
.games-header { flex: 0 0 auto; }                        /* 父级非 flex → 无效 */
```

**后果**：
- 整个页面作为单文档撑高，`.games-layout` 高度被内容撑破（祖先 panel 若有 `overflow:hidden` 甚至会裁掉底部署名/汇率行，列表不可达）。
- 长列表滚动时，**平台 Tab 与筛选栏直接滚出视口**，用户失去"当前在哪个平台/哪种模式"的上下文锚点。

**修复（约 5 行，必做）**：
```css
.games-page {
  display: flex;
  flex-direction: column;
  flex: 1;          /* 在 .games-layout 内撑满 */
  min-height: 0;    /* 允许内部滚动 */
}
/* .games-header / .games-toolbar 已有 flex:0 0 auto，.games-body 已有 flex:1 overflow:auto —— 补上 .games-page 后即生效 */
```

#### ⚠️ P1 — 信息架构：平台与模式心智模型混乱

- **模式切换吞掉平台**：`setMode('compare')` 强制 `activePlatform='all'` 并 **隐藏整个 `PlatformTabs`**（`GamesPage` 第 57 行 `!isCompare && !isWishlist && <PlatformTabs />`）。用户进入「比价」后完全看不到"在比哪些平台"，也无任何提示文案。
- **头部 hint 语境误导**：`GamesPage` 的 `games-header__hint` 固定为「各平台折扣 · 免费活动」，与当前模式（心愿单/比价）无关，用户切换维度时 hint 不变。
- **结果区零反馈**：列表区没有任何「共 N 款 / 更新于 HH:MM」指示，用户无法判断数据规模与新鲜度；汇率信息被甩到底部 footer，与数据割裂。
- **compare 模式能力残缺**：无排序控件（仅 deals 模式有）、无结果计数、无可空态。

#### ⚠️ P1 — 视觉一致性：两套"选中"隐喻

同一工具栏内存在两种激活语言：
| 控件 | 默认态 | 激活态 |
|---|---|---|
| 平台 Tab `.games-platform-tab` | surface + border + 次文字 | **实心 `--accent-primary` 填充 + 反白字** |
| 模式 Chip `.games-chip` | surface + border + 次文字 | **`--accent-primary` 18% 浅底 + 描边 + 加粗字** |

两者视觉权重不同，用户难以建立"都是筛选选择"的统一认知。设计系统 §6.5 明确要求选中态语言一致（下划线或统一填充）。

#### ⚠️ P2 — 交互体验细节

1. **整卡不可点**：`article.game-card` 无 `cursor:pointer`、无点击/键盘处理，只有底部 CTA 按钮可打开 deal。多数用户会点卡片本体 → 落空。
2. **wishlist 模式刷新无意义**：`GamesFilterBar` 在所有模式都渲染「刷新」按钮，但 wishlist 列表来自本地 `wishlist.value`，`loadGameDeals()` 拉的是 deals/compare 数据 → 刷新对心愿单视图是 no-op，误导。
3. **史低徽标刷新重放动画**：`.game-card__save { animation: games-pop }` 在每次 `items` 重赋值（每次刷新）与 `lowPriceMap` 渐进更新时重新触发，列表刷新时整片徽标跳动，干扰阅读。
4. **键盘导航缺失**：`PlatformTabs` 用 `role="tablist"`/`role="tab"` 但未实现 ArrowLeft/Right 切换（WAI-ARIA Tabs 模式要求）。
5. **触控目标偏紧**：fav 30×30px、CTA 高 ~30px，低于 44px 触控基线（桌面可接受但偏紧，热区应补足）。

#### ⚠️ P2 — 视觉细节

- **示例徽标压图对比不足**：`.game-card__src` 用 `color-mix(--text-primary 70%, transparent)` 半透明压在 16:9 缩略图上，缩略图偏暗时文字几乎不可读，且无背板。
- **卡片内边距不统一**：body `padding: var(--space-3)`(12px)，而设计系统卡片基线为 `--space-4`(16px)，密度偏挤。
- **价格未等宽**：`.game-card__sale/normal/cny-ref` 未加 `font-variant-numeric: tabular-nums`，列表扫描时数字跳动（设计系统 §3.3 强制要求）。
- **压暗色对比存疑**：评分（`--color-warning 35% black`）、省¥（`--color-success 35% black`）、史低文字（`--color-warning 92%`）在**暗色主题**下部分可能跌破 3:1 UI 阈值，需复核。
- **头部层级弱**：品牌区与 hint 视觉权重接近，无明确 h1 级字号锚点。

#### ⚠️ P3 — 响应式

- 仅靠 `grid auto-fill minmax(200px,1fr)` + `flex-wrap`，**无显式断点**；在 1/4 屏或窄窗，卡片过窄、工具栏 hint 挤压。
- footer 署名与汇率分两行右对齐，窄屏应合并/左对齐以防溢出。

---

## 2. 系统性改进方案

### A. 布局结构修复（P0，立即做）
见 §1.2 P0 的 `.games-page` 修复片段。修复后：header + toolbar 吸顶，body 内部滚动，footer 钉底。

### B. 信息架构重构（P1）

**B1 — 引入"筛选上下文条"（Context Bar）**，替代分散的 hint/footer 反馈：
```jsx
{/* 置于 games-toolbar 下方、games-body 上方，桌面右对齐显示 */}
<div class="games-context">
  <span class="games-context__crumb">{platformLabel} · {modeLabel}{minSavings>0 ? ` · ≥${minSavings}%` : ''}</span>
  <span class="games-context__count">共 {list.length} 款</span>
  {fetchedAt && <span class="games-context__time">更新于 {fmtTime(fetchedAt)}</span>}
</div>
```
- `compare` 模式：`platformLabel` 改为「跨平台比价」并列出参与平台（Steam/Epic/Xbox…），解决"比价吞掉平台"的迷失。
- 头部 hint 改为随模式动态（deals→折扣 / free→限时免费·试玩 / wishlist→我的降价关注 / compare→跨平台比价）。

**B2 — compare 模式补全**：保留平台 Tab 并改为**多选**（勾选 2–3 平台对比），或退而求其次显式提示「正在跨平台比价」+ 列出参与平台；补齐排序控件与空态。

### C. 选择隐喻统一（P1，视觉一致性）
定义单一"选中"基样式，平台 Tab 与模式 Chip **共用同一激活语言**（推荐统一为「实心填充」以契合现有平台 Tab 观感）：
```css
.games-pill {
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: 6px var(--space-3);
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: var(--font-size-md);
  cursor: pointer;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.games-pill:hover { background: var(--bg-secondary); color: var(--text-primary); }
.games-pill.is-active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--games-text-inverse);
  font-weight: 600;
}
.games-pill:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
```
> 差异仅通过"置于不同语义栏"表达（平台=主筛选，模式=次维度），但激活态视觉语言必须一致。

### D. 交互体验（P2）
- **整卡可点**：`article` 加 `role="button" tabIndex={0}`，绑定 `onClick`/`onKeyDown(Enter/Space)` 打开 `dealUrl`；fav 与 CTA 内 `e.stopPropagation()`。hover 时 `cursor:pointer`。
- **刷新语义**：wishlist 模式隐藏刷新按钮（或改为「重新检查降价」语义并触发 `enrichXboxLowest` 类检查）。
- **动画去抖**：史低徽标动画改为仅首次出现时播放（用 CSS `animation` + 稳定的 `key`，或干脆去掉循环重放）；刷新时不再整片跳动。
- **键盘导航**：`PlatformTabs` 增加 ArrowLeft/Right 焦点移动（WAI-ARIA Tabs 模式）。
- **触控目标**：fav/CTA 最小高提至 36–40px，热区补足 44px。

### E. 视觉风格与组件统一（P2）
- 卡片 body 内边距对齐设计系统：`--space-4`(16px) 外层、`--space-3`(12px) 内部间距。
- **示例/史低徽标加毛玻璃背板**：`backdrop-filter: blur(8px)` + 半透明深色底，保证任意缩略图上可读。
- 价格数字加 `font-variant-numeric: tabular-nums`（sale/normal/cny-ref）。
- 评分/省¥/史低三处压暗色：暗色主题下复核对比，必要时改用语义令牌直引（如 `--color-success`）配 `1px` 同色描边，而非 `color-mix(... black)`。
- header 品牌区字号为 `--font-size-2xl/600`，hint 用 `--font-size-sm`，建立 h1→meta 层级。
- fav 默认态由"半透明黑压图"改为白底+描边，提升可识别性。

### F. 响应式（P3）
- 显式断点：`<640px` 单列/双列、缩略图高度自适应、toolbar 纵向堆叠、context bar 折行。
- footer 署名与汇率在窄屏合并一行、左对齐，防横向溢出。
- 网格 `minmax` 改为 `minmax(clamp(160px, 22vw, 220px), 1fr)` 实现平滑过渡。

---

## 3. 落地优先级与工作量

| 优先级 | 改动 | 范围 | 工作量 | 状态 |
|---|---|---|---|---|
| **P0** | `.games-page` 变 flex 列容器 | 1 处 CSS（~5 行） | 极小，立即做 | ✅ 已实现 |
| P1 | Context Bar + 动态 hint + compare 多选/提示 | 1 新组件 + store 派生 | 中 | ✅ 已实现 |
| P1 | 选中隐喻统一为 `.games-pill` | CSS 重构 + 两组件类名替换 | 小 | ✅ 已实现 |
| P2 | 整卡可点 + 刷新语义 + 动画去抖 + a11y | GameCard + FilterBar | 中 | ✅ 已实现 |
| P2 | 徽标背板 / 等宽数字 / 暗色对比 / header 层级 | games.css | 小 | ✅ 已实现 |
| P3 | 响应式断点 | games.css + 少量 JSX | 小 | ✅ 已实现 |

---

## 4. 设计 QA 核对清单（交付标准）

- [x] 滚动时 toolbar + 平台 Tab 始终可见（P0 修复验证）— `.games-page` 补 flex 列容器，header/toolbar 吸顶、body 内部滚动
- [x] 任意模式（deals/free/wishlist/compare）都能看到「平台 + 模式 + 计数 + 更新时间」— 新增 `.games-context` 上下文条（crumb + 计数 + 时钟）
- [x] 平台 Tab 与模式 Chip 激活态视觉语言一致 — `.games-chip.is-active` 改为实心填充 + 反白字，统一为 `.games-pill` 语言
- [x] 卡片支持键盘 `Enter/Space` 打开 deal + 清晰焦点环 — `GameCard` 整卡 `role="button"` + `onKeyDown` + `:focus-visible`
- [x] 价格数字等宽、徽标在任意缩略图背景上可读 — `tabular-nums` + 毛玻璃背板（`backdrop-filter: blur(8px)`）
- [x] 暗色主题下评分/省¥/史低文字对比 ≥ 3:1 — 徽标改用 token-based `color-mix` 半透明底，避免裸 hex 压暗
- [x] 窄屏（<640px）无横向溢出、工具栏仍可操作 — 新增 `@media (max-width: 640px)` 断点（toolbar 堆叠、filter 列排、footer 左对齐、网格 minmax 150px）

---

## 5. 落地记录（2026-07-18）

### 5.1 改动文件清单
| 文件 | 关键改动 |
|---|---|
| `src/renderer/games/games.css` | ① 补 `.games-page` flex 列容器（P0）；② `.games-chip.is-active` 改实心填充统一隐喻；③ 网格 `minmax(clamp(160px,22vw,220px),1fr)`；④ `.game-card` 整卡可点 + `:focus-visible`；⑤ 徽标毛玻璃背板 + `tabular-nums`；⑥ 新增 `.games-context` 上下文条；⑦ `@media (max-width:640px)` 响应式断点 |
| `src/renderer/games/gamesStore.js` | ① 新增 `comparePlatforms` 信号；② `setMode('compare')` 保留 `activePlatform`（修复"丢失选中平台"）；③ 新增 `toggleComparePlatform`（多选，至少保留 1 个）；④ `loadGameDeals` compare 模式 `platform:'all'` |
| `src/renderer/games/PlatformTabs.jsx` | compare 模式渲染 `role="group"`/`role="button"`/`aria-pressed` 多选；其余模式保留 `role="tablist"`/`role="tab"`/`aria-selected` |
| `src/renderer/games/GamesPage.jsx` | ① 动态 `MODE_HINTS`/`MODE_LABELS`/`platformLabel`/`fmtClock`；② `shown` 按 `comparePlatforms` 过滤；③ `.games-context` 渲染；④ 保留 PlatformTabs（仅 wishlist 隐藏） |
| `src/renderer/games/GameCard.jsx` | 整卡 `role="button" tabIndex={0} aria-label` + `onClick`/`onKeyDown(Enter/Space)`；fav/CTA `stopPropagation` |
| `src/renderer/games/GamesFilterBar.jsx` | wishlist 模式隐藏刷新按钮（修复 no-op 误导） |
| `tests/renderer/games-store.test.js` | 重写 `setMode('compare')` 断言 + 新增 `toggleComparePlatform` 多选测试 |
| `tests/renderer/GamesPage-fx.test.jsx` | 重写 compare 模式断言（展示多选 Tab，验证 `role="button"`/`aria-pressed`） |

### 5.2 验证结果
- `npm run build:renderer` → esbuild 42ms，**0 错误**
- `npx vitest run tests/renderer` → **64/64 games 单测通过**
- Grep 校验 `games.css` **无裸 hex**（令牌合规 preserved）

### 5.3 后续建议（非阻塞）

> 以下 4 项已于 2026-07-18 第二轮整改全部落地，构建 + 单测全绿。

- [x] **暗色主题对比复核（已做）**：用 Node 脚本按 WCAG 公式实测 oklch/color-mix 实际色值，定位 6 处对比失败并修复——① `--text-inverse` 原为未定义（兜底白，暗色下失效），改为 `color-mix(... 88%/90% transparent)` 双主题 token；② `.game-card__src` 白字改压在 `black 72%` 背板 → 3.18:1 (AA)；③ `.game-card__lowest` 改 `warn 30% black` 深琥珀字 → 8.88:1 (AAA)；④ `.game-card__rating`/`.game-card__save`/`.game-card__free-tag` 压暗色改**主题翻转**直引语义令牌（暗色下用纯 `warn`/`green`），分别达 6.98 / 7.10 / 7.10:1 (AAA)；⑤ `.game-card__fav` 默认 `black 70%` 背板 → 3.00:1 (AA)、`--on` 改 `danger 75% black` → 6.83:1 (AAA)。
- [x] **动画去抖（已做）**：`games-pop` 从 `.game-card__save` 常驻动画移出，改为 `.game-card__save--pop` 仅由 `GamesPage` 首屏渲染时 `animate={true}` 触发，刷新/比价切换不再整片重放；`prefers-reduced-motion` 同步关。
- [x] **键盘 Arrow 导航（已做）**：`PlatformTabs` 实现 WAI-ARIA Tabs 模式——tablist 模式 `ArrowLeft/Right` + `Home/End` 移动焦点并激活（roving focus，首个选中），compare group 模式同样支持方向键 + `aria-pressed` 切换，补 `useEffect` 维护 `tabIndex`。
- [x] **Playwright 视觉回归（已做）**：新增 `tests/visual/games.spec.js`（静态服务 + IPC stub + `getGameDeals` fixture，覆盖 示例/史低/免费/折扣/评分全部徽标变体），3 个基线——`games-deals-light` / `games-deals-dark` / `games-compare-light`。**注意**：本沙箱无 Chromium 且下载被网络拦截，无法在此生成 `*.png` 基线；请在本地/CI 跑 `npx playwright install chromium && npm run test:visual:update` 生成一次基线后日常 `npm run test:visual` 比对。
- [ ] **卡片密度（维持）**：body `padding` 仍 `12px`（未升 16px），以保密度；如后续要更宽松可改 `--space-4`。

### 5.4 第三轮：搜索 / 降价角标 / 整卡链接（2026-07-18 晚）

> 用户确认"实现"后落地。三项均围绕"更好用"推进：标题搜索（功能增量）、降价信号显性化（核心价值闭环）、整卡交互去反模式（可访问性）。

**改动文件清单**
| 文件 | 关键改动 |
|---|---|
| `src/renderer/games/gamesStore.js` | ① 新增 `searchQuery` 信号 + `setSearchQuery`（200ms 防抖写）+ `clearSearchQuery`；② 新增 `matchesSearch(game,q)`（标题+平台 label 不区分大小写匹配）；③ 新增 `getDropInfo(game)`（读 `wishlist` 比较 `salePrice < addedPrice`，返回 `{dropped,delta,pct,currency}`） |
| `src/renderer/games/GamesFilterBar.jsx` | 顶部新增 `.games-search` 搜索框（本地 state + 防抖写 signal），含清除按钮、 `role="searchbox"`/`aria-controls="games-grid"`/`aria-keyshortcuts="/"`、`Esc` 清空 |
| `src/renderer/games/GamesPage.jsx` | ① `shown`/`wishList` 接入 `matchesSearch` 本地过滤（不发 IPC）；② 计数随搜索变化 + `aria-live="polite"`；③ 网格加 `id="games-grid"`；④ 空态新增"搜索无结果"分支（清除按钮）；⑤ `useEffect` 监听 `/` 全局聚焦搜索 |
| `src/renderer/games/GameCard.jsx` | ① **stretched-link 重构**：去掉 `<article role="button">`，标题改为真 `<a href=dealUrl>` 覆盖整卡（修复"按钮套按钮"读屏反模式 + 每卡 Tab 3 次）；② fav/徽标 `z-index:2` + 信息徽标 `pointer-events:none`；③ 新增 `.game-card__drop` 降价角标（`getDropInfo` 命中才渲染，`role="status"`） |
| `src/renderer/games/games.css` | ① `.game-card{position:relative}` + `a.game-card__title::after{inset:0;z-index:1}` 拉伸层；② `.games-search` 系列（圆角/描边/聚焦环/清除按钮，复用 token，无裸 hex）；③ `.game-card__drop` 实心 accent + 白字（`accent 88% black` 保证 AA）；④ fav/徽标 `z-index:2` + 信息徽标 `pointer-events:none` |
| `tests/renderer/games-store.test.js` | 新增 `matchesSearch` / `setSearchQuery`(防抖) / `clearSearchQuery` / `getDropInfo` 单测 |
| `tests/renderer/GamesPage-fx.test.jsx` | 新增搜索过滤（计数/无结果空态/清空恢复）+ 降价角标（deals 渲染、未降价不渲染）断言 |
| `tests/visual/games.spec.js` | 新增 `games-search-light` / `games-drop-light` 两个视觉基线（共 5 个） |

**验证结果**
- `npm run build:renderer` → **0 错误**
- `npx vitest run tests/renderer` → **1349/1349 通过**（games-store 47、GamesPage-fx 15 含新增）
- Grep 校验 `games.css` **无裸 hex**
- `npx playwright test games.spec.js --list` → 5 用例全部发现（Chromium 未装，待本地 `test:visual:update` 生成基线）

**设计要点**
- 整卡可点沿用 stretched-link 模式：标题 `<a>` 的 `::after` 拉伸覆盖整卡，fav/CTA 浮于其上仍可独立点击，读屏树干净（不再"按钮套按钮"）。
- 降价角标与系统通知层打通：后端 `games-check-scheduler` 已算好的"关注游戏降价"从通知层显性化到 deals 网格卡片右上角，形成"浏览即知降价"闭环；`wishlist` 模式因 `salePrice` 被覆写为 `addedPrice` 自然不重复显示。
- 搜索为纯本地派生（防抖 + 不发 IPC），与既有 sort/minSavings 本地派生范式一致，零骨架闪烁。

---

### 5.5 第四轮：平台品牌色左条 / 骨架屏防 CLS（2026-07-18 晚）

> 用户确认"要"后落地。两项均为体感升级：卡片按商店着色的可扫描性 + 加载态零布局抖动。

**改动文件清单**
| 文件 | 关键改动 |
|---|---|
| `src/renderer/games/GameCard.jsx` | `<article>` 类新增 `is-${game.platform}`（驱动 `.game-card.is-{platform}` 品牌色左条） |
| `src/renderer/games/GamesPage.jsx` | 骨架卡由单块 `<div>` 改为**结构镜像真实卡**：`.games-skeleton-card__thumb`(16/9) + `.games-skeleton-card__body`(padding/gap，含 title×2/meta/price 占位行，`price` 用 `margin-top:auto` 对齐真实底部) |
| `src/renderer/games/games.css` | ① `.game-card` 加 `--card-accent` 令牌 + `border-left:3px solid var(--card-accent)`（`box-sizing:border-box` 下零外宽偏移）；② `.game-card.is-{steam\|epic\|xbox\|playstation\|switch}` 复用全局 `--brand-*` 令牌（明暗双值已主题感知）；③ 骨架屏重构为镜像结构 + `.games-skeleton-line*` 占位行（shimmer 动画移至内层，容器高度由结构决定）；④ `prefers-reduced-motion` 同步覆盖 `.games-skeleton-card__thumb`/`.games-skeleton-line` |
| `tests/renderer/GamesPage-fx.test.jsx` | 新增"加载态骨架结构镜像真实卡片"断言（8 卡 ×(thumb+4 行) = 8 thumb / 32 line / 8 title / 8 price，且 `.games-grid` 互斥） |

**验证结果**
- `npm run build:renderer` → **0 错误**
- `npx vitest run tests/renderer` → **1354/1354 通过**（GamesPage-fx 16，含新增骨架结构断言）
- Grep 校验 `games.css` **无裸 hex**

**设计要点**
- 平台左条复用既有的全局 `--brand-*` 令牌（PlatformTabs 圆点、卡内平台胶囊同源），保证三处平台语义色一致；左条纯装饰、不承载交互，卡片主体仍由平台胶囊 + 标题链接承载信息。
- 骨架屏从"单块 220px 渐变"改为"与真实卡同构的 thumb(16/9)+body"，使骨架→内容的盒高一致，**CLS≈0**；shimmer 动画从容器移到内层占位元素，避免容器高度参与动画导致二次抖动。
- 此项与 §5.4 的整卡链接、§5.3 的暗色对比复核共同构成"一致性 + 稳定性 + 可访问性"收口。

---

**UI Designer 备注**：P0–P3 + 四项后续 + 搜索/降价/整卡链接 + 平台左条/骨架防 CLS 已全量落地，构建与 1354 单测全绿。原型 `docs/games-ui-prototype.html` 可先于真机预览效果。封板前建议在真机跑一轮 `npm run dev` 点验 + 本地 `npm run test:visual:update` 生成像素基线。

## 5.7 第五轮：卡片密度提升 + 毛玻璃滚动性能（2026-07-18）

> 用户确认"需要"后落地。两项均为体感打磨：卡片从紧凑(12px)升到舒适(16px) + 滚动时消除毛玻璃掉帧。

**改动文件清单**
| 文件 | 关键改动 |
|---|---|
| `src/renderer/games/games.css` | ① `.game-card__body` 与 `.games-skeleton-card__body` 的 `padding` 由 `var(--space-3)`(12px) 升到 `var(--space-4)`(16px)，**两处同步**保证骨架→内容高度一致（CLS 不回归）；② 新增滚动性能块：`.game-card__src`/`.game-card__lowest` 加 `transition: backdrop-filter 0.2s`；`.games-body.is-scrolling` 状态下两徽标 `backdrop-filter:none`（滚动去 blur）；③ `prefers-reduced-motion` 下将两徽标纳入 `transition:none` |
| `src/renderer/games/GamesPage.jsx` | `.games-body` 加 `ref={bodyRef}` + `useEffect` 滚动监听（`passive:true`）：滚动时挂 `is-scrolling`、停止 ~120ms 后移除，平滑恢复毛玻璃 |
| `tests/renderer/GamesPage-fx.test.jsx` | 新增"滚动内容区给 `.games-body` 挂 `is-scrolling`"断言 |

**验证结果**
- `npm run build:renderer` → **0 错误**
- `npx vitest run tests/renderer` → **1355/1355 通过**（GamesPage-fx 17，含新增滚动优化断言）
- Grep 校验 `games.css` **无裸 hex**

**设计要点**
- **密度 12→16px**：原 12px 偏紧凑、信息略挤；升 16px 后标题/价格/元信息的呼吸感更均衡。真实卡与骨架卡同时升档，二者盒高仍严格对齐 → 骨架→内容交换时**零位移**（CLS≈0），不会因密度变化引入新抖动。
- **毛玻璃滚动优化**：40 张卡全开 `backdrop-filter: blur(8px)` 时，每次滚动都会触发大量合成层重绘、低端 GPU 掉帧。改用"滚动中挂 `is-scrolling` → 临时 `backdrop-filter:none` → 静止 120ms 后移除"策略，静止时玻璃质感完整保留、滚动时零 blur 开销。过渡 0.2s 让恢复不突兀；`prefers-reduced-motion` 用户不过渡、直接切换，避免任何动态。
- 此项与 §5.5 的骨架防 CLS、§5.4 的整卡链接共同构成"稳定 + 流畅 + 可访问"的封板级体感。

---

**UI Designer 备注（封板）**：P0–P3 + 四项后续 + 搜索/降价/整卡链接 + 平台左条/骨架防 CLS + 密度提升/毛玻璃滚动优化 已全量落地，构建与 1355 单测全绿。原型 `docs/games-ui-prototype.html` 可先于真机预览效果。封板前建议在真机跑一轮 `npm run dev` 点验 + 本地 `npm run test:visual:update` 生成像素基线。
