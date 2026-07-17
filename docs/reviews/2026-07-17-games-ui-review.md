# 游戏优惠聚合 · UI 设计评审（2026-07-17）

> 评审对象：`src/renderer/games/*`（GamesPage / PlatformTabs / GamesFilterBar / GameCard / TopRanking / games.css）
> 对照真源：`styles.css`（`:root` / `[data-theme="dark"]` / `body.platform-win`）
> 角色：UI Designer（像素君）｜方法：逐文件代码审查 + 令牌一致性核验 + WCAG AA 对比度测算

## 一、总体评价

| 维度 | 现状 | 评级 |
|---|---|---|
| 设计体系一致性（令牌复用） | 主体复用 `--surface/--border/--radius-*`/`--accent-primary`，符合 Apple 原生美学 | ✅ 良好 |
| 语义色令牌可用性 | 依赖的 `--color-success/--color-warning/--color-danger` **在真源中未定义** | ❌ 严重缺陷 |
| 对比度（WCAG AA 4.5:1） | 10px 三级文字、划线价、徽标多处不达标 | ⚠️ 不达标 |
| 字体层级 | 字号区间被压缩（标题 13 / 售价 14），折扣% 反而是最小元素 | ⚠️ 偏弱 |
| 交互元素统一性 | CTA 三态并存、选中态两种语言 | ⚠️ 不一致 |
| 聚焦可见性 | 自定义控件无 `:focus-visible` | ❌ a11y 回归 |
| 响应式 | 网格自适应 OK；榜单行无移动端断点 | ⚠️ 局部缺失 |
| 图标/装饰 | emoji 作平台标识，all/steam 重复 🎮 | ⚠️ 可提升 |

---

## 二、关键视觉缺陷（按严重度）

### P0 · 语义色令牌缺失导致静默渲染失败

`games.css` 引用的三个语义色在 `styles.css` 中**均不存在**（`grep` 全量确认只有 `--color-up/--color-down` 金融色）：

- 第 51/52/53 行 `--color-warning` → 未定义
- 第 184、299、300、306、397 `--color-success` → 未定义
- 第 182 行 `--color-danger` → 未定义

**后果（实测推断）**：`var(--color-*` 无效 → 整条声明失效并回退到继承色，于是：

1. 折扣徽标 `-{savings}%` 渲染成**深灰文字 + 透明底**（本应是绿字绿底）——折扣 Highest 信号被完全抹掉。
2. `★ 评分` 不是琥珀色，而是深色字。
3. `游戏-card--free` 的绿色左边框（`color-mix(... var(--color-success) ...)`）整条失效 → 免费卡与折扣卡**视觉无差别**。
4. `games-state--err` 错误文字**不是红色**，错误态形同普通文字。

**修复（设计体系正确做法）**：在 `styles.css` 的 `:root` / dark / win 三处补定义语义别名，全站受益（github.css 等也引用了 `--color-danger`）：

```css
/* styles.css :root（浅色） */
--color-success: var(--accent-green);  /* #34c759 */
--color-warning: var(--accent-orange); /* #ff9500 */
--color-danger:  var(--accent-red);    /* #ff3b30 */
/* dark / win 同理映射到各自的 --accent-green/orange/red */
```

或直接把 `games.css` 内引用改为已存在的 `--accent-green/--accent-orange/--accent-red`。

---

### P1 · 对比度不达标（WCAG AA 4.5:1）

测算（基于 `styles.css` 实际色值）：

