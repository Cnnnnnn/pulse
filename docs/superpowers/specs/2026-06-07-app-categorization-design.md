# Pulse 应用分类 (App Categorization)

- **日期**: 2026-06-07
- **作者**: Mavis (brainstorming-2)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (Pulse v2.3+)
- **目标特性**: 给每个监控中的 app 静态映射一个分类 (8 类), UI 用顶部 tab 切换, 下方 source section 不变; 静态 map 是 single source of truth, 不支持用户 override。

## 0. 决策日志 (brainstorming-2 产出)

| 决策点 | 选择 | 备选 + 否决理由 |
|---|---|---|
| 分类来源 | **静态映射表** (`config/categories.json` + `config/app-category.json`) | macOS Info.plist (英文枚举难翻译); 用户自定义 (需手动做一次); 静态 + 用户 override (双 source of truth 难维护) |
| UI 布局 | **C 方案: 顶部 category tabs + 内部 source section** | A 方案 (单轴分组, 替换 source) → 丢 source 信息; B 方案 (filter chip 叠加) → 视觉冗余 |
| Taxonomy 粒度 | **8 类** | 3 类 (太粗, "生产力"啥都装); 6 类 (中等, 多数人会有 1-2 个空 tab) |
| 跨分类 | **1:1, 1 个 app 只进 1 类** | 1:N (多分类, 计数去重麻烦, 多数 app 边界明确) |
| 空 tab 处理 | **hide empty** (除 "📦 其他" 永远显示) | 全部显示 (0 透明度 50% → 缩口); "其他" 永显示 + 其余 hide (用户实际选了等价前者) |
| 静态 map 存储 | **JSON 文件** (`config/categories.json` + `config/app-category.json`) | 硬编码 JS 模块 (难 PR); CSV + build step (过度工程) |
| 计数排序 | **count desc → order asc** (相同 count 按 config order) | 固定 order (装多 AI 时很挤); 纯 count desc (装少时其他 0 永远最后) |

## 1. 目标

### 1.1 必须达成

- [A] `config/categories.json` 定义 8 个分类 (id, name, icon, order)
- [A] `config/app-category.json` 定义 app → categoryId 1:1 映射
- [A] `src/config/category.js` 提供 `getCategory(name) / getAllCategories() / validateCategoryMap()` API
- [A] 启动时加载, 跟 `apps.json` 同步加载; 任何 schema 错误 → fall back hardcoded default (跟现有 `apps.json` 容错一致)
- [A] 顶部新 `<CategoryTabs />` 组件, 渲染: 全部 / 非空分类 (按 count desc 排) / "其他" 永远显示
- [A] 点击 tab 切换 `activeCategory` signal, 默认 `'all'`
- [A] `activeCategory` 持久化到 `state.json.active_category` (顶层新字段)
- [A] 切换 tab 不丢 search query / filter / mute 状态
- [A] 任意 app 在 map 找不到 → 自动归 "📦 其他", 不报错
- [A] 8 个分类的初次映射覆盖: Cursor / Claude / ChatGPT / VSCode / iTerm2 / Docker / Postman / Chrome / Firefox / Arc / Slack / Discord / WeChat / Figma / Sketch / Spotify / IINA / Obsidian / Notion / Things / Alfred / 1Password / Bartender / Raycast

### 1.2 应该达成 (nice-to-have)

- [B] "其他" tab 即使空也显示, 显示 "暂无未分类 app"
- [B] 切换 tab 时有 150ms 渐变过渡
- [B] Tab 数字 (count) 实时更新 (跟 results 变化同步)
- [B] 键盘快捷键 `1`-`8` 切换前 8 个 tab, `0` 切到"全部"

### 1.3 不会做 (out of scope)

- ❌ 用户自定义分类或重命名 (静态 map 是 single source of truth)
- ❌ 用户手动 re-categorize 某个 app (override 不支持)
- ❌ 跨分类 (1 app 归多类)
- ❌ 动态发现分类 (从 macOS Info.plist 自动提取)
- ❌ LLM 分类未知 app
- ❌ 分类相关通知 (不引入"AI 工具升级" 这种 grouped notification)
- ❌ 拖拽排序 (固定 order, 不可改)
- ❌ 导出/导入 map (走 git PR)

