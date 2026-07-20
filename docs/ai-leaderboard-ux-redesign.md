# AI 榜单 UI/UX 重构设计方案

> 基于源码的现状诊断 + 重设计方案。涉及文件：
> `src/renderer/ai-leaderboard/{AiLeaderboardPage,AiLeaderboardLayout,LeaderboardTable,ModelRow,LeaderboardFilterBar,BoardHealthCard,ComparePanel,states}.jsx` 与 `ai-leaderboard.css`；挂载于 `src/renderer/components/AppShell.jsx`（左侧 180px `SideNav` + `app-shell-view` 内容区）。
>
> 设计基线：复用项目 token 真源（`--accent-primary` / `--surface` / `--border` / `--text-*` / `--space-*`），保持 Apple 原生美学、a11y 44px 触控热区、`tabular-nums`、`prefers-reduced-motion` 已有关卡。

---

## 0. 现状结构（一句话地图）

```
AppShell
└─ app-shell-view
   └─ AiLeaderboardPage
      ├─ FeatureHeader           标题 + 描述 + "含示例数据"徽标
      ├─ LeaderboardFilterBar
      │  ├─ 视角 tabs (arena/aa/livebench)         ← 主控制器，却是等权 pill
      │  └─ filter-extra 行（space-between 混合）
      │     子维度 select / board chips + 厂商 select + 升降序 + 搜索 + 刷新
      ├─ 上下文条 (border-bottom)  crumb · 计数 · 时间 · note · 复制按钮
      ├─ BoardHealthCard          数据源覆盖率 + 解释文字
      ├─ body (overflow:auto)
      │  ├─ ValueScatter (仅 aa)
      │  └─ LeaderboardTable      ← 最多 10 列，无横向滚动容器
      ├─ ComparePanel             FAB + 右侧抽屉（内联 style 自建）
      └─ AttributionFooter
```

---

## 1. 当前布局问题诊断

### 1.1 信息层级（Information Hierarchy）
- **三重 meta 层叠稀释数据权重**：`FeatureHeader` 描述、`上下文条`、`BoardHealthCard` 三处都在讲"元数据/来源"，而真正的主角（表格数据）没有得到更高的视觉优先级。
- **缺焦点锚点**：榜单的核心是"谁第一"，但 `#1` 与 `#50` 视觉无差异——rank 列甚至是灰色次要色（`--text-tertiary`），与"排名是榜单灵魂"自相矛盾。
- **提示信息碎片化**：「含示例数据」「仅 LLM」「仅 Top N」三类说明分散在 header 徽标、context note、health card 三处，用户需在不同位置拼凑语义。

### 1.2 视觉重点（Visual Emphasis）
- **无比较性视觉编码**：表格全靠文字数字，没有条形/热力/量级提示，扫读 40+ 行成本高（`ModelRow.jsx` 仅渲染纯文本数字）。
- **活跃列强调不足**：`ai-lb-col--active` 仅加粗+变色，强度弱；三视角（arena/aa/livebench）是**数据本质差异**（换整套数据源与列），却用等权 pill 呈现，未传达"切换=换一套世界"。
- **示例行弱提示**：`ai-lb-tag--sample` 只是个小标签，示例数据与实时数据在行内几乎无区分。

### 1.3 用户动线（User Flow）
- **排序概念混淆**：aa/lb 的「排序（选指标）」`select` 与「↑升序/↓降序」按钮相邻但语义不同（"按哪个指标排" vs "升还是降"），外观未做区分（`LeaderboardFilterBar.jsx`）。
- **列头不可点排序**：只能靠全局升降序按钮，且无法按非激活列排序；用户想按"价格"排却得先去下拉改指标。
- **对比入口常驻吃空间**：每行 checkbox 列常驻（`ai-lb-col-check` 32px），未对比时也占用横向空间；勾选上限 3 不前置提示。

### 1.4 响应式与数据可读性
- **真表格无横向滚动容器**：`.ai-lb-table-wrap` 是 `width:100%` 但**没有 `overflow-x:auto`**，移动端 10 列（AA 视图：check+rank+模型+厂商+5 指标+性价比）会被压垮/溢出视口。
- **仅骨架屏做了窄屏适配**：`@media (max-width:640px)` 只改了 `.ai-lb-skeleton-row` 列数，真实表格无任何响应式策略。
- **桌面已偏挤**：内容区 = 视口 − 180px sidebar，AA 视图 10 列在 ~900–1000px 下已紧张。

### 1.5 一致性与可访问性小缺口
- `role="tab"` 用在视角切换，但面板无 `role="tabpanel"` / `aria-controls` 对应。
- 对比抽屉为内联 `style` 自建（`ComparePanel.jsx`），无焦点陷阱、Esc 关闭不显著。
- 间距节奏不统一：body 用 `--space-5`(24)，health card 却用 `2px/3px` 杂值 margin，context 用 `--space-2`(8)。

---

## 2. 重设计方案

### 2.1 信息架构重构（削减 meta chrome）
将 `FeatureHeader 描述 + 上下文条 + 健康卡` 合并为**单条「视图摘要条」**：
`视图名 + 一行描述 + 更新时间 + 数据源状态(实时/示例) + 覆盖率(42/42)`。
删除散落的「含示例数据」badge 与 context note，统一进摘要条，元数据只出现一次。

