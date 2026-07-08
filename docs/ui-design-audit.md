# AppUpdateChecker · UI 一致性审查报告

> **审查人**：UI Designer（界面设计专家）
> **审查对象**：`AppUpdateChecker-Electron`（Preact + Electron 桌面应用）
> **审查方法**：基于 impeccable `audit` / `extract` / `normalize` 方法论，结合对 `src/renderer/**` 与 `styles.css` 的静态扫描（含 `file:line` 证据）
> **审查日期**：2026-07-08

---

## 0. 审查范围与关键前提

| 项 | 结论 |
|---|---|
| 框架 | **Preact**（非 React），组件用 `class=` 原生属性（1562 处）+ `className=`（65 处），两者是同一写法 |
| 样式机制 | **单一全局样式表 `styles.css`（约 331KB / 2217 个选择器）+ CSS 变量令牌层 + 极少量内联样式**。无 CSS Modules、无 styled-components、无 CSS-in-JS |
| 令牌采用度 | `var(--x)` 被引用 **2331 次 / 119 个变量**；变量定义 **185 处 / 110 个变量**；但仍有 **1864 处写死字面色 / 373 种不同颜色** |
| 设计方向 | 明确的 **Apple 原生美学**（SF Pro 系统字体、Apple 系统色 `#007aff/#34c759/#ff3b30/#ff9500/#8e8e93`），并带 Windows 平台变体 `#4cc2ff`。**方向正确、有意为之**，问题在"执行不一致"而非"方向错误" |

> ⚠️ 结论先行：**现有底座是好的**（令牌系统、明/暗双主题、平台主题都已存在且方向正确）。真正的病灶是"**双轨并行**"——令牌与大量写死魔数共存，且存在几处会直接导致显示错误的硬 bug。

---

## 1. 审计健康评分

| # | 维度 | 评分 | 关键发现 |
|---|------|------|----------|
| 1 | 可访问性 (A11y) | **2/4** | 中性灰 `#888/#666/#999` 直接用于文字，在白底上对比度大概率 < 4.5:1；占位符/次要文字对比不足 |
| 2 | 性能 (Performance) | **3/4** | 系统字体零加载成本、单 CSS 文件；但 `styles.css` 331KB 偏大，旧魔数未清理 |
| 3 | 响应式 (Responsive) | **3/4** | 桌面应用，布局基本稳定；个别弹窗/抽屉有固定宽度风险 |
| 4 | 主题化 (Theming) | **2/4** | 令牌存在但采用率低；**仅跟随系统**（`prefers-color-scheme`），无手动切换；存在悬空 `--accent` 硬 bug |
| 5 | 反模式 (Anti-Pattern) | **3/4** | Apple 美学一致、无 AI 套路味；少量离谱内联色与组件重复 |
| **合计** | | **13/20** | **Acceptable（需系统性整改）** |

**评级带**：18-20 优秀 · 14-17 良好 · **10-13 可接受（需重点整改）** · 6-9 差 · 0-5 严重

---

## 2. 详细发现（按严重级别）

### 🔴 P0 · 阻断级（立即修复）

#### P0-1 悬空变量 `--accent` 从未定义，且各规则 fallback 互不一致
`--accent`（不带后缀）在整份 `styles.css` 中**从未被定义**，导致所有 `var(--accent, <fallback>)` 永远落到各自的硬编码 fallback。更严重的是——**同一个"accent"在不同组件里渲染成完全不同的颜色**：

| 行号 | fallback | 实际渲染颜色 | 问题 |
|---|---|---|---|
| 3190 / 3204 / 3950 / 3953 / 4063 / 4065 / 4071 | `#4a90e2` | **Bootstrap 蓝**（错误色相） | 主蓝按钮渲染成非品牌蓝 |
| 5131 / 5133 | `#3b82f6` | **Tailwind 蓝** | 与 `#007aff` 品牌蓝明显不同 |
| 5945 / 5946 / 9943 / 10211 / 10242 | `#007aff` | ✅ 品牌蓝 | 正确 |
| 7161 / 7169 / 7225 / 7321 / 7362 / 7385 / 7457 / 7459 / 7519 | `#ff3b30` | **红色** | "accent"变量竟渲染成红色 |

- **影响**：所谓"强调色"在不同界面表现为蓝、深蓝、甚至红，视觉完全不统一；且一旦有人（错误地）定义 `--accent`，所有组件会瞬间变样，极脆弱。
- **修复**：全局将 `var(--accent, …)` 替换为具体语义令牌——主操作改 `var(--accent-primary)`、危险/提醒操作改 `var(--accent-red)`。可一键 `sed`/批量替换。

#### P0-2 `var()` fallback 写死 Tailwind/Bootstrap 灰，暗色模式不切换
多处令牌的 fallback 不是设计令牌而是 Tailwind 灰，暗色模式下这些 fallback 不会跟随主题切换：