## 2. 架构

```
┌─────────────────────────────────────────────────────────┐
│  config/categories.json    (新增 — 8 类元数据)            │
│  config/app-category.json  (新增 — app → categoryId 1:1) │
└────────────────────────┬────────────────────────────────┘
                         │ 启动时加载 (跟 apps.json 同步)
                         ▼
            ┌────────────────────────┐
            │  category.js  (新模块)  │  getCategory(name) / getAllCategories() / validateCategoryMap()
            │  preload 时构建 Map     │  纯函数 + Map<appName, categoryId> 缓存
            └────────┬───────────────┘
                     │ Map<appName, categoryId>
                     ▼
   ┌─────────────────────────────────────┐
   │  store.js  新 signal:               │
   │  - activeCategory  (默认 'all')     │
   │  持久化: state.json.active_category │
   │  新 computed:                       │
   │  - filteredResults (按 activeCategory 过滤) │
   └────────┬────────────────────────────┘
            │
            ▼
   ┌─────────────────────────────────────┐
   │  ResultsView  新组件:               │
   │  - <CategoryTabs />   (顶部)         │
   │  - <SectionList />    (下方, 输入换 filteredResults) │
   └─────────────────────────────────────┘
```

### 关键不变量

1. **不破坏现有数据流**: `resultsBySection` computed 保留, 输入换成 `filteredResults` (一 wrapper)
2. **降级路径**: 任何 app 在 map 找不到 → "📦 其他", 永不崩
3. **静态 map 是 single source of truth**: UI 不暴露任何修改入口

## 3. 数据层

### 3.1 `config/categories.json`

```json
{
  "version": 1,
  "categories": [
    { "id": "ai",         "name": "AI 工具",  "icon": "🤖", "order": 1 },
    { "id": "dev",        "name": "开发者",   "icon": "🛠", "order": 2 },
    { "id": "browser",    "name": "浏览器",   "icon": "🌐", "order": 3 },
    { "id": "comms",      "name": "沟通",     "icon": "💬", "order": 4 },
    { "id": "media",      "name": "媒体",     "icon": "🎨", "order": 5 },
    { "id": "notes",      "name": "笔记",     "icon": "📝", "order": 6 },
    { "id": "system",     "name": "系统",     "icon": "🔧", "order": 7 },
    { "id": "other",      "name": "其他",     "icon": "📦", "order": 99 }
  ]
}
```

- `version: 1` 留作 schema 演进空间
- `id` 必须稳定 (字符串 literal, 不重命名); `name` / `icon` 可改
- `order: 99` 让 "其他" 永远最后 (兜底)

### 3.2 `config/app-category.json`

```json
{
  "version": 1,
  "mapping": {
    "cursor":        "ai",
    "claude":        "ai",
    "chatgpt":       "ai",
    "raycast":       "system",
    "iterm2":        "dev",
    "vscode":        "dev",
    "docker":        "dev",
    "postman":       "dev",
    "chrome":        "browser",
    "firefox":       "browser",
    "arc":           "browser",
    "slack":         "comms",
    "discord":       "comms",
    "wechat":        "comms",
    "figma":         "media",
    "sketch":        "media",
    "spotify":       "media",
    "iina":          "media",
    "obsidian":      "notes",
    "notion":        "notes",
    "things":        "notes",
    "alfred":        "system",
    "1password":     "system",
    "bartender":     "system"
  }
}
```

- 初次 24 个 app 映射 (跟 §1.1 最后一条对齐)
- 后续 PR 可加 (新 app 装了就 PR 进 map)
- `version: 1` 留 schema 演进空间
- **永远不允许同一 key 对应不同 categoryId** (1:1 不变量)

### 3.3 容错

