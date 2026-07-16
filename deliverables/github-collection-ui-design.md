# GitHub 优秀项目收录 — UI / 布局设计分析与增强建议

> 适用产品：Pulse（Electron + Preact 桌面应用）
> 设计基线：`docs/ui-design-system.md`（Apple 原生美学 / 毛玻璃 / 系统字体 / 设计令牌）
> 现有实现：`src/renderer/github/*`、`src/renderer/store/github-projects-store.js`
> 文档作者：UI Designer　日期：2026-07-16

---

## 0. 定位修正（关键前提）

原始增强提示把本模块假设为「GitHub 项目索引 / 发现 / 搜索页」。但 Pulse 的实际实现是**用户主动通过地址收录的个人项目库（curation & management）**，而非面向公开数据的发现界面。这一定位差异直接决定后续所有设计取舍：

- 数据是**用户私有的少量条目**（个人收藏，通常 < 200），不是海量公共索引 → 不需要重型搜索/分面筛选，轻量过滤即可。
- 核心价值是「**收录 → 看 README → AI 一键读懂**」，而非「探索新项目」。
- **视觉不应模仿 GitHub 风格**。Pulse 有自身设计系统（Apple 系统色 + 毛玻璃 + 系统字体 + oklch 令牌），本模块已正确复用 `--accent-primary` / `--surface` / `--border` / `--text-*` 等令牌，应延续而非另起视觉语言。

---

## 1. 模块功能定位

**建议定位语**：「我的开源项目库 — 收藏、速读、用 AI 提炼价值」。

| 维度 | 结论 |
|---|---|
| 核心用途 | 个人 GitHub 优秀项目的**收录管理 + 速读**（README 内联 + AI 解析） |
| 主客体 | 用户 = 收藏者；条目 = 用户主动添加的项目 |
| 非目标 | 公开发现、趋势榜单、按 star 排序的"热门探索" |
| 与 AI 的关系 | AI 解析是**差异化能力**（用法/功能/场景/标签），应作为一等公民露出，而非收在次级入口 |

> 设计含义：列表行应让"AI 是否已解析 + 一句话价值"可见，引导用户点开 AI 解析而非仅看 README。

---

## 2. 布局结构（现有 → 增强）

**现有结构（已合理，建议保留骨架）**
```
[FeatureHeader: GitHub 图标 + 标题 + 计数]
[AddForm: 地址输入 + 添加按钮]          ← 顶部常驻，收录入口
[ProjectList: 行列表，8/页 分页]
   └ 行：名称 / 简介 / 语言·star·已解析 chip / 操作(查看介绍·AI解析·删除)
[Drawer: README ↔ AI解析 双 tab]       ← 右侧抽屉，桌面端
```

**增强建议**

1. **视图切换（列表 / 卡片）**
   - 列表视图：信息密度高，适合已有收录。
   - 卡片视图：每张卡露出 **AI 解析一句话摘要**，适合"速览我的库"。
   - 实现：在 `GithubProjectList` 顶部加 `view` 状态（list/card），复用同一 `projects` 信号；卡片用现有 `.card` 令牌（圆角 `--radius-lg`、极柔阴影 alpha 0.04–0.18）。

2. **分页 vs 无限滚动**
   - 结论：**保留分页**。`PAGE_SIZE=8` 对私人库足够，分页状态可预期、可跳转，且对 a11y 更友好（焦点管理简单）。
   - 仅在收录数 > 50 时，可追加"跳到末页"；不引入无限滚动（私人库不需要，且会增加抽屉返回时的滚动位置丢失风险）。

3. **响应式适配（当前真实缺口）**
   - 现状：行内 3 个操作按钮在窄宽下会挤压/换行，未定义断点。
   - 建议：
     - `≥ 768px`：名称+操作并排（现状）。
     - `< 768px`：操作按钮换行到第二行，或收为「⋯ 更多」菜单（含 查看介绍 / AI解析 / 删除）。
     - 抽屉在 `< 768px` 应转为**全屏 sheet**（确认 `DrawerShell` 已支持 `fullscreenOnMobile`，否则加 `github-drawer--mobile` 媒体查询）。

---

## 3. 信息层级（字段优先级 + 实锤缺口）

**数据模型可用字段**（来自 `github-projects-store.js`）
`name, url, description, stars, language, addedAt, aiParse{summary,usage,features,scenarios,tags}, readmeFetchedAt, aiParsedAt`

**行内信息优先级（建议）**
```
P0 名称（可点，跳 GitHub）            — var(--text-primary), --font-size-base, 500
P1 简介（单行截断）                   — var(--text-secondary), --font-size-sm
P2 元信息 chip：语言 · star · 收录时间 — var(--text-tertiary), tabular-nums
P3 AI 状态：已解析(绿) / 可解析(蓝)   — github-chip--ok 复用
P4 操作：查看介绍 · AI解析 · 删除
```

