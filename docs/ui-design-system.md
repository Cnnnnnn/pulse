# AppUpdateChecker · 统一 UI 设计规范

> **制定人**：UI Designer
> **目标**：在保留现有 Apple 原生美学的前提下，消除"双轨并行"导致的视觉不一致，建立**单一令牌真源** + **组件样式基线**，让全站风格统一、可维护、跨主题一致。
> **配套文档**：`ui-design-audit.md`（发现）、`ui-theme-switching.md`（明暗主题方案）

---

## 1. 设计原则

1. **保留 Apple 原生美学**：系统字体、Apple 系统色、半透明毛玻璃背景是产品辨识度，**不推翻**，只统一。
2. **单一令牌真源**：所有颜色/字号/间距都来自令牌；禁止写死魔数（fallback 也必须是令牌值）。
3. **Primitive → Semantic 两层结构**：原始色板（`--blue-500`）与语义令牌（`--accent-primary`）分离；主题只重定义语义层。
4. **语义优先于数值**：令牌名表达"用途"（`--text-secondary`）而非"值"（`--gray-600`）。
5. **可访问性内建**：正文对比度 ≥ 4.5:1，UI 元素 ≥ 3:1，焦点环清晰，触控目标 ≥ 44px。

---

## 2. 色彩体系

### 2.1 原始色板（Primitive）— 中性阶梯统一为单一序列

> 废除 Tailwind 灰（`#6b7280/#9ca3af/#e5e7eb`）与 Material/Bootstrap 灰（`#888/#666/#999/#1a1a1a` 等），全部映射到下方 `--gray-*`。

| Token | 浅色值 | 用途 |
|---|---|---|
| `--gray-50`  | `#f5f5f7` | 页面最浅背景 / 反白文字 |
| `--gray-100` | `#e5e5ea` | 分隔线 / 极浅表面 |
| `--gray-200` | `#d1d1d6` | 边框（浅） |
| `--gray-300` | `#aeaeb2` | 占位/禁用文字（tertiary） |
| `--gray-400` | `#8e8e93` | 图标/次要文字（quaternary→统一 tertiary） |
| `--gray-500` | `#6e6e73` | 次要文字（secondary） |
| `--gray-600` | `#48484a` | 深色边框 |
| `--gray-700` | `#2c2c2e` | 深色表面 |
| `--gray-800` | `#1d1d1f` | 主要文字（primary） |

> 品牌强调色沿用现有 Apple 值（已验证为有意设计），不做色相改动：

| Token | macOS 浅 | macOS 暗 | Windows |
|---|---|---|---|
| `--blue-500`  | `#007aff` | `#0a84ff` | `#4cc2ff` |
| `--green-500` | `#34c759` | `#30d158` | `#3fb950` |
| `--orange-500`| `#ff9500` | `#ff9f0a` | `#ff9f0a` |
| `--red-500`   | `#ff3b30` | `#ff453a` | `#ff6b6b` |
| `--purple-500`| `#7c3aed` | `#bf5af2` | `#c586ff` |

### 2.2 语义令牌（Semantic）— 业务直接用这一层

