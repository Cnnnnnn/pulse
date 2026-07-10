# Pulse 应用分类 (Feature A) 实施计划

- **来源 spec**: `docs/superpowers/specs/2026-06-07-app-categorization-design.md`
- **日期**: 2026-06-08
- **作者**: Mavis (brainstorming-2 → writing-plans fallback)
- **范围**: 5 phases, 总计 ~6-8h
- **执行策略**: 全部自己单线干, 每 phase 1 commit, 独立可 rollback

---

## Phase A1 — 数据 + 运行时 (~1.5h)

### A1a — 2 个 JSON 数据文件 (~30 min)

**新增**:
- `config/categories.json` — 8 个分类元数据 (id/name/icon/order), 跟 spec §3.1 一致
- `config/app-category.json` — 24 个 app 1:1 映射, 跟 spec §3.2 一致

**验证**:
- `node -e "JSON.parse(require('fs').readFileSync('config/categories.json'))"` exit 0
- 8 个分类, id 唯一, 'other' 必存在
- 24 个 mapping, 全部 id 引用合法

**risk**: 0 (静态 JSON, 错就修)

### A1b — `src/config/category.js` 抽象 (~45 min)

**新增**:
- `src/config/category.js` — 跟 spec §4.1 一致, 6 个 API: `getCategory / getAllCategories / getCategoryById / getCategoryByName / validateCategoryMap / getCategoryTabsWithCount`

**改动**:
- 引入 `import` JSON (Node 18.17 + esbuild 支持 `assert { type: 'json' }`)
- module-level 构建 `APP_TO_CATEGORY` + `CATEGORIES_BY_ID` + `CATEGORIES_SORTED`
- 硬编码 `DEFAULT_CATEGORIES` + `DEFAULT_MAPPING` 写在文件底部 (跟 spec §3.3 容错路径)
- 启动时 `validateCategoryMap()` 自动调, 错误 log + fallback

**测试**:
- `tests/config/category.test.js` — ~20 cases (spec §8.1)

**验证**:
- `npm test -- tests/config/category.test.js` 全过
- 手动改 `categories.json` 故意写错 id → 启动 log warn, fallback DEFAULT

**risk**: JSON import 语法在 renderer 端 esbuild 编译时可能需调整, 准备 plain JS module 兜底

### A1c — `load-smoke` 加 coverage (~5 min)

**改动**:
- `tests/main/load-smoke.test.js` — 加 1 case: `src/config/category.js` 可 require

---

## Phase A2 — 状态 + 持久化 (~1h)

### A2a — `state-store.js` 扩 `active_category` 字段 (~30 min)

**改动**:
- `src/main/state-store.js`:
  - `loadState()` 读 `active_category` (缺 → 'all' fallback)
  - `saveAll()` 持久化时写入顶层 `active_category`
  - 跟现有 `mutes` / `last_opened` 一致的处理风格
- `src/config/schema.js` — 顶层 schema 加 `active_category: z.string().optional()`

**测试**:
- `tests/main/state-store.test.js` — +3 cases (round-trip / fallback / 缺 state.json)

**验证**:
- 跑全 `npm test` 不回归
- 手改 state.json 写非法 id → 启动 fallback 'all'

**risk**: 0 (扩字段, 旧 state.json 兼容)

### A2b — IPC + preload + api (~30 min)

**新增**:
- `src/main/ipc.js` — `ipcMain.handle('save-active-category', handler)`
- `preload.js` — `contextBridge.exposeInMainWorld('api', { ..., saveActiveCategory: (id) => ipcRenderer.invoke('save-active-category', id) })`
- `src/renderer/api.js` — `saveActiveCategory` 方法

**改动**:
- 跟现有 `saveMute` 同样风格 (round-trip state.json, 错误 log warn 不 throw)

**测试**:
- `tests/main/ipc.test.js` — 已有的话加 case; 没的话新建 5 cases

**risk**: 3 处必须同步 (preload / ipcMain / createApi overrides), 漏 → TypeError (memory 已记)

---

## Phase A3 — store + computed (~1h)

### A3a — `activeCategory` signal + `filteredResults` computed (~30 min)

**改动**:
- `src/renderer/store.js`:
  - `import { getCategory } from '../config/category.js'`
  - 新 `activeCategory = signal('all')` (默认 'all')
  - 新 `filteredResults = computed(() => { if (activeCategory.value === 'all') return results.value; ... })`
  - `resultsBySection` 现有逻辑: 输入从 `results.value` → `filteredResults.value` (单行改)
  - 新 `setActiveCategory(id)` 函数: 赋值 + 异步 `api.saveActiveCategory(id)`

**测试**:
- `tests/renderer/filter-by-category.test.jsx` — ~10 cases (spec §8.1)

**验证**:
- 跑 vitest 全过

**risk**: 0 (computed 包一层, 现有 data flow 不变)

