# I3 — SideNav 拖拽重排 + 隐藏 实施 plan

| 日期       | 作者 | 状态 |
| ---------- | ---- | ---- |
| 2026-06-23 | Cursor | 已批准,实施中 |

> 上游 spec: [`2026-06-22-i3-sidenav-drag-hide-design.md`](../specs/2026-06-22-i3-sidenav-drag-hide-design.md)
> 上游路线图: [`2026-06-19-product-roadmap-design.md`](../specs/2026-06-19-product-roadmap-design.md) §3.2 I3 (评分 7,Next)
> 本 plan 严格遵守 spec §1 / §2 / §3 / §4 / §5 / §6 的所有约束。

## 1. 任务清单(原子 commit 顺序)

按依赖顺序执行,每步 1 个 commit,失败可独立 revert:

| # | 任务 | 产出 | commit 类型 | 估时 |
| -- | --- | --- | --- | --- |
| 1 | `sidenav-prefs.js` + 6 个纯函数 | 新文件 | feat(sidenav) | 30min |
| 2 | `navStore.js` 加 `effectiveVisibleItems` helper | 改 1 文件 | feat(sidenav) | 15min |
| 3 | `sidenav-prefs.test.js` + `sidenav-reorder.test.js`(≥ 9 case) | 新文件 | test(sidenav) | 30min |
| 4 | `SideNavItem.jsx` 子组件(draggable + contextmenu) | 新文件 | feat(sidenav) | 45min |
| 5 | `HiddenItemsDrawer.jsx` 抽屉组件 | 新文件 | feat(sidenav) | 30min |
| 6 | `HiddenItemsDrawer.test.jsx`(≥ 3 case) | 新文件 | test(sidenav) | 20min |
| 7 | `SideNav.jsx` 改造(挂 prefs + Item + drawer) | 改 1 文件 | feat(sidenav) | 30min |
| 8 | `styles/components/sidenav.css` 4 个新 class | 新文件 | style(sidenav) | 20min |
| 9 | 全量 vitest + 修复集成 regression | 跑全套 | chore(sidenav) | 20min |
| 10 | `.release-notes-2.30.0.md` + version bump + roadmap §10.x | 文档 + release | chore(release) | 20min |

**合计 ~4-5 小时纯编码,加 commit / 测试 / push ≈ 6-7 小时 = 1 天可完工。**

## 2. 文件级实施要点

### 2.1 `src/renderer/components/sidenav-prefs.js`(新)

按 spec §3.1 + §3.3 实现:
- `DEFAULTS = { version: 1, order: NAV_KEYS.slice(), hidden: [] }`(`NAV_KEYS` 从 `../worldcup/navStore.js` 导入)
- `loadPrefs()` — localStorage 读 → JSON.parse 失败 / 缺 version → 返 DEFAULTS
- `savePrefs(prefs)` — try/catch 包,失败 `console.warn` 不抛(spec §3.4)
- `listVisible(prefs, NAV_KEYS)` — 按 order 排,排除 hidden
- `listHidden(prefs, NAV_KEYS)` — NAV_KEYS - order
- `hideItem(prefs, key)` / `restoreItem(prefs, key)` — 纯函数,返回新 prefs
- `arrayMove(arr, from, to, position)` — spec §3.3 给的算法,原样实现
- `reorderItems(prefs, fromKey, toKey, position)` — 基于 key 找 index, 调 arrayMove

无 React / 无 preact 依赖。约 100 行。

### 2.2 `src/renderer/worldcup/navStore.js`(改 1 文件)

加 helper:
```js
export function effectiveVisibleItems(prefs, allKeys = NAV_KEYS) {
  // 同 listVisible, 但放在 navStore 方便其他模块复用
  const order = prefs?.order?.length ? prefs.order : allKeys.slice();
  const hidden = new Set(prefs?.hidden || []);
  return order.filter((k) => !hidden.has(k) && allKeys.includes(k));
}
```

不动 `activeNav` / `navCollapsed` / `installNavWatch` / `setActiveNav`(spec §2.3 明文)。

### 2.3 `src/renderer/components/SideNavItem.jsx`(新)

约 100 行 functional component,接收 props:
- `item: { key, label, icon, badge, onClick }`
- `onReorder(fromKey, toKey, position)`
- `onHide(key)`

事件:
- `draggable={true}`
- `onDragStart`: setData + classList add `side-nav-item-dragging`
- `onDragOver`: preventDefault + 根据 mouse Y vs mid 计算 position + class 切换
- `onDragEnd`: 清 class
- `onDrop`: 调 `onReorder(from, to, position)`
- `onContextMenu`: preventDefault + 打开 `<dialog>` 元素 (refs 持有)

右键菜单选项(spec §3.2):
- 「隐藏」→ `onHide(key)` + close dialog
- 「移到顶部」→ `onReorder(key, 0, 'before')` + close
- 「移到底部」→ `onReorder(key, last, 'before')` + close

### 2.4 `src/renderer/components/HiddenItemsDrawer.jsx`(新)

约 80 行 functional component,接收 props:
- `open: signal.value`
- `onClose()`
- `hiddenItems: array` (父组件 listHidden 传入)

UI: 半屏底部抽屉 + 列表(每行: icon + label + 「恢复」按钮)。
全隐藏状态:显示「已隐藏全部 nav 项」横幅 + 「全部恢复」按钮。

### 2.5 `src/renderer/components/SideNav.jsx`(改 1 文件)

