# I6 — IT之家未读角标 + SideNav 联动 设计

| 日期       | 作者         | 状态     |
| ---------- | ------------ | -------- |
| 2026-06-23 | brainstorming | 设计已批准 |

> 上游：`docs/superpowers/specs/2026-06-19-product-roadmap-design.md` §4.1 I6
> (内容标记已读 — 列表变灰 + SideNav badge 减 1)。本 spec 只做 SideNav badge 这一段。

## 1. 背景与目的

IT之家新闻的「已读」能力**已经完整落地**(行级灰色 + `is-new` 高亮 +
main 端 `readAt` 持久化 + 重启保留),但 **SideNav 上的未读角标一直没接**——
用户在别的面板时,无法知道 IT之家有多少新文章没看。

本 spec 只补这一环:**SideNav 的 IT之家 item 右上角显示未读数字胶囊**。

### 1.1 现状盘点(代码事实,非 roadmap 状态机)

| 能力 | 落地状态 | 证据 |
| ---- | -------- | ---- |
| 行级「已读」变灰 | ✅ | `src/renderer/ithome/NewsArticleRow.jsx:58,146,156` (`isRead` + `is-read` class + 「已读」标签) |
| 本 session 新增高亮 (`is-new`) | ✅ | `src/renderer/ithome/store.js:30,48-60` (`ithomeNewIds` + `_applyPayload` diff) |
| 标记已读 (乐观更新 + 落盘) | ✅ | `store.js:176-204` (`markIthomeRead` 改 readIds + 删 newIds + 调 IPC) |
| main 端持久化 `readAt` | ✅ | `src/main/ithome/news-store.js:229,354,377-390` |
| **SideNav 未读角标** | ❌ **缺口** | `SideNav.jsx` / `SideNavItem.jsx` 0 处 badge 渲染 |

**结论**:I6 的「内容标记已读」本体已完工,**唯一缺的是 SideNav badge 联动**。

## 2. 范围(严格不超出)

### 2.1 做

- 新增一个派生 signal `ithomeUnreadBadge` (复用 `ithomeNewIds`,0 新逻辑)
- SideNav 给 ithome item 注入 badge,透传给 SideNavItem
- SideNavItem 加可选 `badge` prop,在 icon 右上渲染数字胶囊
- CSS 新增 `.side-nav-badge` (折叠/展开两态定位)

### 2.2 不做(YAGNI)

- ❌ wechat-hot / funds / metals / ai-usage 的 badge(无对应数据源 / 留 v2)
- ❌ 改 `ithomeNewIds` 语义(切日期清空行为保持现状)
- ❌ 改 main 端持久化(newIds 本就是 session 级,不落盘)
- ❌ "9+" 封顶(未读数实际很少超 9;胶囊 `min-width` + padding 自适应)
- ❌ 改动其他 nav item

## 3. 设计

### 3.1 数据层 — `src/renderer/ithome/store.js`

新增派生 signal(紧跟现有 signals 声明):

```js
import { signal, computed } from "@preact/signals";
// ... 既有 ithomeNewIds = signal({}) 不动
export const ithomeUnreadBadge = computed(
  () => Object.keys(ithomeNewIds.value).length
);
```

**语义**:`ithomeUnreadBadge.value` = 本 session 内新增且未读的文章数。

**行为表**(均与既有 `ithomeNewIds` 一致,无需新逻辑):

| 事件 | `ithomeNewIds` | `ithomeUnreadBadge` |
| ---- | -------------- | ------------------- |
| 启动,bootstrap 今日新闻 | 新文章 id 进 map | 数字 = 新文章数 |
| 读一篇 (`markIthomeRead`) | 删该 id | 数字 -1 |
| 切日期 (`setIthomeSelectedDate`) | `{}` 清空 | 0 |
| 切收藏视图 (`setIthomeViewMode`) | `{}` 清空 | 0 |
| 重启 app | `{}` (session 级) | 0 |

### 3.2 装配层 — `src/renderer/components/SideNav.jsx`

import 新 signal,构建 badge map,透传给 SideNavItem:

```js
import { ithomeUnreadBadge } from '../ithome/store.js';
// ...
// 显式订阅,避免 needsConfig 误判式的 UI 不刷新 (跟现有
// void aiSessionsConfig.value 同模式)
void ithomeUnreadBadge.value;
const navBadges = { ithome: ithomeUnreadBadge.value };
// ...
// 渲染 visibleNavItems 时:
<SideNavItem
  key={item.key}
  item={item}
  badge={navBadges[item.key] || 0}   // ← 新增
  active={isActive}
  // ... 其余 prop 不变
/>
```

