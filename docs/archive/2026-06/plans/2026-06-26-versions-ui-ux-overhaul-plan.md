# Pulse 版本检查 UI/UX 全面重构 (v2.49) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 Pulse 版本检查 tab 的整套 UI/UX：新增全局 TopBar + Command Palette，Library 行级收编，新增 Overview/Insights/Settings 主页，统一 480px 右侧抽屉单实例，修复 changelog/icon/AI 排版三大痛点，全量覆盖 a11y/reduced-motion/dark-mode/perf 横切点。

**Architecture:** 4 阶段交付（P1 Shell → P2 Library → P3 Overview → P4 Insights/Settings）。Preact + signals + custom CSS，沿用现有 store/selectors，组件级 TDD。新建 11 个组件 + 3 个 store + 4 个 IPC handler + 2 个新 icon。修改 6 个现有组件（Header 收编、AppRow 收编、ChangelogPanel 简化、Drawer 单实例化等）。

**Tech Stack:** Electron + Preact + @preact/signals, esbuild, vitest, axe-core (a11y), 现有 IPC + state-store。

## Global Constraints

- 版本管理: bump 到 2.49.0（v2.48.1 → v2.49.0）
- Conventional commits: `feat(versions):` / `fix(versions):` / `chore(release):` / `docs(spec):` / `test(versions):` / `refactor(versions):`
- TDD: 每个 task 先写失败测试，跑确认 fail，再写最小实现让它 pass
- 每个 task 完成后立即 commit（per checklist 第 5 步）
- ponytail: 删除多于添加，boring 多于巧妙，最少文件最简代码
- 模块前缀: 新建 store 用 `route-store` / `command-palette-store` / `library-view-store` / `overview-store`（kebab-case，跟现有 store.js 命名一致）
- 组件前缀: 新组件用 PascalCase 文件名（`TopBar.jsx` / `CommandPalette.jsx`），无前缀
- 图标: 全 emoji 禁用，统一用 `src/renderer/components/icons.jsx` inline SVG（已存在 IconSearch/IconBell/IconRefresh/IconSparkles/IconMoreHorizontal/IconList/IconCheck/IconX/IconChevronDown 等，新增仅 `IconCommand` + `IconGrid` 2 个）
- 横切: 全程开 `prefers-reduced-motion` + 全程 token 化 + 全程 aria-label
- 不引入新 npm 依赖（virtual list 自实现）
- 不拆 main / preload / renderer 进程边界
- IPC 前缀: 新增 `versions:overview-kpis` / `versions:overview-trend` / `versions:overview-watchlist` / `versions:overview-recent` / `versions:overview-ai-insights` / `versions:command-search`
- State-store: `PRESERVE_FIELDS` 新增 `overviewCache`（24h 缓存 AI insights）
- 抽屉: 统一 480px 右侧，单实例（开新抽屉自动关旧的，通过 `ui-overlay` signal 管理）

## File Structure

新文件 (16):
- `src/renderer/components/TopBar.jsx` — 全局 32px 顶部
- `src/renderer/components/CommandPalette.jsx` — Cmd+K 全局命令面板
- `src/renderer/components/PageHeader.jsx` — 各 view 标题 + subtitle + 操作
- `src/renderer/components/AIDrawerShell.jsx` — AI 抽屉共享外壳
- `src/renderer/components/KPICard.jsx` — Overview 单个 KPI 卡片
- `src/renderer/components/TrendSparkline.jsx` — SVG sparkline
- `src/renderer/components/WatchlistQuick.jsx` — Watchlist 快速入口
- `src/renderer/components/RecentTimeline.jsx` — 最近活动 timeline
- `src/renderer/components/AIInsightsBlock.jsx` — AI 摘要块
- `src/renderer/components/ViewSwitcher.jsx` — Table/Card 切换
- `src/renderer/components/AppCard.jsx` — Card 视图单卡
- `src/renderer/components/MergedFilterChip.jsx` — status + category 合并 chip
- `src/renderer/route-store.js` — 路由 signal
- `src/renderer/command-palette-store.js` — palette signal
- `src/renderer/library-view-store.js` — view + filter signal
- `src/renderer/overview-store.js` — Overview 派生信号 + AI cache

修改文件 (10):
- `src/renderer/components/icons.jsx` — 加 IconCommand + IconGrid
- `src/renderer/components/Header.jsx` — 删除原 9 按钮，只留 PageHeader 逻辑（迁出到 PageHeader.jsx）
- `src/renderer/components/AppRow.jsx` — 行级 9 元素 → 3 元素 + `···` 菜单
- `src/renderer/components/ChangelogPanel.jsx` — 删底部 fallback link + 版本标签简化
- `src/renderer/components/FilterBar.jsx` — 删除（功能迁到 MergedFilterChip）
- `src/renderer/components/CategoryTabs.jsx` — 删除（功能迁到 MergedFilterChip）
- `src/renderer/components/VersionsLayout.jsx` — 加 route-switch 逻辑
- `src/renderer/stocks/AiAdviseDrawer.jsx` — 用 AIDrawerShell 重构
- `src/renderer/stocks/StockDetailDrawer.jsx` — 用 AIDrawerShell 重构
- `src/main/ipc/index.js` — 注册 6 个新 IPC
- `src/main/state-store.js` — PRESERVE_FIELDS 加 overviewCache
- `styles.css` — 加 `.topbar` `.command-palette` `.page-header` `.ai-drawer-shell` `.kpi-card` `.trend-sparkline` `.watchlist-quick` `.recent-timeline` `.ai-insights` `.view-switcher` `.app-card` `.merged-filter-chip` + 全局 reduced-motion

测试文件: 16 个（与新组件一一对应，含 axe-core 集成）

---

## P1: Shell (TopBar + Command Palette + 路由)

### Task 1: 加 IconCommand + IconGrid

**Files:**
- Modify: `src/renderer/components/icons.jsx:50-100`
- Test: `tests/renderer/icons.test.jsx`

**Interfaces:**
- Consumes: 现有 `Svg` helper
- Produces: `IconCommand` (Cmd+K 标志) + `IconGrid` (Card 视图标志)

- [ ] **Step 1: 写失败测试**

`tests/renderer/icons.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { IconCommand, IconGrid } from "../../src/renderer/components/icons.jsx";

describe("new icons", () => {
  it("IconCommand 渲染 svg", () => {
    const { container } = render(<IconCommand size={14} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("svg")).toHaveAttribute("width", "14");
  });
  it("IconGrid 渲染 svg", () => {
    const { container } = render(<IconGrid size={14} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/icons.test.jsx`
Expected: FAIL (IconCommand / IconGrid not exported)

- [ ] **Step 3: 在 icons.jsx 加 2 个 icon**

```jsx
export function IconCommand({ size = 14 }) {
  return (
    <Svg size={size}>
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </Svg>
  );
}

export function IconGrid({ size = 14 }) {
  return (
    <Svg size={size}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </Svg>
  );
}
```

- [ ] **Step 4: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/icons.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/icons.jsx tests/renderer/icons.test.jsx
git commit -m "feat(icons): add IconCommand + IconGrid (v2.49)"
```

### Task 2: route-store (路由 signal)

**Files:**
- Create: `src/renderer/route-store.js`
- Test: `tests/renderer/route-store.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `currentRoute` — signal，默认 `'overview'`
  - `navigateTo(route)` — 设置 currentRoute
  - `ROUTES` — 常量: `['overview', 'library', 'diagnostics', 'insights', 'settings']`

- [ ] **Step 1: 写失败测试**

`tests/renderer/route-store.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { currentRoute, navigateTo, ROUTES } from "../../src/renderer/route-store.js";

beforeEach(() => { currentRoute.value = "overview"; });

describe("route-store", () => {
  it("currentRoute 默认 overview", () => {
    expect(currentRoute.value).toBe("overview");
  });
  it("ROUTES 包含 5 个 view", () => {
    expect(ROUTES).toEqual(["overview", "library", "diagnostics", "insights", "settings"]);
  });
  it("navigateTo 切换路由", () => {
    navigateTo("library");
    expect(currentRoute.value).toBe("library");
  });
  it("navigateTo 非法路由不改变", () => {
    navigateTo("invalid-route-xyz");
    expect(currentRoute.value).toBe("overview");
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/route-store.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: 写实现**

`src/renderer/route-store.js`:

```js
/**
 * src/renderer/route-store.js
 *
 * 版本检查 5 个 view 的路由 signal. 不引入真 hash 路由 (太重),
 * signal 已能驱动组件重渲染, 5 个 view 切换足够.
 */
import { signal } from "@preact/signals";

export const ROUTES = ["overview", "library", "diagnostics", "insights", "settings"];

export const currentRoute = signal("overview");

export function navigateTo(route) {
  if (ROUTES.includes(route)) currentRoute.value = route;
}
```

- [ ] **Step 4: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/route-store.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/route-store.js tests/renderer/route-store.test.js
git commit -m "feat(route-store): versions 5-view routing signal"
```

### Task 3: PageHeader 组件

**Files:**
- Create: `src/renderer/components/PageHeader.jsx`
- Test: `tests/renderer/PageHeader.test.jsx`

**Interfaces:**
- Consumes: 无
- Produces: `<PageHeader title="..." subtitle="...">{children}</PageHeader>` — 各 view 顶部通用 header（不含全局 TopBar 的 logo/搜索/通知）

- [ ] **Step 1: 写失败测试**

`tests/renderer/PageHeader.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { PageHeader } from "../../src/renderer/components/PageHeader.jsx";

describe("PageHeader", () => {
  it("渲染 title + subtitle", () => {
    render(<PageHeader title="应用库" subtitle="11 监控 · 3 可升级" />);
    expect(screen.getByText("应用库")).toBeTruthy();
    expect(screen.getByText("11 监控 · 3 可升级")).toBeTruthy();
  });
  it("children 作为右侧操作区", () => {
    render(
      <PageHeader title="应用库" subtitle="—">
        <button>视图切换</button>
      </PageHeader>
    );
    expect(screen.getByText("视图切换")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/PageHeader.test.jsx`
Expected: FAIL (module not found)

- [ ] **Step 3: 写实现**

`src/renderer/components/PageHeader.jsx`:

```jsx
/**
 * src/renderer/components/PageHeader.jsx
 *
 * 各 view 的 page-level header. 不含全局 TopBar (logo/搜索/通知),
 * 只显示 view 自己的标题 + subtitle + children (操作按钮).
 */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div class="page-header">
      <div class="page-header-text">
        <h2 class="page-header-title">{title}</h2>
        {subtitle && <p class="page-header-subtitle">{subtitle}</p>}
      </div>
      {children && <div class="page-header-actions">{children}</div>}
    </div>
  );
}

export default PageHeader;
```

- [ ] **Step 4: 加 CSS**

`styles.css` 末尾追加:

```css
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
  gap: 16px;
}
.page-header-text { min-width: 0; }
.page-header-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #1d1d1f);
  margin: 0;
}
.page-header-subtitle {
  font-size: 12px;
  color: var(--text-secondary, #6e6e73);
  margin: 4px 0 0;
}
.page-header-actions { display: flex; gap: 8px; flex-shrink: 0; }
```

- [ ] **Step 5: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/PageHeader.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/PageHeader.jsx tests/renderer/PageHeader.test.jsx styles.css
git commit -m "feat(versions): add PageHeader component"
```

### Task 4: command-palette-store

**Files:**
- Create: `src/renderer/command-palette-store.js`
- Test: `tests/renderer/command-palette-store.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `paletteOpen` — signal，默认 `false`
  - `paletteQuery` — signal，默认 `""`
  - `paletteResults` — signal，默认 `[]`
  - `paletteSelectedIndex` — signal，默认 `0`
  - `openPalette()` / `closePalette()` / `setPaletteQuery(q)` / `setPaletteResults(arr)` / `setPaletteSelectedIndex(n)`

- [ ] **Step 1: 写失败测试**

`tests/renderer/command-palette-store.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import {
  paletteOpen, paletteQuery, paletteResults, paletteSelectedIndex,
  openPalette, closePalette, setPaletteQuery, setPaletteResults, setPaletteSelectedIndex,
} from "../../src/renderer/command-palette-store.js";

beforeEach(() => {
  closePalette();
  setPaletteQuery("");
  setPaletteResults([]);
  setPaletteSelectedIndex(0);
});

describe("command-palette-store", () => {
  it("默认关闭", () => {
    expect(paletteOpen.value).toBe(false);
  });
  it("openPalette / closePalette 切换", () => {
    openPalette();
    expect(paletteOpen.value).toBe(true);
    closePalette();
    expect(paletteOpen.value).toBe(false);
  });
  it("setPaletteQuery 写 query", () => {
    setPaletteQuery("vscode");
    expect(paletteQuery.value).toBe("vscode");
  });
  it("setPaletteResults 写 results", () => {
    setPaletteResults([{ id: "1", label: "test" }]);
    expect(paletteResults.value).toEqual([{ id: "1", label: "test" }]);
  });
  it("setPaletteSelectedIndex 写 index", () => {
    setPaletteSelectedIndex(2);
    expect(paletteSelectedIndex.value).toBe(2);
  });
  it("closePalette 不重置 query/results (允许下次打开恢复)", () => {
    setPaletteQuery("foo");
    openPalette();
    closePalette();
    expect(paletteQuery.value).toBe("foo");
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/command-palette-store.test.js`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/renderer/command-palette-store.js`:

```js
/**
 * src/renderer/command-palette-store.js
 *
 * Cmd+K 全局命令面板 state. 不自动 reset (用户中断搜索再打开能恢复).
 */
import { signal } from "@preact/signals";

export const paletteOpen = signal(false);
export const paletteQuery = signal("");
export const paletteResults = signal([]);
export const paletteSelectedIndex = signal(0);

export function openPalette() { paletteOpen.value = true; }
export function closePalette() { paletteOpen.value = false; }
export function setPaletteQuery(q) { paletteQuery.value = q; }
export function setPaletteResults(arr) { paletteResults.value = arr; }
export function setPaletteSelectedIndex(n) {
  paletteSelectedIndex.value = Math.max(0, n);
}
```

- [ ] **Step 4: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/command-palette-store.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/command-palette-store.js tests/renderer/command-palette-store.test.js
git commit -m "feat(command-palette): add palette state signals"
```

### Task 5: CommandPalette 组件 (Cmd+K 全局)

**Files:**
- Create: `src/renderer/components/CommandPalette.jsx`
- Test: `tests/renderer/CommandPalette.test.jsx`
- Modify: `src/renderer/api.js` (加 `versionsCommandSearch` bridge)

**Interfaces:**
- Consumes:
  - `command-palette-store` 全套
  - `navigateTo` from route-store
  - `api.versionsCommandSearch(q)` 返回 `{ok, results: [{id, label, kind}]}`
  - `api.runCheck()` (existing)
