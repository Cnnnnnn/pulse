# I6 — IT之家未读角标 + SideNav 联动 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 SideNav 的 IT之家 item 加未读数字胶囊,数字 = 本 session 新增未读文章数 (`ithomeNewIds`),读一篇减 1,切日期/重启清空。

**Architecture:** 三层改动 — ①ithome store 加一个 `computed` signal (`ithomeUnreadBadge`) 直接派生自现有 `ithomeNewIds`;②SideNav 把 badge 数字透传给 SideNavItem;③SideNavItem 加可选 `badge` prop 在 icon 右上渲染胶囊。零 main 端改动 (newIds 本就是 session 级)。

**Tech Stack:** Preact + @preact/signals (`computed`) + happy-dom (组件测试) + vitest

**Spec:** `docs/superpowers/specs/2026-06-23-i6-ithome-sidenav-unread-badge-design.md`

---

## File Structure

| 文件 | 改动 | 职责 |
| ---- | ---- | ---- |
| `src/renderer/ithome/store.js` | 修改 | 新增 `ithomeUnreadBadge` computed signal |
| `src/renderer/components/SideNav.jsx` | 修改 | import `ithomeUnreadBadge`,构建 navBadges map,透传给 SideNavItem |
| `src/renderer/components/SideNavItem.jsx` | 修改 | 加可选 `badge` prop,渲染数字胶囊 |
| `styles.css` | 修改 | 新增 `.side-nav-button{position:relative}` + `.side-nav-badge` + 折叠态定位 |
| `tests/renderer/ithome-news-store.test.js` | 修改 | 加 `ithomeUnreadBadge` computed 测试 |
| `tests/renderer/sidenav-ithome-badge.test.jsx` | 新建 | SideNav 集成测试 (ithome item 带 badge) |
| `tests/renderer/sidenav-item-badge.test.jsx` | 新建 | SideNavItem 单元测试 (badge prop 渲染) |

**测试文件位置约定** (跟现有结构对齐):
- store 测试 → `tests/renderer/ithome-news-store.test.js` (已存在,追加 case)
- SideNav 集成测试 → `tests/renderer/sidenav-*.test.jsx` (跟 `sidenav-prefs.test.jsx` 同目录同前缀)
- SideNavItem 单元测试 → `tests/renderer/sidenav-*.test.jsx`

---

## Task 1: ithomeUnreadBadge computed signal (TDD)

**Files:**
- Modify: `src/renderer/ithome/store.js` (signals 声明区, 第 29-30 行附近)
- Test: `tests/renderer/ithome-news-store.test.js`

- [ ] **Step 1: 在 ithome-news-store.test.js 顶部 import 区追加 `ithomeUnreadBadge`**

打开 `tests/renderer/ithome-news-store.test.js`,找到现有的 import 块 (从 `import {` 开始,引入 `ithomeReadIds, ithomeNewIds, ithomeSharingIds` 等)。把 `ithomeUnreadBadge` 加进同一个 import 列表:

```js
import {
  ithomeReadIds,
  ithomeNewIds,
  ithomeSharingIds,
  ithomeUnreadBadge,
```

(只加一行 `ithomeUnreadBadge,`,其余不动。)

- [ ] **Step 2: 在该文件末尾追加一个新 describe 块,写 3 个失败的 case**

在文件末尾追加:

```js
describe("ithomeUnreadBadge — SideNav 未读角标 (I6)", () => {
  beforeEach(() => {
    // ithomeNewIds 是 module-level signal, 跨 it 残留 — 每个 case 前显式清空
    ithomeNewIds.value = {};
  });

  it("空 newIds → 0", () => {
    expect(ithomeUnreadBadge.value).toBe(0);
  });

  it("newIds 有 3 个 id → 3", () => {
    ithomeNewIds.value = { a: 1, b: 1, c: 1 };
    expect(ithomeUnreadBadge.value).toBe(3);
  });

  it("删掉 1 个 id 后 → 数字 -1", () => {
    ithomeNewIds.value = { a: 1, b: 1, c: 1 };
    expect(ithomeUnreadBadge.value).toBe(3);
    const next = { ...ithomeNewIds.value };
    delete next.a;
    ithomeNewIds.value = next;
    expect(ithomeUnreadBadge.value).toBe(2);
  });
});
```