### 3.3 渲染层 — `src/renderer/components/SideNavItem.jsx`

加可选 `badge` prop (默认 0,不影响其他 nav item),在 icon 后渲染胶囊:

```jsx
export function SideNavItem({
  item,
  active = false,
  collapsed = false,
  badge = 0,              // ← 新增
  onSelect,
  // ... 其余 prop 不变
}) {
  // ...
  return (
    <li ...>
      <button class="side-nav-button" ...>
        <span class="side-nav-icon">{item.icon}</span>
        {badge > 0 && (
          <span class="side-nav-badge" aria-label={`${badge} 条未读`}>
            {badge}
          </span>
        )}
        {!collapsed && <span class="side-nav-label">{item.label}</span>}
      </button>
      {/* dialog 不变 */}
    </li>
  );
}
```

**定位锚点**:胶囊绝对定位在 `<button class="side-nav-button">` 内,锚定 icon `<span>` 右上。

> ⚠️ **现有 CSS 事实**(grep 验证):`.side-nav-button` **无 `position` 声明**,
> 而 `.side-nav-setup-dot` 的 `position: absolute` 是相对于 `.side-nav`
> (设了 `position: relative`) 定位的 —— 它能成立是因为全侧边栏只有一个 dot。
> **本 spec 的 badge 是每 item 独立一个,必须相对 item 自己定位**,因此
> **必须给 `.side-nav-button` 加 `position: relative`**(真实缺口,非可选)。

### 3.4 CSS — `styles.css`

新增 `.side-nav-badge`,折叠/展开两态定位(复用现有 `.side-nav-collapsed` 父 class):

```css
.side-nav-button { position: relative; }   /* 现有 CSS 无此声明,必加 (见 §3.3 备注) */

.side-nav-badge {
  position: absolute;
  top: 2px;
  right: 18px;            /* 展开态:锚定 icon (左侧) 右上 */
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #ff3b30;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  pointer-events: none;   /* 不挡按钮点击 */
  z-index: 1;
}

.side-nav-collapsed .side-nav-badge {
  right: 2px;             /* 折叠态:40px 窄栏,锚定 button 右上 */
}
```

**色彩**:`#ff3b30` 跟 `digest-badge` / iOS 系统红一致,无需新变量。
**pointer-events: none**:胶囊纯展示,点击穿透到下层 `<button>` 切 tab。

## 4. 验收

- [ ] `ithomeUnreadBadge` computed: newIds 增/减时数字正确 (3 case)
      - 空 newIds → 0
      - newIds 有 3 个 → 3
      - markIthomeRead 删 1 个 → 2
- [ ] SideNavItem: badge=0 不渲染; badge>0 渲染数字; aria-label 含数字 (3 case)
- [ ] SideNav 集成: ithome 有 newIds 时 ithome item 带 badge; 其他 item 不带 (1-2 case)
- [ ] 全套 vitest 绿
- [ ] 用户本地手测: `npx electron .`
      1. 切到 IT之家, bootstrap 拉今日新闻 → 看到 NEW 高亮的文章
      2. 切到版本检查 → SideNav IT之家 item 右上有红数字
      3. 回 IT之家读一篇 → badge 数字 -1
      4. 切到昨天 → badge 归 0
      5. 重启 → badge 归 0

## 5. 风险

| 风险 | 等级 | 缓解 |
| ---- | ---- | ---- |
| `ithomeUnreadBadge` 在 ithome tab 未 bootstrap 时为 0 | 无 | newIds 初始 `{}`,computed=0,badge 不渲染,符合预期 |
| 折叠态 badge 与 `side-nav-setup-dot` 冲突 | 无 | ithome nav 不走 setup-dot(仅 AI 配置按钮),无交集 |
| `computed` signal 被提前 GC | 低 | SideNav 持续订阅,生命周期=组件;`void ithomeUnreadBadge.value` 显式保活 |
| `<button>` 未设 `position: relative` 导致 badge 定位漂移 | 中 | **已确认现有 CSS 无此声明,spec §3.3/§3.4 已要求必加**(否则 badge 会相对 `.side-nav` 错位) |

## 6. 与路线图对齐

- 上游候选:`2026-06-19-product-roadmap-design.md` §4.1 I6(评分 价值2/成本1/风险0/总分7)
- **本次只做 I6 的 SideNav badge 子项**;I6 的「已读变灰」本体已落地(§1.1)。
- 状态机:合入后 I6 → 🟢 Next + 🟢 已合入。
- 流程:§9 spec → plan(本 spec 已落)。