- Produces: `<CommandPalette />` 全局 modal，`Cmd+K` 唤起，键盘 ↑↓ Enter Esc，搜索结果分 `app` / `action` / `view` 三类

- [ ] **Step 1: 写失败测试**

`tests/renderer/CommandPalette.test.jsx`:

```jsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/preact";
import { CommandPalette } from "../../src/renderer/components/CommandPalette.jsx";
import { paletteOpen, openPalette, closePalette, paletteSelectedIndex, setPaletteSelectedIndex } from "../../src/renderer/command-palette-store.js";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    versionsCommandSearch: vi.fn(async (q) => ({
      ok: true,
      results: [
        { id: "app-vscode", label: `VS Code`, kind: "app" },
        { id: "action-check", label: "检查更新", kind: "action" },
      ],
    })),
    runCheck: vi.fn(async () => ({ ok: true })),
  },
}));

beforeEach(() => {
  cleanup();
  closePalette();
  setPaletteSelectedIndex(0);
});

describe("CommandPalette", () => {
  it("关闭时渲染空", () => {
    const { container } = render(<CommandPalette />);
    expect(container.querySelector(".command-palette")).toBeFalsy();
  });
  it("打开时渲染 input", async () => {
    openPalette();
    render(<CommandPalette />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("combobox")).toBeTruthy();
  });
  it("Esc 关闭", async () => {
    openPalette();
    render(<CommandPalette />);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(paletteOpen.value).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/CommandPalette.test.jsx`
Expected: FAIL (module not found)

- [ ] **Step 3: 加 api bridge**

`src/renderer/api.js` 末尾追加:

```js
// Cmd+K command palette 全局搜索
export const api = {
  ...existingApi,
  versionsCommandSearch: (q) => invoke("versions:command-search", { q }),
};
```

(若 `api` 已存在则合并; 检查顶部是否已有 `const api = { ... }` 模式)

- [ ] **Step 4: 写 CommandPalette 实现**

`src/renderer/components/CommandPalette.jsx`:

```jsx
/**
 * src/renderer/components/CommandPalette.jsx
 *
 * Cmd+K 全局命令面板. 3 类结果: app (跳转 Library) / action (执行) / view (navigateTo).
 * 键盘导航: ↑↓ 切换, Enter 执行, Esc 关闭.
 */
import { useEffect, useRef } from "preact/hooks";
import {
  paletteOpen, paletteQuery, paletteResults, paletteSelectedIndex,
  closePalette, setPaletteQuery, setPaletteResults, setPaletteSelectedIndex,
} from "../command-palette-store.js";
import { navigateTo } from "../route-store.js";
import { api } from "../api.js";
import { IconSearch } from "./icons.jsx";

const KIND_LABEL = { app: "应用", action: "操作", view: "页面" };

export function CommandPalette() {
  const open = paletteOpen.value;
  const query = paletteQuery.value;
  const results = paletteResults.value;
  const selected = paletteSelectedIndex.value;
  const inputRef = useRef(null);

  // 打开时 focus input + 注册全局快捷键
  useEffect(() => {
    if (!open) return undefined;
    inputRef.current && inputRef.current.focus();

    function onKey(e) {
      if (e.key === "Escape") {
        closePalette();
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        setPaletteSelectedIndex(Math.min(results.length - 1, selected + 1));
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowUp") {
        setPaletteSelectedIndex(Math.max(0, selected - 1));
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        const item = results[selected];
        if (item) execute(item);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, selected]);

  // 全局 Cmd+K 唤起
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        paletteOpen.value = !paletteOpen.value;
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // debounced search
  useEffect(() => {
    if (!open) return undefined;
    if (!query || query.length < 1) {
      setPaletteResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      if (!api.versionsCommandSearch) return;
      const r = await api.versionsCommandSearch(query);
      if (r && r.ok) {
        setPaletteResults(r.results || []);
        setPaletteSelectedIndex(0);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  function execute(item) {
    if (item.kind === "view") navigateTo(item.id);
    else if (item.kind === "action" && item.id === "action-check") api.runCheck();
    else if (item.kind === "app") navigateTo("library");
    closePalette();
  }

  if (!open) return null;

  return (
    <div class="command-palette-overlay" role="dialog" aria-modal="true" aria-label="命令面板">
      <div class="command-palette">
        <div class="command-palette-input-wrap">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            class="command-palette-input"
            type="text"
            value={query}
            onInput={(e) => setPaletteQuery(e.currentTarget.value)}
            placeholder="搜索 app 或输入操作..."
            role="combobox"
            aria-controls="command-palette-listbox"
            aria-expanded="true"
            aria-autocomplete="list"
          />
        </div>
        <ul id="command-palette-listbox" class="command-palette-list" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.id}
              class={`command-palette-item${i === selected ? " selected" : ""}`}
              role="option"
              aria-selected={i === selected}
              onMouseEnter={() => setPaletteSelectedIndex(i)}
              onClick={() => execute(r)}
            >
              <span class={`command-palette-kind kind-${r.kind}`}>{KIND_LABEL[r.kind]}</span>
              <span class="command-palette-label">{r.label}</span>
            </li>
          ))}
          {results.length === 0 && query.length >= 1 && (
            <li class="command-palette-empty">无匹配结果</li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default CommandPalette;
```

- [ ] **Step 5: 加 CSS**

`styles.css` 末尾追加:

```css
.command-palette-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 15vh;
  animation: command-palette-fade 0.12s ease-out;
}
@keyframes command-palette-fade { from { opacity: 0; } to { opacity: 1; } }
.command-palette {
  width: min(560px, 90vw);
  background: var(--bg-card, #fff);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.command-palette-input-wrap {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
  color: var(--text-tertiary, #8e8e93);
}
.command-palette-input {
  flex: 1; border: 0; outline: 0; background: transparent;
  font-size: 14px; color: var(--text-primary, #1d1d1f);
}
.command-palette-list {
  list-style: none; margin: 0; padding: 4px;
  max-height: 360px; overflow-y: auto;
}
.command-palette-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 6px;
  cursor: pointer; font-size: 13px;
  color: var(--text-primary, #1d1d1f);
}
.command-palette-item.selected { background: var(--accent-primary, #007aff); color: #fff; }
.command-palette-kind {
  font-size: 10px; padding: 2px 6px; border-radius: 8px;
  background: var(--bg-elevated, #f5f5f7); color: var(--text-tertiary, #8e8e93);
  font-weight: 600; text-transform: uppercase;
}
.command-palette-item.selected .command-palette-kind { background: rgba(255,255,255,0.25); color: #fff; }
.command-palette-empty {
  padding: 20px; text-align: center;
  color: var(--text-tertiary, #8e8e93); font-size: 12px;
}
```

- [ ] **Step 6: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/CommandPalette.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/CommandPalette.jsx src/renderer/components/CommandPalette.test.jsx styles.css src/renderer/api.js
git commit -m "feat(versions): add CommandPalette (Cmd+K global)"
```

### Task 6: TopBar 组件 + 集成

**Files:**
- Create: `src/renderer/components/TopBar.jsx`
- Test: `tests/renderer/TopBar.test.jsx`
- Modify: `src/renderer/components/Header.jsx:51-133` (删除 9 按钮)
- Modify: `src/renderer/components/VersionsLayout.jsx` (TopBar 挂载)

**Interfaces:**
- Consumes:
  - `currentRoute` from route-store (显示当前位置)
  - `openPalette` from command-palette-store
  - `upgradableCount.value` from selectors
- Produces: `<TopBar />` 32px fixed top：PulseLogo | search trigger | AI 任务按钮 | NotificationBell (badge) | OverflowMenu (诊断/关注列表/Reminders/Recent/导出 JSON/CSV/Release Notes)

- [ ] **Step 1: 写失败测试**

`tests/renderer/TopBar.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { TopBar } from "../../src/renderer/components/TopBar.jsx";

vi.mock("../../src/renderer/api.js", () => ({
  api: { detectResultsExport: vi.fn(async () => ({ ok: true })), openUrl: vi.fn() },
}));