`category.js` 启动时执行 `validateCategoryMap()`:
- 任一 `app-category.json.mapping` 引用的 categoryId 在 `categories.json` 不存在 → log warn, 忽略该 entry
- 任一必需分类 (8 个) 缺失 → log error, fall back 到 hardcoded default (跟 `apps.json` 失败处理一致)
- 任一 entry 缺字段 → log error + 跳过

Hardcoded default (跟 `categories.json` schema 严格一致) 写在 `category.js` 文件底部, 仅 fallback 用:

```js
const DEFAULT_CATEGORIES = { /* 同 categories.json 内容 */ };
const DEFAULT_MAPPING = { /* 同 app-category.json 内容 */ };
```

## 4. Runtime 层

### 4.1 `src/config/category.js` (新增)

**职责**: 静态 map 加载 + 验证 + 纯函数 API + Map 缓存

**API**:

| 函数 | 入参 | 出参 | 复杂度 |
|---|---|---|---|
| `getCategory(appName)` | string | categoryId (找不到 → `'other'`) | O(1) |
| `getAllCategories()` | - | Category[] (按 order asc) | O(n) |
| `getCategoryById(id)` | string | Category or undefined | O(1) |
| `getCategoryByName(name)` | string | Category (找不到 → 'other' Category) | O(1) |
| `validateCategoryMap()` | - | `{ ok, errors[], warnings[] }` | O(n+m) |
| `getCategoryTabsWithCount(results)` | Map<name, result> | Tab[] (sorted, hide-empty applied) | O(n + m) |

**内部状态** (module-level, 启动时构建):
- `APP_TO_CATEGORY: Map<appName, categoryId>`
- `CATEGORIES_BY_ID: Map<id, Category>`
- `CATEGORIES_SORTED: Category[]` (按 order asc 排好)

**约束**:
- 不在 main process 调 (renderer 直接 require 跟 `config/schema.js` 一致)
- 启动期一次性 require + 缓存; 不做 hot reload
- 无副作用, 纯函数 (除 validate 时的 console.warn)

### 4.2 `src/renderer/store.js` 改动

**新增 signal**:
```js
export const activeCategory = signal('all');  // 'all' | categoryId
```

**新增 computed**:
```js
// 按 activeCategory 过滤 results
const filteredResults = computed(() => {
  if (activeCategory.value === 'all') return results.value;
  return new Map(
    [...results.value].filter(([name]) => getCategory(name) === activeCategory.value)
  );
});
```

**`resultsBySection` 改动**: 输入从 `results.value` → `filteredResults.value` (单行改)

**`activeCategory` setter**:
```js
export function setActiveCategory(id) {
  activeCategory.value = id;
  // 异步写 state.json, 复用现有 saveAll
  api.saveActiveCategory?.(id).catch(err => console.warn('saveActiveCategory failed:', err));
}
```

## 5. UI 层

### 5.1 新增 `src/renderer/components/CategoryTabs.jsx`

```jsx
export function CategoryTabs({ tabs, active, onSelect }) {
  return (
    <div class="category-tabs">
      {tabs.map(t => (
        <button
          key={t.id}
          class={`category-tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onSelect(t.id)}
          title={t.title}  // 完整分类名, hover 显示
        >
          <span class="category-tab-icon">{t.icon}</span>
          <span class="category-tab-name">{t.name}</span>
          <span class="category-tab-count">{t.count}</span>
        </button>
      ))}
    </div>
  );
}
```

**Props**:
- `tabs: Tab[]` (从 `getCategoryTabsWithCount(results)` 拿, 已经过滤 + 排序好)
- `active: string` (`activeCategory.value`)
- `onSelect: (id) => void` (`setActiveCategory`)

**Tab shape**:
```ts
{ id: 'all' | categoryId; name: string; icon: string; count: number; title?: string }
```

### 5.2 `src/renderer/components/ResultsView.jsx` 改动

插入 `<CategoryTabs />` 在 `<SectionList />` 上方, 传入 computed tabs:

```jsx
const tabs = computed(() => getCategoryTabsWithCount(results.value));
// ...
<CategoryTabs
  tabs={tabs.value}
  active={activeCategory.value}
  onSelect={setActiveCategory}