**两个可补的实锤缺口**
1. **收录时间 `addedAt` 当前行内未展示** → 加一个「收录于 07-16」次级 chip（用 `--text-tertiary` + `--font-size-2xs`）。排序时也可按它。
2. **仓库最近更新时间 `pushedAt` 未持久化** → GitHub API（`fetchRepoMeta`）能返回，但 store 只映射了 `description/stars/language`。建议在 `addGithubProject` 与 `refreshGithubReadme` 时把 `pushedAt` 也写入 project 对象，行内可选展示「更新于 x 天前」，提升"项目是否还活跃"的判断。

**AI 摘要速览（建议）**
- 已解析的项目，在行内 `P1` 下方追加一行 AI 摘要（取 `aiParse.summary`，截断 1 行）。这能把"AI 解析"从隐藏能力变成**可见价值**，直接呼应模块定位。

---

## 4. 交互设计（现状缺口 → 建议）

**现状**：无搜索、无筛选、无排序、无置顶。

**建议（轻量、贴合私人库）**

1. **搜索框**（P0）
   - 位置：AddForm 下方、列表上方，复用 `.github-add__input` 样式（或细分 `.github-search`）。
   - 行为：按 `name` + `description` 实时过滤（信号派生 `filteredProjects`），不区分大小写。

2. **排序**（P1）
   - 选项：收录时间（默认，新→旧）/ star 高→低 / 名称 A→Z。
   - 实现：`<select>` 走 `--surface` + `--border` 令牌；排序在派生信号里完成，不改动持久化顺序。

3. **语言筛选**（P1，可选）
   - 从已收录项目的 `language` 集合生成下拉；私人库语言种类少，纯前端过滤即可，无需后端。

4. **置顶 / Pin**（P2）
   - 私人库常有"常看的项目"，加 `pinned` 布尔，置顶展示。比"收藏"更贴合（本身已是收藏）。

5. **详情展开方式**
   - 桌面：保持右侧 **Drawer**（现状良好）。
   - 移动：转全屏 sheet（见 §2.3）。
   - 抽屉内 README/AI 双 tab 设计合理，保留；建议 AI tab 空态文案强化"点击生成"的主行动感。

6. **删除确认**（a11y / 防误删）
   - 现状 `removeGithubProject` 直接删。建议加二次确认（`window.confirm` 或轻量 `confirm` 弹层），尤其鼠标易误触的图标按钮。

---

## 5. 视觉风格（延续 Pulse 设计系统，不模仿 GitHub）

**已合规项（保持）**
- 颜色：按钮 `--accent-primary`(#007aff 浅 / #0a84ff 深)、表面 `--surface`、分隔 `--border`、危险 `--color-danger`。**无裸 hex**（stylelint 通过）。
- 字体：系统字体栈 + `tabular-nums`（数字对齐，star 数更整齐）。
- 圆角：输入/按钮 `--radius-sm/md`，抽屉/卡片 `--radius-lg` + pill。
- 阴影：alpha 0.04–0.18 极柔阴影表达层级（深色模式靠"表面提亮"而非阴影）。
- 焦点：`--focus-ring` 2px outline，键盘可见。

**可增强的视觉细节**
1. **空状态**：现有 `IconPackage` + 标题 + 提示，良好。建议配图用 `--bg-secondary` 圆底托盘，与品牌空态一致。
2. **加载态**：
   - 添加中：`添加中…` 已有（good）。
   - README 加载：`GithubReadmeView` 接收 `loading`，建议渲染**骨架屏**（若干 `--bg-secondary` 圆角条）而非转圈，体验更稳。
   - AI 解析中：抽屉内用 `--accent-primary` 脉冲指示器 + "AI 正在阅读 README…"文案。
3. **star 数格式**：`formatStars` 已做 `1.2k` 缩写，保持；确保用 `tabular-nums`。
4. **图标一致性**：列表用 `IconBook`/`IconSparkles`/`IconTrash`，header 用 GitHub mark——均 `<svg>` 组件，统一 `currentColor`，符合系统。

---

## 6. 优先级行动清单

| 优先级 | 事项 | 改动点 |
|---|---|---|
| **P0** | 行内展示 `addedAt`（收录时间） | `GithubProjectRow` + `github.css` chip |
| **P0** | 加搜索框（name/desc 实时过滤） | `GithubProjectList` 派生 `filteredProjects` |
| **P0** | 删除二次确认 | `removeGithubProject` 调用处加 confirm |
| **P1** | 排序（收录时间/star/名称） | 同上 select |
| **P1** | 持久化 `pushedAt` 并可选展示 | store `addGithubProject`/`refreshGithubReadme` |
| **P1** | AI 摘要行内速览 | `aiParse.summary` 截断展示 |
| **P1** | 移动端行操作收拢 + 抽屉转 sheet | `github.css` 媒体查询 + `DrawerShell` 校验 |
| **P2** | 列表/卡片视图切换 | `GithubProjectList` view 状态 + 卡片样式 |
| **P2** | 置顶 Pin | store `pinned` + 排序置顶 |
| **P2** | README 骨架屏 | `GithubReadmeView` loading 态 |

---

**设计裁决小结**：本模块定位为「个人项目库管理」，视觉严格沿用 Pulse 设计令牌（不模仿 GitHub）。最高杠杆的三件事是——**行内露出收录时间 + AI 摘要速览**、**加轻量搜索/排序**、**移动端操作与抽屉响应式**。其余为体验润色。