| 元素 | 当前 | 对比度(对白底) | 判定 |
|---|---|---|---|
| `.game-card__meta` 10px `--text-tertiary`(gray-300 #aeaeb2) | 浅灰小字 | **≈ 2.2:1** | ❌ 远低于 4.5 |
| `.game-card__normal` 划线价 `--text-tertiary` 12px | 同上 | ≈ 2.2:1 | ❌ |
| `.game-card__free-until` / `.games-rank__sub` 10px | 同上 | ≈ 2.2:1 | ❌ |
| 折扣徽标绿字（修复后 `#34c759`）12px | 浅绿字 | **≈ 2.2:1** | ❌ 仍不达标 |
| 错误红字（修复后 `#ff3b30`）12–14px | 浅红字 | ≈ 3.5:1 | ❌ 普通文字需 4.5 |

**优化方向**：

1. 所有「次要信息」改用 `--text-secondary`（gray-500 #6e6e73，≈ **5.1:1**，达标），三级灰只留给纯装饰。
2. 折扣/免费强调**不要**用彩色文字，而用「深色文字 + 彩色淡底」：
   ```css
   .game-card__save {
     color: var(--text-primary);                 /* 深字，高对比 */
     background: color-mix(in oklch, var(--accent-green) 16%, transparent);
     font-size: var(--font-size-sm);             /* 12px，不再 10px */
   }
   ```
3. 错误态：文字用 `--text-primary`，仅靠红色图标/左边框表达「错误」，避免浅红字。

---

### P1 · 字体层级压缩、字号破底

- 设计体系明确「正文基准 14px、表格元信息可 11–13px」，但本界面**大量使用 `--font-size-10`(10px)**（meta/徽标/来源/截止日/评分），跌破 11px 下限。
- 层级关系失真：卡片标题 13px/600，售价 14px/700，而**最重要的折扣% 仅 10px**。视觉重心落在按钮而非价值信息。

**优化方向**：

- 元信息统一升至 `--font-size-sm`(12px)；来源/徽标最小不低于 11px。
- 折扣% 作为 deals 界面的 Hero 指标，建议 ≥12px 且配色底突出（见上）。
- 售价维持 14px/700，标题 13px/600 —— 保持「价 > 标题 > 元信息」的清晰梯度。

---

### P2 · 交互元素视觉风格不统一

界面对「同一类操作」给出了三种不同语言：

| 控件 | 当前样式 | 问题 |
|---|---|---|
| `.game-card__cta`（查看优惠） | 实心蓝 `--accent-primary` | 主操作 |
| `.games-rank__cta`（查看） | 描边中性 `--border` | **同是「打开优惠」，却是次级样式** |
| `.games-refresh`（刷新） | 描边中性 | 中性 OK |
| 平台 Tab 选中 | 实心蓝填充 | 选中语言 A |
| 维度 Chip 选中 | 蓝淡底 + 蓝字描边 | 选中语言 B（同一工具条内两种选中态） |

**优化方向**：

1. **复用全局按钮体系**：`styles.css` 已定义 `.btn / .btn-primary / .btn-secondary / .btn-sm`（含 `:focus-visible` 与统一 hover/active）。把两处 CTA 改为 `class="btn btn-primary btn-sm"`，自动获得聚焦环与全站一致手感，并消除「查看 vs 查看优惠」双样式。
2. **统一选中态语言**：平台 Tab 与维度 Chip 二选一作为「主选中」表达。建议两者都采用「蓝淡底 + 蓝字 + 1px 蓝描边 + 字重 600」的同一套（轻量且一致）；若想强调 Tab 为一级导航，可保留实心但需确保 Chip 不与其实时竞争（拉开间距或降权）。

---

### P2 · 图标与装饰运用

- 平台标识用 emoji：`all/steam` 同为 🎮（重复）、`xbox` 🟢 / `playstation` 🔵 / `switch` 🔴 用彩色圆点——跨平台渲染不一致（Windows 与圆点 emoji 观感差），且品牌辨识弱。
- 同一 🎮 出现在「页头品牌标」「卡片占位图」「榜单占位图」三处，重复且扁平。
- 评价星 ★ 使用文本字形而非图标，且因 P0 缺陷未上色。

**优化方向（按投入）**：

- 轻量：去重 emoji（all 用 🎮、steam 用其品牌符号或 💻），榜单/卡片占位统一用品牌色首字母块而非 emoji。
- 进阶：引入单色品牌 SVG 标记（Xbox 绿 / PlayStation 蓝 / Steam / Nintendo 红 / Epic）——这是「游戏聚合」品类辨识度提升的最大杠杆，建议作为后续专项。

---

### P2 · 响应式与聚焦态

1. **聚焦态缺失**：自定义 Tab/Chip/CTA/刷新按钮**均无 `:focus-visible`**。键盘用户无任何可见焦点指示 → a11y 回归。复用全局 `.btn` 可一并解决 CTA；Tab/Chip 需补：
   ```css
   .games-platform-tab:focus-visible,
   .games-chip:focus-visible {
     outline: var(--focus-ring);
     outline-offset: 2px;
   }
   ```
2. **榜单行无移动端断点**：`.games-rank__row` 网格 `32px 56px 1fr auto` 在窄屏下「缩略图+序号+标题+指标」易挤压/溢出，指标列（售价+折扣+按钮）无最小宽度。建议 `<768px` 隐藏缩略图、允许标题换行、指标列 `min-width` 保底。
3. 卡片 `minmax(200px,1fr)` 偏窄，建议 `220–240px` 以容纳 2 行标题 + 价格 + CTA。

---

### P3 · 信息层级

- 折扣力度是 deals 界面的第一价值，但当前最小且（因 P0）无色彩；划线原价用三级灰几乎不可见，削弱了「省了多少」的感知。
- 「示例数据」徽标用警示色（修复后琥珀）且 10px，既是信息又像告警，易疲劳。建议改为中性次级 pill（`--bg-secondary` + `--text-secondary`），仅作事实标注。

---

## 三、优化优先级与建议实施范围

| 优先级 | 项 | 类型 | 工作量 |
|---|---|---|---|
| **P0** | 定义/映射 `--color-success/--color-warning/--color-danger` | 缺陷修复 | 极小 |
| **P1** | 三级灰→二级灰、折扣/免费改深字彩底、字号 10→12 | 对比度合规 | 小 |
| **P1** | 字体层级（折扣% 提升、梯度清晰） | 层级 | 小 |
| **P2** | CTA 复用全局 `.btn`、统一选中态语言 | 一致性 | 小 |
| **P2** | 补 `:focus-visible`、榜单移动端断点 | a11y/响应式 | 小 |
| **P2** | 平台品牌 SVG 标记替换 emoji | 品牌辨识 | 中 |
| **P3** | 「示例数据」徽标改中性、加载骨架屏 |  polish | 小/中 |

**建议**：P0 + P1 + 复用 `.btn` 属于「低风险、高回报、纯收益」，可立即落地；平台 SVG 标记作为独立视觉专项排期。

---

_UI Designer · 像素君 · 2026-07-17_