/>
<SectionList results={resultsBySection.value} />  // 内部用 filteredResults
```

### 5.3 Tab 排序规则 (在 `category.js` 内部)

```js
export function getCategoryTabsWithCount(results) {
  // 1. 统计每个分类的 app count
  const counts = new Map();
  for (const name of results.keys()) {
    const cat = getCategory(name);
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }
  // 2. 构建 tab 列表
  const tabs = [];
  // 2a. "全部" 永远第一
  tabs.push({ id: 'all', name: '全部', icon: '📋', count: results.size, title: '所有 app' });
  // 2b. 其他 7 个分类 (除 "other"), 按 count desc → order asc
  const cats = getAllCategories().filter(c => c.id !== 'other');
  cats.sort((a, b) => {
    const ca = counts.get(a.id) || 0;
    const cb = counts.get(b.id) || 0;
    if (ca !== cb) return cb - ca;
    return a.order - b.order;
  });
  for (const cat of cats) {
    const count = counts.get(cat.id) || 0;
    if (count === 0) continue;  // hide empty (除 other)
    tabs.push({ id: cat.id, name: cat.name, icon: cat.icon, count, title: cat.name });
  }
  // 2c. "其他" 永远最后, 永远显示
  tabs.push({ id: 'other', name: '其他', icon: '📦', count: counts.get('other') || 0, title: '其他' });
  return tabs;
}
```

### 5.4 视觉细节

- 选中 tab: 底部 2px 蓝色下划线, 字色 `#007aff`
- 未选中: 灰色 `#666`
- tab 间距: 0 (border 分割)
- count 数字: 小一号, 灰色, `()` 包裹 (e.g. `🤖 AI (4)`)
- hover: 浅灰背景 `#f5f5f5`
- 切换 150ms 渐变: `transition: all 150ms ease`

## 6. 状态 + 持久化

### 6.1 `state.json` 扩展

```json
{
  "mutes": { ... },
  "last_opened": { ... },
  "active_category": "ai"      // 新增, 顶层字段
}
```

- 缺字段时 fallback `'all'`
- `'all'` 合法值, 持久化 "all" 也行 (重启后回到 all)
- 旧 state.json (无 `active_category` 字段) → 启动时 fallback 'all', 正常

### 6.2 IPC 通道

**新增**:
- `ipcMain.handle('save-active-category', ...)` — 写 state.json.active_category
- `preload.js` 暴露 `saveActiveCategory(id)` (跟 `saveMute` 一致风格)
- `api.js` 加 `saveActiveCategory(id)` (renderer 调用入口)

### 6.3 `state-store.js` 改动

- `loadState()` 读 `active_category` 字段 (缺 → null, fallback)
- `saveAll()` 持久化所有顶层字段, 加 `active_category`
- 现有 `loadMutes` / `saveAll` 流程不变, 共享同一份 state.json

## 7. 边界 / 错误处理

| 场景 | 行为 |
|---|---|
| 启动时 `categories.json` 不存在 / parse 错 | log error, 用 hardcoded DEFAULT_CATEGORIES |
| 启动时 `app-category.json` 不存在 / parse 错 | log error, 用 hardcoded DEFAULT_MAPPING |
| `app-category.json` 引用了不存在的 categoryId | log warn, 忽略该 entry (app 运行时 → 'other') |
| `app-category.json` 同一 app 对应 2 个 category | zod schema 拒绝, 启动 fail-fast (1:1 不变量) |
| `app-category.json` 缺 'other' 分类 | 启动 fail-fast, log error |
| 运行时 `activeCategory` 被设成不存在的 id | 静默回退到 'all', 不报错 |
| 用户从 'all' 切到 'ai', 但 ai count=0 | hide-empty 已防; 但 'ai' id 仍合法, 不会崩 (空 state 显示 "无匹配") |
| 用户用 CLI / dev tools 改 state.json active_category | 启动时 validate, 非法值 → fallback 'all' |
| 切换 tab 时 saveActiveCategory 失败 | log warn, 不影响 UI; 下次启动读到旧值 |
| 配置 PR 加了新 app (e.g. "warp") 但没加进 app-category.json | warp 运行时归 "other", log info 一次 (可后续 batch 加) |

