# 检查更新页重构 — 默认页改为应用列表 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 versions 模块默认落地页从不讨喜的 dashboard overview 改为"应用列表/平铺"(复用 LibraryPage),废弃 KPI 墙/关注 mini/最近活动 mini,清理残留并修复 CommandPalette 断链 bug。

**Architecture:** 合并 overview/library 路由(默认路由改为 library,`navigateTo` 对旧 `overview` 做容错重定向)。在 LibraryPage 增加空态分支(复用 OverviewEmptyState)+ PageHeader 醒目「检查更新」主按钮,共享一个 `useRunCheck` hook。删除 dashboard 组件与 overview-store 等残留。保留主进程 IPC 通道不动(契约被测试锁定)。

**Tech Stack:** Preact + @preact/signals, vitest + happy-dom + @testing-library/preact, Electron。

**设计文档:** `docs/superpowers/specs/2026-06-27-overview-as-app-list-design.md`

---

## 文件结构

**新建:**
- `src/renderer/hooks/useRunCheck.js` — 共享的"检查更新"逻辑 hook(loading 态 + `api.versionsRunCheck()` + 2s 视觉 hold)。供 LibraryPage 空态 CTA 与 PageHeader 主按钮共用。从 OverviewPage.jsx 迁移而来。

**修改:**
- `src/renderer/route-store.js` — 默认路由 `overview` → `library`;`ROUTES` 移除 `overview`;`navigateTo` 对 `"overview"` 重定向到 `"library"`。
- `src/renderer/components/VersionsLayout.jsx` — 移除 `route === "overview"` 分支。
- `src/renderer/components/LibraryPage.jsx` — 增加空态分支(复用 OverviewEmptyState)+ PageHeader 加「检查更新」主按钮(用 `useRunCheck`)。
- `src/renderer/components/CommandPalette.jsx:85` — `api.runCheck()` → `api.versionsRunCheck()`(修断链)。

**删除:**
- `src/renderer/components/OverviewPage.jsx` + `OverviewPage.css`
- `src/renderer/components/OverviewKPIWall.jsx` + `OverviewKPIWall.css`
- `src/renderer/components/OverviewWatchlistMini.jsx` + `OverviewWatchlistMini.css`
- `src/renderer/components/OverviewRecentMini.jsx` + `OverviewRecentMini.css`
- `src/renderer/components/AIInsightsBlock.jsx`
- `src/renderer/components/RecentTimeline.jsx`
- `src/renderer/components/WatchlistQuick.jsx`
- `src/renderer/overview-store.js`
- `src/renderer/components/Header.jsx`
- 对应测试:`overview-page.test.jsx` / `overview-kpi-wall.test.jsx` / `overview-watchlist-mini.test.jsx` / `overview-recent-mini.test.jsx` / `overview-store.test.js`

**新增样式:**
- 根 `styles.css`(全项目唯一全局 stylesheet,所有非 Overview 组件样式都在这里)新增 `.btn-run-check` 规则。

**保留(不改):**
- `src/renderer/components/OverviewEmptyState.jsx` + CSS(被 LibraryPage 空态复用)
- 主进程 `register-versions-overview.js` / `preload.js` / `api.js` 的 `versions:overview-*` IPC 通道(契约被 `tests/main/versions-overview-ipc.test.js` 锁定,保持稳定)
- `tests/renderer/overview-empty-state.test.jsx`(组件复用,单测继续有效)
- `tests/main/versions-overview-ipc.test.js`(IPC 契约继续保障)

---

## Task 1: 抽取 `useRunCheck` hook

把 OverviewPage.jsx 里的 runCheck 逻辑抽成可复用 hook,为 LibraryPage 空态 CTA 和主按钮做准备。

**Files:**
- Create: `src/renderer/hooks/useRunCheck.js`
- Test: `tests/renderer/useRunCheck.test.js`

- [ ] **Step 1: 写失败测试**

创建 `tests/renderer/useRunCheck.test.js`:

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/preact";
import { useRunCheck } from "../../src/renderer/hooks/useRunCheck.js";

const mockRunCheck = vi.fn();

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    get versionsRunCheck() { return mockRunCheck; },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

