# I3 — SideNav 拖拽重排 + 隐藏 设计 (Phase I3 v1)

| 日期       | 作者 | 状态     |
| ---------- | ---- | -------- |
| 2026-06-22 | brainstorming | 设计已批准,待 writing-plans |

> 本 spec 对应产品路线图 §3.2 **I3 SideNav 拖拽重排 + 隐藏**(评分 7,Next 状态,动工状态 ⚫ 未立项)。
> 上游文档:[2026-06-19-product-roadmap-design.md](2026-06-19-product-roadmap-design.md) §3.2 / §10.2 / §10.4 / §10.5。

## 1. 背景与目的

当前 `src/renderer/components/SideNav.jsx` 有 7 个硬编码 nav item + 1 个 AI 配置 footer item,顺序固定(`NAV_ITEMS` 数组),**没有任何用户定制能力**:不能重排顺序、不能隐藏任何 item。

**I3 v1 目标**(本次范围,严格不超出):

- 在 SideNav 内**直接拖拽重排** nav item,drop 即持久化
- **右键菜单**(原生 `<dialog>`)支持隐藏 / 移到顶部 / 移到底部
- 底部新增"**显示已隐藏 (N)**"入口,点开是抽屉,逐项恢复
- 状态持久化到 renderer **localStorage**(`pulse.sidenav.prefs.v1`),无 IPC / 无 main 改动 / **零新依赖**
- 所有 8 项(包括 AI 配置)都可被隐藏,**不留强制项**
- happy-dom 单测覆盖 prefs 纯函数 + 关键集成点

**I3 v1 明确不做**(留给后续版本):

- 跨设备同步
- 触摸设备拖拽(Electron 主要桌面)
- 键盘拖拽(WAI-ARIA,留 v2)
- 撤销 / 重做
- 折叠态拖拽(40px 太挤,折叠态禁用拖,只允许右键)
- 全局 Cmd+K(那是 A3,本 v1 不接)

## 2. 架构与模块边界

### 2.1 新增文件 3 个

**`src/renderer/components/sidenav-prefs.js`** — 纯函数模块,无 React 依赖,约 120 行
- `loadPrefs()` / `savePrefs(prefs)` — localStorage 读写 + 迁移
- `listVisible(prefs, NAV_KEYS)` / `listHidden(prefs, NAV_KEYS)`
- `hideItem(prefs, key)` / `restoreItem(prefs, key)` / `reorderItems(prefs, from, to, position)`

**`src/renderer/components/SideNavItem.jsx`** — 子组件,约 100 行
- `draggable=true` + ondragstart/over/drop + oncontextmenu → 打开 `<dialog>` 菜单

**`src/renderer/components/HiddenItemsDrawer.jsx`** — 抽屉组件,约 80 行
- 列出 `listHidden()`,每行"恢复"按钮 + "永久删除"(v2 才接,本次只"恢复")

### 2.2 新增 CSS 1 个

**`src/renderer/styles/components/sidenav.css`** — 约 60 行
- `.side-nav-item-dragging`(opacity 0.5 + scale 0.98)
- `.side-nav-item-drop-before` / `.side-nav-item-drop-after`(顶部/底部 2px 蓝条)
- `.sidenav-context-menu`(原生 dialog 样式)
- `.sidenav-hidden-drawer`(底部抽屉)

### 2.3 修改文件 2 个

| 文件 | 改动 | diff |
|---|---|---|
| `src/renderer/components/SideNav.jsx` | 引入 prefs、reorder NAV_ITEMS、用 `<SideNavItem>` 替换 `<li>`、footer 加"显示已隐藏 (N)" 按钮 + 抽屉挂载 | ~30 行 |
| `src/renderer/worldcup/navStore.js` | 加 `effectiveVisibleItems(prefs)` helper(纯函数,折算 order + hidden → 可见顺序);**不动 `activeNav` / `navCollapsed`** | ~15 行 |

### 2.4 完全不动

- `state.json` schema / main 进程 / IPC handler
- `package.json`(零新依赖)
- `nav-refresh.js` / `openAISettings` 等其他 nav 调用方
- SideNav 折叠 / 刷新按钮 / 现有 CSS layout

### 2.5 模块依赖图

```
SideNav.jsx
   ├─> sidenav-prefs.js (load/save/listVisible/listHidden/toggleHide/reorder)
   ├─> SideNavItem.jsx (draggable + oncontextmenu → sidenav-prefs)
   ├─> HiddenItemsDrawer.jsx (读 sidenav-prefs.listHidden)
   └─> navStore.js (activeNav / navCollapsed 维持原样 + effectiveVisibleItems)

sidenav-prefs.js
   └─> window.localStorage (key: 'pulse.sidenav.prefs.v1')
   └─> NAV_KEYS (从 navStore.js 导入)
```