```css
/* styles.css:5005 */ border: 1px solid var(--border, #e5e7eb);   /* Tailwind gray-200 */
/* styles.css:5016 */ color: var(--text-secondary, #6b7280);      /* Tailwind gray-500 */
/* styles.css:5066 */ .day-bet-footer-empty { color: var(--text-tertiary, #9ca3af); } /* Tailwind gray-400 */
/* styles.css:5037/5038/5061/5073/5081/5094 */ 同类问题
```
- **影响**：浅色模式正常，但**暗色模式下这些边框/文字仍用亮色灰**，出现"灰边框浮在深背景上""文字对比错误"的视觉 bug（虽当前靠 `prefers-color-scheme` 多数规则直接命中令牌，但凡令牌缺失就暴露）。
- **修复**：fallback 统一改为对应令牌自身值（`var(--border, rgba(0,0,0,0.08))` 等），或直接去掉 fallback 强制依赖令牌。

---

### 🟠 P1 · 重要级（发布前修复）

#### P1-1 多套中性灰并行，同语义多值表达
同时存在 **至少三套灰色体系**，且彼此混用：

| 体系 | 取值 | 用途 |
|---|---|---|
| **Apple 灰**（✅ 应作为唯一标准） | `#1d1d1f / #6e6e73 / #8e8e93 / #aeaeb2` | 文本三档 |
| **Tailwind 灰** | `#6b7280 / #9ca3af / #e5e7eb` | 散落于多处 |
| **Material/Bootstrap 灰** | `#888(76次) / #666(56次) / #999(25次) / #555(23次) / #1a1a1a(21次) / #222(18次) / #333(18次)` | 大量直接写死 |

- **影响**：同一"次要文字"在不同界面呈现 `#6e6e73` 或 `#666` 或 `#888`，肉眼可辨的不一致；`#888` 在白底对比度仅 ~3.5:1，**不达标 WCAG AA**。
- **修复**：收敛为单一中性阶梯（见设计系统文档的 `--gray-*` primitive），用 `ripgrep` 批量替换高频散色。

#### P1-2 语义色多值并存（红/绿/蓝各有多套）
| 语义 | 应取值（令牌） | 散落错误值 |
|---|---|---|
| 绿 | `#34c759` | `#2ea043 / #4cc26b / #30d158 / #1eb53a / #00853f` |
| 红 | `#ff3b30` | `#e53935`(Material 红，9 处：4751/5341/5352) / `#ed2939 / #da0000` |
| 蓝 | `#007aff` | `#4a90e2 / #357abd / #0a84ff(暗) / #0055a4 / #0033a0` |

- **影响**：状态色（更新可用/已最新/风险）在不同卡片上色相偏移，降低"颜色即信息"的可信度。
- **修复**：所有状态色统一引用 `--accent-green/-red/-orange/-blue`；`#e53935` 等 Material 红直接替换。

#### P1-3 `AITasksDrawer.jsx` 内联离谱色，偏离调色板
```jsx
// src/renderer/components/AITasksDrawer.jsx
'cursor':       '#7C3AED',  // 紫 — 调色板无
'codex':        '#10A981',  // 翠绿 — 与 --accent-green(#34c759) 不一致
'minimax-code': '#F59E0B',  // 琥珀 — 与 --accent-orange(#ff9500) 不一致
color: APP_COLOR[app] || '#6b7280'  // Tailwind 灰
```
- **影响**：AI 任务状态点颜色与全站状态色体系割裂。
- **修复**：抽取为共享状态色常量（如 `STATUS_COLORS.cursor = var(--accent-purple)` 等），或收敛到现有语义色。

#### P1-4 `selectors.js` 中 `dotColor` 硬编码且部分偏离令牌
```js
// src/renderer/selectors.js
dotColor: '#ff9500' // ok（= --accent-orange）
dotColor: '#34c759' // ok（= --accent-green）
dotColor: '#007aff' // ok（= --accent-blue）
dotColor: '#8e8e93' // ok
dotColor: '#aeaeb2' // ok
dotColor: '#c7c7cc' // ❌ 偏离 --text-tertiary(#aeaeb2)，自成一套浅灰
```
- **修复**：`dotColor` 直接改为引用对应 `--accent-*` 令牌字符串（CSS 变量可作值），消除双重来源。

#### P1-5 无手动明暗切换，仅跟随系统
检索结果：`data-theme` 出现 **0 次**；`ThemeProvider/setTheme/toggleTheme` **全 0**；仅 `prefers-color-scheme` 触发（3 处：L112/L1220/L11705）。
- **影响**：用户无法在"系统浅色但想用深色 App"等场景下手动选择；且 Electron 应用常独立于系统外观。
- **修复**：见《深浅色主题切换方案》文档——增加 `system/light/dark` 三态 + `data-theme` 属性 + 持久化。

#### P1-6 字号散乱 + 半像素怪值，令牌采用率低
统计 `styles.css` 内 **25 种不同字号、236 次**；连续覆盖 10/11/12/13/14/15/16px 且出现半像素 `12.5px/11.5px/13.5px/9.5px/10.5px`。虽已定义 `--font-size-*` 阶梯（L76-88），但代码大量仍写裸 `px`。
- **影响**：层级模糊（12px 与 13px 几乎无差），半像素在部分 DPI 下发虚。
- **修复**：强制使用 `--font-size-*` 令牌；删除半像素值；见设计系统排版规范。

