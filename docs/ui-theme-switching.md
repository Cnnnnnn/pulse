# AppUpdateChecker · 深浅色主题切换方案

> **制定人**：UI Designer
> **目标**：在现有"令牌 + `prefers-color-scheme` 跟随系统"基础上，增加**用户手动切换**（system / light / dark），建立**可维护的三轴主题架构**，并确保所有组件在两种主题下都正确显示。
> **配套**：`ui-design-audit.md`、`ui-design-system.md`、`src/renderer/theme/theme-manager.js`（已落地）。令牌已归并 `styles.css`（单一真源），不再单独维护 `tokens.css`。

---

## 1. 现状（落地后）

| 能力 | 现状 | 缺口 |
|---|---|---|
| 令牌系统 | ✅ 110 个 CSS 变量 | 采用率低，1864 处写死（P1/P2 持续收敛） |
| 深色模式 | ✅ 原 3 处 `@media` 已改为 `:root[data-theme="dark"]` 驱动 | 支持手动 + 跟随系统 |
| 平台主题 | ✅ `body.platform-mac` / `platform-win` | 正常 |
| JS 主题状态 | ✅ `theme-manager.js` 三态 + localStorage 持久化 | 设置页可切换 |

---

## 2. 目标架构：三轴

```
                  ┌─────────────────────────────────────────┐
   用户偏好轴 ──▶ │  mode = 'system' | 'light' | 'dark'     │  ← 由 theme-manager 写入
                  └─────────────────────────────────────────┘
                                     │ data-theme="light|dark"（已解析）
                  ┌─────────────────────────────────────────┐
   主题令牌轴 ──▶ │  Semantic 令牌按 data-theme 重定义        │  ← styles.css
                  └─────────────────────────────────────────┘
                                     │ <html data-theme> + <body class="platform-*">
                  ┌─────────────────────────────────────────┐
   平台轴 ──────▶ │  body.platform-win 覆盖强调色/字体        │  ← 保留现有机制
                  └─────────────────────────────────────────┘
```

**关键决策**：
- `mode='system'` 由 **JS 解析**为具体 `light/dark` 后写入 `data-theme`（而非依赖 CSS `@media`）。好处：单一事实来源、手动覆盖无歧义、无媒体查询重复。
- CSS 只认 `:root`（浅）与 `:root[data-theme="dark"]`（深）两种显式状态。
- 平台差异仍由 `body.platform-win` 独立覆盖（与主题正交；按 CSS 继承"就近生效"原则，body 上的令牌覆盖 html 上的同名令牌）。

---

## 3. 令牌分层策略（防回归核心）

```
Primitive（--blue-500 / --gray-800 …）   ─┐
                                          ├─ 任何主题都不变，只做"颜料"
Semantic （--accent-primary / --text-…） ─┘
     │
     ├─ :root                   → 浅色语义映射
     ├─ :root[data-theme=dark]  → 深色语义映射（只改这一层！）
     └─ body.platform-win       → 平台语义映射（只改这一层！）
```

> **规则**：Primitive 永不在主题块里改；改主题 = 只重定义 Semantic 层。新增颜色先加 Primitive，再在 Semantic 引用。

---

## 4. 接入步骤（已落地）

### Step 1 · 令牌单一真源（已落地）
令牌定义统一在 `styles.css` 内，分三层：
- `:root` — 浅色 Semantic 映射（现有，未动）
- `:root[data-theme="dark"]` — 深色 Semantic 映射（由原 3 处 `@media (prefers-color-scheme: dark)` 块转换而来，**手动切换的关键**）
- `body.platform-win` — 平台语义覆盖（现有，未动）

> 不引入独立 `tokens.css`：避免两套令牌打架，`styles.css` 即运行时唯一真源。FOUC 与切换脚本见 Step 2–3。

### Step 2 · 防闪烁（FOUC）内联脚本（已落地）
在 `index.html` `<head>` 顶部、引入 CSS **之前**插入（已落地）：

```html
<script>
  /* 防闪烁 (FOUC): 在 CSS 加载前同步写入 data-theme, 避免深浅色切换闪白/闪黑 */
  (function () {
    try {
      var key = 'app-theme-preference';
      var mode = localStorage.getItem(key) || 'system';
      var dark = mode === 'dark' ||
        (mode === 'system' && window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);
      var root = document.documentElement;
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
      root.setAttribute('data-theme-source', mode);
    } catch (e) {}
  })();
</script>
```

### Step 3 · 渲染入口初始化（已落地）
在 `src/renderer/index.jsx`（`applyPlatformBodyClass()` 之后）调用：

```js
import { initTheme } from './theme/theme-manager.js';
initTheme();
```

### Step 4 · 提供切换 UI（已落地）
- **设置页**（`src/renderer/components/SettingsPage.jsx`）：三选项分段控件 `system / light / dark` → `setThemePreference(mode)`，用 `@preact/signals` 高亮当前项。
- **托盘菜单 / 快捷键**：`toggleTheme()`。
- **状态读取**：`getThemePreference()` 用于高亮当前选项。

### Step 5 · 持久化（Electron 建议）
`theme-manager.js` 默认用 `localStorage`；桌面应用建议替换为既有配置模块（代码内 `CONFIG` 注释处改为 `window.electronAPI.getConfig/setConfig`），保证跨会话与多窗口同步。