## 3. 数据流与算法

### 3.1 持久化 schema

```js
// localStorage['pulse.sidenav.prefs.v1']
{
  version: 1,
  order: ['versions', 'ithome', 'wechat-hot', 'worldcup', 'funds', 'metals', 'ai-usage'],
  hidden: ['metals'],
}
```

### 3.2 数据流(用户交互)

```
[用户拖拽 / 右键]
       │
       ▼
[SideNavItem.jsx]
   ├─ ondragstart   →  e.dataTransfer.setData('text/plain', item.key)
   │                  + 自身 class 加 .side-nav-item-dragging
   ├─ ondragover    →  e.preventDefault() 接受 drop
   │                  + 计算 position (before/after, 看 mouse Y vs target mid)
   │                  + 目标 li class 加 .side-nav-item-drop-before/-after
   ├─ ondrop        →  reorderItems(from, to, position) → savePrefs
   │
   └─ oncontextmenu → e.preventDefault() + 打开 <dialog> 右键菜单
                       ├─ "隐藏"      → hideItem(key)
                       ├─ "移到顶部"  → reorderItems(key, 0, 'before')
                       └─ "移到底部"  → reorderItems(key, last, 'before')
       │
       ▼
[sidenav-prefs.js 纯函数]
   loadPrefs → listVisible(prefs, NAV_KEYS) → SideNav 重新渲染
   hideItem / restoreItem / reorderItems → savePrefs
       │
       ▼
[localStorage 'pulse.sidenav.prefs.v1']
```

### 3.3 关键算法

**arrayMove(arr, from, to, position)**:
```js
function arrayMove(arr, from, to, position) {
  if (from === to) return arr;
  const out = arr.slice();
  const [moved] = out.splice(from, 1);
  // 'before' = 插到 to 之前, 'after' = 插到 to 之后
  const insertAt = position === 'after' && to < from ? to + 1
                : position === 'after' ? to + 1
                : to;
  out.splice(insertAt, 0, moved);
  return out;
}
```

**migration**:`loadPrefs` 检测 `version` 字段缺失 → 返回 defaults。v2+ 暂不处理。

**default order**:`sidenav-prefs.js` 从 `navStore.js` 导入 `NAV_KEYS`,保持单源真相。

**savePrefs 节流**:**不节流**,操作频率低,节流反而引入"半保存"复杂度。

### 3.4 错误处理

- `localStorage` 满 / 不可用(隐私模式):`savePrefs` 套 try/catch,失败 `console.warn`,不抛
- `JSON.parse` 失败:`loadPrefs` 返回 defaults,旧值被覆盖
- 用户拖到自身:`reorderItems` if (from === to) → noop
- 用户拖到 hidden 区域:DOM 上 hidden 不渲染,无法 drop
- **全隐藏后**:`effectiveVisibleItems` 返回 `[]`,SideNav 渲染空 list + 顶部提示条 "已隐藏全部 nav 项,点这里恢复",链接到 HiddenItemsDrawer
- happy-dom 单测:`globalThis.localStorage = createStorage()`,每个 case 前清空

## 4. 测试护栏(happy-dom 单测)

### 4.1 `tests/renderer/sidenav-prefs.test.js`(≥ 6 case)

1. `loadPrefs()` 默认值正确(无 localStorage)
2. `savePrefs` 后 `loadPrefs` 还原
3. localStorage 损坏(JSON.parse fail) → 返回 defaults
4. `hideItem` 把 key 加入 hidden
5. `restoreItem` 把 key 从 hidden 移除
6. `listVisible` 排除 hidden + 按 order 排序
7. `listHidden` 返回 NAV_KEYS - order

### 4.2 `tests/renderer/sidenav-reorder.test.js`(≥ 3 case)

1. `reorderItems` 从 index 0 移到 index 2('before') → 数组正确
2. `reorderItems` from === to → noop
3. 拖到隐藏 item 之外 → reorder 正常

### 4.3 `tests/renderer/sidenav-hidden-drawer.test.js`(≥ 3 case)

1. drawer 渲染 `listHidden()` 数量
2. 点"恢复"按钮 → 调 `restoreItem` + savePrefs
3. 全隐藏状态:drawer 显示所有 8 项 + "恢复"按钮

**合计 ≥ 12 case,纯 happy-dom,不依赖 React render**(prefs 是纯函数,drawer 测试用 props 传入)。