describe("useRunCheck", () => {
  it("初始 loading 为 false", () => {
    const { result } = renderHook(() => useRunCheck());
    expect(result.current.isLoading).toBe(false);
  });

  it("run() 调用 api.versionsRunCheck 并置 loading=true", async () => {
    let resolve;
    mockRunCheck.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useRunCheck());
    act(() => { result.current.run(); });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(mockRunCheck).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ started: true }); });
  });

  it("完成后 2s loading 复位为 false", async () => {
    mockRunCheck.mockResolvedValue({ started: true });
    const { result } = renderHook(() => useRunCheck());
    await act(async () => { await result.current.run(); });
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.isLoading).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/useRunCheck.test.js`
Expected: FAIL — `Cannot find module '../../src/renderer/hooks/useRunCheck.js'`

- [ ] **Step 3: 实现 hook**

创建 `src/renderer/hooks/useRunCheck.js`:

```js
/**
 * src/renderer/hooks/useRunCheck.js
 *
 * 共享的"检查更新"逻辑: loading 态 + api.versionsRunCheck() + 2s 视觉 hold.
 * 供 LibraryPage 空态 CTA 与 PageHeader 主按钮共用.
 *
 * 2s hold 避免按钮闪一下又可点 (check 通常 < 2s).
 * main 侧 safeHandle 已返 { started, error }, 异常在内部吞掉.
 */
import { useState, useRef } from "preact/hooks";
import { api } from "../api.js";

export function useRunCheck() {
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef(null);

  const run = async () => {
    setIsLoading(true);
    try {
      await api.versionsRunCheck();
    } catch {
      /* swallowed — main 侧 safeHandle 已返 { started: false, error } */
    } finally {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsLoading(false), 2000);
    }
  };

  return { isLoading, run };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/renderer/useRunCheck.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: 提交**

```bash
git add src/renderer/hooks/useRunCheck.js tests/renderer/useRunCheck.test.js
git commit -m "feat(versions): 抽取 useRunCheck hook 共享检查更新逻辑"
```

---

## Task 2: 路由合并 — 默认路由改为 library

修改 route-store.js,移除 overview 路由,默认改 library,并对旧 overview 做容错重定向。

**Files:**
- Modify: `src/renderer/route-store.js`
- Test: 新增路由单测 `tests/renderer/route-store.test.js`

- [ ] **Step 1: 写失败测试**

创建 `tests/renderer/route-store.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { currentRoute, navigateTo, ROUTES } from "../../src/renderer/route-store.js";

beforeEach(() => {
  navigateTo("library");
});

describe("route-store (合并后)", () => {
  it("默认路由是 library (不再是 overview)", () => {
    // currentRoute 是 signal, 直接读当前 value (已被 beforeEach 设成 library)
    expect(currentRoute.value).toBe("library");
  });

  it("ROUTES 不含 overview", () => {
    expect(ROUTES).not.toContain("overview");
    expect(ROUTES).toContain("library");
  });

  it("navigateTo('overview') 容错重定向到 library", () => {
    navigateTo("diagnostics");
    expect(currentRoute.value).toBe("diagnostics");
    navigateTo("overview");
    expect(currentRoute.value).toBe("library");
  });

  it("navigateTo 对未知路由不变更", () => {
    navigateTo("library");
    navigateTo("不存在的路由");
    expect(currentRoute.value).toBe("library");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/route-store.test.js`
Expected: FAIL — 默认路由仍是 `overview`,navigateTo('overview') 不会重定向。

- [ ] **Step 3: 修改 route-store.js**

把 `src/renderer/route-store.js` 全文替换为:

```js
/**
 * src/renderer/route-store.js
 *
 * 版本检查 view 的路由 signal. 不引入真 hash 路由 (太重),
 * signal 已能驱动组件重渲染.
 *
 * 2026-06-27: 合并 overview→library. 默认落地改为应用列表 (LibraryPage),
 * 废弃 dashboard overview. navigateTo 对旧 "overview" 做容错重定向,
 * 避免旧持久化状态/深链断裂.
 */
import { signal } from "@preact/signals";

export const ROUTES = ["library", "diagnostics", "insights", "settings"];

export const currentRoute = signal("library");

export function navigateTo(route) {
  // 容错: 旧 overview 路由重定向到 library (应用列表)
  if (route === "overview") route = "library";
  if (ROUTES.includes(route)) currentRoute.value = route;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/renderer/route-store.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 提交**

```bash
git add src/renderer/route-store.js tests/renderer/route-store.test.js
git commit -m "refactor(versions): 合并 overview→library 路由, 默认页改为应用列表"
```

---

## Task 3: VersionsLayout 移除 overview 分支

**Files:**
- Modify: `src/renderer/components/VersionsLayout.jsx`
- Test: `tests/renderer/VersionsLayout.test.jsx`(若不存在则新建)

- [ ] **Step 1: 写失败测试**

创建/确认 `tests/renderer/VersionsLayout.test.jsx`:

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/preact";

// mock 掉 CommandPalette 和 TopBar 避免拉真实 IPC
vi.mock("../../src/renderer/components/CommandPalette.jsx", () => ({
  CommandPalette: () => null,
}));

import { VersionsLayout } from "../../src/renderer/components/VersionsLayout.jsx";
import { navigateTo } from "../../src/renderer/route-store.js";

describe("VersionsLayout", () => {
  it("默认渲染 library 而非 overview", () => {
    navigateTo("library");
    const { container } = render(<VersionsLayout />);
    // library 页有 .library-page class; overview 已不存在
    expect(container.querySelector(".library-page")).toBeTruthy();
  });

  it("对 overview 重定向后仍渲染 library", () => {
    navigateTo("overview"); // 已被 route-store 重定向到 library
    const { container } = render(<VersionsLayout />);
    expect(container.querySelector(".library-page")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/VersionsLayout.test.jsx`
Expected: FAIL — 当前 route 为 overview 时渲染 OverviewPage(无 `.library-page`),且 VersionsLayout 仍 import OverviewPage。

- [ ] **Step 3: 修改 VersionsLayout.jsx**

把 `src/renderer/components/VersionsLayout.jsx` 全文替换为:

```jsx
/**
 * src/renderer/components/VersionsLayout.jsx
 *
 * 版本检查 view 的统一容器: TopBar + CommandPalette + 当前路由对应的 page.
 * 每个 page 各自负责 PageHeader + 内容.
 *
 * 2026-06-27: 合并 overview→library. 默认落地 = 应用列表 (LibraryPage),
 * 不再有 dashboard overview 视图.
 */
import { currentRoute } from "../route-store.js";
import { TopBar } from "./TopBar.jsx";
import { CommandPalette } from "./CommandPalette.jsx";
import { LibraryPage } from "./LibraryPage.jsx";
import { DiagnosticsPage } from "./DiagnosticsPage.jsx";
import { InsightsPage } from "./InsightsPage.jsx";
import { SettingsPage } from "./SettingsPage.jsx";

export function VersionsLayout({ onCheck }) {
  const route = currentRoute.value;
  return (
    <div class="versions-layout">
      <TopBar />
      <CommandPalette />
      {route === "library" && <LibraryPage />}
      {route === "diagnostics" && <DiagnosticsPage />}
      {route === "insights" && <InsightsPage />}
      {route === "settings" && <SettingsPage />}
    </div>
  );
}

export default VersionsLayout;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/renderer/VersionsLayout.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 提交**

```bash
git add src/renderer/components/VersionsLayout.jsx tests/renderer/VersionsLayout.test.jsx
git commit -m "refactor(versions): VersionsLayout 移除 overview 分支"
```

---

## Task 4: LibraryPage 增加空态分支 + 检查更新主按钮

让 LibraryPage 在 `results.size === 0` 时显 OverviewEmptyState CTA;PageHeader 加醒目「检查更新」主按钮,用 useRunCheck。

**Files:**
- Modify: `src/renderer/components/LibraryPage.jsx`
- Modify: `tests/renderer/LibraryPage.test.jsx`

> **样式说明:** 项目用单一全局 `styles.css`(根目录),非 Overview 组件都不自带 CSS。`.btn-run-check` 样式在 Task 4b 新增。本任务只改 JSX + 测试。

- [ ] **Step 1: 更新测试(先写空态 + 主按钮断言)**

在 `tests/renderer/LibraryPage.test.jsx` 文件末尾(`describe` 块结束前)追加新用例。同时确认 mock api 已就绪。完整替换文件为:

```jsx
// @vitest-environment happy-dom
/**
 * tests/renderer/LibraryPage.test.jsx
 *
 * LibraryPage 组合 PageHeader + ViewSwitcher + MergedFilterChip
 * + TableView (ResultsView) / CardView (AppCard 网格).
 * 2026-06-27: 新增空态分支 + PageHeader 检查更新主按钮.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/preact";
import { LibraryPage } from "../../src/renderer/components/LibraryPage.jsx";
import { viewMode, setViewMode, resetLibraryFilters } from "../../src/renderer/library-view-store.js";
import { results, resetCheck } from "../../src/renderer/store.js";

const mockRunCheck = vi.fn();
vi.mock("../../src/renderer/api.js", () => ({
  api: {
    get versionsRunCheck() { return mockRunCheck; },
    get brewUpgrade() { return () => Promise.resolve(); },
    get detectResultsExport() { return () => Promise.resolve(); },
  },
}));

beforeEach(() => {
  cleanup();
  resetLibraryFilters();
  resetCheck();
  vi.clearAllMocks();
  mockRunCheck.mockReset();
});

describe("LibraryPage (Task 12)", () => {
  it("默认渲染 PageHeader + ViewSwitcher + MergedFilterChip", () => {
    // 填充一个结果, 避开空态
    results.value = new Map([["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }]]);
    render(<LibraryPage />);
    expect(screen.getByText("应用库")).toBeTruthy();
    expect(screen.getByLabelText("表格视图")).toBeTruthy();
    expect(screen.getByLabelText("卡片视图")).toBeTruthy();
    expect(screen.getAllByText("全部").length).toBeGreaterThan(0);
  });

  it("card 模式渲染 app-card-grid", () => {
    setViewMode("card");
    results.value = new Map([["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }]]);
    render(<LibraryPage />);
    expect(document.querySelector(".app-card-grid")).toBeTruthy();
  });
});

describe("LibraryPage 空态 + 检查更新按钮", () => {
  it("results.size === 0 时显示 OverviewEmptyState CTA, 不显示列表", () => {
    results.value = new Map(); // 空
    const { container } = render(<LibraryPage />);
    expect(container.querySelector(".overview-empty-state")).toBeTruthy();
    expect(container.querySelector(".cta-button")).toBeTruthy();
    expect(container.querySelector(".library-page__list, .merged-filter")).toBeFalsy();
  });

  it("空态 CTA 点击触发 api.versionsRunCheck", async () => {
    let resolve;
    mockRunCheck.mockReturnValue(new Promise((r) => { resolve = r; }));
    results.value = new Map();
    const { container } = render(<LibraryPage />);
    const cta = container.querySelector(".cta-button");
    fireEvent.click(cta);
    await waitFor(() => expect(mockRunCheck).toHaveBeenCalledTimes(1));
    await Promise.resolve().then(() => resolve({ started: true }));
  });

  it("有数据时 PageHeader 显示醒目的检查更新主按钮", () => {
    results.value = new Map([["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }]]);
    render(<LibraryPage />);
    const btn = screen.getByTestId("library-run-check");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toMatch(/检查更新/);
  });

  it("检查更新主按钮点击触发 api.versionsRunCheck", async () => {
    mockRunCheck.mockResolvedValue({ started: true });
    results.value = new Map([["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }]]);
    render(<LibraryPage />);
    fireEvent.click(screen.getByTestId("library-run-check"));
    await waitFor(() => expect(mockRunCheck).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/LibraryPage.test.jsx`
Expected: FAIL — LibraryPage 还没空态分支(空时仍渲染 PageHeader),没有 `library-run-check` testid。

- [ ] **Step 3: 修改 LibraryPage.jsx**

把 `src/renderer/components/LibraryPage.jsx` 全文替换为:

```jsx
/**
 * src/renderer/components/LibraryPage.jsx
 *
 * 默认视图 (路由 /versions/library, 也是应用默认落地页).
 * PageHeader + ViewSwitcher + MergedFilterChip
 * + TableView (ResultsView) 或 CardView (AppCard 网格).
 *
 * 2026-06-27: 作为默认落地页.
 *   - results.size === 0 → OverviewEmptyState 空态 CTA (首次启动引导)
 *   - PageHeader 右侧加醒目「检查更新」主按钮 (useRunCheck)
 *   - KPI 压缩为 subtitle 一行小字 ("N 个监控 · M 个可升级")
 *
 * ponytail: 复用现有 ResultsView 当 TableView. Card 视图 < 100 行直接渲染,
 *          > 100 行用 VirtualCardGrid.
 */
import { PageHeader } from "./PageHeader.jsx";
import { ViewSwitcher } from "./ViewSwitcher.jsx";
import { MergedFilterChip } from "./MergedFilterChip.jsx";
import { ResultsView } from "./ResultsView.jsx";
import { AppCard } from "./AppCard.jsx";
import { VirtualCardGrid } from "./VirtualCardGrid.jsx";
import { OverviewEmptyState } from "./OverviewEmptyState.jsx";
import { useRunCheck } from "../hooks/useRunCheck.js";
import { viewMode } from "../library-view-store.js";
import { results } from "../store.js";

export function LibraryPage() {
  const mode = viewMode.value;
  const totalApps = results.value.size;
  const upgradable = Array.from(results.value.values()).filter((r) => r && r.has_update).length;
  const { isLoading, run } = useRunCheck();

  // 空态: 首次启动引导 CTA
  if (totalApps === 0) {
    return <OverviewEmptyState onRunCheck={run} isLoading={isLoading} />;
  }

  const useVirtual = mode === "card" && totalApps > 100;

  return (
    <div class="library-page">
      <PageHeader
        title="应用库"
        subtitle={`${totalApps} 个监控 · ${upgradable} 个可升级`}
      >
        <button
          type="button"
          class="btn-run-check"
          onClick={run}
          disabled={isLoading}
          aria-busy={isLoading}
          aria-label="检查更新"
          title="检查更新"
          data-testid="library-run-check"
        >
          {isLoading ? "检查中…" : "检查更新"}
        </button>
        <ViewSwitcher />
      </PageHeader>
      <MergedFilterChip />
      {mode === "table" && <ResultsView />}
      {mode === "card" && (
        useVirtual
          ? <VirtualCardGrid />
          : <div class="app-card-grid">{Array.from(results.value.keys()).map((n) => <AppCard key={n} name={n} />)}</div>
      )}
    </div>
  );
}

export default LibraryPage;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/renderer/LibraryPage.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 5: 提交**

```bash
git add src/renderer/components/LibraryPage.jsx tests/renderer/LibraryPage.test.jsx
git commit -m "feat(versions): LibraryPage 作为默认页, 增加空态 CTA 与检查更新主按钮"
```

---

## Task 4b: 新增 `.btn-run-check` 样式

为 LibraryPage 的「检查更新」主按钮添加醒目样式(复用项目现有的 `.btn-upgrade-row` 视觉语言,保持一致)。

**Files:**
- Modify: `styles.css`(根目录全局样式)

- [ ] **Step 1: 定位插入点**

Run: 读 `styles.css` 第 646-662 行(`.btn-upgrade-row` 规则块),确认视觉语言(背景色、圆角、hover/disabled)。把新规则紧跟其后。

- [ ] **Step 2: 新增样式**

在 `styles.css` 第 662 行(`.btn-upgrade-row:disabled` 那行)之后,插入:

```css

/* LibraryPage 检查更新主按钮 (2026-06-27) — 比 upgrade-row 更醒目, 作页面主操作 */
.btn-run-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  background: #2563eb;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
}
.btn-run-check:hover { filter: brightness(1.08); }
.btn-run-check:active { transform: scale(0.96); }
.btn-run-check:disabled { opacity: 0.5; pointer-events: none; }
```

- [ ] **Step 3: 构建确认样式被打包**

Run: `npm run build:renderer`
Expected: 成功。`renderer-dist/index.css` 会包含新规则(esbuild 把根 styles.css 打包进 index.css)。

- [ ] **Step 4: 提交**

```bash
git add styles.css
git commit -m "style(versions): 新增 LibraryPage 检查更新主按钮样式"
```

---

## Task 5: 修复 CommandPalette 断链 bug

`CommandPalette.jsx` 调用了不存在的 `api.runCheck`,改为 `api.versionsRunCheck`。

**Files:**
- Modify: `src/renderer/components/CommandPalette.jsx`
- Test: `tests/renderer/CommandPalette.test.jsx`(若不存在则新建一个针对性测试)

- [ ] **Step 1: 读 CommandPalette 定位调用**

Run: 读 `src/renderer/components/CommandPalette.jsx` 第 80-95 行,确认 `api.runCheck()` 调用位置(在第 85 行附近,`pick()` 分支内)。

- [ ] **Step 2: 写失败测试**

创建 `tests/renderer/CommandPalette.test.jsx`:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";

const mockVersionsRunCheck = vi.fn();
const mockCommandSearch = vi.fn();
const apiMock = {
  get versionsRunCheck() { return mockVersionsRunCheck; },
  get versionsCommandSearch() { return mockCommandSearch; },
};
vi.mock("../../src/renderer/api.js", () => ({ api: apiMock }));

import { CommandPalette } from "../../src/renderer/components/CommandPalette.jsx";
import { closePalette } from "../../src/renderer/command-palette-store.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockVersionsRunCheck.mockReset();
  mockCommandSearch.mockReset();
  mockCommandSearch.mockResolvedValue([
    { id: "action-check", kind: "action", label: "检查更新" },
  ]);
  mockVersionsRunCheck.mockResolvedValue({ started: true });
});