按 spec §2.3,改 ~30 行:
1. `import { loadPrefs, savePrefs, ... } from './sidenav-prefs.js'`
2. `import { effectiveVisibleItems } from '../worldcup/navStore.js'`
3. `const [prefs, setPrefs] = useState(loadPrefs())` — 用 preact `useState` 或 signal
4. 计算 `visibleItems = effectiveVisibleItems(prefs, NAV_KEYS)`
5. 把现有 `<li>` 循环替换为 `<SideNavItem item={...} onReorder={...} onHide={...} />`
6. footer 加按钮 "显示已隐藏 ({hidden.length})" + 调 `HiddenItemsDrawer`
7. 全空时显示横幅 "已隐藏全部 nav 项 → 点这里恢复"

不动现有折叠按钮 / refresh 按钮 / AI 配置 footer / 整体 layout(spec §2.4)。

### 2.6 `src/renderer/styles/components/sidenav.css`(新)

约 60 行:
- `.side-nav-item-dragging { opacity: 0.5; transform: scale(0.98); }`
- `.side-nav-item-drop-before { box-shadow: inset 0 2px 0 var(--accent, #4a90e2); }`
- `.side-nav-item-drop-after { box-shadow: inset 0 -2px 0 var(--accent, #4a90e2); }`
- `.sidenav-context-menu { /* dialog 样式 */ }`
- `.sidenav-hidden-drawer { /* 底部抽屉 */ }`

import 进主 `styles.css`(看现有 `sidenav` 引用方式)。

## 3. 测试矩阵(13+ case,全 happy-dom)

### 3.1 `tests/renderer/sidenav-prefs.test.js`(≥ 7 case)

| # | case | 验证 |
| -- | --- | --- |
| 1 | loadPrefs() 默认值 | 无 localStorage → 返 DEFAULTS |
| 2 | savePrefs → loadPrefs 还原 | round-trip 一致 |
| 3 | localStorage 损坏(JSON.parse fail) → DEFAULTS | 容错 |
| 4 | hideItem 加 hidden | prefs.hidden.length + 1 |
| 5 | restoreItem 减 hidden | prefs.hidden.length - 1 |
| 6 | listVisible 排除 hidden + 按 order 排 | 顺序正确 |
| 7 | listHidden = NAV_KEYS - order | 集合差正确 |

### 3.2 `tests/renderer/sidenav-reorder.test.js`(≥ 3 case)

| # | case | 验证 |
| -- | --- | --- |
| 1 | reorderItems 0 → 2 'before' | 数组: [1, 0, 2, 3, 4] (示意) |
| 2 | from === to | noop,返同一 ref |
| 3 | arrayMove 'after' 位置正确 | to > from + 'after' → to 索引 |

### 3.3 `tests/renderer/sidenav-hidden-drawer.test.jsx`(≥ 3 case)

| # | case | 验证 |
| -- | --- | --- |
| 1 | drawer 渲染 listHidden 数量 | 3 个隐藏 → 3 行 |
| 2 | 点「恢复」→ restoreItem + savePrefs | mock 调过 |
| 3 | 全隐藏状态 → 全部 8 项 | 8 行 + 全恢复按钮 |

测试环境:
- `// @vitest-environment happy-dom`
- `globalThis.localStorage = createStorage()` 隔离(看 `tests/renderer/` 现有用 happy-dom 的测试用啥方案)

## 4. 验收清单(spec §7 复制)

- [ ] 9 个产出文件全部落地(6 新 + 3 改)
- [ ] 3 个 test 文件全过(13 case)
- [ ] 全量 vitest 2491 + 新 13 ≥ 2504 全绿
- [ ] manual smoke: 拖 item 到顶 → 刷新页面顺序保持 / 右键 → 隐藏 → footer 出现"显示已隐藏 (1)"
- [ ] 路线图 §10.x(I3) 行: 🟤 立项中 → 🟢 已合入
- [ ] `.release-notes-2.30.0.md` 写完 + package.json bump 到 2.30.0
- [ ] git push origin main 同步

## 5. 不做(再次明确,spec §1 / §6)

- ❌ IPC / main 改动
- ❌ 新依赖
- ❌ 跨设备同步
- ❌ 触摸 / 键盘拖拽
- ❌ 撤销重做
- ❌ 全局 Cmd+K 触发

## 6. Rollout

- commit message 前缀: `feat(sidenav)` / `test(sidenav)` / `style(sidenav)` / `chore(sidenav)` / `chore(release)`
- 路线图 §10.7 / §11.1 标记 I3 完成:🟢 已合入 (v2.30.0)
- 按路线图 §12 新规则,在 `.release-notes-2.30.0.md` 里加迷你 §10.x 子节对账

## 7. 风险监控

| 风险 | 触发条件 | 缓解 |
| --- | --- | --- |
| localStorage 在 happy-dom 默认 mock 不稳定 | test 偶发失败 | 用 vi.stubGlobal + 干净 reset |
| `<dialog>` 在 happy-dom 渲染异常 | drawer test 失败 | 测试只用 props,不依赖真实 dialog 渲染 |
| SideNav 改造破坏现有折叠逻辑 | full suite regression | 任务 #7 跑 `tests/renderer/SideNav.test.jsx`(如有) 优先 |
| 用户隐藏 activeNav 后无法切 | spec §5 已识别 | UI 提示条 + `setActiveNav` 仍可用 |

---

**开工条件**:本 plan 已批准,可以直接执行任务 #1。