## 5. 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| HTML5 drag 在 WebView 内对自定义 dragImage 支持差 | 中 | 用浏览器默认 dragImage + CSS `opacity: 0.5` 给视觉反馈;不依赖自定义 dragImage |
| happy-dom 不支持原生 `<dialog>` 完整 API | 中 | 单测只测 prefs 纯函数 + drawer props,不测 dialog 交互 |
| 用户隐藏 activeNav 后无法切到其他 item | 低 | UI 提示条"已隐藏全部 nav 项"引导恢复;`setActiveNav` 仍可用 |
| localStorage 在隐私模式被禁用 | 低 | `loadPrefs` 检测抛错 → 用内存 Map 替代 + `console.warn`,用户能拖但重启失效 |
| `nav-refresh.js` 的 `REFRESHABLE_NAV_KEYS` 没考虑隐藏 | 低 | refresh 按钮看 `activeNav.value`,跟隐藏无关 |
| 7 → 8 nav item 后 UI 拥挤 | 低 | 折叠态(40px)只显 icon,空间够;展开态 8 项可容纳 |
| 右键菜单被浏览器默认菜单拦截 | 极低 | Electron 内 `oncontextmenu preventDefault` 全平台正常 |

## 6. 范围之外(明确不做)

- 跨设备同步(澄清阶段已选不同步)
- 拖拽动画 / spring physics(用 CSS `transition: transform 200ms ease`)
- 触摸设备拖拽(Electron 主要桌面)
- 键盘拖拽(WAI-ARIA,留 v2)
- 撤销 / 重做
- 折叠态拖拽(40px 太挤,折叠态禁用)
- 全局 Cmd+K 触发(I3 不做,这是 A3)

## 7. 验收清单(1-2 天工作量,跟 §3 评分"成本 1"对齐)

- [ ] `src/renderer/components/sidenav-prefs.js` 落地,6 export + load 迁移
- [ ] `src/renderer/components/SideNavItem.jsx` 落地
- [ ] `src/renderer/components/HiddenItemsDrawer.jsx` 落地
- [ ] `src/renderer/styles/components/sidenav.css` 落地,4 个新 class
- [ ] `src/renderer/components/SideNav.jsx` 改造
- [ ] `src/renderer/worldcup/navStore.js` 加 `effectiveVisibleItems` helper
- [ ] `tests/renderer/sidenav-prefs.test.js`(≥ 6 case 全过)
- [ ] `tests/renderer/sidenav-reorder.test.js`(≥ 3 case 全过)
- [ ] `tests/renderer/sidenav-hidden-drawer.test.js`(≥ 3 case 全过)
- [ ] 完整 suite 全绿(原 2260 + 新 ≥ 12)
- [ ] manual smoke:拖一个 item 到顶 + 刷新页面顺序保持;右键 → 隐藏 → 底部出现"显示已隐藏 (1)"

## 8. Rollout

- commit message:`feat(sidenav): drag-reorder + right-click hide (Phase I3 v1)`
- 路线图 §3.2 §10.2 I3 行:`❌ 未开始` / `⚫ 未立项` → `🟢 已合入`
- 不开 tag,不发 release notes
- 在 `docs/superpowers/specs/` 加 `2026-06-22-i3-rollout-note.md`(实施完成时)

## 9. 与路线图的对齐

| 项 | 引用 |
|---|---|
| 上游候选 | `2026-06-19-product-roadmap-design.md` §3.2 I3(评分 7,Next) |
| 状态机 | §2.3 优先级 + §2.4 动工状态(本次 v1 合入后:`🟢 Next + 🟢 已合入`) |
| 流程纪律 | §9:每条 Next 项进入开发前先写 `spec → plan`(本次 spec 落地,下一步是 writing-plans) |
| v2.26 切片 | §10.4:"v2.26 切片 = C4 + I3 + Q7",Q7 已合入;本次 I3 落地,C4 仍 ❌(下一步可选) |
| 评分卡 | §10.5:"I3 几乎无风险,但与 Pillar 1-2 协同弱,优先度低" — 本次严格守住低成本边界 |

## 10. Brainstorming 决策记录

### Step 3 澄清问题

| # | 问题 | 用户选 |
|---|---|---|
| 1 | UX 模型(mockup 3 选) | A. 直接拖拽 / 右键菜单(零摩擦,推荐) |
| 2 | 持久化 | renderer localStorage(快,推荐) |
| 3 | 隐藏范围 | 全部可隐藏,包括 footer AI 配置 |
| 4 | 跨设备同步 | 不同步 |
| 5 | 测试深度 | happy-dom 单测(推荐) |

### Step 4 方案

- **A**(选):原生 drag + `<dialog>` 右键菜单,零新依赖
- **B**(否):引 `@dnd-kit/sortable`,加 2 依赖
- **C**(否):全走 IPC + main,跟澄清阶段 localStorage 选型冲突

### Step 5 分节批准

3 节全部用户 OK 通过。