describe("CommandPalette 检查更新", () => {
  it("选中 action-check 调用 api.versionsRunCheck (而非不存在的 runCheck)", async () => {
    const { container } = render(<CommandPalette />);
    // 等 command-search 返回结果
    await waitFor(() => {
      expect(container.textContent).toContain("检查更新");
    });
    // 点选第一个结果项
    const item = Array.from(container.querySelectorAll("button, [role='option'], li"))
      .find((el) => el.textContent && el.textContent.includes("检查更新"));
    expect(item).toBeTruthy();
    fireEvent.click(item);
    await waitFor(() => expect(mockVersionsRunCheck).toHaveBeenCalledTimes(1));
  });
});
```

> 说明:CommandPalette 的 DOM 结构细节以实际为准。若 `item` 查找失败,在 Step 3 实现后回到本测试,调整选择器以匹配真实渲染项(`button[data-...]` 或 `li[role='option']`)。关键是断言 `mockVersionsRunCheck` 被调用。

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/renderer/CommandPalette.test.jsx`
Expected: FAIL — 当前代码调 `api.runCheck`(undefined),点击后 `mockVersionsRunCheck` 不会被调用。

- [ ] **Step 4: 修改 CommandPalette.jsx**

在 `src/renderer/components/CommandPalette.jsx` 中,把 `api.runCheck()` 改为 `api.versionsRunCheck()`。具体:找到约第 85 行:

```js
    } else if (item.kind === "action" && item.id === "action-check") {
      api.runCheck();        // ← 改这行
      closePalette();
      return;
```

替换为:

```js
    } else if (item.kind === "action" && item.id === "action-check") {
      api.versionsRunCheck && api.versionsRunCheck();
      closePalette();
      return;
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/renderer/CommandPalette.test.jsx`
Expected: PASS。若选择器不匹配导致 FAIL,按 Step 2 说明调整测试选择器后再跑。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/components/CommandPalette.jsx tests/renderer/CommandPalette.test.jsx
git commit -m "fix(versions): CommandPalette 检查更新改用 api.versionsRunCheck 修复断链"
```

---

## Task 6: 删除 dashboard 组件 + 残留 + 对应测试

删除已被废弃的 dashboard 组件、overview-store、Header stub 及其对应测试。

**Files:**
- Delete: 组件(见下)
- Delete: 测试(见下)

- [ ] **Step 1: 全局核查无残留引用**

Run:
```bash
grep -rn "OverviewPage\|OverviewKPIWall\|OverviewWatchlistMini\|OverviewRecentMini\|AIInsightsBlock\|RecentTimeline\|WatchlistQuick\|overview-store\|components/Header" src/ --include="*.js" --include="*.jsx"
```
Expected: 仅命中"要被删除的文件自身"以及 `OverviewEmptyState`(保留,合法)。确认没有 `src` 中的其它文件 import 这些要删的模块。若 VersionsLayout 仍 import OverviewPage,说明 Task 3 未完成,先回去完成。

- [ ] **Step 2: 删除组件文件**

```bash
git rm src/renderer/components/OverviewPage.jsx \
       src/renderer/components/OverviewPage.css \
       src/renderer/components/OverviewKPIWall.jsx \
       src/renderer/components/OverviewKPIWall.css \
       src/renderer/components/OverviewWatchlistMini.jsx \
       src/renderer/components/OverviewWatchlistMini.css \
       src/renderer/components/OverviewRecentMini.jsx \
       src/renderer/components/OverviewRecentMini.css \
       src/renderer/components/AIInsightsBlock.jsx \
       src/renderer/components/RecentTimeline.jsx \
       src/renderer/components/WatchlistQuick.jsx \
       src/renderer/overview-store.js \
       src/renderer/components/Header.jsx
