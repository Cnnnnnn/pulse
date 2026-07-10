# Search + Filter 设计 Spec

- **日期**: 2026-06-07
- **作者**: Mavis (brainstorming-2)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (AppUpdateChecker v2.x)
- **目标特性**: 顶部 search + 4 状态 tab 过滤

## 1. 背景

AppUpdateChecker v2.0.0 + Phase 22 (Bulk Upgrade) 已上线，默认 11 个 app。当前痛点：app 多了之后定位困难 —— 没有搜索框，没有状态过滤，只能靠滚。

未来加更多 app 之后更糟。

## 2. 目标

加 MVP 级别的 search + status tab：

1. 顶部一条 FilterBar —— search input + 4 状态 tab
2. Cmd+F 聚焦 search
3. 搜索 / 过滤 实时生效
4. Bulk Upgrade 按钮 count 反映过滤后可见数
5. 空状态引导（"无匹配" → 一键清除过滤）

## 3. 非目标 (YAGNI)

- 持久化过滤状态 (localStorage / sessionStorage) —— MVP 不做，后续
- 按 source 过滤 (brew / sparkle / App Store / ...) —— MVP 4 tab 不够，加了显乱
- 模糊搜索 (Levenshtein) —— substring 搜索 80% 场景够用
- 排序选项 (按名称 / 版本 / 上次检查时间) —— 后续
- URL hash 路由 (可分享) —— over-engineering
- 多选过滤 (AND/OR 组合) —— MVP 单 tab

## 4. UX 流程

### 4.1 FilterBar 位置
- 在 Header 下方、ResultsView 上方
- 占据整宽（跟 Header 一致）

### 4.2 布局
```
┌─────────────────────────────────────────────────────────┐
│  [🔍 搜索 app 名称…          ]   [全部 11] [有更新 3] [...│
└─────────────────────────────────────────────────────────┘
```
- 左侧：search input，placeholder "搜索 app 名称…"
- 右侧：4 个 tab，每个带 count
- tab 文案：全部 / 有更新 / 已是最新 / 出错

### 4.3 行为
- **search** 实时过滤（不按回车）
  - case-insensitive，substring 匹配 `name` + `bundle`
  - "codex" → 命中 Codex, CodexBar
  - "" → 不过滤
  - **Esc** → 清空 search
- **tab** 单选（radio 风格）
  - 全部 → 不过滤 status
  - 有更新 → `has_update === true`
  - 已是最新 → `!has_update && status === 'up_to_date'`
  - 出错 → `status === 'error'`
- **search + tab 组合**：AND 关系
- **Cmd+F (mac) / Ctrl+F**：全局拦截，preventDefault + focus search input

### 4.4 BulkUpgradeButton 联动
- count 反映 **过滤后** 可见的 upgradable app 数
- 例：tab="有更新" + search="" → `Upgrade All (3)`
- 例：tab="已是最新" → 0 个 upgradable → `All up to date` disabled
- 例：tab="出错" → 0 个 upgradable → `All up to date` disabled
- modal 打开时只显示当前可见的 app（filter 影响 modal 范围）

### 4.5 Section 标题
- 保留现有 "有待更新 / 已是最新 / 出错" sections
- filter 之后被隐藏的 section 直接不渲染
- 例：tab="出错" → 只显示 "出错" section

### 4.6 空状态
- 0 匹配 → 显示 "无匹配项"
  - 中央提示文字 + "清除过滤" 按钮（一次清 search + 回 'all' tab）
  - 跟现有 EmptyState 组件融合

## 5. 架构

### 5.1 State (preact signals)

加到 `src/renderer/store.js`：

```js
export const searchQuery = signal('');           // 当前 search 内容
export const activeFilter = signal('all');       // 'all' | 'update' | 'latest' | 'error'
```

加到 `src/renderer/selectors.js` (computed)：

```js
// filteredResults: 应用 search + tab 双重过滤
export const filteredResults = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  const tab = activeFilter.value;
  const out = new Map();
  for (const [name, r] of results.value) {
    // tab filter
    if (tab === 'update' && !r.has_update) continue;
    if (tab === 'latest' && (r.has_update || r.status !== 'up_to_date')) continue;
    if (tab === 'error' && r.status !== 'error') continue;
    // search filter
    if (q) {
      const nameMatch = r.name && r.name.toLowerCase().includes(q);
      const bundleMatch = r.bundle && r.bundle.toLowerCase().includes(q);
      if (!nameMatch && !bundleMatch) continue;
    }
    out.set(name, r);
  }
  return out;
});

// tabCounts: 4 个 tab 的数字
export const tabCounts = computed(() => {
  const counts = { all: 0, update: 0, latest: 0, error: 0 };
  for (const r of results.value.values()) {
    counts.all++;
    if (r.has_update) counts.update++;
    else if (r.status === 'up_to_date') counts.latest++;
    if (r.status === 'error') counts.error++;
  }
  return counts;
});
```

### 5.2 数据流
```
[user] type in search OR click tab
   ↓
FilterBar 写 searchQuery / activeFilter
   ↓ (computed 自动重算)
filteredResults + tabCounts
   ↓ 订阅
ResultsView / BulkUpgradeButton / EmptyState 自动重渲染
   ↓
Cmd+F → App.jsx 拦截 → focus search input DOM element
```

### 5.3 关键设计决策