| 类别 | Token | 映射（浅） | 映射（暗） |
|---|---|---|---|
| **强调/品牌** | `--accent-primary` | `var(--blue-500)` | `var(--blue-500)`（暗用 `#0a84ff`） |
| | `--accent-primary-hover` | `#0066d6` | `#409cff` |
| | `--accent-primary-press` | `#0055a4` | `#0a84ff` |
| **语义状态** | `--color-success` | `var(--green-500)` | `var(--green-500)`（暗 `#30d158`） |
| | `--color-warning` | `var(--orange-500)` | `var(--orange-500)` |
| | `--color-danger` | `var(--red-500)` | `var(--red-500)`（暗 `#ff453a`） |
| | `--color-info` | `var(--blue-500)` | `var(--blue-500)` |
| **文字** | `--text-primary` | `var(--gray-800)` | `var(--gray-50)` |
| | `--text-secondary` | `var(--gray-500)` | `var(--gray-300)` |
| | `--text-tertiary` | `var(--gray-400)` | `var(--gray-400)`（暗 `#8e8e93` 已达标） |
| | `--text-inverse` | `#ffffff` | `#1d1d1f`（深底浅字） |
| **表面/背景** | `--bg-primary` | `rgba(255,255,255,0.82)`（毛玻璃） | `rgba(30,30,30,0.88)` |
| | `--bg-secondary` | `#f5f5f7` | `#2c2c2e` |
| | `--surface` | `#ffffff` | `#1c1c1e` |
| | `--surface-elevated` | `#ffffff` | `#2c2c2e`（暗色靠"更亮"表达层级） |
| **边框** | `--border` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.10)` |
| | `--border-strong` | `rgba(0,0,0,0.16)` | `rgba(255,255,255,0.20)` |
| **聚焦** | `--focus-ring` | `rgba(0,122,255,0.45)` | `rgba(10,132,255,0.55)` |

> **关键修复**：原 `--accent`（悬空变量）在此体系中**彻底废除**，所有原 `var(--accent, …)` 调用改为显式 `--accent-primary` / `--color-danger` 等（见审计 P0-1）。

---

## 3. 排版规范

### 3.1 字体栈（沿用现有，保留平台切换）
```css
--font-system: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif;
--font-windows: "Segoe UI", "Segoe UI Variable", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```
`body.platform-win { --font-system: var(--font-windows); }`（保留现有平台机制）。

### 3.2 字号阶梯（固定 rem 制，适配数据密集桌面 UI）

> 废除 12.5/11.5/13.5/9.5/10.5px 等半像素值；统一用令牌。

| Token | 值 | 用途 |
|---|---|---|
| `--font-size-2xs` | 10px | 极次要标注、legal |
| `--font-size-xs`  | 11px | 元信息、表格辅助 |
| `--font-size-sm`  | 12px | 次要 UI 文字 |
| `--font-size-md`  | 13px | 默认次级正文 |
| `--font-size-base`| 14px | **正文基准** |
| `--font-size-lg`  | 15px | 强调正文 |
| `--font-size-xl`  | 17px | 小标题（title） |
| `--font-size-2xl` | 18px | 区块标题（subtitle） |
| `--font-size-3xl` | 20px | 卡片大标题 |
| `--font-size-4xl` | 28px | 页面主标题 |

### 3.3 字重 / 行高 / 字距
- **字重**：`400`（正文）/ `500`（强调）/ `600`（标题/按钮）/ `700`（数字/重点）。暗色下正文可降至 `350-400` 减轻发虚。
- **行高**：正文 `1.5`、标题 `1.25`、紧凑 UI `1.35`；统一为无单位比例，禁止 `18px` 像素行高。
- **数字对齐**：表格/价格用 `font-variant-numeric: tabular-nums;`（等宽数字）。
- **正文最小 14px**（桌面可接受 13px 元信息）；行高随暗色背景 +0.05–0.1。

---

## 4. 间距规范（4px 基线 + 半步）

> 废除 7/5/9/26/22/34/30px 等越界值。

| Token | 值 | 典型用途 |
|---|---|---|
| `--space-1`  | 4px  | 图标内间距、细密间隙 |
| `--space-1h` | 6px  | 半步 |
| `--space-2`  | 8px  | 控件内边距、列表项内距 |
| `--space-2h` | 10px | 半步 |
| `--space-3`  | 12px | 卡片内边距、行间 |
| `--space-3h` | 14px | 半步 |
| `--space-4`  | 16px | 区块内边距 |
| `--space-5`  | 20px | 页面边距 `--page-padding` |
| `--space-6`  | 24px | 大区块间距 |
| `--space-8`  | 32px | 段落级间距 |
| `--space-10` | 40px | 分区级间距 |
| `--space-12` | 48px | 页面级留白 |

---

## 5. 圆角 / 阴影 / 层级

| Token | 值 | 用途 |
|---|---|---|
| `--radius-sm` | 6px  | 输入框、小标签 |
| `--radius-md` | 10px | 卡片、按钮 |
| `--radius-lg` | 14px | 弹窗、抽屉 |
| `--radius-pill` | 999px | 徽章、胶囊按钮、头像 |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.06)` | 浅色表面微浮 |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.10)` | 卡片 hover、下拉 |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,0.18)` | 弹窗、抽屉 |

> **暗色模式靠"表面提亮"表达层级，而非阴影**（见主题方案）：`--surface` 比 `--bg-primary` 亮一档即可，避免暗底投影发脏。

---

## 6. 组件样式定义（基线）

> 所有组件**只用上述令牌**。以下为规范基线，供迁移对照。