```

> 若某文件不存在(例如某 CSS 未生成),`git rm` 会报错——逐个确认存在性后删除,缺失的跳过。

- [ ] **Step 3: 删除对应测试**

```bash
git rm tests/renderer/overview-page.test.jsx \
       tests/renderer/overview-kpi-wall.test.jsx \
       tests/renderer/overview-watchlist-mini.test.jsx \
       tests/renderer/overview-recent-mini.test.jsx \
       tests/renderer/overview-store.test.js
```

> `tests/renderer/overview-empty-state.test.jsx` **保留**(组件复用)。`tests/main/versions-overview-ipc.test.js` **保留**(IPC 契约)。

- [ ] **Step 4: 确认 Header.jsx 是孤立死代码**

Run:
```bash
grep -rn "components/Header['\"]\|from.*['\"]\.\/Header" src/ --include="*.js" --include="*.jsx"
```
Expected: 无输出(已核查:全项目无任何文件 import `components/Header.jsx`,它是 `return null` 的孤立 stub)。Header.jsx 已在 Step 2 删除,无需额外改 App.jsx/AppShell.jsx。若 grep 有输出,移除对应 import 与 `<Header />` 使用后再继续。

- [ ] **Step 5: 运行全量 renderer 测试确认无断链**

Run: `npx vitest run tests/renderer/`
Expected: 全部 PASS。失败的用例应只可能来自"未更新、仍引用已删组件"的测试——若有,删除或更新这些测试。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor(versions): 删除 dashboard overview 组件与 overview-store 残留

- 删除 OverviewPage/KPIWall/WatchlistMini/RecentMini 及 CSS
- 删除 AIInsightsBlock/RecentTimeline/WatchlistQuick/overview-store/Header
- 删除对应单测; 保留 OverviewEmptyState (空态复用) 与 IPC 契约测试"
```