- [ ] **Step 3: 跑测试,确认失败 (ithomeUnreadBadge 未导出)**

Run: `npx vitest run tests/renderer/ithome-news-store.test.js`
Expected: FAIL — `ithomeUnreadBadge is not exported` 或 `undefined` (因为 store.js 还没加)

- [ ] **Step 4: 在 store.js 加 computed**

打开 `src/renderer/ithome/store.js`。第 1 行的 import 把 `computed` 加上:

```js
import { signal, computed } from "@preact/signals";
```

(`signal` 已在,只加 `, computed`。)

然后在 `ithomeNewIds` 声明之后 (约第 30 行 `export const ithomeNewIds = signal({});` 这行下面) 加:

```js
/**
 * SideNav 未读角标 (I6) — 本 session 新增且未读的文章数.
 * 直接派生自 ithomeNewIds, 行为完全跟随:
 *   读一篇 (markIthomeRead) → -1; 切日期/重启 → 归 0.
 */
export const ithomeUnreadBadge = computed(
  () => Object.keys(ithomeNewIds.value).length
);
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `npx vitest run tests/renderer/ithome-news-store.test.js`
Expected: PASS (含新增 3 case + 原有 case 全绿)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/ithome/store.js tests/renderer/ithome-news-store.test.js
git commit -m "feat(i6): ithomeUnreadBadge computed signal

派生自 ithomeNewIds, 为 SideNav 未读角标提供数据源.
读一篇减 1, 切日期/重启归 0 (跟 newIds 语义一致)."
```

---

## Task 2: SideNavItem 加可选 badge prop (TDD)

**Files:**
- Modify: `src/renderer/components/SideNavItem.jsx`
- Test (新建): `tests/renderer/sidenav-item-badge.test.jsx`

- [ ] **Step 1: 新建测试文件,写失败的 case**

新建 `tests/renderer/sidenav-item-badge.test.jsx`:

```jsx
// @vitest-environment happy-dom
/**
 * tests/renderer/sidenav-item-badge.test.jsx
 *
 * I6: SideNavItem 的 badge prop 渲染.
 * badge=0 不渲染; badge>0 渲染数字胶囊 + aria-label.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { SideNavItem } from "../../src/renderer/components/SideNavItem.jsx";

const baseItem = { key: "ithome", icon: "📰", label: "IT 新闻", tooltip: "x" };

describe("SideNavItem — badge prop (I6)", () => {
  it("badge=0 → 不渲染 badge 元素", () => {
    render(<SideNavItem item={baseItem} badge={0} />);
    expect(document.body.querySelector(".side-nav-badge")).toBeNull();
  });

  it("badge=3 → 渲染数字 3 + aria-label 含 3", () => {
    render(<SideNavItem item={baseItem} badge={3} />);
    const badge = document.body.querySelector(".side-nav-badge");
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe("3");
    expect(badge.getAttribute("aria-label")).toContain("3");
  });

  it("不传 badge (默认 0) → 不渲染", () => {
    render(<SideNavItem item={baseItem} />);
    expect(document.body.querySelector(".side-nav-badge")).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败 (badge 不渲染)**

Run: `npx vitest run tests/renderer/sidenav-item-badge.test.jsx`
Expected: FAIL — `badge=3` case 查不到 `.side-nav-badge` (因为 SideNavItem 还没渲染它)

- [ ] **Step 3: 改 SideNavItem.jsx — 加 badge prop + 渲染**

打开 `src/renderer/components/SideNavItem.jsx`。

**(a)** 在函数参数解构里加 `badge = 0` (紧跟 `collapsed = false,` 之后,约第 31 行):

```jsx
export function SideNavItem({
  item,
  active = false,
  collapsed = false,
  badge = 0,
  onSelect,
```

**(b)** 在 icon `<span>` 之后 (约第 154 行 `<span class="side-nav-icon">{item.icon}</span>` 这行下面),加 badge 渲染:

```jsx
        <span class="side-nav-icon">{item.icon}</span>
        {badge > 0 && (
          <span class="side-nav-badge" aria-label={`${badge} 条未读`}>
            {badge}
          </span>
        )}
        {!collapsed && <span class="side-nav-label">{item.label}</span>}
```

(只加中间的 `{badge > 0 && ...}` 块,上下两行不动。)

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/renderer/sidenav-item-badge.test.jsx`
Expected: PASS (3 case 全绿)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/SideNavItem.jsx tests/renderer/sidenav-item-badge.test.jsx
git commit -m "feat(i6): SideNavItem 加可选 badge prop

badge>0 在 icon 右上渲染数字胶囊 (aria-label 含未读数).
默认 0 不影响其他 nav item."
```

---

## Task 3: SideNav 装配 — ithome item 注入 badge (TDD)

**Files:**
- Modify: `src/renderer/components/SideNav.jsx`
- Test (新建): `tests/renderer/sidenav-ithome-badge.test.jsx`

- [ ] **Step 1: 新建 SideNav 集成测试**

新建 `tests/renderer/sidenav-ithome-badge.test.jsx`:

```jsx
// @vitest-environment happy-dom
/**
 * tests/renderer/sidenav-ithome-badge.test.jsx
 *
 * I6: SideNav 把 ithomeUnreadBadge 注入 ithome item.
 * - ithome item 带 badge 数字; 其他 nav item 不带.
 *
 * mock 策略跟 sidenav-prefs.test.jsx 一致 (navStore/store/trayConfigStore),
 * 额外 mock ithome/store.js 的 ithomeUnreadBadge 让 badge 可控.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/preact";
import { signal } from "@preact/signals";

const ithomeUnreadBadge = signal(0);

vi.mock("../../src/renderer/worldcup/navStore.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    NAV_KEYS_LIST: actual.NAV_KEYS_LIST,
    effectiveVisibleItems: actual.effectiveVisibleItems,
    activeNav: { value: "ithome" },
    navCollapsed: { value: false },
    setActiveNav: vi.fn(),
    toggleNavCollapsed: vi.fn(),
  };
});

vi.mock("../../src/renderer/store.js", () => ({
  openAISettings: vi.fn(),
  needsConfig: () => false,
  aiSessionsConfig: { value: null },
  aiKeyStatus: { value: {} },
}));

vi.mock("../../src/renderer/nav-refresh.js", () => ({
  refreshActiveNav: vi.fn(),
  REFRESHABLE_NAV_KEYS: new Set(),
}));

vi.mock("../../src/renderer/trayConfigStore.js", () => ({
  trayMenuPrefs: signal({
    version: 1,
    segments: {
      updates: true, ai_usage: true, worldcup: true, metals: true,
      check_action: true, config_action: true,
    },
  }),
}));

vi.mock("../../src/renderer/ithome/store.js", () => ({
  ithomeUnreadBadge,
}));

// localStorage 初始化 (sidenav-prefs loadPrefs 依赖)
beforeEach(() => {
  localStorage.clear();
  ithomeUnreadBadge.value = 0;
});

const { SideNav } = await import("../../src/renderer/components/SideNav.jsx");

function ithomeBadgeText() {
  const li = document.body.querySelector('.side-nav-item[data-nav="ithome"]');
  if (!li) return null;
  const badge = li.querySelector(".side-nav-badge");
  return badge ? badge.textContent : null;
}

describe("SideNav — ithome badge 联动 (I6)", () => {
  it("ithomeUnreadBadge=0 → ithome item 无 badge", () => {
    render(<SideNav />);
    expect(ithomeBadgeText()).toBeNull();
  });

  it("ithomeUnreadBadge=5 → ithome item badge 显示 5", () => {
    ithomeUnreadBadge.value = 5;
    render(<SideNav />);
    expect(ithomeBadgeText()).toBe("5");
  });

  it("非 ithome item 永远无 badge", () => {
    ithomeUnreadBadge.value = 9;
    render(<SideNav />);
    const others = ["wechat-hot", "worldcup", "funds", "versions"];
    for (const key of others) {
      const li = document.body.querySelector(`.side-nav-item[data-nav="${key}"]`);
      if (li) {
        expect(li.querySelector(".side-nav-badge")).toBeNull();
      }
    }
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/renderer/sidenav-ithome-badge.test.jsx`
Expected: FAIL — `ithomeUnreadBadge=5` case 查不到 badge (因为 SideNav 还没透传 badge)

- [ ] **Step 3: 改 SideNav.jsx — import + 构建 navBadges + 透传**

打开 `src/renderer/components/SideNav.jsx`。

**(a)** 在 import 区 (第 28-42 行附近) 加 ithome store 的 import。紧跟 `import { openAISettings, ... } from '../store.js';` 这行之后:

```js
import { ithomeUnreadBadge } from '../ithome/store.js';
```

**(b)** 在组件函数体内,现有 `void aiSessionsConfig.value;` / `void aiKeyStatus.value;` 之后 (约第 68-69 行),加显式订阅 + navBadges map:

```js
  void aiSessionsConfig.value;
  void aiKeyStatus.value;
  const aiNeedsSetup = needsConfig();

  // I6: ithome 未读角标 — 显式订阅确保 UI 刷新
  void ithomeUnreadBadge.value;
  const navBadges = { ithome: ithomeUnreadBadge.value };
```

**(c)** 在 `<SideNavItem ... />` 渲染处 (约第 167-178 行),加 `badge` prop:

```jsx
            <SideNavItem
              key={item.key}
              item={item}
              active={isActive}
              collapsed={collapsed}
              badge={navBadges[item.key] || 0}
              draggable={!collapsed}
              onSelect={setActiveNav}
              onReorder={handleReorder}
              onHide={handleHide}
              onMoveTop={handleMoveTop}
              onMoveBottom={handleMoveBottom}
            />
```

(只加 `badge={navBadges[item.key] || 0}` 这一行,其余 prop 不动。)

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/renderer/sidenav-ithome-badge.test.jsx`
Expected: PASS (3 case 全绿)

- [ ] **Step 5: 跑现有 SideNav 测试,确认无回归**

Run: `npx vitest run tests/renderer/sidenav-prefs.test.jsx tests/renderer/sidenav-collapsed-buttons.test.jsx`
Expected: PASS (这些测试没 mock ithome/store.js, 但 import 安全 — store-utils 用 `typeof window` 守卫, recent/track 纯 JS, 不会炸; 且它们不渲染 ithome badge 因为真实的 ithomeNewIds 初始为 {} → badge=0)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SideNav.jsx tests/renderer/sidenav-ithome-badge.test.jsx
git commit -m "feat(i6): SideNav ithome item 注入未读 badge

ithomeUnreadBadge → navBadges map → 透传 SideNavItem.
其他 nav item 不受影响 (navBadges 只含 ithome)."
```

---

## Task 4: CSS — side-nav-badge 样式

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 给 .side-nav-button 加 position: relative**

打开 `styles.css`,找到 `.side-nav-button {` 规则 (约第 3518 行)。在规则内加 `position: relative;`:

```css
.side-nav-button {
  position: relative;   /* I6: badge 绝对定位的锚点 (原 setup-dot 相对 .side-nav, 每 item badge 必须独立锚点) */
  display: flex;
  align-items: center;
  gap: 10px;
```

(加在规则内第一行,其余属性不动。)

- [ ] **Step 2: 新增 .side-nav-badge 样式**

在 `.side-nav-setup-dot` 规则附近 (约第 4760-4771 行,已有的 setup-dot 块之后) 追加:

```css
/* ─── I6: SideNav 未读角标 (ithome) ─── */
.side-nav-badge {
  position: absolute;
  top: 2px;
  right: 18px;            /* 展开态: 锚定 icon 右上 (icon 在 button 左侧) */
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #ff3b30;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  pointer-events: none;   /* 不挡下层 button 点击 */
  z-index: 1;
}

.side-nav-collapsed .side-nav-badge {
  right: 2px;             /* 折叠态: 40px 窄栏, 锚定 button 右上 */
}
```

- [ ] **Step 3: 跑全量 vitest,确认无回归**

Run: `npx vitest run`
Expected: PASS (CSS 改动不影响测试逻辑, 但确认全绿)

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "style(i6): side-nav-badge 胶囊样式 + button 定位锚点

- .side-nav-button 补 position:relative (现有 setup-dot 相对 .side-nav
  定位, 每 item 独立 badge 必须独立锚点)
- .side-nav-badge 数字胶囊 (#ff3b30, 折叠/展开两态定位)
- pointer-events:none 不挡 tab 切换"
```

---

## Task 5: 全量验证 + 手测清单

**Files:** 无 (验证任务)

- [ ] **Step 1: 跑全量 vitest**

Run: `npx vitest run`
Expected: 全绿 (含新增 9 case: Task1 3 + Task2 3 + Task3 3)

- [ ] **Step 2: 重新构建 renderer bundle**

Run: `npm run build:renderer`
Expected: 成功 (验证 JSX 改动语法正确)

- [ ] **Step 3: 填写手测清单 (留给 release notes)**

在本次实现的 commit message 或后续 release notes 里记录手测步骤:

```
用户本地验证 (留给 release):
1. npx electron .
2. 切到 IT之家, bootstrap 拉今日新闻 → 看到 NEW 高亮文章
3. 切到版本检查 → SideNav IT之家 item 右上有红数字
4. 回 IT之家读一篇 → badge 数字 -1
5. 切到昨天 → badge 归 0
6. 重启 → badge 归 0
```

- [ ] **Step 4: (可选) 更新 roadmap §10.2 I6 状态**

打开 `docs/superpowers/specs/2026-06-19-product-roadmap-design.md` §10.2,把 I6 行从

```
| I6 | 内容标记已读(列表变灰 + SideNav badge) | 7 | ❌ 未开始 | ... |
```

改为

```
| I6 | 内容标记已读(列表变灰 + SideNav badge) | 7 | ✅ 已落地 | ithome SideNav badge 联动 (ithome 已读本体此前已落地); wechat-hot badge 留 v2 |
```

- [ ] **Step 5: Commit (若改了 roadmap)**

```bash
git add docs/superpowers/specs/2026-06-19-product-roadmap-design.md
git commit -m "docs(roadmap): I6 状态对账 — ithome SideNav badge 已落地"
```

---

## Self-Review

**Spec 覆盖检查:**

| Spec 要求 | 对应 Task |
| --------- | --------- |
| §3.1 `ithomeUnreadBadge` computed | Task 1 |
| §3.2 SideNav navBadges map + 透传 | Task 3 |
| §3.3 SideNavItem `badge` prop + 渲染 | Task 2 |
| §3.3 `.side-nav-button` 必加 `position: relative` | Task 4 Step 1 |
| §3.4 `.side-nav-badge` CSS + 折叠态 | Task 4 Step 2 |
| §4 验收 (computed 3 case + SideNavItem 3 case + 集成) | Task 1/2/3 |

无遗漏。

**Placeholder 扫描:** 无 TBD/TODO,每个 step 都有完整代码。

**类型/命名一致性:**
- `ithomeUnreadBadge` — store.js (Task1) / 测试 (Task1) / SideNav import (Task3) / mock (Task3) ✓ 一致
- `badge` prop — SideNavItem (Task2) / 测试 (Task2) / SideNav 透传 (Task3) ✓ 一致
- `navBadges` map — SideNav 内 (Task3) ✓ 一致
- `.side-nav-badge` class — SideNavItem (Task2) / CSS (Task4) / 测试 querySelector (Task2/Task3) ✓ 一致

**回归风险检查:**
- 现有 `sidenav-prefs.test.jsx` / `sidenav-collapsed-buttons.test.jsx` 未 mock `ithome/store.js`,Task 3 Step 5 专门跑这两个确认不炸 (import 安全性已验证: store-utils 有 `typeof window` 守卫)。