### 2.2 页面结构（自上而下）
1. **Page Header**：标题 + 一行描述；右上角「实时 · 更新 18:05」状态药丸（合并原 badge）。
2. **视图切换（主控制器）**：**分段控件（Segmented Control）**，三视角，active 强对比；每个段带副标（ELO 排名 / 客观分·价格·速度 / 抗污染评测），传达"切换=换整套数据"。
3. **工具栏（按视图自适应）**：
   - 左组：子维度（aa/lb 用带「排序依据」标签的 chip group）/ board chips（arena）+ 厂商筛选。
   - 右组：搜索 / 升降序切换（独立小箭头按钮）/ 刷新。
   - **关键**：把"排序依据(指标)"与"升降序"用不同视觉语言区分（前者=带标签的 chip group，后者=纯箭头按钮）。
4. **头部高亮区（可选焦点）**：当前指标的 Top-3 迷你领奖台，或至少 `#1` 高亮卡，给页面一个视觉锚点。
5. **数据表格（主角）**：
   - `sticky thead` + **首列(模型名) `sticky` 左**，长列表滚动不丢上下文。
   - **rank 列 medal 处理**：`#1` 金 / `#2` 银 / `#3` 铜，恢复"排名是核心"的视觉权重。
   - **主指标列加迷你内联条形**（量级比较），数字后接淡色 bar。
   - **示例行**：左侧色条 + 轻微底色，而非小 tag。
   - **列头可点排序**：▲▼ 指示，主指标默认可点。
6. **对比**：行 hover/选中态才显「对比」勾选（或把 checkbox 列收为可切换表头）；保留 FAB + 抽屉（改用统一 Drawer 组件 + 焦点陷阱 + Esc + "已选 2/3" 前置提示）。
7. **页脚署名**：保持低调。

### 2.3 视觉风格
- **视角语义色（orientation aid）**：Arena=琥珀金🏆、AA=靛紫📊、LiveBench=青蓝🛡️。仅用于 active 段、激活列淡底、`#1` 奖牌——**不全局换肤**，避免认知负担。
- **字体**：保持系统栈；主指标数字 `font-size-lg`(18) + `tabular-nums` + 略紧字距；列头 13px/600；模型名 15px/600。
- **间距**：统一 8px 节奏——区块间 `--space-5`(24)、控件组内 `--space-3`(12)、控件间 `--space-2`(8)、单元格纵向 `--space-3`；弃用 2/3px 杂值。
- **动效**：入场 `fade-up`；数据载入**行错峰进入**(0.04s×i，限 12 行)；hover 微抬升；奖牌 pop。全部包裹 `prefers-reduced-motion` 关闭。

### 2.4 交互体验
- 列头点击排序 + ▲▼；主指标默认可点，非主指标也可点。
- 行 hover 显对比勾选 + 可选「查看详情」。
- 键盘：`/` 聚焦搜索、`↑↓` 行导航、`Esc` 关抽屉。
- 对比上限"已选 2/3"前置提示。

---

## 3. 样式优化建议

### 3.1 配色
- 保留 token 真源；新增 **per-view accent 变量**（均用 `oklch` 派生，浅/深自适应）：
  - `--ai-lb-accent-arena: oklch(72% 0.14 75)`（琥珀金）
  - `--ai-lb-accent-aa: oklch(58% 0.17 285)`（靛紫）
  - `--ai-lb-accent-livebench: oklch(60% 0.13 220)`（青蓝）
- **奖牌色**：金 `oklch(82% 0.13 85)`、银 `oklch(82% 0.02 250)`、铜 `oklch(66% 0.10 50)`。
- 主指标条形：accent 低透明 `color-mix(in oklch, var(--ai-lb-accent-*) 22%, transparent)`。

### 3.2 字体
- 数字统一 `tabular-nums`；指标数字 18px；列头 13px/600；模型名 15px/600；副标 11px/`--text-tertiary`。

### 3.3 间距规范
- 区块间 `--space-5`(24) · 控件组内 `--space-3`(12) · 控件间 `--space-2`(8) · 单元格纵向 `--space-3`(12) · 行高 `min 52px` 提升可读性。

### 3.4 动画
- `fade-up` 0.32s · `row-stagger` 0.04s×i（≤12 行）· `medal-pop` 0.2s `cubic-bezier(.34,1.56,.64,1)` · `bar-grow` 0.4s ease。全部 `prefers-reduced-motion` 关闭。

---

## 4. 响应式方案（桌面 / 平板 / 移动）

| 断点 | 布局策略 |
|---|---|
| **桌面 ≥1024**（含 180 sidebar → 内容 ≈900+） | 完整表格 + 工具栏左右分组（左筛选 / 右搜索排序）；sticky thead + 首列 sticky |
| **平板 640–1024** | 工具栏折两行；board chips 换行；表格**横向滚动** + 首列 sticky 左 |
| **移动 <640** | 表格转 **卡片列表**：每模型一卡 = rank 徽章(medal) + 模型名 + 主指标大数字 + 次级指标 2×N 网格；tab 横向滚动分段；控件全宽堆叠；对比改**底部 sticky 条** |

**移动端卡片视图是最大体验杠杆**：10 列表格在 375px 下不可用，卡片把"主指标大、次指标辅"的层级显性化。

---

## 5. 落地优先级

- **P0（直接解决可读性与动线）**：表格 `sticky thead`/首列 + 移动端卡片视图 + 列头点击排序。
- **P1（视觉与层级）**：视图语义色 + medal 排名 + 摘要条合并 + 间距统一。
- **P2（体验打磨）**：对比抽屉组件化（焦点陷阱/Esc）+ 键盘快捷键 + 动效补全 + 示例行色条。

---

*设计交付：UI Designer · 2026-07-20 · 可直接进入开发者交接（组件级 CSS 变量与断点已给出）*