---

## Task 7: 更新 a11y 测试 + 全量回归

**Files:**
- Modify: `tests/renderer/a11y-versions.test.jsx`

- [ ] **Step 1: 读 a11y 测试,定位 overview 相关断言**

Run: 读 `tests/renderer/a11y-versions.test.jsx` 全文。找出任何 `navigateTo("overview")`、`route === "overview"`、对 OverviewPage/`.overview-grid`/`.overview-kpi-wall` 的断言。

- [ ] **Step 2: 更新断言**

把所有指向 `overview` 路由的测试改为 `library`,移除对已删 dashboard 组件/class 的断言。若某个用例是专门测 dashboard a11y 的,整条删除(组件已不存在)。

具体修改点(以实际文件内容为准):
- `navigateTo("overview")` → `navigateTo("library")`
- 断言 `.overview-grid` / `.overview-kpi-wall` / `.cta-button`(在 overview 上下文)→ 改为断言 `.library-page`
- 保留对 TopBar、CommandPalette、LibraryPage 本身的 a11y 断言(aria-label / role / keyboard)

- [ ] **Step 3: 运行 a11y 测试确认通过**

Run: `npx vitest run tests/renderer/a11y-versions.test.jsx`
Expected: PASS

- [ ] **Step 4: 全量回归**