### A3b — Bootstrap 时还原 (~15 min)

**改动**:
- `src/renderer/index.jsx`:
  - 启动 `Promise.all([loadMutes, loadLastOpened, loadActiveCategory])` 拿 `state.json.active_category`
  - 调 `setActiveCategory(saved)` 还原
  - 加 `loadActiveCategory()` helper (跟 `loadMutes` 一致)

**测试**:
- `tests/integration/...` 1 e2e case (spec §8.2)

**risk**: 启动时序, 跟现有 `loadMutes` 同步没问题

---

## Phase A4 — UI + 集成 (~1.5h)

### A4a — `<CategoryTabs />` 组件 (~45 min)

**新增**:
- `src/renderer/components/CategoryTabs.jsx` — 跟 spec §5.1 一致
- `styles.css` 新增 `.category-tabs` / `.category-tab` / `.category-tab.active` 等样式

**测试**:
- `tests/renderer/category-tabs.test.jsx` — ~15 cases (spec §8.1)

**风险**:
- "全部" + 7 个非空分类 + "其他" 横排可能挤窗口 (4 tab 也有可能), 横向 scroll
- count 数字格式: `(4)` vs `[4]` vs 裸 4 — 决策在 spec §5.4: `(4)` 括号

### A4b — `<ResultsView />` 集成 (~30 min)

**改动**:
- `src/renderer/components/ResultsView.jsx`:
  - import `<CategoryTabs />` + `getCategoryTabsWithCount`
  - 在 `<SectionList />` 上方插 `<CategoryTabs />`
  - `tabs = computed(() => getCategoryTabsWithCount(results.value))`
  - 传 `active` + `onSelect` props

**视觉验证**:
- 启 Pulse, 截屏 / playwright 渲染截图
- 切 tab → app list 跟着过滤
- 切回 "全部" → 看到所有

**risk**: 0 (UI 集成, 不改 data flow)

### A4c — 视觉细节 + 150ms 渐变 (~15 min)

**改动**:
- `styles.css` — 选中 tab 蓝色下划线 + 文字色, hover 浅灰, 150ms transition
- 跟 Phase 14/28/29 视觉风格一致 (不引入新设计 token)

---

## Phase A5 — Polish + e2e (~1h)

### A5a — 键盘快捷键 (~20 min)

**改动**:
- `CategoryTabs` 加 `useEffect` 监听 `keydown`:
  - `1`-`8` 切前 8 个 tab (按 tab 顺序)
  - `0` 切 "全部"
  - 焦点在 input/textarea 时不抢

**测试**:
- 1-2 个手动 case (不写自动化, 简单)

**risk**: 跟 macOS 菜单栏快捷键冲突, 测一遍

### A5b — 空 state + 边界 (~15 min)

**改动**:
- "📦 其他" 0 app 时, banner 显示 "📅 暂无未分类 app" 而不是 0
- 当前 activeCategory 是被 hide 的空 tab → 启动 fallback 'all' (state-store 已防, 这里再 defense in depth)
- 切 tab 时 `saveActiveCategory` 失败 → log warn, 不弹错

**测试**:
- 0 app 启动 → banner "其他" 显示 0 但不崩
- mock saveActiveCategory 失败 → UI 仍切

### A5c — README + RELEASE-NOTES (~10 min)

**改动**:
- `RELEASE-NOTES.md` — 新增 v2.4.0 (Phase A) 章节, 描述 8 类 + 顶部 tabs
- `README.md` (如有) — 加 1 段"应用分类" 描述

**风险**: 0

### A5d — 跑全测试 + manual smoke (~15 min)

- `npx vitest run` → 全过
- `npm run build:renderer && npm run build` → 出新 DMG
- 装 DMG, 启动, 截屏验证 5 phases 一起 work

---

## 总测试 case

| 新增 | ~50 case (spec §8.1) |
|---|---|
| 现有更新 | +4 case (load-smoke + state-store) |
| **总** | **+54 case** (跟 Phase 28/29 量级一致) |

## 风险汇总

1. **JSON import 语法** — esbuild + renderer 可能不直接支持 `assert { type: 'json' }`, 准备 plain JS module 兜底
2. **`activeCategory` 持久化跟 search/filter 同步问题** — 切 tab 不丢 search query, 已在 spec §7 边界 + Phase A3 测试覆盖
3. **隐藏空 tab 时 selected tab 被隐藏** — 已加 fallback (active 不存在 → 'all')

## 决策默认值 (v1 拍板, 后续可调)

- 8 类固定 (无 drag-to-reorder)
- 'all' 永显示, 不参与 hide
- 'other' 永显示, 不参与 hide
- "全部" 用 📋 emoji (跟分类 emoji 风格统一)
- 切换 150ms ease transition (跟其他 tab/panel 风格一致)
- 键盘 `0` 切 "全部", `1-8` 切分类 (按 tab 顺序, "其他" 排第 9)