---

### 🟡 P2 · 次要级（下一轮修复）

- **P2-1 间距散落奇值**：主流为 4px 栅格（含 6/10/14 半步），但仍有 `7px(16次)/5px(14次)/9px(4次)/26px/22px/34px/30px` 等越界值 → 统一到 `--space-*` 阶梯。
- **P2-2 组件重复实现**：11 个股票诊断 Card（`stocks/diagnosis/` 下 VerdictCard/CapitalFlowCard/...）、多套 feature Header（News/Fund/Metal/Worldcup/WechatHot）、多套 Layout（App/Fund/Metal/News/Worldcup/Stock）、多个 Tabs 实现（`FundMainTabs`、`TabList`、`ViewSwitcher`）→ 收敛为共享 `Card`/`PageHeader`/`FeatureLayout`/`Tabs`。

  > 勘误：原文中"`CategoryTabs` 同名重复"有误。仓库内仅 `funds/CategoryTabs.jsx` 一份 `CategoryTabs` 实现，无重复。

- **P2-2a ModuleCard 抽取**（已落地，P2）：新建 `src/renderer/stocks/diagnosis/ModuleCard.jsx`，统一 9 张诊断卡（CapitalFlow/CorporateEvents/EarningsForecast/Fundamentals/News/PeerCompare/Risk/Shareholders/Tech/Valuation）的外壳；`VerdictCard` 语义独立保留不统一。预计消 ~110 行重复。
- **P2-3 `useIcon.js` 彩虹渐变**：10+ 条 `linear-gradient` 用于生成 App 图标，合法但建议集中为 `ICON_GRADIENTS` 常量表，避免未来漂移。
- **P2-4 行高单位混杂**：`1/1.5/1.6/1.4/1.2` 与个别 `18px` 像素行高并存 → 统一为无单位比例令牌。

---

### 🟢 P3 · 打磨级（可选）

- **P3-1 `OverviewEmptyState.css`** 是唯一的组件级私有 CSS，与"全量令牌"方向略背离 → 迁回全局令牌。
- **P3-2 `#fff` 直接用于文本/背景 124 次** → 暗色下应改用 `--color-text-inverse` / `--color-surface` 令牌，避免纯白刺眼。
- **P3-3 `--stock-up:#e23b3b / --stock-down:#ff5b5b`** 等 feature 局部红绿未复用 `--accent-red/-green` → 二级映射统一到全局令牌。

---

## 3. 系统性问题（根因）

1. **双轨并行（最核心）**：令牌层（110 变量）与写死魔数层（1864 处）长期共存，注释标明"ponytail: P2 令牌——新样式优先用这些，旧魔数逐步迁移"，但无强制约束，漂移持续。
2. **缺中央令牌真源 + lint 护栏**：`var(--accent, …)` 因缺定义而"按 fallback 工作"，说明没人校验"引用的变量是否真的存在"。
3. **组件库未沉淀**：feature 各自造轮子，重复实现未被抽取为共享组件，导致"同构不同名"的样式漂移。

---

## 4. 正面发现（应保留）

- ✅ **令牌系统底座扎实**：110 个 CSS 变量、明/暗/`platform-win` 三套覆盖，方向完全正确。
- ✅ **Apple 原生美学一致且成熟**：系统字体、Apple 系统色、毛玻璃半透明背景（`rgba(255,255,255,0.82)`）整体协调，无 AI 套路味。
- ✅ **平台主题做得好**：`body.platform-mac` / `platform-win` 切换字体与强调色（#007aff ↔ #4cc2ff），是少见但正确的细节。
- ✅ **共享壳存在**：`ModalShell.jsx` / `DrawerShell.jsx` 已作为 22 个弹窗/抽屉的基础，是很好的收敛起点。
- ✅ **系统字体 = 零加载成本**：无 `@font-face`、无 Web Font，首屏无 FOUT/FOIT。

---

## 5. 修复优先级建议（下一步）

| 顺序 | 严重级 | 动作 | 对应命令/方法 |
|---|------|------|------|
| 1 | **P0** | 全局替换 `var(--accent, …)` → 具体语义令牌；修正 Tailwind 灰 fallback | `/normalize`（配合批量替换） |
| 2 | **P1** | 收敛多套灰系与状态色到单一令牌；修 `AITasksDrawer`/`selectors.js` 离谱色 | `/extract`（抽取状态色常量） |
| 3 | **P1** | 增加 `system/light/dark` 手动主题切换 | 见《深浅色主题切换方案》 |
| 4 | **P1** | 字号/间距全面改用 `--font-size-*` / `--space-*` | `/typeset` + `/arrange` |
| 5 | **P2** | 抽取共享 `Card`/`PageHeader`/`FeatureLayout`/`Tabs` | `/extract` |
| 6 | **P3** | 私有 CSS 回归、纯白→令牌、feature 局部色映射统一 | `/polish` |

> 可要求我逐条执行，或一次性执行全部。修复后重跑本审计，预期健康分从 **13/20** 提升至 **17+**。