---

## 5. 确保"所有组件两主题正确显示"的 QA 清单

切换主题后，逐项核对（建议接 Playwright 截图比对）：

- [ ] **无裸色残留**：`styles.css` 中每个组件若写死 hex，暗色下必出 bug → 全量引用令牌（审计 P0-2 的 Tailwind 灰 fallback 已修）。
- [ ] **悬空 `--accent` 已清零**：全局 `var(--accent, …)` 替换为 `--accent-primary` / `--color-danger`（审计 P0-1）。
- [ ] **毛玻璃背景**：`--bg-primary` 暗色为 `rgba(30,30,30,0.88)`，与窗口底色协调，无白边。
- [ ] **文字对比**：`--text-secondary`(#6e6e73) / `--text-tertiary`(#8e8e93) 在暗底均 ≥ 4.5:1（实测达标）。
- [ ] **边框可见**：`--border` 暗色为 `rgba(255,255,255,0.10)`，分隔线在深背景可见但不刺眼。
- [ ] **阴影转层级**：暗色下阴影减弱、表面提亮（`--surface-elevated` 比 `--bg-primary` 亮一档）。
- [ ] **平台正交**：`platform-win` 下 `data-theme=dark` 也正确（`styles.css` 中 `:root[data-theme="dark"]` 与 `body.platform-win` 两套独立覆盖，按继承就近生效）。
- [ ] **图表/内联 SVG**：`Sparkline` 等内联色改用令牌（`#34c759→var(--color-success)` 等）；国旗色板（`flags.jsx`）属合法数据，豁免。
- [ ] **焦点环**：`--focus-ring` 暗色更亮（`rgba(10,132,255,0.55)`），键盘可达。
- [ ] **减少动效**：`@media (prefers-reduced-motion: reduce)` 下过渡关闭（分段控件已加）。

---

## 6. 迁移策略（分阶段，低风险）

### Phase 1 · 快速止血（P0，已执行）
1. 全局替换 `var(--accent, #4a90e2)` / `#3b82f6` / `#007aff` / `#ff3b30` 等 → 对应 `--accent-primary` / `--color-danger`（按上下文语义判断）。
2. 修正 `var(--border, #e5e7eb)` / `var(--text-secondary, #6b7280)` / `var(--text-tertiary, #9ca3af)` 的 fallback 为令牌自身值。
3. 落地 `theme-manager.js`（JS 控制器）+ `index.html` FOUC 脚本 + `styles.css` 三处 `@media` 转 `:root[data-theme="dark"]` + 设置页切换 UI。

### Phase 2 · 收敛散色（P1）
用 `ripgrep` 批量映射高频散色（在 `styles.css` 非令牌定义区）：

| 散色（误） | 应映射令牌 |
|---|---|
| `#888` `#666` `#999` `#555` `#1a1a1a` `#222` `#333` | `--text-secondary` / `--text-tertiary` / `--gray-*` |
| `#6b7280` `#9ca3af` `#e5e7eb` | `--text-secondary` / `--text-tertiary` / `--border` |
| `#e53935` `#ed2939` `#da0000` | `--color-danger` |
| `#2ea043` `#4cc26b` `#1eb53a` `#00853f` | `--color-success` |
| `#4a90e2` `#357abd` `#0055a4` `#0033a0` | `--accent-primary` / 其 hover/press |
| `#c7c7cc` | `--text-tertiary` |
| `#fff`（文字/背景） | `--text-inverse` / `--surface` |

> 批量后用对比截图验证，避免误伤（如纯白图标描边应保留 `#fff`）。

### Phase 3 · 护栏与回归（P2/P3）
1. **Stylelint 规则**：`color-no-hex`（定义区豁免）+ 自定义"引用变量必须存在"规则，CI 阻断裸色新增。
2. **抽取共享组件**：11 个诊断 Card → 共享 `Card`；多套 Header/Layout/Tabs → 共享基线（见设计系统 §6）。
3. **收敛散色**：`styles.css` 非令牌区的裸 hex 持续迁到 Semantic 令牌；`tokens.css` 已合并进 `styles.css`，保持单一真源。

---

## 7. 性能与兼容性

- **OKLCH 选项**：当前用 hex 以保品牌精确匹配与广泛 Electron Chromium 兼容；未来可平滑迁移到 OKLCH（中性阶梯用 `oklch()` 获得更均匀的明度阶梯），Primitive 改名即可，Semantic 不动。
- **零运行成本**：主题切换仅改 `<html>` 一个属性，CSS 变量即时重算，无重渲染、无布局抖动。
- **首屏无闪**：内联 FOUC 脚本保证渲染前 `data-theme` 已就绪。

---

## 8. 验收标准

- [x] 设置页可切换 system/light/dark，立即生效且重启保留
- [x] `data-theme` 在 `<html>` 上正确反映（DevTools 可查）
- [ ] 浅/暗两套截图通过 §5 QA 清单（P1/P2 散色收敛后复测）
- [ ] `styles.css` 中裸 hex 新增数为 0（Stylelint 通过后）
- [ ] 审计健康分从 **13/20** 提升至 **17+**