1. **用 preact signals (跟项目一致)** —— 跟 store-bulk-upgrade.js / store.js 风格统一
2. **filter 在 selectors 层 (computed)** —— 不污染业务组件
3. **count 用全局 results 算** —— tab count 不被自己 filter 影响 (永远显示 "全部 11")
4. **filteredResults 是 Map (跟 results 一样)** —— ResultsView 不需要改结构
5. **Cmd+F 拦截在 App.jsx** —— 全局 keydown 监听，不污染 FilterBar
6. **不在 ResultsView 单独算 filter** —— FilterBar 负责写，ResultsView 读 computed

## 6. 文件改动

| 路径 | 操作 | 说明 |
|---|---|---|
| `src/renderer/store.js` | edit | +`searchQuery` / +`activeFilter` signals |
| `src/renderer/selectors.js` | edit | +`filteredResults` / +`tabCounts` computed |
| `src/renderer/components/FilterBar.jsx` | **new** | search input + 4 tabs |
| `src/renderer/App.jsx` | edit | mount FilterBar + Cmd+F 拦截 + ResultsView 改用 filteredResults |
| `src/renderer/components/ResultsView.jsx` | edit | 读 filteredResults，section header 反映过滤后 |
| `src/renderer/components/BulkUpgradeButton.jsx` | edit | N 从 filteredResults 算 |
| `src/renderer/components/EmptyState.jsx` | edit | 加 "0 匹配" 分支 |
| `src/renderer/store-bulk-upgrade.js` | edit | `openBulkUpgrade` 改用 filteredResults (N 跟按钮一致) |
| `styles.css` | edit | +~80 行 filter bar 样式 |
| `tests/renderer/filter.test.js` | **new** | 纯函数 filter 逻辑 (10+ case) |
| `tests/renderer/filter-bar.test.jsx` | **new** | 组件渲染 / 交互 (5+ case) |
| `tests/renderer/bulk-upgrade-button.test.jsx` | edit | +2 case 验证 count 反映 filtered |

## 7. CSS 设计

```css
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-primary);
}

.filter-search {
  flex: 1;
  position: relative;
}
.filter-search input {
  width: 100%;
  padding: 6px 10px 6px 32px;  /* 左留出搜索图标 */
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  font-size: 13px;
  transition: border-color var(--transition);
}
.filter-search input:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}
.filter-search::before {
  content: "🔍";
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  pointer-events: none;
  opacity: 0.5;
}

.filter-tabs {
  display: flex;
  gap: 2px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.filter-tab {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition);
  background: transparent;
  border: 0;
  font-weight: 500;
  white-space: nowrap;
}
.filter-tab:hover { color: var(--text-primary); }
.filter-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}
.filter-tab .count {
  margin-left: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 400;
}
.filter-tab.active .count { color: var(--text-secondary); }
```

## 8. 测试策略

### 8.1 Unit (`filter.test.js`, 10+ case)
- 纯函数 filter logic
  - 空 search + 'all' → 全部
  - search "codex" → 命中 Codex, CodexBar
  - search 大小写不敏感
  - search 匹配 bundle id
  - tab='update' → 只 has_update
  - tab='latest' → 只 up_to_date
  - tab='error' → 只 status='error'
  - 组合: search "codex" + tab='update'
  - 空 result map → 空 filtered
  - search 含特殊字符 ("c++", "vue.js") — substring OK
- tabCounts 纯函数
  - 全 has_update → {all: N, update: N, latest: 0, error: 0}
  - 混合 → 各 count 正确

### 8.2 Component (`filter-bar.test.jsx`, 5+ case)
- happy-dom 渲染
- 初始 'all' tab active
- click tab → 切换 activeFilter signal
- input 键入 → 改 searchQuery signal
- Esc → 清空 search
- 0 匹配时显示 "无匹配" 状态

### 8.3 Component (`bulk-upgrade-button.test.jsx` edit, +2 case)
- 过滤后 0 upgradable → "All up to date" disabled
- 过滤后 N upgradable → "Upgrade All (N)"

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Cmd+F 跟 Electron "在页面查找" 冲突 | App.jsx 全局 keydown 拦截 preventDefault |
| filter 期间 check 完成, counts shift | signals 自动重算, OK |
| ResultsView 的 section header 文案重叠 filter tab | 隐藏空 section (filter=update 时只剩 1 个 section) |
| 用户期望搜索 match release notes / version | 明确只 match name + bundle，文档化 |
| search query 包含特殊字符 (regex 注入) | 用 `.includes()` 不是 regex，安全 |

## 10. 实施计划（顺序）

1. `store.js` + `selectors.js` 加 signals/computed (30 min)
2. `FilterBar.jsx` 组件 (1 h)
3. `App.jsx` mount + Cmd+F 拦截 (30 min)
4. `ResultsView` / `BulkUpgradeButton` / `EmptyState` / `store-bulk-upgrade` 改用 filteredResults (1 h)
5. CSS (30 min)
6. Tests: filter + filter-bar + button edit (1.5 h)
7. 集成 + 全测 + build (30 min)

**总计: 5h**

## 11. 后续 (out of scope)

- 持久化 filter 状态 (localStorage)
- 按 source 多选过滤
- 排序选项 (名称 / 版本 / 上次检查 / 大小)
- URL hash 路由 (可分享)
- 模糊搜索 (Levenshtein)
- 多选过滤 (AND/OR)
- 折叠空 section 之外的 collapse (用户手动折叠)