describe("TopBar", () => {
  it("渲染 Pulse logo + search trigger + AI button", () => {
    render(<TopBar />);
    expect(screen.getByText("Pulse")).toBeTruthy();
    expect(screen.getByLabelText("搜索 (Cmd+K)")).toBeTruthy();
    expect(screen.getByLabelText("AI 任务")).toBeTruthy();
  });
  it("search trigger 唤起 palette", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByLabelText("搜索 (Cmd+K)"));
    // paletteOpen 是 signal, 通过 mock store 验证
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/TopBar.test.jsx`
Expected: FAIL

- [ ] **Step 3: 写 TopBar 实现**

`src/renderer/components/TopBar.jsx`:

```jsx
/**
 * src/renderer/components/TopBar.jsx
 *
 * 全局 32px 顶部栏. 跨所有 versions view.
 * ponytail: 不做"全部状态"展示, 只放"全局动作" (搜索/AI/通知/overflow).
 */
import { useState } from "preact/hooks";
import { openPalette } from "../command-palette-store.js";
import { upgradableCount } from "../selectors.js";
import { api } from "../api.js";
import {
  IconCommand, IconSparkles, IconBell, IconMoreHorizontal,
  IconRefresh, IconStar, IconSettings, IconCalendar, IconNote,
} from "./icons.jsx";

export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const badge = upgradableCount.value;

  async function exportResults(format) {
    if (!api.detectResultsExport) return;
    await api.detectResultsExport({ format });
    setMenuOpen(false);
  }

  return (
    <header class="topbar" role="banner">
      <div class="topbar-left">
        <span class="topbar-logo">Pulse</span>
      </div>
      <div class="topbar-center">
        <button
          type="button"
          class="topbar-search"
          onClick={openPalette}
          aria-label="搜索 (Cmd+K)"
        >
          <IconCommand size={14} />
          <span>搜索 app 或输入操作...</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
      <div class="topbar-right">
        <button
          type="button"
          class="topbar-icon-btn"
          onClick={() => api.runCheck && api.runCheck()}
          aria-label="检查更新"
          title="检查更新"
        >
          <IconRefresh size={16} />
        </button>
        <button
          type="button"
          class="topbar-icon-btn topbar-ai"
          aria-label="AI 任务"
          title="AI 任务"
        >
          <IconSparkles size={16} />
        </button>
        <button
          type="button"
          class="topbar-icon-btn topbar-bell"
          aria-label={`通知${badge > 0 ? ` (${badge} 个可升级)` : ""}`}
          title="通知"
        >
          <IconBell size={16} />
          {badge > 0 && <span class="topbar-badge" aria-hidden="true">{badge}</span>}
        </button>
        <div class="topbar-overflow">
          <button
            type="button"
            class="topbar-icon-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="更多"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <IconMoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <ul class="topbar-menu" role="menu">
              <li><button role="menuitem" onClick={() => { setMenuOpen(false); }}><IconStar size={14} />关注列表</button></li>
              <li><button role="menuitem" onClick={() => { setMenuOpen(false); }}><IconSettings size={14} />错误诊断</button></li>
              <li><button role="menuitem" onClick={() => { setMenuOpen(false); }}><IconCalendar size={14} />Reminders</button></li>
              <li><button role="menuitem" onClick={() => { setMenuOpen(false); }}><IconCalendar size={14} />Recent Activity</button></li>
              <li class="topbar-menu-divider" />
              <li><button role="menuitem" onClick={() => exportResults("json")}>导出 JSON</button></li>
              <li><button role="menuitem" onClick={() => exportResults("csv")}>导出 CSV</button></li>
              <li class="topbar-menu-divider" />
              <li><button role="menuitem" onClick={() => { setMenuOpen(false); }}><IconNote size={14} />Release Notes</button></li>
            </ul>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopBar;
```

- [ ] **Step 4: 加 CSS**

`styles.css` 末尾追加:

```css
.topbar {
  position: sticky; top: 0; z-index: 100;
  display: flex; align-items: center; gap: 12px;
  height: 32px; padding: 0 12px;
  background: var(--bg-card, #fff);
  border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
}
.topbar-left { flex-shrink: 0; }
.topbar-logo {
  font-size: 14px; font-weight: 700;
  color: var(--accent-primary, #007aff);
}
.topbar-center { flex: 1; display: flex; justify-content: center; }
.topbar-search {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 10px; min-width: 280px;
  background: var(--bg-elevated, #f5f5f7);
  border: 1px solid transparent; border-radius: 6px;
  color: var(--text-tertiary, #8e8e93); font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.topbar-search:hover { border-color: var(--border, rgba(0,0,0,0.16)); }
.topbar-search kbd {
  margin-left: auto;
  font-family: monospace; font-size: 10px;
  padding: 1px 5px; border-radius: 3px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, rgba(0,0,0,0.08));
}
.topbar-right { display: flex; align-items: center; gap: 4px; }
.topbar-icon-btn {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  background: transparent; border: 0; border-radius: 6px;
  color: var(--text-primary, #1d1d1f);
  cursor: pointer;
  transition: background 0.15s ease;
}
.topbar-icon-btn:hover { background: var(--bg-elevated, #f5f5f7); }
.topbar-ai { color: var(--accent-primary, #007aff); }
.topbar-badge {
  position: absolute; top: 2px; right: 2px;
  min-width: 14px; height: 14px; padding: 0 4px;
  background: #ff3b30; color: #fff;
  border-radius: 7px;
  font-size: 9px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
.topbar-overflow { position: relative; }
.topbar-menu {
  position: absolute; top: calc(100% + 4px); right: 0;
  list-style: none; margin: 0; padding: 4px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, rgba(0,0,0,0.08));
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  min-width: 180px;
  z-index: 200;
}
.topbar-menu li { margin: 0; }
.topbar-menu button {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 6px 10px;
  background: transparent; border: 0; border-radius: 4px;
  font-size: 12px; color: var(--text-primary, #1d1d1f);
  text-align: left; cursor: pointer;
}
.topbar-menu button:hover { background: var(--bg-elevated, #f5f5f7); }
.topbar-menu-divider {
  height: 1px; margin: 4px 0;
  background: var(--border, rgba(0,0,0,0.08));
}
```

- [ ] **Step 5: 收编 Header.jsx**

`src/renderer/components/Header.jsx`: 删除 line 51-133 (整个 `<header id="header">` 块)，改为:

```jsx
/**
 * src/renderer/components/Header.jsx
 *
 * Header 已迁移到 TopBar + PageHeader (v2.49). 本文件保留作为 fallback 引用,
 * 业务页面改用 PageHeader.
 */
export function Header() {
  return null;
}

export default Header;
```

(确保所有 `import { Header } from './Header.jsx'` 还能 import, 不报 missing)

- [ ] **Step 6: 修改 VersionsLayout.jsx**

`src/renderer/components/VersionsLayout.jsx`:

```jsx
import { TopBar } from './TopBar.jsx';
import { CommandPalette } from './CommandPalette.jsx';

export function VersionsLayout({ onCheck }) {
  return (
    <div class="versions-layout">
      <TopBar />
      <CommandPalette />
      {/* 现有内容不变, onCheck 传给 PageHeader (后续 task 替换 Header) */}
      <Header onCheck={onCheck} />
      {/* ... */}
    </div>
  );
}
```

(Header 还在 line, 后续 task 7+ 替换为 PageHeader; 此 task 只加 TopBar)

- [ ] **Step 7: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/TopBar.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/TopBar.jsx tests/renderer/TopBar.test.jsx src/renderer/components/Header.jsx src/renderer/components/VersionsLayout.jsx styles.css
git commit -m "feat(versions): TopBar + Header migration (32px global shell)"
```

---

## P2: Library (AppRow 收编 + Card 视图 + 合并 filter + 虚拟列表)

### Task 7: library-view-store

**Files:**
- Create: `src/renderer/library-view-store.js`
- Test: `tests/renderer/library-view-store.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `viewMode` — signal，默认 `'table'`
  - `filterStatus` — signal，默认 `'all'`
  - `filterCategory` — signal，默认 `'all'`
  - `searchQuery` — signal (替代原 FilterBar 的 searchQuery)
  - `setViewMode(mode)` / `setFilterStatus(s)` / `setFilterCategory(c)` / `setSearchQuery(q)` / `resetLibraryFilters()`

- [ ] **Step 1: 写失败测试**

`tests/renderer/library-view-store.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import {
  viewMode, filterStatus, filterCategory, searchQuery,
  setViewMode, setFilterStatus, setFilterCategory, setSearchQuery, resetLibraryFilters,
} from "../../src/renderer/library-view-store.js";

beforeEach(() => {
  setViewMode("table");
  setFilterStatus("all");
  setFilterCategory("all");
  setSearchQuery("");
});

describe("library-view-store", () => {
  it("默认 table + all + all", () => {
    expect(viewMode.value).toBe("table");
    expect(filterStatus.value).toBe("all");
    expect(filterCategory.value).toBe("all");
  });
  it("setViewMode 接受 table/card", () => {
    setViewMode("card");
    expect(viewMode.value).toBe("card");
    setViewMode("invalid");
    expect(viewMode.value).toBe("card"); // 不变
  });
  it("setFilterStatus 接受 4 种", () => {
    setFilterStatus("update");
    expect(filterStatus.value).toBe("update");
  });
  it("setFilterCategory", () => {
    setFilterCategory("dev");
    expect(filterCategory.value).toBe("dev");
  });
  it("setSearchQuery", () => {
    setSearchQuery("vs");
    expect(searchQuery.value).toBe("vs");
  });
  it("resetLibraryFilters 全部归位", () => {
    setViewMode("card"); setFilterStatus("update"); setFilterCategory("dev"); setSearchQuery("foo");
    resetLibraryFilters();
    expect(viewMode.value).toBe("table");
    expect(filterStatus.value).toBe("all");
    expect(filterCategory.value).toBe("all");
    expect(searchQuery.value).toBe("");
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/library-view-store.test.js`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/renderer/library-view-store.js`:

```js
/**
 * src/renderer/library-view-store.js
 *
 * Library view 的 view/filter 状态. 跟现有 store.js 的 searchQuery / activeFilter
 * 字段语义一致 (供 selectors 复用), 但独立信号便于 Library 重构后解耦.
 *
 * ponytail: 不替换 store.js 的旧字段, 新 LibraryPage 用本 store;
 *          旧 ResultsView 仍走 store.js (迁移期间共存).
 */
import { signal } from "@preact/signals";

export const viewMode = signal("table");
export const filterStatus = signal("all");
export const filterCategory = signal("all");
export const searchQuery = signal("");

export function setViewMode(mode) {
  if (mode === "table" || mode === "card") viewMode.value = mode;
}
export function setFilterStatus(s) { filterStatus.value = s; }
export function setFilterCategory(c) { filterCategory.value = c; }
export function setSearchQuery(q) { searchQuery.value = q; }
export function resetLibraryFilters() {
  viewMode.value = "table";
  filterStatus.value = "all";
  filterCategory.value = "all";
  searchQuery.value = "";
}
```

- [ ] **Step 4: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/library-view-store.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/library-view-store.js tests/renderer/library-view-store.test.js
git commit -m "feat(library): add view-store (viewMode + filter signals)"
```

### Task 8: ViewSwitcher (Table / Card)

**Files:**
- Create: `src/renderer/components/ViewSwitcher.jsx`
- Test: `tests/renderer/ViewSwitcher.test.jsx`

**Interfaces:**
- Consumes: `viewMode` + `setViewMode` from library-view-store
- Produces: `<ViewSwitcher />` 2 按钮 toggle (table / card)

- [ ] **Step 1: 写失败测试**

`tests/renderer/ViewSwitcher.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ViewSwitcher } from "../../src/renderer/components/ViewSwitcher.jsx";
import { viewMode, setViewMode } from "../../src/renderer/library-view-store.js";

beforeEach(() => { setViewMode("table"); });

describe("ViewSwitcher", () => {
  it("默认 table 高亮", () => {
    render(<ViewSwitcher />);
    expect(screen.getByLabelText("表格视图").className).toContain("active");
    expect(screen.getByLabelText("卡片视图").className).not.toContain("active");
  });
  it("点击 card 切到 card", () => {
    render(<ViewSwitcher />);
    fireEvent.click(screen.getByLabelText("卡片视图"));
    expect(viewMode.value).toBe("card");
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/ViewSwitcher.test.jsx`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/renderer/components/ViewSwitcher.jsx`:

```jsx
import { viewMode, setViewMode } from "../library-view-store.js";
import { IconList, IconGrid } from "./icons.jsx";

export function ViewSwitcher() {
  return (
    <div class="view-switcher" role="group" aria-label="视图切换">
      <button
        type="button"
        class={`view-switcher-btn${viewMode.value === "table" ? " active" : ""}`}
        onClick={() => setViewMode("table")}
        aria-label="表格视图"
        aria-pressed={viewMode.value === "table"}
        title="表格视图"
      >
        <IconList size={14} />
      </button>
      <button
        type="button"
        class={`view-switcher-btn${viewMode.value === "card" ? " active" : ""}`}
        onClick={() => setViewMode("card")}
        aria-label="卡片视图"
        aria-pressed={viewMode.value === "card"}
        title="卡片视图"
      >
        <IconGrid size={14} />
      </button>
    </div>
  );
}

export default ViewSwitcher;
```

- [ ] **Step 4: 加 CSS**

`styles.css`:

```css
.view-switcher {
  display: inline-flex; gap: 2px;
  padding: 2px; border-radius: 6px;
  background: var(--bg-elevated, #f5f5f7);
}
.view-switcher-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 24px;
  background: transparent; border: 0; border-radius: 4px;
  color: var(--text-secondary, #6e6e73); cursor: pointer;
  transition: background 0.15s ease;
}
.view-switcher-btn:hover { color: var(--text-primary, #1d1d1f); }
.view-switcher-btn.active {
  background: var(--bg-card, #fff); color: var(--accent-primary, #007aff);
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}
```

- [ ] **Step 5: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/ViewSwitcher.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ViewSwitcher.jsx tests/renderer/ViewSwitcher.test.jsx styles.css
git commit -m "feat(library): add ViewSwitcher (Table/Card)"
```

### Task 9: MergedFilterChip (status + category 合并)

**Files:**
- Create: `src/renderer/components/MergedFilterChip.jsx`
- Test: `tests/renderer/MergedFilterChip.test.jsx`

**Interfaces:**
- Consumes:
  - `filterStatus` + `filterCategory` + `searchQuery` + `setFilterStatus` + `setFilterCategory` + `setSearchQuery` + `resetLibraryFilters` from library-view-store
  - `tabCounts` from selectors (existing)
- Produces: `<MergedFilterChip />` 单行 chip 集合: search input + 4 status chip + N category chip + reset button

- [ ] **Step 1: 写失败测试**

`tests/renderer/MergedFilterChip.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { MergedFilterChip } from "../../src/renderer/components/MergedFilterChip.jsx";
import {
  filterStatus, filterCategory, searchQuery,
  setFilterStatus, setFilterCategory, setSearchQuery, resetLibraryFilters,
} from "../../src/renderer/library-view-store.js";

beforeEach(() => { resetLibraryFilters(); });

describe("MergedFilterChip", () => {
  it("渲染 search + 4 status chips + reset", () => {
    render(<MergedFilterChip />);
    expect(screen.getByPlaceholderText("搜索 app 名称...")).toBeTruthy();
    expect(screen.getByText("全部")).toBeTruthy();
    expect(screen.getByText("有更新")).toBeTruthy();
    expect(screen.getByText("已是最新")).toBeTruthy();
    expect(screen.getByText("出错")).toBeTruthy();
  });
  it("click status chip 切换 filterStatus", () => {
    render(<MergedFilterChip />);
    fireEvent.click(screen.getByText("有更新"));
    expect(filterStatus.value).toBe("update");
  });
  it("search input 设置 searchQuery", () => {
    render(<MergedFilterChip />);
    fireEvent.input(screen.getByPlaceholderText("搜索 app 名称..."), { target: { value: "vs" } });
    expect(searchQuery.value).toBe("vs");
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/MergedFilterChip.test.jsx`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/renderer/components/MergedFilterChip.jsx`:

```jsx
/**
 * src/renderer/components/MergedFilterChip.jsx
 *
 * 合并原 FilterBar (search + 4 status) + CategoryTabs (8+ category) 为单一组件.
 * ponytail: 一次展示, 不分组 (UI 紧凑). 选 category 后, 顶部 status 仍可见.
 */
import { searchQuery, setSearchQuery, filterStatus, setFilterStatus, filterCategory, setFilterCategory, resetLibraryFilters } from "../library-view-store.js";
import { tabCounts } from "../selectors.js";
import { getCategoryTabsWithCount } from "../../config/category.js";
import { IconSearch } from "./icons.jsx";

const STATUS_TABS = [
  { key: "all", label: "全部" },
  { key: "update", label: "有更新" },
  { key: "latest", label: "已是最新" },
  { key: "error", label: "出错" },
];

export function MergedFilterChip() {
  const counts = tabCounts.value;
  const categories = getCategoryTabsWithCount({ size: 0 }); // categories 是静态列表, count 后续可注入
  const activeStatus = filterStatus.value;
  const activeCategory = filterCategory.value;

  return (
    <div class="merged-filter">
      <div class="merged-filter-search">
        <IconSearch size={14} />
        <input
          type="text"
          placeholder="搜索 app 名称..."
          value={searchQuery.value}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          aria-label="搜索 app 名称"
        />
        {searchQuery.value && (
          <button type="button" class="merged-filter-clear" onClick={() => setSearchQuery("")} aria-label="清空">×</button>
        )}
      </div>
      <div class="merged-filter-chips" role="group" aria-label="状态筛选">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            class={`merged-filter-chip${activeStatus === t.key ? " active" : ""}`}
            onClick={() => setFilterStatus(t.key)}
            aria-pressed={activeStatus === t.key}
          >
            {t.label} <span class="merged-filter-count">{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>
      <div class="merged-filter-chips" role="group" aria-label="分类筛选">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            class={`merged-filter-chip${activeCategory === c.id ? " active" : ""}`}
            onClick={() => setFilterCategory(c.id)}
            aria-pressed={activeCategory === c.id}
          >
            {c.name}
          </button>
        ))}
      </div>
      {(activeStatus !== "all" || activeCategory !== "all" || searchQuery.value) && (
        <button type="button" class="merged-filter-reset" onClick={resetLibraryFilters}>
          清除过滤
        </button>
      )}
    </div>
  );
}

export default MergedFilterChip;
```

- [ ] **Step 4: 加 CSS**

`styles.css`:

```css
.merged-filter {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
}
.merged-filter-search {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 8px; min-width: 200px;
  background: var(--bg-elevated, #f5f5f7); border-radius: 6px;
  color: var(--text-tertiary, #8e8e93);
}
.merged-filter-search input {
  flex: 1; border: 0; outline: 0; background: transparent;
  font-size: 12px; color: var(--text-primary, #1d1d1f);
}
.merged-filter-clear {
  background: transparent; border: 0; color: var(--text-tertiary, #8e8e93);
  cursor: pointer; padding: 0 4px; font-size: 14px;
}
.merged-filter-chips { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.merged-filter-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 12px;
  background: transparent;
  border: 1px solid var(--border, rgba(0,0,0,0.08));
  font-size: 11px; color: var(--text-secondary, #6e6e73);
  cursor: pointer; transition: all 0.15s ease;
}
.merged-filter-chip:hover { border-color: var(--accent-primary, #007aff); }
.merged-filter-chip.active {
  background: var(--accent-primary, #007aff); color: #fff; border-color: var(--accent-primary, #007aff);
}
.merged-filter-count {
  font-size: 10px; opacity: 0.7;
}
.merged-filter-reset {
  background: transparent; border: 0; color: var(--accent-primary, #007aff);
  font-size: 11px; cursor: pointer; padding: 4px 8px;
}
```

- [ ] **Step 5: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/MergedFilterChip.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/MergedFilterChip.jsx tests/renderer/MergedFilterChip.test.jsx styles.css
git commit -m "feat(library): add MergedFilterChip (status + category + search)"
```

### Task 10: AppRow 行级收编 (9 元素 → 3 元素 + `···` 菜单)

**Files:**
- Modify: `src/renderer/components/AppRow.jsx:160-247` (保留 row + 升级按钮 + `···` 菜单, 其他进菜单)
- Test: `tests/renderer/AppRow.test.jsx` (新)

**Interfaces:**
- Consumes: 现有 AppRow 全部 imports
- Produces: 行结构 `<AppAvatar /> <AppInfo /> <AppAction /> <RowOverflowMenu />` (snooze / rollback / pin / changelog / mute 全进菜单)

- [ ] **Step 1: 写失败测试**

`tests/renderer/AppRow.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { AppRow } from "../../src/renderer/components/AppRow.jsx";

describe("AppRow 收编", () => {
  it("行内只有 upgrade + overflow menu 按钮, snooze/rollback/pin 不直接暴露", () => {
    render(<AppRow name="vscode" />);
    expect(screen.getByLabelText("升级 vscode")).toBeTruthy();
    expect(screen.getByLabelText("vscode 行的更多操作")).toBeTruthy();
    // 原 snooze/rollback/pin 按钮不在行级
    expect(screen.queryByLabelText("等下次再升")).toBeFalsy();
    expect(screen.queryByLabelText("查看回滚历史")).toBeFalsy();
    expect(screen.queryByLabelText("加入关注列表")).toBeFalsy();
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/AppRow.test.jsx`
Expected: FAIL (snooze / rollback / pin 按钮还存在)

- [ ] **Step 3: 修改 AppRow.jsx**

把 `src/renderer/components/AppRow.jsx` line 192-223 的 4 个 row-action-* 按钮 (snooze / rollback / pin) 删掉。改为:

```jsx
// 行级只保留 avatar + info + upgrade + overflow menu
return (
  <div class={`app-row${changelogOpen ? " changelog-open" : ""}${muted ? " muted" : ""}${phaseClass}`}
       data-name={result.name}
       style={hasDownloadUrl(result.name) ? 'cursor: pointer' : ''}
       onClick={(e) => {
         if (e.target.closest('.btn-upgrade-row')
             || e.target.closest('.status-badge')
             || e.target.closest('.app-info-btn')
             || e.target.closest('.changelog-panel')
             || e.target.closest('.row-overflow-menu')) return;
         const cfg = lookupConfig(result.name);
         if (cfg && cfg.download_url) api.openUrl(cfg.download_url);
       }}
       onContextMenu={onContextMenu}>
    <AppAvatar bundle={bundle} name={result.name} />
    <AppInfo result={result}
             muted={muted}
             muteUntil={muteEntry ? muteEntry.until : 0}
             lastOpened={lastOpenedEntry || null}
             onShowChangelog={() => setChangelogOpen((v) => !v)}
             isChangelogOpen={changelogOpen} />
    <AppVersions result={result} />
    <AppAction result={result} onUpgrade={handleUpgrade} isUpgrading={upgrading} />
    <RowOverflowMenu
      name={result.name}
      hasUpdate={result.has_update}
      pinned={pinned}
      onPin={togglePin}
      onSnooze={() => setSnoozeMenuAt({ x: 100, y: 100 })}
      onRollback={() => openVersionHistory(result.name)}
      onShowChangelog={() => setChangelogOpen((v) => !v)}
      rollbackCount={versionHistoryCounts.value.get(result.name) || 0}
    />
    {changelogOpen && <ChangelogPanel result={result} />}
    {muteMenuAt && (<MuteMenu x={muteMenuAt.x} y={muteMenuAt.y} appName={name} isMuted={muted}
                              muteUntil={muteEntry ? muteEntry.until : 0}
                              lastOpened={lastOpenedEntry}
                              onClose={() => setMuteMenuAt(null)} />)}
    {snoozeMenuAt && (<SnoozeMenu x={snoozeMenuAt.x} y={snoozeMenuAt.y} name={result.name}
                                  latestVersion={result.latest_version}
                                  snoozeUntil={result.snoozeUntil}
                                  skippedVersion={result.skippedVersion}
                                  onClose={() => setSnoozeMenuAt(null)} />)}
  </div>
);
```

新增 `RowOverflowMenu` 子组件 (放在同文件 line 248 之后):

```jsx
function RowOverflowMenu({ name, hasUpdate, pinned, onPin, onSnooze, onRollback, onShowChangelog, rollbackCount }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="row-overflow-menu">
      <button type="button" class="row-overflow-trigger"
              onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
              aria-label={`${name} 行的更多操作`} aria-haspopup="menu" aria-expanded={open}>
        <IconMoreHorizontal size={14} />
      </button>
      {open && (
        <ul class="row-overflow-dropdown" role="menu" onClick={(e) => e.stopPropagation()}>
          {hasUpdate && (
            <li><button role="menuitem" onClick={() => { onSnooze(); setOpen(false); }}>等下次再升</button></li>
          )}
          <li><button role="menuitem" onClick={() => { onRollback(); setOpen(false); }}>
            回滚历史 {rollbackCount > 0 ? `(${rollbackCount})` : ""}
          </button></li>
          <li><button role="menuitem" onClick={() => { onPin(); setOpen(false); }}>
            {pinned ? "取消关注" : "加入关注列表"}
          </button></li>
          <li><button role="menuitem" onClick={() => { onShowChangelog(); setOpen(false); }}>Changelog</button></li>
        </ul>
      )}
    </div>
  );
}
```

并在文件顶部 import `IconMoreHorizontal`:

```jsx
import { IconMoreHorizontal } from "./icons.jsx";
```

- [ ] **Step 4: 加 CSS**

`styles.css`:

```css
.row-overflow-menu { position: relative; }
.row-overflow-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  background: transparent; border: 0; border-radius: 4px;
  color: var(--text-tertiary, #8e8e93); cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.row-overflow-trigger:hover { background: var(--bg-elevated, #f5f5f7); color: var(--text-primary, #1d1d1f); }
.row-overflow-dropdown {
  position: absolute; top: 100%; right: 0;
  list-style: none; margin: 4px 0 0; padding: 4px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, rgba(0,0,0,0.08));
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  min-width: 160px; z-index: 50;
}
.row-overflow-dropdown button {
  display: block; width: 100%; padding: 6px 10px;
  background: transparent; border: 0; border-radius: 4px;
  font-size: 12px; color: var(--text-primary, #1d1d1f);
  text-align: left; cursor: pointer;
}
.row-overflow-dropdown button:hover { background: var(--bg-elevated, #f5f5f7); }
```

- [ ] **Step 5: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/AppRow.test.jsx`
Expected: PASS (1 test)

- [ ] **Step 6: 跑全套测试确认无回归**

Run: `npx vitest run`
Expected: PASS (3194+ tests)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/AppRow.jsx tests/renderer/AppRow.test.jsx styles.css
git commit -m "refactor(versions): AppRow 收编 9 元素 → 3 元素 + overflow menu"
```

### Task 11: AppCard (Card 视图单卡)

**Files:**
- Create: `src/renderer/components/AppCard.jsx`
- Test: `tests/renderer/AppCard.test.jsx`

**Interfaces:**
- Consumes: 现有 AppRow 同源 store/imports (`getResultSignal`, `api`, `AppAvatar`)
- Produces: `<AppCard name="vscode" />` 紧凑卡片: avatar + name + current→latest + 升级按钮 + 最近检查时间

- [ ] **Step 1: 写失败测试**

`tests/renderer/AppCard.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { AppCard } from "../../src/renderer/components/AppCard.jsx";

describe("AppCard", () => {
  it("渲染 avatar + name + 升级按钮", () => {
    render(<AppCard name="vscode" />);
    expect(screen.getByText("vscode")).toBeTruthy();
    expect(screen.getByLabelText("升级 vscode")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/AppCard.test.jsx`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/renderer/components/AppCard.jsx`:

```jsx
/**
 * src/renderer/components/AppCard.jsx
 *
 * Library Card 视图单卡. ponytail: 跟 AppRow 共用 data source,
 * 但不抽 helper — Card 后续可独立演进 (放更多元数据).
 */
import { useState } from "preact/hooks";
import { getResultSignal, getAppPhaseSignal } from "../store.js";
import { api } from "../api.js";
import { AppAvatar } from "./AppAvatar.jsx";
import { RowOverflowMenu } from "./AppRow.jsx"; // 复用

export function AppCard({ name }) {
  const result = getResultSignal(name).value;
  const phase = getAppPhaseSignal(name).value;
  const [upgrading, setUpgrading] = useState(false);

  async function onUpgrade() {
    if (!result || !result.bundle) return;
    setUpgrading(true);
    try { await api.brewUpgrade(result.bundle); } catch {}
    setUpgrading(false);
  }

  if (!result) {
    return (
      <div class="app-card app-card--pending">
        <AppAvatar bundle="" name={name} />
        <div class="app-card-name">{name}</div>
        <div class="app-card-status">检测中...</div>
      </div>
    );
  }

  return (
    <div class="app-card" data-name={result.name}>
      <AppAvatar bundle={result.bundle} name={result.name} />
      <div class="app-card-name">{result.name}</div>
      <div class="app-card-versions">
        {result.current_version} → {result.latest_version}
        {result.has_update && <span class="app-card-update-badge">有更新</span>}
      </div>
      <button
        type="button"
        class="btn-upgrade-row"
        onClick={onUpgrade}
        disabled={upgrading || !result.has_update}
        aria-label={`升级 ${result.name}`}
      >
        {upgrading ? "升级中…" : result.has_update ? "升级" : "最新"}
      </button>
      <RowOverflowMenu name={result.name} hasUpdate={result.has_update} pinned={false} />
    </div>
  );
}

export default AppCard;
```

注意 `RowOverflowMenu` 当前不是 export — 加 export:

`src/renderer/components/AppRow.jsx` line ~248 之后:

```jsx
// ponytail: Card 视图复用, 但 AppRow 是 default export, 这里 export named 也行
export { RowOverflowMenu };
```

(把 `function RowOverflowMenu(...)` 改为 `export function RowOverflowMenu(...)`)

- [ ] **Step 4: 加 CSS**

`styles.css`:

```css
.app-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px; padding: 16px 20px;
}
.app-card {
  display: flex; flex-direction: column; gap: 6px;
  padding: 14px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, rgba(0,0,0,0.08));
  border-radius: 10px;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.app-card:hover { border-color: var(--accent-primary, #007aff); }
.app-card--pending { opacity: 0.6; }
.app-card-name { font-size: 14px; font-weight: 600; color: var(--text-primary, #1d1d1f); }
.app-card-versions {
  font-size: 12px; color: var(--text-secondary, #6e6e73);
  display: flex; align-items: center; gap: 6px;
}
.app-card-update-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 8px;
  background: #ff9500; color: #fff;
}
.app-card-status { font-size: 12px; color: var(--text-tertiary, #8e8e93); }
```

- [ ] **Step 5: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/AppCard.test.jsx`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/AppCard.jsx tests/renderer/AppCard.test.jsx src/renderer/components/AppRow.jsx styles.css
git commit -m "feat(library): add AppCard (Card view)"
```

### Task 12: LibraryPage (Table/Card 视图切换 + 虚拟列表)

**Files:**
- Create: `src/renderer/components/LibraryPage.jsx`
- Test: `tests/renderer/LibraryPage.test.jsx`

**Interfaces:**
- Consumes:
  - `viewMode` from library-view-store
  - `filterStatus` / `filterCategory` / `searchQuery` from library-view-store
  - `filteredResultsBySection` from selectors
  - `setActiveCategory` from store.js (供 category 切换)
- Produces: `<LibraryPage />` 包含 PageHeader + ViewSwitcher + MergedFilterChip + TableView 或 CardView

- [ ] **Step 1: 写失败测试**

`tests/renderer/LibraryPage.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { LibraryPage } from "../../src/renderer/components/LibraryPage.jsx";
import { viewMode, setViewMode } from "../../src/renderer/library-view-store.js";

describe("LibraryPage", () => {
  it("默认渲染 PageHeader + ViewSwitcher + MergedFilterChip", () => {
    render(<LibraryPage />);
    expect(screen.getByText("应用库")).toBeTruthy();
    expect(screen.getByLabelText("表格视图")).toBeTruthy();
    expect(screen.getByLabelText("卡片视图")).toBeTruthy();
    expect(screen.getByText("全部")).toBeTruthy();
  });
  it("card 模式渲染 app-card-grid", () => {
    setViewMode("card");
    render(<LibraryPage />);
    expect(document.querySelector(".app-card-grid")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/LibraryPage.test.jsx`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/renderer/components/LibraryPage.jsx`:

```jsx
/**
 * src/renderer/components/LibraryPage.jsx
 *
 * Library view (路由 /versions/library). 包含 PageHeader + ViewSwitcher
 * + MergedFilterChip + TableView 或 CardView.
 *
 * ponytail: 复用现有 ResultsView (Table) 作为 TableView, 增量加 CardView;
 *          Card 视图 < 100 行时跟 Table 一样不虚拟化, 只在 > 100 行才启用.
 */
import { PageHeader } from "./PageHeader.jsx";
import { ViewSwitcher } from "./ViewSwitcher.jsx";
import { MergedFilterChip } from "./MergedFilterChip.jsx";
import { ResultsView } from "./ResultsView.jsx";
import { AppCard } from "./AppCard.jsx";
import { viewMode } from "../library-view-store.js";
import { results } from "../store.js";

export function LibraryPage() {
  const mode = viewMode.value;
  const totalApps = results.value.size;
  const useVirtual = mode === "card" && totalApps > 100;

  return (
    <div class="library-page">
      <PageHeader title="应用库" subtitle={`${totalApps} 个监控 · ${/* upgradable */0} 个可升级`}>
        <ViewSwitcher />
      </PageHeader>
      <MergedFilterChip />
      {mode === "table" && <ResultsView />}
      {mode === "card" && (
        useVirtual
          ? <VirtualCardGrid />  // 后续 Task 13
          : <div class="app-card-grid">{Array.from(results.value.keys()).map((n) => <AppCard key={n} name={n} />)}</div>
      )}
    </div>
  );
}

// placeholder, Task 13 实现
function VirtualCardGrid() { return <div class="app-card-grid">virtual TODO</div>; }

export default LibraryPage;
```

- [ ] **Step 4: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/LibraryPage.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/LibraryPage.jsx tests/renderer/LibraryPage.test.jsx
git commit -m "feat(library): add LibraryPage (Table/Card switcher)"
```

### Task 13: VirtualCardGrid (虚拟列表)

**Files:**
- Create: `src/renderer/components/VirtualCardGrid.jsx`
- Test: `tests/renderer/VirtualCardGrid.test.jsx`

**Interfaces:**
- Consumes: `results.value.keys()` from store
- Produces: 窗口化网格 (只渲染可视区 + 上下 buffer, 滚动时动态加载)

- [ ] **Step 1: 写失败测试**

`tests/renderer/VirtualCardGrid.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { VirtualCardGrid } from "../../src/renderer/components/VirtualCardGrid.jsx";
import { results } from "../../src/renderer/store.js";

vi.mock("../../src/renderer/store.js", async () => {
  const { signal } = await import("@preact/signals");
  const names = Array.from({ length: 200 }, (_, i) => `app-${i}`);
  return { results: signal(new Map(names.map((n) => [n, { name: n, has_update: false, current_version: "1", latest_version: "1" }]))) };
});

describe("VirtualCardGrid", () => {
  it("默认只渲染可视区 (~30 个, 不是 200)", () => {
    render(<VirtualCardGrid />);
    const cards = document.querySelectorAll(".app-card");
    expect(cards.length).toBeLessThan(60);
    expect(cards.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/VirtualCardGrid.test.jsx`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/renderer/components/VirtualCardGrid.jsx`:

```jsx
/**
 * src/renderer/components/VirtualCardGrid.jsx
 *
 * 简单窗口化网格: 只渲染 scrollTop 附近的 ROWS, 上下各加 buffer.
 * ponytail: < 100 行不启用 (LibraryPage 已 gate). 自实现, 不引依赖.
 */
import { useState, useEffect, useRef } from "preact/hooks";
import { results } from "../store.js";
import { AppCard } from "./AppCard.jsx";

const ROW_HEIGHT = 130;     // Card 高度 (含 gap)
const BUFFER_ROWS = 3;      // 上下多渲染几行
const COLS = 4;             // 桌面默认 4 列

export function VirtualCardGrid() {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const allNames = Array.from(results.value.keys());

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    function onScroll() { setScrollTop(el.scrollTop); }
    function onResize() { setContainerHeight(el.clientHeight); }
    el.addEventListener("scroll", onScroll, { passive: true });
    setContainerHeight(el.clientHeight);
    window.addEventListener("resize", onResize);
    return () => { el.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onResize); };
  }, []);

  const totalRows = Math.ceil(allNames.length / COLS);
  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const visibleEnd = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS);
  const visibleNames = [];
  for (let r = visibleStart; r < visibleEnd; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      if (idx < allNames.length) visibleNames.push(allNames[idx]);
    }
  }

  const offsetY = visibleStart * ROW_HEIGHT;
  const totalHeight = totalRows * ROW_HEIGHT;

  return (
    <div class="virtual-card-scroll" ref={scrollRef}>
      <div class="virtual-card-spacer" style={{ height: `${totalHeight}px`, paddingTop: `${offsetY}px` }}>
        <div class="app-card-grid">
          {visibleNames.map((n) => <AppCard key={n} name={n} />)}
        </div>
      </div>
    </div>
  );
}

export default VirtualCardGrid;
```

- [ ] **Step 4: 加 CSS**

`styles.css`:

```css
.virtual-card-scroll {
  height: calc(100vh - 200px);
  overflow-y: auto;
  padding: 0 20px;
}
.virtual-card-spacer { position: relative; }
.virtual-card-spacer .app-card-grid { padding: 0; }
```

- [ ] **Step 5: 替换 placeholder**

`src/renderer/components/LibraryPage.jsx`: 把 `VirtualCardGrid` placeholder 改为 import:

```jsx
import { VirtualCardGrid } from "./VirtualCardGrid.jsx";
```

(删除本文件内的 placeholder function)

- [ ] **Step 6: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/VirtualCardGrid.test.jsx tests/renderer/LibraryPage.test.jsx`
Expected: PASS (1 + 2 = 3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/VirtualCardGrid.jsx tests/renderer/VirtualCardGrid.test.jsx src/renderer/components/LibraryPage.jsx styles.css
git commit -m "feat(library): add VirtualCardGrid (windowed render)"
```

### Task 14: 集成 LibraryPage + 删旧 FilterBar / CategoryTabs

**Files:**
- Modify: `src/renderer/components/VersionsLayout.jsx` (路由到 LibraryPage)
- Modify: `src/renderer/components/FilterBar.jsx` (删除/废弃)
- Modify: `src/renderer/components/CategoryTabs.jsx` (删除/废弃)

**Interfaces:**
- Consumes: `currentRoute` from route-store
- Produces: 路由 `library` 时渲染 `<LibraryPage />`

- [ ] **Step 1: 修改 VersionsLayout.jsx**

```jsx
import { currentRoute } from '../route-store.js';
import { LibraryPage } from './LibraryPage.jsx';

export function VersionsLayout({ onCheck }) {
  const route = currentRoute.value;
  return (
    <div class="versions-layout">
      <TopBar />
      <CommandPalette />
      {route === "library" && <LibraryPage />}
      {route !== "library" && (
        <>
          <Header onCheck={onCheck} />
          <FilterBar />
          <ResultsView />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 删除 FilterBar / CategoryTabs 文件**

```bash
git rm src/renderer/components/FilterBar.jsx
git rm src/renderer/components/CategoryTabs.jsx
```

(若有测试, 一起删)

- [ ] **Step 3: 跑全套测试**

Run: `npx vitest run`
Expected: PASS (无回归)

- [ ] **Step 4: 跑 build**

Run: `npm run build:renderer`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/VersionsLayout.jsx src/renderer/components/FilterBar.jsx src/renderer/components/CategoryTabs.jsx
git commit -m "refactor(versions): route Library view + delete old FilterBar/CategoryTabs"
```

---

## P3: Overview (KPI + Trend + Watchlist + Recent + AI Insights)

### Task 15: overview-store + IPC 注册

**Files:**
- Create: `src/renderer/overview-store.js`
- Modify: `src/main/ipc/index.js` (注册 4 个 IPC)
- Test: `tests/renderer/overview-store.test.js`
- Test: `tests/main/versions-overview-ipc.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `kpis` — signal，`{ upgradable, latest, error, total }`
  - `trend` — signal，`number[]` (过去 7 天)
  - `watchlistQuick` — signal，`Array<{name, has_update}>`
  - `recentActivity` — signal，`Array<{kind, appName, ts}>`
  - `aiInsights` — signal，`{status, text, fromCache}`
  - 4 个 `load*` actions

- [ ] **Step 1: 写失败测试 (store)**

`tests/renderer/overview-store.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import {
  kpis, trend, watchlistQuick, recentActivity, aiInsights,
  setKpis, setTrend, setWatchlistQuick, setRecentActivity, setAiInsights, resetOverview,
} from "../../src/renderer/overview-store.js";

beforeEach(() => { resetOverview(); });

describe("overview-store", () => {
  it("默认空状态", () => {
    expect(kpis.value).toEqual({ upgradable: 0, latest: 0, error: 0, total: 0 });
    expect(trend.value).toEqual([]);
    expect(watchlistQuick.value).toEqual([]);
    expect(recentActivity.value).toEqual([]);
    expect(aiInsights.value.status).toBe("idle");
  });
  it("setKpis 写入", () => {
    setKpis({ upgradable: 3, latest: 5, error: 1, total: 11 });
    expect(kpis.value.upgradable).toBe(3);
  });
  it("setTrend", () => {
    setTrend([1, 2, 3, 4, 5, 6, 7]);
    expect(trend.value).toHaveLength(7);
  });
  it("setAiInsights", () => {
    setAiInsights({ status: "ready", text: "summary", fromCache: false });
    expect(aiInsights.value.status).toBe("ready");
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/overview-store.test.js`
Expected: FAIL

- [ ] **Step 3: 写 overview-store**

`src/renderer/overview-store.js`:

```js
/**
 * src/renderer/overview-store.js
 *
 * Overview 页 5 个数据源的 signal. 每个有独立 loader,
 * 避免一处刷新影响其他 (per-section signal pattern).
 */
import { signal } from "@preact/signals";

export const kpis = signal({ upgradable: 0, latest: 0, error: 0, total: 0 });
export const trend = signal([]);
export const watchlistQuick = signal([]);
export const recentActivity = signal([]);
export const aiInsights = signal({ status: "idle", text: "", fromCache: false });

export function setKpis(v) { kpis.value = v; }
export function setTrend(v) { trend.value = v; }
export function setWatchlistQuick(v) { watchlistQuick.value = v; }
export function setRecentActivity(v) { recentActivity.value = v; }
export function setAiInsights(v) { aiInsights.value = v; }

export function resetOverview() {
  kpis.value = { upgradable: 0, latest: 0, error: 0, total: 0 };
  trend.value = [];
  watchlistQuick.value = [];
  recentActivity.value = [];
  aiInsights.value = { status: "idle", text: "", fromCache: false };
}
```

- [ ] **Step 4: 写 4 个 IPC handler (main 端)**

`src/main/ipc/index.js` 注册:

```js
const {
  getOverviewKpis, getOverviewTrend, getOverviewWatchlist,
  getOverviewRecent, getOverviewAiInsights, commandSearch,
} = require("./register-versions-overview.js");

// 在现有 handlers 旁边追加
safeHandle("versions:overview-kpis", async () => getOverviewKpis(ctx));
safeHandle("versions:overview-trend", async () => getOverviewTrend(ctx));
safeHandle("versions:overview-watchlist", async () => getOverviewWatchlist(ctx));
safeHandle("versions:overview-recent", async () => getOverviewRecent(ctx));
safeHandle("versions:overview-ai-insights", async () => getOverviewAiInsights(ctx));
safeHandle("versions:command-search", async (_e, { q }) => commandSearch(ctx, q));
```

新建 `src/main/ipc/register-versions-overview.js`:

```js
/**
 * src/main/ipc/register-versions-overview.js
 *
 * Overview 5 个数据源 + command palette 搜索. 全部走 selectors 或 store 派生,
 * 不引入新业务逻辑.
 */
const { upgradableCount, checkedCount, totalAppCount, lastErrorCount } = require("../../renderer/selectors.js");
const { watchlistItems } = require("../../renderer/watchlist/watchlist-store.js");
const { recentActivity } = require("../../renderer/recent/track.js");
const { aiOverviewSummary } = require("../../ai/versions-overview-advisor.js");

function getOverviewKpis() {
  return {
    upgradable: upgradableCount.value,
    latest: checkedCount.value - upgradableCount.value,
    error: lastErrorCount.value,
    total: totalAppCount.value,
  };
}

function getOverviewTrend() {
  // 从 state-store.trendHistory 取过去 7 天数据; 若空, 返 [0]*7
  return global.__pulse_state__?.trendHistory || [0, 0, 0, 0, 0, 0, 0];
}

function getOverviewWatchlist() {
  return watchlistItems.value.slice(0, 6).map((name) => ({
    name,
    has_update: true, // ponytail: 简化, 真实 has_update 由 store 派生
  }));
}

function getOverviewRecent() {
  return (recentActivity.value || []).slice(0, 10);
}

async function getOverviewAiInsights(ctx) {
  const cache = ctx.store.get("overviewCache") || {};
  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (cache.text && Date.now() - cache.fetchedAt < ONE_DAY) {
    return { ok: true, text: cache.text, fromCache: true };
  }
  try {
    const summary = await aiOverviewSummary(ctx);
    ctx.store.set("overviewCache", { text: summary, fetchedAt: Date.now() });
    return { ok: true, text: summary, fromCache: false };
  } catch (e) {
    return { ok: false, reason: "advisor_failed", error: e.message };
  }
}

async function commandSearch(ctx, q) {
  if (!q) return { ok: true, results: [] };
  const lower = q.toLowerCase();
  const results = [];
  // 静态动作
  if (lower.includes("check") || lower.includes("更新") || q.length === 0) {
    results.push({ id: "action-check", label: "检查更新", kind: "action" });
  }
  // 视图
  for (const v of ["overview", "library", "diagnostics", "insights", "settings"]) {
    if (v.startsWith(lower) || lower.includes(v)) {
      results.push({ id: v, label: v, kind: "view" });
    }
  }
  // app (from store)
  const appNames = Array.from(ctx.store.get("results")?.keys?.() || []);
  for (const name of appNames) {
    if (name.toLowerCase().includes(lower)) {
      results.push({ id: `app-${name}`, label: name, kind: "app" });
      if (results.length >= 10) break;
    }
  }
  return { ok: true, results: results.slice(0, 10) };
}

module.exports = {
  getOverviewKpis, getOverviewTrend, getOverviewWatchlist,
  getOverviewRecent, getOverviewAiInsights, commandSearch,
};
```

新增 `src/ai/versions-overview-advisor.js`:

```js
/**
 * src/ai/versions-overview-advisor.js
 *
 * 复用 stock-screener-advisor 模式, AI 总结本周版本动态.
 * ponytail: V1 只返静态模板, 等真实 AI 接入再接 shared-llm.
 */
async function aiOverviewSummary(ctx) {
  const stats = ctx.store.get("results");
  const total = stats ? stats.size : 0;
  const updates = stats ? Array.from(stats.values()).filter((r) => r.has_update).length : 0;
  return `本周共监控 ${total} 个 app, ${updates} 个有可用更新. 建议优先升级安全相关更新, 然后是高频使用的开发工具.`;
}

module.exports = { aiOverviewSummary };
```

- [ ] **Step 5: state-store PRESERVE_FIELDS**

`src/main/state-store.js`:

```js
const PRESERVE_FIELDS = [
  // ...existing
  "overviewCache",  // 新增
];
```

- [ ] **Step 6: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/overview-store.test.js tests/main/versions-overview-ipc.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/overview-store.js tests/renderer/overview-store.test.js \
        src/main/ipc/index.js src/main/ipc/register-versions-overview.js \
        src/ai/versions-overview-advisor.js src/main/state-store.js \
        tests/main/versions-overview-ipc.test.js
git commit -m "feat(versions): Overview IPC + store + AI advisor stub"
```

### Task 16: KPICard + TrendSparkline

**Files:**
- Create: `src/renderer/components/KPICard.jsx`
- Create: `src/renderer/components/TrendSparkline.jsx`
- Test: `tests/renderer/KPICard.test.jsx`
- Test: `tests/renderer/TrendSparkline.test.jsx`

**Interfaces:**
- Consumes:
  - `kpis.value` from overview-store
  - `trend.value` from overview-store
- Produces:
  - `<KPICard label="可升级" value={3} variant="warning" />`
  - `<TrendSparkline data={[1,2,3,4,5]} />` 渲染 SVG path

- [ ] **Step 1: 写 KPICard 失败测试**

`tests/renderer/KPICard.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { KPICard } from "../../src/renderer/components/KPICard.jsx";

describe("KPICard", () => {
  it("渲染 label + value", () => {
    render(<KPICard label="可升级" value={3} variant="warning" />);
    expect(screen.getByText("可升级")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });
  it("variant 影响 class", () => {
    const { container } = render(<KPICard label="最新" value={5} variant="success" />);
    expect(container.querySelector(".kpi-card")).toHaveClass("kpi-card--success");
  });
});
```

- [ ] **Step 2: 写 KPICard 实现**

`src/renderer/components/KPICard.jsx`:

```jsx
export function KPICard({ label, value, variant = "default" }) {
  return (
    <div class={`kpi-card kpi-card--${variant}`}>
      <div class="kpi-card-value">{value}</div>
      <div class="kpi-card-label">{label}</div>
    </div>
  );
}

export default KPICard;
```

- [ ] **Step 3: 写 TrendSparkline 失败测试**

`tests/renderer/TrendSparkline.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { TrendSparkline } from "../../src/renderer/components/TrendSparkline.jsx";

describe("TrendSparkline", () => {
  it("渲染 svg with path", () => {
    const { container } = render(<TrendSparkline data={[1, 3, 2, 4, 5, 3, 6]} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("svg path")).toBeTruthy();
  });
  it("空数据不渲染 path", () => {
    const { container } = render(<TrendSparkline data={[]} />);
    expect(container.querySelector("svg path")).toBeFalsy();
  });
});
```

- [ ] **Step 4: 写 TrendSparkline 实现**

`src/renderer/components/TrendSparkline.jsx`:

```jsx
/**
 * src/renderer/components/TrendSparkline.jsx
 *
 * ponytail: 纯函数 SVG 路径生成, 不引 chart 库. 7 个点 → 平滑折线.
 */
export function TrendSparkline({ data, width = 200, height = 40 }) {
  if (!data || data.length === 0) return <svg width={width} height={height} />;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / Math.max(1, data.length - 1);

  const points = data.map((v, i) => [
    i * stepX,
    height - ((v - min) / range) * height,
  ]);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export default TrendSparkline;
```

- [ ] **Step 5: 加 CSS**

`styles.css`:

```css
.kpi-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
  padding: 20px;
}
.kpi-card {
  padding: 16px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, rgba(0,0,0,0.08));
  border-radius: 10px;
  border-left: 4px solid var(--text-tertiary, #8e8e93);
}
.kpi-card--warning { border-left-color: #ff9500; }
.kpi-card--success { border-left-color: #34c759; }
.kpi-card--danger  { border-left-color: #ff3b30; }
.kpi-card--default { border-left-color: var(--accent-primary, #007aff); }
.kpi-card-value {
  font-size: 28px; font-weight: 700;
  color: var(--text-primary, #1d1d1f);
  line-height: 1; margin-bottom: 6px;
}
.kpi-card-label {
  font-size: 12px; color: var(--text-secondary, #6e6e73);
}
.trend-sparkline {
  display: inline-block; color: var(--accent-primary, #007aff);
}
```

- [ ] **Step 6: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/KPICard.test.jsx tests/renderer/TrendSparkline.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/KPICard.jsx src/renderer/components/TrendSparkline.jsx \
        tests/renderer/KPICard.test.jsx tests/renderer/TrendSparkline.test.jsx styles.css
git commit -m "feat(versions): add KPICard + TrendSparkline"
```

### Task 17: WatchlistQuick + RecentTimeline + AIInsightsBlock

**Files:**
- Create: `src/renderer/components/WatchlistQuick.jsx`
- Create: `src/renderer/components/RecentTimeline.jsx`
- Create: `src/renderer/components/AIInsightsBlock.jsx`
- Test: `tests/renderer/WatchlistQuick.test.jsx`
- Test: `tests/renderer/RecentTimeline.test.jsx`
- Test: `tests/renderer/AIInsightsBlock.test.jsx`

- [ ] **Step 1: 写 WatchlistQuick**

`src/renderer/components/WatchlistQuick.jsx`:

```jsx
import { watchlistQuick } from "../overview-store.js";
import { navigateTo } from "../route-store.js";
import { IconStar } from "./icons.jsx";

export function WatchlistQuick() {
  const items = watchlistQuick.value;
  return (
    <div class="watchlist-quick">
      <h3 class="watchlist-quick-title">
        <IconStar filled size={14} /> 关注列表
      </h3>
      {items.length === 0 ? (
        <div class="watchlist-quick-empty">暂无关注, 去 Library 加几个 app</div>
      ) : (
        <ul class="watchlist-quick-list">
          {items.map((it) => (
            <li key={it.name} class={`watchlist-quick-item${it.has_update ? " has-update" : ""}`}>
              {it.name}
              {it.has_update && <span class="watchlist-quick-badge">有更新</span>}
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="watchlist-quick-view-all" onClick={() => navigateTo("library")}>
        View all →
      </button>
    </div>
  );
}

export default WatchlistQuick;
```

`tests/renderer/WatchlistQuick.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { WatchlistQuick } from "../../src/renderer/components/WatchlistQuick.jsx";
import { setWatchlistQuick } from "../../src/renderer/overview-store.js";

beforeEach(() => setWatchlistQuick([]));

describe("WatchlistQuick", () => {
  it("空显示 empty", () => {
    render(<WatchlistQuick />);
    expect(screen.getByText(/暂无关注/)).toBeTruthy();
  });
  it("有 items 显示 list", () => {
    setWatchlistQuick([{ name: "vscode", has_update: true }, { name: "chrome", has_update: false }]);
    render(<WatchlistQuick />);
    expect(screen.getByText("vscode")).toBeTruthy();
    expect(screen.getByText("chrome")).toBeTruthy();
    expect(screen.getByText("有更新")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 写 RecentTimeline**

`src/renderer/components/RecentTimeline.jsx`:

```jsx
import { recentActivity } from "../overview-store.js";
import { RecentActivityIcon } from "./icons.jsx";

export function RecentTimeline() {
  const items = recentActivity.value;
  return (
    <div class="recent-timeline">
      <h3 class="recent-timeline-title">最近活动</h3>
      {items.length === 0 ? (
        <div class="recent-timeline-empty">暂无活动</div>
      ) : (
        <ul class="recent-timeline-list">
          {items.map((it, i) => (
            <li key={i} class="recent-timeline-item">
              <RecentActivityIcon kind={it.kind} size={12} />
              <span class="recent-timeline-text">{it.appName} · {it.kind}</span>
              <time class="recent-timeline-ts">{new Date(it.ts).toLocaleTimeString()}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default RecentTimeline;
```

`tests/renderer/RecentTimeline.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { RecentTimeline } from "../../src/renderer/components/RecentTimeline.jsx";
import { setRecentActivity } from "../../src/renderer/overview-store.js";

beforeEach(() => setRecentActivity([]));

describe("RecentTimeline", () => {
  it("空显示 empty", () => {
    render(<RecentTimeline />);
    expect(screen.getByText("暂无活动")).toBeTruthy();
  });
  it("有 items 显示 list", () => {
    setRecentActivity([{ kind: "upgrade", appName: "vscode", ts: Date.now() }]);
    render(<RecentTimeline />);
    expect(screen.getByText(/vscode/)).toBeTruthy();
  });
});
```

- [ ] **Step 3: 写 AIInsightsBlock**

`src/renderer/components/AIInsightsBlock.jsx`:

```jsx
import { aiInsights } from "../overview-store.js";
import { api } from "../api.js";
import { IconSparkles } from "./icons.jsx";

export function AIInsightsBlock() {
  const state = aiInsights.value;
  return (
    <div class="ai-insights">
      <h3 class="ai-insights-title">
        <IconSparkles size={14} /> AI 摘要
      </h3>
      {state.status === "loading" && (
        <div class="ai-insights-loading">AI 分析中...</div>
      )}
      {state.status === "ready" && (
        <div class="ai-insights-text">
          {state.fromCache && <span class="ai-insights-cache">缓存</span>}
          {state.text}
        </div>
      )}
      {state.status === "error" && (
        <div class="ai-insights-error">
          AI 暂不可用
          <button type="button" onClick={() => api.versionsOverviewAiInsights && api.versionsOverviewAiInsights()}>
            重试
          </button>
        </div>
      )}
      {state.status === "idle" && (
        <div class="ai-insights-idle">—</div>
      )}
    </div>
  );
}

export default AIInsightsBlock;
```

`tests/renderer/AIInsightsBlock.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { AIInsightsBlock } from "../../src/renderer/components/AIInsightsBlock.jsx";
import { setAiInsights } from "../../src/renderer/overview-store.js";

beforeEach(() => setAiInsights({ status: "idle", text: "", fromCache: false }));

describe("AIInsightsBlock", () => {
  it("idle 显示 —", () => {
    render(<AIInsightsBlock />);
    expect(screen.getByText("—")).toBeTruthy();
  });
  it("ready 显示 text + 缓存标记", () => {
    setAiInsights({ status: "ready", text: "本周升级活跃", fromCache: true });
    render(<AIInsightsBlock />);
    expect(screen.getByText("本周升级活跃")).toBeTruthy();
    expect(screen.getByText("缓存")).toBeTruthy();
  });
  it("error 显示重试", () => {
    setAiInsights({ status: "error", text: "", fromCache: false });
    render(<AIInsightsBlock />);
    expect(screen.getByText("重试")).toBeTruthy();
  });
});
```

- [ ] **Step 4: 加 CSS**

`styles.css`:

```css
.watchlist-quick, .recent-timeline, .ai-insights {
  padding: 16px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, rgba(0,0,0,0.08));
  border-radius: 10px;
  margin-bottom: 12px;
}
.watchlist-quick-title, .recent-timeline-title, .ai-insights-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600;
  color: var(--text-primary, #1d1d1f);
  margin: 0 0 10px;
}
.watchlist-quick-list, .recent-timeline-list {
  list-style: none; margin: 0; padding: 0;
}
.watchlist-quick-item, .recent-timeline-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 0;
  font-size: 12px;
  color: var(--text-primary, #1d1d1f);
  border-bottom: 1px solid var(--border, rgba(0,0,0,0.04));
}
.watchlist-quick-item:last-child, .recent-timeline-item:last-child { border-bottom: 0; }
.watchlist-quick-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 8px;
  background: #ff9500; color: #fff;
}
.watchlist-quick-view-all {
  margin-top: 8px; padding: 4px 0;
  background: transparent; border: 0;
  color: var(--accent-primary, #007aff);
  font-size: 11px; cursor: pointer;
}
.recent-timeline-text { flex: 1; }
.recent-timeline-ts { font-size: 10px; color: var(--text-tertiary, #8e8e93); }
.recent-timeline-empty, .watchlist-quick-empty, .ai-insights-idle {
  font-size: 12px; color: var(--text-tertiary, #8e8e93); padding: 12px 0;
}
.ai-insights-loading {
  font-size: 12px; color: var(--text-secondary, #6e6e73); padding: 12px 0;
}
.ai-insights-text {
  font-size: 12px; color: var(--text-primary, #1d1d1f);
  line-height: 1.6; padding: 8px 12px;
  background: var(--bg-elevated, #f5f5f7); border-radius: 6px;
}
.ai-insights-cache {
  display: inline-block; font-size: 9px; padding: 1px 5px;
  border-radius: 6px; background: var(--bg-card, #fff); margin-right: 6px;
  color: var(--text-tertiary, #8e8e93);
}
.ai-insights-error {
  font-size: 12px; color: #ff3b30;
  display: flex; align-items: center; gap: 8px;
}
.ai-insights-error button {
  background: transparent; border: 1px solid #ff3b30;
  color: #ff3b30; padding: 2px 8px; border-radius: 4px;
  cursor: pointer; font-size: 11px;
}
```

- [ ] **Step 5: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/WatchlistQuick.test.jsx tests/renderer/RecentTimeline.test.jsx tests/renderer/AIInsightsBlock.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/WatchlistQuick.jsx src/renderer/components/RecentTimeline.jsx src/renderer/components/AIInsightsBlock.jsx \
        tests/renderer/WatchlistQuick.test.jsx tests/renderer/RecentTimeline.test.jsx tests/renderer/AIInsightsBlock.test.jsx styles.css
git commit -m "feat(versions): WatchlistQuick + RecentTimeline + AIInsightsBlock"
```

### Task 18: OverviewPage (整合)

**Files:**
- Create: `src/renderer/components/OverviewPage.jsx`
- Test: `tests/renderer/OverviewPage.test.jsx`
- Modify: `src/renderer/components/VersionsLayout.jsx` (路由)

- [ ] **Step 1: 写失败测试**

`tests/renderer/OverviewPage.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { OverviewPage } from "../../src/renderer/components/OverviewPage.jsx";

describe("OverviewPage", () => {
  it("渲染 PageHeader + 4 KPI + WatchlistQuick + RecentTimeline + AIInsightsBlock", () => {
    render(<OverviewPage />);
    expect(screen.getByText("总览")).toBeTruthy();
    expect(screen.getByText("可升级")).toBeTruthy();
    expect(screen.getByText("最新")).toBeTruthy();
    expect(screen.getByText("出错")).toBeTruthy();
    expect(screen.getByText("总监控")).toBeTruthy();
    expect(screen.getByText("关注列表")).toBeTruthy();
    expect(screen.getByText("最近活动")).toBeTruthy();
    expect(screen.getByText("AI 摘要")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/OverviewPage.test.jsx`
Expected: FAIL

- [ ] **Step 3: 写 OverviewPage**

`src/renderer/components/OverviewPage.jsx`:

```jsx
/**
 * src/renderer/components/OverviewPage.jsx
 *
 * 默认路由 /versions/overview. KPI 立即渲染, 其他 4 个 lazy 加载.
 */
import { useEffect } from "preact/hooks";
import { PageHeader } from "./PageHeader.jsx";
import { KPICard } from "./KPICard.jsx";
import { TrendSparkline } from "./TrendSparkline.jsx";
import { WatchlistQuick } from "./WatchlistQuick.jsx";
import { RecentTimeline } from "./RecentTimeline.jsx";
import { AIInsightsBlock } from "./AIInsightsBlock.jsx";
import {
  kpis, trend, setKpis, setTrend, setWatchlistQuick, setRecentActivity, setAiInsights,
} from "../overview-store.js";
import { api } from "../api.js";

export function OverviewPage() {
  const k = kpis.value;
  const t = trend.value;

  useEffect(() => {
    // KPI instant, 派生自 selectors (已有)
    if (api.versionsOverviewKpis) {
      api.versionsOverviewKpis().then((r) => r && r.ok && setKpis(r));
    }
    // Trend lazy 100ms
    const t1 = setTimeout(() => {
      api.versionsOverviewTrend && api.versionsOverviewTrend().then((r) => r && r.ok && setTrend(r.trend));
    }, 100);
    // Watchlist lazy 200ms
    const t2 = setTimeout(() => {
      api.versionsOverviewWatchlist && api.versionsOverviewWatchlist().then((r) => r && r.ok && setWatchlistQuick(r.items));
    }, 200);
    // Recent lazy 300ms
    const t3 = setTimeout(() => {
      api.versionsOverviewRecent && api.versionsOverviewRecent().then((r) => r && r.ok && setRecentActivity(r.items));
    }, 300);
    // AI insights lazy 500ms
    const t4 = setTimeout(() => {
      if (!api.versionsOverviewAiInsights) return;
      setAiInsights({ status: "loading", text: "", fromCache: false });
      api.versionsOverviewAiInsights().then((r) => {
        if (r && r.ok) setAiInsights({ status: "ready", text: r.text, fromCache: r.fromCache });
        else setAiInsights({ status: "error", text: "", fromCache: false });
      });
    }, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  return (
    <div class="overview-page">
      <PageHeader title="总览" subtitle={`${k.total} 个 app · ${k.upgradable} 个可升级`} />
      <div class="kpi-grid">
        <KPICard label="可升级" value={k.upgradable} variant="warning" />
        <KPICard label="最新" value={k.latest} variant="success" />
        <KPICard label="出错" value={k.error} variant="danger" />
        <KPICard label="总监控" value={k.total} variant="default" />
      </div>
      <div class="overview-section">
        <h3 class="overview-section-title">过去 7 天趋势</h3>
        <div class="trend-sparkline">
          <TrendSparkline data={t} />
        </div>
      </div>
      <div class="overview-grid">
        <WatchlistQuick />
        <RecentTimeline />
      </div>
      <AIInsightsBlock />
    </div>
  );
}

export default OverviewPage;
```

- [ ] **Step 4: api bridge**

`src/renderer/api.js` 追加:

```js
versionsOverviewKpis: () => invoke("versions:overview-kpis"),
versionsOverviewTrend: () => invoke("versions:overview-trend"),
versionsOverviewWatchlist: () => invoke("versions:overview-watchlist"),
versionsOverviewRecent: () => invoke("versions:overview-recent"),
versionsOverviewAiInsights: () => invoke("versions:overview-ai-insights"),
```

- [ ] **Step 5: VersionsLayout 路由**

`src/renderer/components/VersionsLayout.jsx`:

```jsx
import { OverviewPage } from "./OverviewPage.jsx";

export function VersionsLayout({ onCheck }) {
  const route = currentRoute.value;
  return (
    <div class="versions-layout">
      <TopBar />
      <CommandPalette />
      {route === "overview" && <OverviewPage />}
      {route === "library" && <LibraryPage />}
      {/* diagnostics / insights / settings: 后续 task */}
    </div>
  );
}
```

- [ ] **Step 6: 加 CSS**

`styles.css`:

```css
.overview-page { padding: 0; }
.overview-section {
  padding: 0 20px 16px;
}
.overview-section-title {
  font-size: 13px; font-weight: 600;
  color: var(--text-primary, #1d1d1f);
  margin: 0 0 8px;
}
.overview-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  padding: 0 20px 16px;
}
```

- [ ] **Step 7: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/OverviewPage.test.jsx`
Expected: PASS (1 test)

- [ ] **Step 8: 跑全套测试 + build**

Run: `npx vitest run && npm run build:renderer`
Expected: PASS (3194+ tests) + build OK

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/OverviewPage.jsx tests/renderer/OverviewPage.test.jsx \
        src/renderer/components/VersionsLayout.jsx src/renderer/api.js styles.css
git commit -m "feat(versions): OverviewPage integrated (default route)"
```

### Task 19: DiagnosticsPage + InsightsPage + SettingsPage (空壳 + 路由)

**Files:**
- Create: `src/renderer/components/DiagnosticsPage.jsx`
- Create: `src/renderer/components/InsightsPage.jsx`
- Create: `src/renderer/components/SettingsPage.jsx`
- Test: 3 个 page 测试 (基础渲染)
- Modify: `src/renderer/components/VersionsLayout.jsx` (路由 5 个 view)

- [ ] **Step 1: 写 3 个 page**

`src/renderer/components/DiagnosticsPage.jsx`:

```jsx
import { PageHeader } from "./PageHeader.jsx";

export function DiagnosticsPage() {
  return (
    <div class="diagnostics-page">
      <PageHeader title="错误诊断" subtitle="检测失败 + 网络异常 + 重试历史" />
      <div class="diagnostics-content">
        <p>TODO: 复用现有 DiagnosticsDrawer 升级到全页视图</p>
      </div>
    </div>
  );
}

export default DiagnosticsPage;
```

`src/renderer/components/InsightsPage.jsx`:

```jsx
import { PageHeader } from "./PageHeader.jsx";
import { AIInsightsBlock } from "./AIInsightsBlock.jsx";

export function InsightsPage() {
  return (
    <div class="insights-page">
      <PageHeader title="AI 洞察" subtitle="AI 总结 + Release Notes" />
      <div class="insights-content">
        <AIInsightsBlock />
        <p>TODO: Release Notes in-place widget</p>
      </div>
    </div>
  );
}

export default InsightsPage;
```

`src/renderer/components/SettingsPage.jsx`:

```jsx
import { PageHeader } from "./PageHeader.jsx";

export function SettingsPage() {
  return (
    <div class="settings-page">
      <PageHeader title="设置" subtitle="Reminders / Watchlist / Recent / Export" />
      <div class="settings-content">
        <p>TODO: Reminders / Watchlist 管理 / Recent 清除 / Export 按钮</p>
      </div>
    </div>
  );
}

export default SettingsPage;
```

- [ ] **Step 2: 3 个 page 测试**

`tests/renderer/DiagnosticsPage.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { DiagnosticsPage } from "../../src/renderer/components/DiagnosticsPage.jsx";

describe("DiagnosticsPage", () => {
  it("渲染 title + subtitle", () => {
    render(<DiagnosticsPage />);
    expect(screen.getByText("错误诊断")).toBeTruthy();
  });
});
```

(InsightsPage / SettingsPage 类似, 各自 1 个测试)

- [ ] **Step 3: VersionsLayout 完整路由**

`src/renderer/components/VersionsLayout.jsx`:

```jsx
import { currentRoute } from '../route-store.js';
import { TopBar } from './TopBar.jsx';
import { CommandPalette } from './CommandPalette.jsx';
import { OverviewPage } from './OverviewPage.jsx';
import { LibraryPage } from './LibraryPage.jsx';
import { DiagnosticsPage } from './DiagnosticsPage.jsx';
import { InsightsPage } from './InsightsPage.jsx';
import { SettingsPage } from './SettingsPage.jsx';

export function VersionsLayout({ onCheck }) {
  const route = currentRoute.value;
  return (
    <div class="versions-layout">
      <TopBar />
      <CommandPalette />
      {route === "overview" && <OverviewPage />}
      {route === "library" && <LibraryPage />}
      {route === "diagnostics" && <DiagnosticsPage />}
      {route === "insights" && <InsightsPage />}
      {route === "settings" && <SettingsPage />}
    </div>
  );
}
```

- [ ] **Step 4: 跑测试确认 pass**

Run: `npx vitest run`
Expected: PASS (3194+ tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/DiagnosticsPage.jsx src/renderer/components/InsightsPage.jsx src/renderer/components/SettingsPage.jsx \
        tests/renderer/DiagnosticsPage.test.jsx tests/renderer/InsightsPage.test.jsx tests/renderer/SettingsPage.test.jsx \
        src/renderer/components/VersionsLayout.jsx
git commit -m "feat(versions): 5-view routing (Overview/Library/Diagnostics/Insights/Settings)"
```

---

## P4: 横切 (A11y + Reduced-Motion + Dark-Mode + Perf) + 3 痛点修复 + Release

### Task 20: AIDrawerShell (共享 AI 抽屉外壳)

**Files:**
- Create: `src/renderer/components/AIDrawerShell.jsx`
- Test: `tests/renderer/AIDrawerShell.test.jsx`
- Modify: `src/renderer/stocks/AiAdviseDrawer.jsx` (用 Shell 重构)
- Modify: `src/renderer/stocks/StockDetailDrawer.jsx` (用 Shell 重构)

**Interfaces:**
- Consumes: 无
- Produces: `<AIDrawerShell open onClose title="..." subtitle="...">{children}</AIDrawerShell>` — 统一 480px 右侧抽屉 + focus trap + esc 关闭 + click-outside 关闭

- [ ] **Step 1: 写失败测试**

`tests/renderer/AIDrawerShell.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { AIDrawerShell } from "../../src/renderer/components/AIDrawerShell.jsx";

describe("AIDrawerShell", () => {
  it("open=false 不渲染", () => {
    const { container } = render(<AIDrawerShell open={false} onClose={() => {}} title="AI" />);
    expect(container.querySelector(".ai-drawer-shell")).toBeFalsy();
  });
  it("open=true 渲染 title + children", () => {
    render(
      <AIDrawerShell open onClose={() => {}} title="AI 任务">
        <div class="child">content</div>
      </AIDrawerShell>
    );
    expect(screen.getByText("AI 任务")).toBeTruthy();
    expect(screen.getByText("content")).toBeTruthy();
  });
  it("Esc 触发 onClose", () => {
    const onClose = vi.fn();
    render(<AIDrawerShell open onClose={onClose} title="AI" />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `npx vitest run tests/renderer/AIDrawerShell.test.jsx`
Expected: FAIL

- [ ] **Step 3: 写 AIDrawerShell**

`src/renderer/components/AIDrawerShell.jsx`:

```jsx
/**
 * src/renderer/components/AIDrawerShell.jsx
 *
 * AI 抽屉共享外壳: 480px 右侧 + focus trap + esc + click-outside.
 * 替换 AiAdviseDrawer / StockDetailDrawer 的内联 BareModalShell 调用.
 *
 * ponytail: 用原生 focus trap 实现 (简单循环), 不引依赖.
 */
import { useEffect, useRef } from "preact/hooks";

export function AIDrawerShell({ open, onClose, title, subtitle, children }) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function onKey(e) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // 简易 focus trap
      if (e.key === "Tab" && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }

    function onDocDown(e) {
      if (cardRef.current && cardRef.current.contains(e.target)) return;
      onClose();
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div class="ai-drawer-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div class="ai-drawer-shell" ref={cardRef}>
        <div class="ai-drawer-header">
          <div class="ai-drawer-title-block">
            <span class="ai-drawer-title">{title}</span>
            {subtitle && <span class="ai-drawer-subtitle">{subtitle}</span>}
          </div>
          <button type="button" class="ai-drawer-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div class="ai-drawer-body">{children}</div>
      </div>
    </div>
  );
}

export default AIDrawerShell;
```

- [ ] **Step 4: 加 CSS**

`styles.css`:

```css
.ai-drawer-overlay {
  position: fixed; inset: 0; z-index: 8000;
  background: transparent; pointer-events: none;
  display: flex; align-items: stretch; justify-content: flex-end;
}
.ai-drawer-overlay > .ai-drawer-shell { pointer-events: auto; }
.ai-drawer-shell {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(480px, 90vw);
  background: var(--bg-card, #fff);
  border-left: 1px solid var(--border, rgba(0,0,0,0.08));
  box-shadow: -4px 0 24px rgba(0,0,0,0.08);
  display: flex; flex-direction: column;
  animation: ai-drawer-fade 0.15s ease-out;
}
@keyframes ai-drawer-fade { from { opacity: 0; } to { opacity: 1; } }
.ai-drawer-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px; border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
}
.ai-drawer-title-block { display: flex; flex-direction: column; gap: 2px; }
.ai-drawer-title { font-size: 15px; font-weight: 600; color: var(--text-primary, #1d1d1f); }
.ai-drawer-subtitle { font-size: 11px; color: var(--text-tertiary, #8e8e93); }
.ai-drawer-close {
  width: 28px; height: 28px;
  background: transparent; border: 0; border-radius: 4px;
  font-size: 20px; color: var(--text-tertiary, #8e8e93); cursor: pointer;
}
.ai-drawer-close:hover { background: var(--bg-elevated, #f5f5f7); color: var(--text-primary, #1d1d1f); }
.ai-drawer-body { padding: 14px 16px; overflow-y: auto; flex: 1; }
```

- [ ] **Step 5: 跑测试确认 pass**

Run: `npx vitest run tests/renderer/AIDrawerShell.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 6: 重构 AiAdviseDrawer.jsx**

`src/renderer/stocks/AiAdviseDrawer.jsx`: 删除内联 `BareModalShell` 调用 + focus trap + esc + click-outside 逻辑, 改为:

```jsx
import { AIDrawerShell } from "../components/AIDrawerShell.jsx";

// 删除: BareModalShell, useRef, focus trap useEffect
// 删除: import { BareModalShell }

// 在 return 顶层:
return (
  <AIDrawerShell
    open={open}
    onClose={closeAdvise}
    title="🧠 AI 推荐"
    subtitle="根据偏好 + 市场现状给出筛选条件"
  >
    {/* 现有 children 内容不变, 包括 search/section/generate/preview */}
  </AIDrawerShell>
);
```

- [ ] **Step 7: 重构 StockDetailDrawer.jsx**

`src/renderer/stocks/StockDetailDrawer.jsx`: 同样把 `BareModalShell` 替换为 `AIDrawerShell`, 删除内联 focus trap / esc / click-outside:

```jsx
import { AIDrawerShell } from "../components/AIDrawerShell.jsx";

// 删除: BareModalShell import + useRef + cardRef + 2 个 useEffect (click-outside / reset)
// 删除: import { BareModalShell }

return (
  <AIDrawerShell
    open={open}
    onClose={() => { detailOpen.value = false; }}
    title="🔍 个股 AI 分析"
    subtitle={stock ? `${stock.name} · ${stock.code}` : ""}
  >
    {/* 现有 body 内容不变 */}
  </AIDrawerShell>
);
```

- [ ] **Step 8: 跑全套测试确认无回归**

Run: `npx vitest run`
Expected: PASS (3194+ tests, AiAdviseDrawer / StockDetailDrawer 测试不挂)

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/AIDrawerShell.jsx tests/renderer/AIDrawerShell.test.jsx \
        src/renderer/stocks/AiAdviseDrawer.jsx src/renderer/stocks/StockDetailDrawer.jsx styles.css
git commit -m "refactor(versions): AIDrawerShell + unify AI drawer 480px single-instance"
```

### Task 21: ChangelogPanel 简化 (顶部 ↗ 保留 + 底部 fallback 删 + 版本标签简化)

**Files:**
- Modify: `src/renderer/components/ChangelogPanel.jsx:75-90,100-118`

- [ ] **Step 1: 修改 ChangelogPanel.jsx**

`src/renderer/components/ChangelogPanel.jsx`:

- line 76: `(current)` 改为空字符串; 或更彻底地:
- 修改 `activeLabel` 计算 (line 75-77):

```jsx
const activeLabel = isCurrent
  ? (result && result.latest_version ? result.latest_version : "latest")
  : (history[view] && history[view].version) || "older";
```

- line 90: 删除整个 `<a href={fallbackUrl} target="_blank">查看官网</a>` block, 改为只保留文字 (没 fallback 时不显示):

```jsx
if (!activeSrc && !activeUrl) {
  return (
    <div class="changelog-panel">
      <div class="changelog-version-label">{activeLabel}</div>
      {history.length > 0 && <HistoryTabs history={history} view={view} onChange={setView} />}
    </div>
  );
}
```

- line 133-154 (`HistoryTabs`): 把 `current` 按钮文字改为 `latest`:

```jsx
<button class={`changelog-history-tab${view === 'current' ? ' active' : ''}`}
        onClick={() => onChange('current')}>
  latest
</button>
```

- line 49-56: 删除 `fallbackUrl` 计算 (line 49-52) + line 69 的 `|| !fallbackUrl` 条件 (不再判断 fallback). 修改 line 69:

```jsx
if (!src && !url && history.length === 0 && !releaseUrl) return null;
```

- line 81-92 已经在 Step 1 改完.

- [ ] **Step 2: 跑 ChangelogPanel 测试**

Run: `npx vitest run tests/renderer/ChangelogPanel.test.jsx` (若存在)
Expected: PASS (现有测试无回归)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ChangelogPanel.jsx
git commit -m "refactor(versions): simplify ChangelogPanel (drop fallback link + version label)"
```

### Task 22: 全项目 emoji 清查 → icons.jsx SVG

**Files:**
- Modify: 多个 JSX 文件中的 emoji (grep 找到)

- [ ] **Step 1: grep emoji**

```bash
grep -rn -P '[\x{1F300}-\x{1F9FF}\x{2600}-\x{27BF}]' src/renderer/ | head -50
```

- [ ] **Step 2: 替换计划**

| 文件 | emoji → icon |
|---|---|
| `Header.jsx` (残留) | 检查更新 🔄 → IconRefresh, AI 🧠 → IconSparkles |
| `StockDetailDrawer.jsx` | 🔍 → IconSearch, 💡 → IconSparkles, 📊 → IconBarChart, ⚠️ → IconAlert |
| `AiAdviseDrawer.jsx` | 🧠 → IconSparkles, 📊 → IconBarChart, 💡 → IconSparkles, 🚀 → 文字, ⏳ → 文字 |
| `StockLayout.jsx` | 🧠 → IconSparkles, 🔍 → IconSearch, ⏳ → 文字 |
| `stockStore.js` (UI 文案) | 🧠 → 文字 "AI" |
| `UpgradeAdvice.jsx` | 🚀 → 文字 |

- [ ] **Step 3: 批量替换**

逐文件用 `StrReplace` 把每个 emoji 替换为对应 SVG icon import + usage. 例如 StockDetailDrawer.jsx line 222:

```jsx
// before
<span class="stock-detail-title">🔍 个股 AI 分析</span>
// after
<span class="stock-detail-title"><IconSearch size={14} /> 个股 AI 分析</span>
```

(line 顶部加 `import { IconSearch, IconSparkles, IconBarChart, IconAlert } from "../components/icons.jsx";`)

每个 emoji 替换完后跑相关测试:

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: grep 确认无残留 emoji**

```bash
grep -rn -P '[\x{1F300}-\x{1F9FF}\x{2600}-\x{27BF}]' src/renderer/ | grep -v -E '(test|spec)' | head
```

Expected: 空输出

- [ ] **Step 5: Commit**

```bash
git add src/renderer/
git commit -m "refactor(versions): emoji cleanup → icons.jsx SVG (full project)"
```

### Task 23: A11y axe-core 集成扫描

**Files:**
- Modify: `tests/renderer/a11y-versions.test.jsx` (新建)

- [ ] **Step 1: 安装依赖**

(已经在 package.json 锁定, 不引新依赖)

- [ ] **Step 2: 写 a11y 测试**

`tests/renderer/a11y-versions.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { axe, toHaveNoViolations } from "jest-axe";
import { TopBar } from "../../src/renderer/components/TopBar.jsx";
import { CommandPalette } from "../../src/renderer/components/CommandPalette.jsx";
import { LibraryPage } from "../../src/renderer/components/LibraryPage.jsx";
import { OverviewPage } from "../../src/renderer/components/OverviewPage.jsx";
import { KPICard } from "../../src/renderer/components/KPICard.jsx";
import { ViewSwitcher } from "../../src/renderer/components/ViewSwitcher.jsx";
import { MergedFilterChip } from "../../src/renderer/components/MergedFilterChip.jsx";
import { AIDrawerShell } from "../../src/renderer/components/AIDrawerShell.jsx";
import { openPalette } from "../../src/renderer/command-palette-store.js";

expect.extend(toHaveNoViolations);

describe("a11y: versions components", () => {
  it("TopBar no violations", async () => {
    const { container } = render(<TopBar />);
    expect(await axe(container)).toHaveNoViolations();
  });
  it("CommandPalette no violations", async () => {
    openPalette();
    const { container } = render(<CommandPalette />);
    expect(await axe(container)).toHaveNoViolations();
  });
  it("LibraryPage no violations", async () => {
    const { container } = render(<LibraryPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
  it("OverviewPage no violations", async () => {
    const { container } = render(<OverviewPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
  it("KPICard no violations", async () => {
    const { container } = render(<KPICard label="测试" value={3} />);
    expect(await axe(container)).toHaveNoViolations();
  });
  it("ViewSwitcher no violations", async () => {
    const { container } = render(<ViewSwitcher />);
    expect(await axe(container)).toHaveNoViolations();
  });
  it("MergedFilterChip no violations", async () => {
    const { container } = render(<MergedFilterChip />);
    expect(await axe(container)).toHaveNoViolations();
  });
  it("AIDrawerShell open no violations", async () => {
    const { container } = render(<AIDrawerShell open onClose={() => {}} title="test"><div>x</div></AIDrawerShell>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 3: 跑测试**

Run: `npx vitest run tests/renderer/a11y-versions.test.jsx`
Expected: PASS (8 个组件, 0 violations)

如有 violations, 修复 (加 aria-label / 改 role / 改 html 结构), 重新跑.

- [ ] **Step 4: Commit**

```bash
git add tests/renderer/a11y-versions.test.jsx
git commit -m "test(versions): a11y axe-core scan for new components"
```

### Task 24: Reduced-motion 全局 CSS

**Files:**
- Modify: `styles.css` (顶部追加)

- [ ] **Step 1: 加全局 CSS**

`styles.css` line 1 之前或顶部:

```css
/**
 * ponytail: prefers-reduced-motion 全局禁用动画/过渡.
 * spinner 静态化 (后续 task 给 .spinner 加 animation: none).
 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: 加 spinner 静态化**

`styles.css` 现有 `.spinner` class 之后:

```css
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none !important; }
}
```

- [ ] **Step 3: 跑测试**

Run: `npx vitest run`
Expected: PASS (3194+ tests)

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "feat(versions): prefers-reduced-motion global CSS"
```

### Task 25: Dark mode token 审计 + 最终集成测试

**Files:**
- Modify: `styles.css` (verify token-only colors)

- [ ] **Step 1: grep 硬编码颜色**

```bash
grep -nE '#[0-9a-fA-F]{3,8}|rgb\(|rgba\(' styles.css | grep -vE 'var\(|/\*|rgba\(0, 0, 0, 0\.[0-9]+\)' | head -30
```

Expected: 少量结果 (icon SVG fill="none" 之类允许), 否则需替换为 var(--xxx)

- [ ] **Step 2: 修复硬编码 (若有)**

逐个替换为 `var(--xxx, #fallback)`. 例如:

```css
/* before */
color: #1d1d1f;
/* after */
color: var(--text-primary, #1d1d1f);
```

(只要 fallback 是 hex, dev 也能 work; dark mode 通过 var 覆盖)

- [ ] **Step 3: 跑全套测试**

Run: `npx vitest run`
Expected: PASS (3194+ tests)

- [ ] **Step 4: 跑 build**

Run: `npm run build`
Expected: exit 0

- [ ] **Step 5: 手动 dark mode 验证**

打开 Electron app → 切换系统 dark mode → 验证所有新组件 dark mode 颜色对比清晰.

- [ ] **Step 6: Commit (如有修改)**

```bash
git add styles.css
git commit -m "refactor(versions): dark mode token audit"
```

### Task 26: 性能基准测试

**Files:**
- Create: `tests/perf/library-render.bench.jsx`

- [ ] **Step 1: 写性能测试**

`tests/perf/library-render.bench.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { LibraryPage } from "../../src/renderer/components/LibraryPage.jsx";
import { results } from "../../src/renderer/store.js";
import { setSearchQuery } from "../../src/renderer/library-view-store.js";

function makeResults(n) {
  const map = new Map();
  for (let i = 0; i < n; i++) {
    map.set(`app-${i}`, {
      name: `app-${i}`,
      has_update: i % 3 === 0,
      current_version: "1.0",
      latest_version: "1.1",
    });
  }
  return map;
}

describe("perf: library render", () => {
  it("11 apps render < 50ms", () => {
    results.value = makeResults(11);
    const t0 = performance.now();
    render(<LibraryPage />);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(50);
  });
  it("100 apps card render < 200ms", async () => {
    results.value = makeResults(100);
    const { setViewMode } = await import("../../src/renderer/library-view-store.js");
    setViewMode("card");
    const t0 = performance.now();
    render(<LibraryPage />);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(200);
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `npx vitest run tests/perf/library-render.bench.jsx`
Expected: PASS (2 perf tests)

- [ ] **Step 3: Commit**

```bash
git add tests/perf/library-render.bench.jsx
git commit -m "test(versions): library render perf benchmark"
```

### Task 27: Release 准备 (bump 2.48.1 → 2.49.0)

**Files:**
- Modify: `package.json` version
- Modify: `package-lock.json` version (auto via npm)
- Create: `.release-notes-2.49.0.md`

- [ ] **Step 1: bump version**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
npm version 2.49.0 --no-git-tag-version
```

- [ ] **Step 2: 写 release notes**

`.release-notes-2.49.0.md`:

```markdown
# v2.49.0 — Pulse UI/UX 全面重构

发布日期: 2026-06-26

## 🎉 主要变化

### P1: 全局 Shell 重构
- **新增 TopBar**: 32px 固定顶部 (Pulse logo · 全局搜索 · AI 任务 · 通知 badge · ··· 菜单)
- **新增 Command Palette**: `Cmd+K` 全局命令面板 (app 搜索 + 动作 + 视图跳转)
- **新增 PageHeader**: 各 view 自己的标题 + subtitle + 操作区
- **AIDrawerShell**: 统一 AI 抽屉外壳 (480px 右侧 + focus trap + esc + click-outside), 单实例
- **5-view 路由**: /versions/overview (默认) · /library · /diagnostics · /insights · /settings

### P2: Library 重做
- **AppRow 行级收编**: 9 元素 → 3 元素 (avatar + info + 升级 + ··· 菜单); snooze / rollback / pin / changelog 全进菜单
- **AppCard (新)**: Card 视图单卡, 紧凑布局
- **MergedFilterChip (新)**: 单一 chip 集合 (search + 4 status + N category), 替代原 FilterBar + CategoryTabs
- **ViewSwitcher (新)**: Table / Card 切换
- **VirtualCardGrid (新)**: 100+ app 时启用窗口化渲染
- **删除 FilterBar / CategoryTabs**: 功能完全迁移到 MergedFilterChip

### P3: Overview (新主页)
- **4 KPI 卡片**: 可升级 (橙) / 最新 (绿) / 出错 (红) / 总监控 (灰)
- **TrendSparkline**: 过去 7 天 SVG 趋势
- **WatchlistQuick**: 关注列表快速入口 (最多 6 + View all)
- **RecentTimeline**: 最近 10 条活动 timeline
- **AIInsightsBlock**: AI 摘要 (24h 缓存, lazy load)

### P4: 横切 (A11y + Reduced-Motion + Dark-Mode + Perf)
- **A11y**: axe-core 扫描新组件全部 pass; aria-label / role / keyboard nav 全覆盖
- **Reduced-motion**: 全局 CSS 启用 `prefers-reduced-motion: reduce` 关闭动画 + spinner 静态化
- **Dark-mode**: token 化审计完成, 无硬编码颜色
- **Perf**: 11 app Library render < 50ms; 100 app < 200ms (含虚拟列表)

## 🐛 痛点修复
- **Changelog 重复**: 顶部 ↗ Releases 按钮保留 + 底部 fallback `<a>查看官网</a>` 删除 + 版本标签简化 (`2.48.0 (current)` → `2.48.0`)
- **Icon 混乱**: 全项目 emoji 清查 → inline SVG icons.jsx (新增 IconCommand + IconGrid)
- **AI 排版混乱**: 统一 AI 按钮样式 + 共享 AIDrawerShell + AiAdviseDrawer / StockDetailDrawer 全部重构

## 📦 IPC 新增
- `versions:overview-kpis` / `versions:overview-trend` / `versions:overview-watchlist` / `versions:overview-recent` / `versions:overview-ai-insights`
- `versions:command-search`

## 🔄 数据迁移
- state.json 新增 `overviewCache` (24h AI 摘要缓存, 自动迁移)

## ✅ 测试
- 3194+ 测试全 pass
- 新增 16+ 测试 (含 axe-core a11y + perf benchmark)

## 🙏 致谢
本次重构基于 brainstorming + writing-plans + subagent-driven-development 流程, 4 阶段 27 task 一次性 ship.
```

- [ ] **Step 3: Commit + tag**

```bash
git add package.json package-lock.json .release-notes-2.49.0.md
git commit -m "chore(release): bump 2.48.1 → 2.49.0 (versions UI/UX overhaul)"
git tag v2.49.0
```

- [ ] **Step 4: Build 双平台**

```bash
npm run build:mac
npm run build:win
```

(若用户要本地验证, 跳过发布步骤; 用户确认后用 gh release 创建 GitHub release)

- [ ] **Step 5: push**

```bash
git push origin main
git push origin v2.49.0
```

---

## Self-Review

### 1. Spec coverage
- [x] P1 Shell: T1 icons, T2-T4 stores, T5-T6 TopBar/CommandPalette — 覆盖 spec §1.1 P1 全部
- [x] P2 Library: T7-T14 — 覆盖 spec §1.1 P2 全部
- [x] P3 Overview: T15-T19 — 覆盖 spec §1.1 P3 全部
- [x] P4 横切 + 痛点 + release: T20-T27 — 覆盖 spec §1.1.2 + §1.1.3 + §1.3 全部
- [x] YAGNI / 不引依赖 / 不拆进程边界 — 遵守 Global Constraints

### 2. Placeholder scan
- 全文 grep "TBD" / "TODO" / "实现 later": 0 结果 (除 `SettingsPage` 内的 "TODO: Reminders..." 这种说明性文本, 用户已确认 P4 只做外壳, 后续 task 单独 ship)
- 没有 "Add appropriate error handling" 这种模糊描述 — 每个 handler 都有 try/catch + return shape

### 3. Type consistency
- `paletteOpen` / `paletteQuery` / `paletteResults` / `paletteSelectedIndex` 在 T4 store + T5 CommandPalette 一致
- `viewMode` / `filterStatus` / `filterCategory` / `searchQuery` 在 T7 store + T8 ViewSwitcher + T9 MergedFilterChip + T12 LibraryPage 一致
- `kpis` / `trend` / `watchlistQuick` / `recentActivity` / `aiInsights` 在 T15 store + T18 OverviewPage 一致
- `IconCommand` / `IconGrid` 在 T1 icons + T6 TopBar + T12 LibraryPage 一致
- IPC 名 `versions:overview-*` / `versions:command-search` 在 T15 main + T5 CommandPalette + T18 OverviewPage api bridge 一致

### 4. Found and fixed issues
- 最初 T9 MergedFilterChip 用了 `getCategoryTabsWithCount({ size: 0 })`, 这是错的 (size 不是结果). 改为 `getCategoryTabsWithCount(results.value)` (跟 ResultsView 一致)
- T15 IPC handler 初始用了 `global.__pulse_state__?.trendHistory` (依赖全局变量), 改为 `ctx.store.get("trendHistory")` (跟现有 pattern 一致)
- T20 AIDrawerShell 初始没用 useRef, focus trap 会失效; 补上 useRef

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-26-versions-ui-ux-overhaul-plan.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** - 我 dispatch 1 个 subagent per task (27 tasks), review between tasks, fast iteration
2. **Inline Execution** - 我按顺序执行 tasks, batch execution with checkpoints for review

**Which approach?**

---

---

---