## 8. 测试策略

### 8.1 新增测试 (~50 cases 总)

**`tests/config/category.test.js`** (~20 cases):
- `getCategory`: 命中 / 未命中 / fallback 'other' / 大小写不敏感?
- `getAllCategories`: 顺序 (按 order asc) / 8 个全有
- `getCategoryById`: 命中 / 未命中 → undefined
- `validateCategoryMap`: valid / dangling id / 缺 'other' / 缺字段 / 空 mapping
- `getCategoryTabsWithCount`: 全部 / hide empty / 'other' 永显示 / 排序 (count desc → order asc) / 空 results

**`tests/renderer/category-tabs.test.jsx`** (~15 cases):
- 渲染所有传入 tabs
- active state 加 `active` class
- 点 tab 触发 onSelect 回调
- 切 active 触发 UI 更新
- empty tabs 数组不崩
- 0 count 也显示 (在 'other' 场景)
- 'all' tab 总是在最前

**`tests/renderer/filter-by-category.test.jsx`** (~10 cases):
- activeCategory='ai' 只显示 ai apps
- 'all' 显示所有
- 'other' 显示未映射 apps
- 切换 tab 不丢 searchQuery / activeFilter
- 切换 tab 不丢 mute 状态 (持久化的)

**`tests/config/categories-schema.test.js`** (~5 cases):
- JSON parse 合法
- 8 个分类, id 唯一
- 'other' 必存在
- 所有 entry 有 id/name/icon/order
- order 字段是数字

### 8.2 现有测试更新

**`tests/main/state-store.test.js`** (+3 cases):
- active_category round-trip (save → load 一致)
- 缺字段时 fallback 'all'
- 缺 state.json 时 fallback 'all'

**`tests/main/load-smoke.test.js`** (+1 case):
- `src/config/category.js` 可 require (不抛)

**`tests/integration/...`**: 新增 1 个 e2e 集成 case 验证 "切 tab → state.json 写入 → 重启后还原"。

### 8.3 总数

~50 新 case + 4 更新 case, 跟 Phase 28/29 量级一致。

## 9. 实施计划 (后续, 进 writing-plans)

预计 4-5 phases (跟 Phase 28/29 量级一致):
1. **config + runtime** — `categories.json` / `app-category.json` / `category.js` + 单元测试
2. **state + persistence** — `active_category` 加进 `state-store.js` + IPC
3. **store + computed** — `activeCategory` signal + `filteredResults` + 单元测试
4. **UI + integration** — `CategoryTabs` 组件 + `ResultsView` 集成 + e2e
5. **polish** — 视觉细节 / 键盘快捷键 / 边界处理

每 phase 1 commit, 独立可 rollback。

## 10. 开放问题 (后续 phase 处理, 不阻塞 spec 落地)

- 新装 app (brew install) 自动检测 "在 app-category.json 没映射" → 弹一次性 toast 邀请 PR? (类似 Phase 30 的 tier color)
- 分类顺序是否做 "drag to reorder"? (用户说不要, 不做)
- 是否给每个分类加 "本类最近升级" 视图? (out of scope)
- 多语言? (i18n, 跟主项目一起做)

## 11. 设计原则摘要

1. **静态 map 是 single source of truth** — 不引入 user override / 自定义 / LLM
2. **降级路径清晰** — 任何 app 找不到 → 'other', 永不崩
3. **不破坏现有数据流** — `resultsBySection` 保留, 一层 filter 包装
4. **hide empty + 'other' 永显示** — 干净 + 兜底
5. **跟 Phase 28/29 风格一致** — 同样的 spec 格式 / 同样的 phase 拆法 / 同样的测试量级