### 6.1 按钮 Button
| 变体 | 背景 | 文字 | 边框 | hover | 圆角 |
|---|---|---|---|---|---|
| Primary | `--accent-primary` | `--text-inverse` | 无 | `--accent-primary-hover` + `--shadow-md` | `--radius-md` |
| Secondary | `transparent` | `--accent-primary` | `1px --accent-primary` | `rgba(0,122,255,0.08)` 底 | `--radius-md` |
| Ghost | `transparent` | `--text-secondary` | 无 | `--bg-secondary` | `--radius-md` |
| Danger | `--color-danger` | `--text-inverse` | 无 | 暗一档 | `--radius-md` |

- **尺寸**：`sm`(高 28px/字 12px)、`md`(高 32px/字 14px)、`lg`(高 40px/字 15px)
- **最小触控**：高度 ≥ 32px（桌面可接受 28px，但交互热区 padding 保证 ≥ 44px）
- **焦点**：`outline: 2px solid var(--focus-ring); outline-offset: 2px;`
- **禁用**：`opacity: .5; pointer-events: none;`

### 6.2 输入框 Input
- 背景 `--surface`，边框 `1px --border`，圆角 `--radius-sm`，内边距 `--space-2 --space-3`
- 聚焦：边框变 `--accent-primary` + `box-shadow: 0 0 0 3px var(--focus-ring);`
- 占位符：必须用 `--text-tertiary`（达标对比），**禁止** `#999` 等

### 6.3 卡片 Card（替代 11 个诊断 Card 各自实现）
- 背景 `--surface`，边框 `1px --border`，圆角 `--radius-md`，内边距 `--space-4`
- hover：`--shadow-md` + `translateY(-2px)`（数据卡可不加位移，仅阴影）
- 标题用 `--font-size-xl/600 --text-primary`；正文 `--text-secondary`

### 6.4 徽章 Badge（状态点/标签）
- 用语义色：更新可用=`--color-warning`、已最新=`--color-success`、预发布=`--accent-primary`、不兼容=`--text-tertiary`、未安装=`--text-tertiary`
- 圆角 `--radius-pill`，字 `--font-size-2xs/600`，配 `1px` 同色半透明边框
- **状态色一律引用 `--color-*` 令牌**（修复 `selectors.js` 的 `#c7c7cc` 等离谱值）

### 6.5 标签 Tabs
- 选中：底部 `2px --accent-primary` 下划线 + 文字 `--text-primary`
- 未选：`--text-secondary`，hover `--text-primary`
- 禁止用悬空 `--accent` 画下划线（审计 P0-1）

### 6.6 表格 Table / 列表行 Row
- 行高 ≥ 44px（触控），单元格间距 `--space-3`
- 表头 `--text-tertiary --font-size-xs` + `tabular-nums`
- 分隔线 `1px --border`

### 6.7 弹窗/抽屉 Modal & Drawer
- 沿用现有 `ModalShell.jsx` / `DrawerShell.jsx` 壳，背景 `--surface`、圆角 `--radius-lg`、阴影 `--shadow-lg`
- 遮罩 `rgba(0,0,0,0.4)`（浅）/ `rgba(0,0,0,0.6)`（暗）
- 标题 `--font-size-2xl/600`，关闭按钮 `--text-secondary` hover `--text-primary`

---

## 7. 可访问性基线（强制）

- **对比度**：正文 ≥ 4.5:1、大字 ≥ 3:1、UI 元素 ≥ 3:1（用 WebAIM Contrast Checker 校验 `#888` 等散色，均不达标）。
- **焦点管理**：所有可交互元素有清晰 `:focus-visible` 环；逻辑 Tab 顺序。
- **语义 HTML**：列表用 `<ul>/<li>`、按钮用 `<button>`（非 `<div onClick>`）、标题层级 `h1→h2→h3` 不跳级。
- **触控目标**：≥ 44×44px（桌面可放宽至 32px 视觉，但热区补足）。
- **不依赖颜色**：状态除颜色外辅以图标/文字（如"已最新"配对勾）。
- **动效尊重**：`@media (prefers-reduced-motion: reduce)` 关闭非必要过渡。

---

## 8. 令牌采用率护栏（防回归）

1. **lint 规则**：CSS 中出现裸 hex（非令牌定义区）即告警；`var(--未定义变量)` 报错。可用 Stylelint `color-no-hex` + 自定义"变量必须存在"规则。
2. **CI 检查**：提交时扫描 `styles.css` 新增裸色，超阈值阻断。
3. **单一真源文件**：所有令牌集中在 `styles.css` 的 `:root` / `:root[data-theme="dark"]` / `body.platform-win` 三层（见主题方案），运行时唯一真源；不再单独维护 `tokens.css`。