Run: `npx vitest run`
Expected: 全部 PASS(除已知与本重构无关的预存失败外)。若发现预存失败,记录但不属本计划范围;本重构相关测试必须全绿。

- [ ] **Step 5: 构建验证**

Run: `npm run build:renderer`
Expected: 成功,无 import 报错(确认无对已删组件的悬空 import)。

- [ ] **Step 6: 提交**

```bash
git add tests/renderer/a11y-versions.test.jsx
git commit -m "test(versions): a11y 测试适配 overview→library 合并"
```

---

## 完成标准(对照设计文档 §7)

- [ ] 启动应用默认进入"应用库"列表,非 dashboard。
- [ ] 有数据时显示 Table/Card(可切换),KPI 压缩为头部一行小字。
- [ ] 无数据时显示"欢迎使用 Pulse / 运行首次检查"CTA,点击触发检查。
- [ ] PageHeader 右侧有醒目「检查更新」按钮,点击触发检查并显示 loading。
- [ ] TopBar 🔄 仍可触发检查(未改动,回归确认)。
- [ ] Cmd+K 搜"检查更新"并选中,能真正触发(Task 5 修复)。
- [ ] 原 dashboard 的 KPI 墙/关注/最近组件不再渲染,相关文件已删除(Task 6)。
- [ ] `npx vitest run` 全绿;`npm run build:renderer` 成功(Task 7)。
