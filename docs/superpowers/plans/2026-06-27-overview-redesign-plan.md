# Pulse Overview 重构 + TopBar 死按钮修复 (v2.50) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v2.49 Overview 5 区块改成 3 等宽列 (KPI / 关注 / 最近)，补 TopBar 8 个死按钮 onClick，替换 0/0/0/0 占位为首次启动 CTA。修复 v2.49.0 用户反馈的"界面不喜欢 + 按钮没反应"两个问题。

**Architecture:** 单阶段交付（Overview 子树 + TopBar 接线 + 1 个新 IPC）。Preact + signals + custom CSS，组件级 TDD。新建 4 个组件 + 1 个新 IPC + 改 3 个现有文件。**不重做 Library / Insights / Diagnostics / Settings**（v2.49 主体保留）。

**Tech Stack:** Electron + Preact + @preact/signals, esbuild, vitest, 现有 IPC + state-store。

**Reference:** 设计 spec `docs/superpowers/specs/2026-06-27-overview-redesign-design.md`

## Global Constraints

- **版本管理**: bump 到 2.50.0（v2.49.0 → v2.50.0）
- **Conventional commits**: `feat(versions):` / `fix(versions):` / `chore(release):` / `docs(spec):` / `test(versions):` / `refactor(versions):`
- **TDD**: 每个 task 先写失败测试，跑确认 fail，再写最小实现让它 pass
- **每个 task 完成后立即 commit**（per checklist 第 5 步）
- **ponytail**: 删除多于添加，boring 多于巧妙，最少文件最简代码
- **范围**: 只动 Overview 子树 + TopBar onClick 接线 + 1 个新 IPC。Library / Insights / Diagnostics / Settings 主体保留
- **不删** v2.49 错位的 `TrendSparkline.jsx` / `AIInsightsBlock.jsx`，加 `@deprecated` 注释即可（YAGNI）
- **不引入新依赖**
- **不引入新路由**
- **不重做** Insights 页
- **不重做** CommandPalette
- **组件前缀**: 新组件 PascalCase 文件名（`OverviewKPIWall.jsx` 等）
- **IPC 前缀**: 新增 `versions:run-check`（只 1 个）
- **横切**: 全程 token 化 + aria-label + reduced-motion
- **不修改** detector / worker / notification / bulk-upgrade 业务逻辑
- **不修改** v2.49 已修的 preload.js 6 个 IPC（保持现状）
- **不修改** main / preload / renderer 进程边界

## File Structure

新文件 (5):
- `src/renderer/components/OverviewKPIWall.jsx` — 列 1: 4 数字渐进式
- `src/renderer/components/OverviewWatchlistMini.jsx` — 列 2: 关注列表前 4 + View all
- `src/renderer/components/OverviewRecentMini.jsx` — 列 3: 最近 5 条活动
- `src/renderer/components/OverviewEmptyState.jsx` — 首次启动 CTA 大按钮
- `tests/renderer/overview-redesign.test.jsx` — 集成测试 (4 组件 + OverviewPage)

修改文件 (5):
- `src/renderer/components/OverviewPage.jsx` — 重写: 3 列布局 + EmptyState 切换
- `src/renderer/components/TopBar.jsx` — 8 个死按钮接 onClick
- `preload.js` — 加 1 个 IPC bridge: `versionsRunCheck`
- `src/renderer/api.js` — 加 1 个 wrapper: `versionsRunCheck: pick(overrides, "versionsRunCheck")`
- `src/main/ipc/register-versions-overview.js` — 加 1 个 handler: `versions:run-check` (复用 `check-session.js` 的 `runCheck`)

修改注释 (1):
- `src/renderer/components/TrendSparkline.jsx` — 加 `@deprecated since v2.50` 注释（v2.49 错位, Overview 不用）
- `src/renderer/components/AIInsightsBlock.jsx` — 加 `@deprecated since v2.50` 注释

## Pre-flight (执行每个 task 前必做)

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
git status  # 确认 working tree 干净（除了未提交的 v2.49.1 hotfix 等）
npm test -- --run  # 确认基线测试全过
```

如果基线测试不过, **停止**, 跟用户确认。

---

## Task 1: OverviewKPIWall (列 1: KPI 数字墙)

**Files:**
- Create: `src/renderer/components/OverviewKPIWall.jsx`
- Test: `tests/renderer/overview-kpi-wall.test.jsx`

**Step 1: 写失败测试**

```jsx
// tests/renderer/overview-kpi-wall.test.jsx
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { OverviewKPIWall } from "../../src/renderer/components/OverviewKPIWall.jsx";
import { signal } from "@preact/signals";

describe("OverviewKPIWall", () => {
  let kpis;
  beforeEach(() => {
    kpis = signal({ upgradable: 3, latest: 7, error: 1, total: 11 });
  });

  it("renders 4 KPI numbers with progressive sizing", () => {
    const { container } = render(<OverviewKPIWall kpis={kpis} />);
    const numbers = container.querySelectorAll(".kpi-number");
    expect(numbers).toHaveLength(4);
    // First (upgradable) is largest
    expect(numbers[0]).toHaveClass("kpi-number-large");
    expect(numbers[1]).toHaveClass("kpi-number-small");
  });

  it("displays correct values from signal", () => {
    const { container } = render(<OverviewKPIWall kpis={kpis} />);
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("7");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("11");
  });

  it("updates when kpis signal changes", () => {
    const { container } = render(<OverviewKPIWall kpis={kpis} />);
    kpis.value = { upgradable: 5, latest: 6, error: 0, total: 11 };
    expect(container.textContent).toContain("5");
  });

  it("uses CSS tokens, no hardcoded colors", () => {
    const { container } = render(<OverviewKPIWall kpis={kpis} />);
    const style = container.innerHTML;
    expect(style).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
```

跑测试, 确认 fail: `npm test -- --run tests/renderer/overview-kpi-wall.test.jsx`

**Step 2: 写最小实现**

```jsx
// src/renderer/components/OverviewKPIWall.jsx
import "./OverviewKPIWall.css";

const FIELDS = [
  { key: "upgradable", label: "个可升级", className: "kpi-number-large" },
  { key: "latest", label: "个最新", className: "kpi-number-small" },
  { key: "error", label: "个出错", className: "kpi-number-small" },
  { key: "total", label: "总监控", className: "kpi-number-small" },
];

export function OverviewKPIWall({ kpis }) {
  const data = kpis.value;
  return (
    <div class="overview-kpi-wall" role="list">
      {FIELDS.map(({ key, label, className }) => (
        <div key={key} class="kpi-row" role="listitem">
          <span class={className}>{data[key]}</span>
          <span class="kpi-label">{label}</span>
        </div>
      ))}
    </div>
  );
}
```

```css
/* src/renderer/components/OverviewKPIWall.css */
.overview-kpi-wall { display: flex; flex-direction: column; gap: 12px; }
.kpi-row { display: flex; align-items: baseline; gap: 4px; }
.kpi-number-large { font-size: 32px; font-weight: 700; color: var(--accent-upgradable, #ff9500); line-height: 1; }
.kpi-number-small { font-size: 20px; font-weight: 600; color: var(--text-secondary, #6e6e73); line-height: 1; }
.kpi-label { font-size: 11px; color: var(--text-tertiary, #8e8e93); }
```

**Step 3: 跑测试, 确认 pass**

**Step 4: Commit**

```bash
git add src/renderer/components/OverviewKPIWall.jsx src/renderer/components/OverviewKPIWall.css tests/renderer/overview-kpi-wall.test.jsx
git commit -m "feat(versions): OverviewKPIWall with progressive sizing (T1)"
```

---

## Task 2: OverviewWatchlistMini (列 2: 关注列表)

**Files:**
- Create: `src/renderer/components/OverviewWatchlistMini.jsx`
- Create: `src/renderer/components/OverviewWatchlistMini.css`
- Test: `tests/renderer/overview-watchlist-mini.test.jsx`

**Step 1: 读现有 watchlistStore 形状**

```bash
cat src/renderer/watchlist-store.js
```

确认导出 signal 形状, 写测试 (mock 形状匹配).

**Step 2: 写失败测试**

```jsx
// tests/renderer/overview-watchlist-mini.test.jsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { OverviewWatchlistMini } from "../../src/renderer/components/OverviewWatchlistMini.jsx";

describe("OverviewWatchlistMini", () => {
  it("shows first 4 watched apps, 'View all' link", () => {
    const watchlist = signal([
      { id: "vscode", name: "vscode", status: "upgradable" },
      { id: "chrome", name: "chrome", status: "latest" },
      { id: "iterm2", name: "iterm2", status: "latest" },
      { id: "docker", name: "docker", status: "latest" },
      { id: "node", name: "node", status: "latest" },
      { id: "figma", name: "figma", status: "latest" },
    ]);
    const { container } = render(<OverviewWatchlistMini watchlist={watchlist} onViewAll={() => {}} />);
    const items = container.querySelectorAll(".watchlist-item");
    expect(items).toHaveLength(4);
    expect(container.textContent).toContain("+ 2 个");
  });

  it("shows upgradable badge for items with status='upgradable'", () => {
    const watchlist = signal([{ id: "vscode", name: "vscode", status: "upgradable" }]);
    const { container } = render(<OverviewWatchlistMini watchlist={watchlist} onViewAll={() => {}} />);
    expect(container.querySelector(".watchlist-badge")).toBeTruthy();
  });

  it("shows empty state when watchlist is empty", () => {
    const watchlist = signal([]);
    const { container } = render(<OverviewWatchlistMini watchlist={watchlist} onViewAll={() => {}} />);
    expect(container.textContent).toContain("暂无关注");
  });
});
```

**Step 3: 写最小实现**

```jsx
// src/renderer/components/OverviewWatchlistMini.jsx
import "./OverviewWatchlistMini.css";

const MAX = 4;

export function OverviewWatchlistMini({ watchlist, onViewAll }) {
  const items = watchlist.value.slice(0, MAX);
  const overflow = Math.max(0, watchlist.value.length - MAX);

  if (watchlist.value.length === 0) {
    return (
      <div class="overview-watchlist-mini empty">
        <p>暂无关注 app</p>
        <button onClick={onViewAll} class="link">在 Library 选 app 加关注 →</button>
      </div>
    );
  }

  return (
    <div class="overview-watchlist-mini">
      <div class="header">
        <h3>★ 关注列表</h3>
        <button onClick={onViewAll} class="link">View all →</button>
      </div>
      <ul role="list">
        {items.map((app) => (
          <li key={app.id} class="watchlist-item" role="listitem">
            <span class={`dot dot-${app.status}`} />
            <span class="name">{app.name}</span>
            {app.status === "upgradable" && <span class="watchlist-badge">升</span>}
          </li>
        ))}
        {overflow > 0 && <li class="watchlist-overflow">+ {overflow} 个</li>}
      </ul>
    </div>
  );
}
```

```css
/* src/renderer/components/OverviewWatchlistMini.css */
.overview-watchlist-mini { background: var(--bg-card, #fff); border: 1px solid var(--border, rgba(0,0,0,0.08)); border-radius: 10px; padding: 14px; }
.overview-watchlist-mini .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.overview-watchlist-mini h3 { font-size: 12px; font-weight: 600; margin: 0; }
.overview-watchlist-mini ul { list-style: none; margin: 0; padding: 0; }
.watchlist-item { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--border-subtle, rgba(0,0,0,0.04)); font-size: 12px; }
.watchlist-overflow { font-size: 11px; color: var(--text-tertiary, #8e8e93); padding: 4px 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-upgradable { background: var(--accent-upgradable, #ff9500); }
.dot-latest { background: var(--accent-success, #34c759); }
.dot-error { background: var(--accent-error, #ff3b30); }
.watchlist-badge { font-size: 10px; padding: 1px 5px; background: var(--accent-upgradable, #ff9500); color: #fff; border-radius: 6px; }
.overview-watchlist-mini.empty { text-align: center; padding: 24px 14px; }
.overview-watchlist-mini.empty p { color: var(--text-secondary, #6e6e73); margin: 0 0 8px; }
.link { background: transparent; border: 0; color: var(--accent-primary, #007aff); font-size: 10px; padding: 0; cursor: pointer; }
```

**Step 4: 跑测试, pass**

**Step 5: Commit**

```bash
git add src/renderer/components/OverviewWatchlistMini.jsx src/renderer/components/OverviewWatchlistMini.css tests/renderer/overview-watchlist-mini.test.jsx
git commit -m "feat(versions): OverviewWatchlistMini with first-4 + view-all (T2)"
```

---

## Task 3: OverviewRecentMini (列 3: 最近活动)

**Files:**
- Create: `src/renderer/components/OverviewRecentMini.jsx`
- Create: `src/renderer/components/OverviewRecentMini.css`
- Test: `tests/renderer/overview-recent-mini.test.jsx`

**Step 1: 读现有 track.js 事件源**

```bash
cat src/renderer/track.js | head -60
```

确认事件 shape. 写测试 mock shape.

**Step 2: 写失败测试**

```jsx
// tests/renderer/overview-recent-mini.test.jsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { OverviewRecentMini } from "../../src/renderer/components/OverviewRecentMini.jsx";

describe("OverviewRecentMini", () => {
  it("shows 5 most recent events with relative time", () => {
    const events = signal([
      { type: "upgrade", description: "vscode → 1.85.0", timestamp: Date.now() - 120000 },
      { type: "check", description: "检查完成 · 11 个", timestamp: Date.now() - 300000 },
      { type: "error", description: "slack 失败", timestamp: Date.now() - 3600000 },
      { type: "snooze", description: "figma 静音 7d", timestamp: Date.now() - 10800000 },
      { type: "star", description: "+ iterm2 关注", timestamp: Date.now() - 86400000 },
      { type: "upgrade", description: "node → 20.11", timestamp: Date.now() - 90000000 }, // 应该不显示
    ]);
    const { container } = render(<OverviewRecentMini events={events} onViewAll={() => {}} />);
    const items = container.querySelectorAll(".recent-item");
    expect(items).toHaveLength(5);
    expect(container.textContent).toContain("2m");
    expect(container.textContent).toContain("5m");
    expect(container.textContent).toContain("1h");
  });

  it("shows empty state when no events", () => {
    const events = signal([]);
    const { container } = render(<OverviewRecentMini events={events} onViewAll={() => {}} />);
    expect(container.textContent).toContain("还没有活动");
  });
});
```

**Step 3: 写最小实现**

```jsx
// src/renderer/components/OverviewRecentMini.jsx
import "./OverviewRecentMini.css";

const MAX = 5;
const TYPE_LABELS = { upgrade: "升", check: "查", error: "错", snooze: "静", star: "星" };

function relativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return "昨天";
}

export function OverviewRecentMini({ events, onViewAll }) {
  if (events.value.length === 0) {
    return (
      <div class="overview-recent-mini empty">
        <p>还没有活动</p>
      </div>
    );
  }

  const items = events.value.slice(0, MAX);
  return (
    <div class="overview-recent-mini">
      <div class="header">
        <h3>最近活动</h3>
        <button onClick={onViewAll} class="link">View all →</button>
      </div>
      <ul role="list">
        {items.map((event, i) => (
          <li key={i} class="recent-item" role="listitem">
            <span class={`type type-${event.type}`}>{TYPE_LABELS[event.type] || "·"}</span>
            <span class="description">{event.description}</span>
            <span class="time">{relativeTime(event.timestamp)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```css
/* src/renderer/components/OverviewRecentMini.css */
.overview-recent-mini { background: var(--bg-card, #fff); border: 1px solid var(--border, rgba(0,0,0,0.08)); border-radius: 10px; padding: 14px; }
.overview-recent-mini .header { margin-bottom: 10px; }
.overview-recent-mini h3 { font-size: 12px; font-weight: 600; margin: 0; }
.overview-recent-mini ul { list-style: none; margin: 0; padding: 0; }
.recent-item { display: flex; gap: 6px; padding: 4px 0; font-size: 11px; border-bottom: 1px solid var(--border-subtle, rgba(0,0,0,0.04)); align-items: center; }
.recent-item .type { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: var(--text-secondary, #6e6e73); background: var(--surface-2, #f5f5f7); border-radius: 3px; }
.recent-item .description { flex: 1; }
.recent-item .time { color: var(--text-tertiary, #8e8e93); font-size: 10px; }
.overview-recent-mini.empty { text-align: center; padding: 24px 14px; color: var(--text-secondary, #6e6e73); }
```

**Step 4: 跑测试, pass**

**Step 5: Commit**

```bash
git add src/renderer/components/OverviewRecentMini.jsx src/renderer/components/OverviewRecentMini.css tests/renderer/overview-recent-mini.test.jsx
git commit -m "feat(versions): OverviewRecentMini with last-5 events (T3)"
```

---

## Task 4: OverviewEmptyState (首次启动 CTA)

**Files:**
- Create: `src/renderer/components/OverviewEmptyState.jsx`
- Create: `src/renderer/components/OverviewEmptyState.css`
- Test: `tests/renderer/overview-empty-state.test.jsx`

**Step 1: 写失败测试**

```jsx
// tests/renderer/overview-empty-state.test.jsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { OverviewEmptyState } from "../../src/renderer/components/OverviewEmptyState.jsx";

describe("OverviewEmptyState", () => {
  it("renders CTA button with aria-label", () => {
    const { container } = render(<OverviewEmptyState onRunCheck={() => {}} isLoading={false} />);
    const btn = container.querySelector("button");
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-label")).toMatch(/检查/);
  });

  it("calls onRunCheck when button clicked", () => {
    const onRunCheck = vi.fn();
    const { container } = render(<OverviewEmptyState onRunCheck={onRunCheck} isLoading={false} />);
    fireEvent.click(container.querySelector("button"));
    expect(onRunCheck).toHaveBeenCalledTimes(1);
  });

  it("shows loading state with aria-busy", () => {
    const { container } = render(<OverviewEmptyState onRunCheck={() => {}} isLoading={true} />);
    const btn = container.querySelector("button");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.disabled).toBe(true);
  });
});
```

**Step 2: 写最小实现**

```jsx
// src/renderer/components/OverviewEmptyState.jsx
import "./OverviewEmptyState.css";

export function OverviewEmptyState({ onRunCheck, isLoading }) {
  return (
    <div class="overview-empty-state">
      <div class="empty-content">
        <h2>👋 欢迎使用 Pulse</h2>
        <p>开始监控你的 app 更新情况</p>
        <button
          class="cta-button"
          onClick={onRunCheck}
          disabled={isLoading}
          aria-busy={isLoading}
          aria-label="运行首次检查"
        >
          {isLoading ? "检查中..." : "运行首次检查"}
        </button>
      </div>
    </div>
  );
}
```

```css
/* src/renderer/components/OverviewEmptyState.css */
.overview-empty-state { display: flex; align-items: center; justify-content: center; min-height: 400px; padding: 40px 20px; }
.empty-content { text-align: center; max-width: 360px; }
.empty-content h2 { font-size: 24px; font-weight: 700; margin: 0 0 8px; color: var(--text-primary, #1d1d1f); }
.empty-content p { font-size: 14px; color: var(--text-secondary, #6e6e73); margin: 0 0 24px; }
.cta-button { padding: 12px 32px; background: var(--accent-primary, #007aff); color: #fff; border: 0; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 200ms; }
.cta-button:hover { background: var(--accent-primary-hover, #0066d6); }
.cta-button:disabled { opacity: 0.6; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .cta-button { transition: none; } }
```

**Step 3: 跑测试, pass**

**Step 4: Commit**

```bash
git add src/renderer/components/OverviewEmptyState.jsx src/renderer/components/OverviewEmptyState.css tests/renderer/overview-empty-state.test.jsx
git commit -m "feat(versions): OverviewEmptyState with CTA button (T4)"
```

---

## Task 5: OverviewPage 重写 (3 列布局) + 新 IPC

**Files:**
- Modify: `src/renderer/components/OverviewPage.jsx` (重写, 从 5 区块 → 3 列)
- Create: `src/renderer/components/OverviewPage.css` (新, 3 列 Grid)
- Modify: `preload.js` (加 1 个 IPC bridge)
- Modify: `src/renderer/api.js` (加 1 个 wrapper)
- Modify: `src/main/ipc/register-versions-overview.js` (加 1 个 handler)
- Test: `tests/renderer/overview-page.test.jsx` (集成测试)
- Modify: `src/renderer/components/TrendSparkline.jsx` (加 @deprecated)
- Modify: `src/renderer/components/AIInsightsBlock.jsx` (加 @deprecated)

**Step 1: 读 OverviewPage.jsx 现状**

```bash
cat src/renderer/components/OverviewPage.jsx
cat src/main/ipc/register-versions-overview.js
```

**Step 2: 加新 IPC handler (main 进程)**

在 `src/main/ipc/register-versions-overview.js` 末尾加:

```javascript
// v2.50 (T5): run check via TopBar/Overview CTA
ipcMain.handle("versions:run-check", async () => {
  // 复用 check-session.js 的 runCheck 逻辑
  const { runCheck } = require("../check-session");
  try {
    await runCheck();
    return { started: true };
  } catch (e) {
    return { started: false, error: String(e.message || e) };
  }
});
```

(具体 require 路径跟 `check-session.js` 实际位置一致, 实施时确认)

**Step 3: 暴露 IPC bridge (preload.js)**

在 `preload.js` 的 `contextBridge.exposeInMainWorld("api", { ... })` block 末尾加:

```javascript
// v2.50 (T5): TopBar/Overview CTA 触发检查
versionsRunCheck: () => ipcRenderer.invoke("versions:run-check"),
```

**Step 4: 加 API wrapper (api.js)**

在 `src/renderer/api.js` 的 `pick` 调用列表里加:

```javascript
versionsRunCheck: pick(overrides, "versionsRunCheck"),
```

**Step 5: 加 @deprecated 注释**

`src/renderer/components/TrendSparkline.jsx` 顶部:
```javascript
// @deprecated since v2.50 — v2.49 错位 (Overview 不用). 保留供 Insights 页后续复用. 不要在 OverviewPage 引用.
```

`src/renderer/components/AIInsightsBlock.jsx` 顶部:
```javascript
// @deprecated since v2.50 — Q1.3 用户不用 AI 摘要. 保留供 Insights 页后续复用. 不要在 OverviewPage 引用.
```

**Step 6: 写集成测试**

```jsx
// tests/renderer/overview-page.test.jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { OverviewPage } from "../../src/renderer/components/OverviewPage.jsx";

// Mock api
vi.mock("../../src/renderer/api.js", () => ({
  api: {
    versionsOverviewKpis: vi.fn(() => Promise.resolve({ upgradable: 3, latest: 7, error: 1, total: 11 })),
    versionsOverviewWatchlist: vi.fn(() => Promise.resolve([{ id: "vscode", name: "vscode", status: "upgradable" }])),
    versionsOverviewRecent: vi.fn(() => Promise.resolve([{ type: "upgrade", description: "test", timestamp: Date.now() }])),
  },
}));

describe("OverviewPage integration", () => {
  it("shows EmptyState when state.total === 0", () => {
    // 需要 mock stateStore.total
    const { container } = render(<OverviewPage />);
    // 看是否含 CTA 按钮
  });

  it("shows 3-column layout when state.total > 0", () => {
    const { container } = render(<OverviewPage />);
    const grid = container.querySelector(".overview-grid");
    expect(grid).toBeTruthy();
    expect(grid.children).toHaveLength(3);
  });
});
```

**Step 7: 重写 OverviewPage.jsx**

```jsx
// src/renderer/components/OverviewPage.jsx
// NOTE: 实施时需 DISCOVER 以下导入路径 (plan 写的是推断, 实际可能不同):
//   - `api.js` 的实际路径 (e.g. ./api.js vs ../api.js vs ../../api.js)
//   - 路由跳转函数 (plan 假设 routeStore.navigateTo, 实际可能叫 navigate/routeTo 之类, 实施前 grep 确认)
//   - 状态 signal 源 (plan 假设 stateStore.value.total, 实际可能是 store.value.total 或 readState())
//   路径不对就改 import, 逻辑不变.

import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { api } from "../api.js";  // DISCOVER: 实际路径
import { OverviewKPIWall } from "./OverviewKPIWall.jsx";
import { OverviewWatchlistMini } from "./OverviewWatchlistMini.jsx";
import { OverviewRecentMini } from "./OverviewRecentMini.jsx";
import { OverviewEmptyState } from "./OverviewEmptyState.jsx";
// DISCOVER: stateStore 实际导出位置 (可能是 store.js / state-store.js / store/state.js)
import { routeStore } from "../route-store.js";  // DISCOVER: 实际路径
import "./OverviewPage.css";

const kpisSignal = signal({ upgradable: 0, latest: 0, error: 0, total: 0 });
const watchlistSignal = signal([]);
const recentSignal = signal([]);

export function OverviewPage() {
  const [loaded, setLoaded] = useState(false);
  const [isLoadingCheck, setIsLoadingCheck] = useState(false);
  // DISCOVER: total 的读法 (stateStore.value.total / store.value.total / readState().total)
  const total = 11;  // placeholder, 实施时替换

  useEffect(() => {
    if (total === 0) return;
    Promise.all([
      api.versionsOverviewKpis().then((d) => (kpisSignal.value = d)),
      api.versionsOverviewWatchlist().then((d) => (watchlistSignal.value = d)),
      api.versionsOverviewRecent().then((d) => (recentSignal.value = d)),
    ]).finally(() => setLoaded(true));
  }, [total]);

  const runCheck = async () => {
    setIsLoadingCheck(true);
    try {
      await api.versionsRunCheck();
    } finally {
      setTimeout(() => setIsLoadingCheck(false), 2000);
    }
  };

  if (total === 0) {
    return <OverviewEmptyState onRunCheck={runCheck} isLoading={isLoadingCheck} />;
  }

  // DISCOVER: 实际跳转函数. 下面两行是 plan 假设, 实施时按实际函数名替换.
  // routeStore.navigateTo 实际可能叫 navigate / routeTo / go
  return (
    <div class="overview-page">
      <div class="overview-grid">
        <OverviewKPIWall kpis={kpisSignal} />
        <OverviewWatchlistMini watchlist={watchlistSignal} onViewAll={() => routeStore.navigateTo("/versions/library?filter=watched")} />
        <OverviewRecentMini events={recentSignal} onViewAll={() => routeStore.navigateTo("/versions/settings#recent")} />
      </div>
    </div>
  );
}
```

```css
/* src/renderer/components/OverviewPage.css */
.overview-page { padding: 12px 16px; }
.overview-grid { display: grid; grid-template-columns: 1fr 1.4fr 1.4fr; gap: 12px; }
@media (max-width: 1280px) { .overview-grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .overview-grid > * { animation: none; transition: none; } }
```

**Step 8: 跑测试, pass**

**Step 9: Commit**

```bash
git add src/renderer/components/OverviewPage.jsx src/renderer/components/OverviewPage.css src/renderer/components/TrendSparkline.jsx src/renderer/components/AIInsightsBlock.jsx preload.js src/renderer/api.js src/main/ipc/register-versions-overview.js tests/renderer/overview-page.test.jsx
git commit -m "feat(versions): OverviewPage 3-col layout + run-check IPC (T5)"
```

---

## Task 6: TopBar 8 个死按钮接 onClick

**Files:**
- Modify: `src/renderer/components/TopBar.jsx` (8 个按钮接 onClick)
- Test: `tests/renderer/topbar-buttons.test.jsx`

**Step 1: 读 TopBar.jsx 现状**

```bash
cat src/renderer/components/TopBar.jsx
```

**Step 2: 写失败测试**

```jsx
// tests/renderer/topbar-buttons.test.jsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { TopBar } from "../../src/renderer/components/TopBar.jsx";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    versionsRunCheck: vi.fn(() => Promise.resolve({ started: true })),
    versionsExportJson: vi.fn(() => Promise.resolve({ ok: true })),
    versionsExportCsv: vi.fn(() => Promise.resolve({ ok: true })),
    versionsOpenReleaseNotes: vi.fn(() => Promise.resolve({ ok: true })),
    navigateTo: vi.fn(),
  },
}));

describe("TopBar button wiring", () => {
  it("'检查更新' button calls versionsRunCheck", () => {
    const { api } = require("../../src/renderer/api.js");
    const { container } = render(<TopBar />);
    const btn = container.querySelector('[data-testid="topbar-run-check"]');
    fireEvent.click(btn);
    expect(api.versionsRunCheck).toHaveBeenCalled();
  });

  it("'AI 任务' button navigates to /versions/insights", () => {
    const { api } = require("../../src/renderer/api.js");
    const { container } = render(<TopBar />);
    fireEvent.click(container.querySelector('[data-testid="topbar-ai-tasks"]'));
    expect(api.navigateTo).toHaveBeenCalledWith("/versions/insights");
  });

  it("'通知' button navigates to /versions/diagnostics", () => {
    const { api } = require("../../src/renderer/api.js");
    const { container } = render(<TopBar />);
    fireEvent.click(container.querySelector('[data-testid="topbar-notification"]'));
    expect(api.navigateTo).toHaveBeenCalledWith("/versions/diagnostics");
  });

  // ... 类似测试 4 个 overflow 菜单项 + Release Notes
});
```

**Step 3: 改 TopBar.jsx**

NOTE: 实施时需 DISCOVER:
- 路由跳转函数 (routeStore.navigateTo 实际可能叫 navigate / routeTo / go). 实施前 `grep -n "navigate\|routeTo" src/renderer/route-store.js` 确认
- 3 个 IPC 是否已存在: `versionsExportJson` / `versionsExportCsv` / `versionsOpenReleaseNotes`. 实施前 `grep "versionsExport\|versionsOpenReleaseNotes" preload.js src/renderer/api.js`. 不存在则**跳过** (按 spec §2 YAGNI, 菜单项 onClick 改成空操作 + console.log, 后续 v2.51 再补)
- toast 调用 (复用什么, plan 假设 toastStore, 实施前 grep 确认)

在每个按钮上加 `onClick` 和 `data-testid`:

```jsx
// 检查更新
<button onClick={() => api.versionsRunCheck()} data-testid="topbar-run-check">检查更新</button>

// AI 任务
<button onClick={() => api.navigateTo("/versions/insights")} data-testid="topbar-ai-tasks">AI 任务</button>

// 通知
<button onClick={() => api.navigateTo("/versions/diagnostics")} data-testid="topbar-notification">通知</button>

// ··· 溢出菜单
<button onClick={() => api.navigateTo("/versions/diagnostics")} data-testid="topbar-menu-diagnostics">诊断</button>
<button onClick={() => api.navigateTo("/versions/library?filter=watched")} data-testid="topbar-menu-watchlist">关注列表</button>
<button onClick={() => api.navigateTo("/versions/settings#reminders")} data-testid="topbar-menu-reminders">Reminders</button>
<button onClick={() => api.navigateTo("/versions/settings#recent")} data-testid="topbar-menu-recent">Recent</button>
<button onClick={() => api.versionsExportJson()} data-testid="topbar-menu-export-json">导出 JSON</button>
<button onClick={() => api.versionsExportCsv()} data-testid="topbar-menu-export-csv">导出 CSV</button>
<button onClick={() => api.versionsOpenReleaseNotes()} data-testid="topbar-menu-release-notes">Release Notes</button>
```

**Step 4: 跑测试, pass**

**Step 5: 跑全量 e2e**

```bash
npm test -- --run
```

**Step 6: Commit + bump version + release notes**

```bash
git add src/renderer/components/TopBar.jsx tests/renderer/topbar-buttons.test.jsx
git commit -m "fix(versions): wire TopBar 8 dead buttons to onClick (T6)"

# bump version
# 编辑 package.json: 2.49.0 → 2.50.0

# 写 release notes
cat > .release-notes-2.50.0.md <<'EOF'
# v2.50.0 — Overview 重构 + TopBar 死按钮修复

## 修复
- **TopBar 8 个按钮接 onClick**: 检查更新 / AI 任务 / 通知 / 诊断 / 关注列表 / Reminders / Recent / 导出 JSON / 导出 CSV / Release Notes
- **首次启动 CTA**: 0/0/0/0 占位 → "运行首次检查" 大按钮

## 重构
- **Overview 5 区块 → 3 等宽列**: KPI 数字墙 / 关注列表 / 最近活动 (移除 Trend + AI Insights, Q1.3 用户不用)
- **KPI 渐进式排版**: 可升级 32px 橙 / 其他 20px 灰

## 新增
- `OverviewKPIWall` / `OverviewWatchlistMini` / `OverviewRecentMini` / `OverviewEmptyState` 4 个新组件
- IPC `versions:run-check` (复用 check-session.js 现有逻辑)

## YAGNI
- 保留 v2.49 错位的 `TrendSparkline.jsx` / `AIInsightsBlock.jsx` 文件, 加 @deprecated 注释, 供后续 Insights 页复用
EOF

git add package.json .release-notes-2.50.0.md
git commit -m "chore(release): bump 2.49.0 → 2.50.0 (overview redesign + topbar fix)"
```

**Step 7: Push + Build 双包 + GitHub release**

(按 v2.48/v2.49 流程, 用户确认后执行)

---

## Post-flight

- 跑全量测试 `npm test -- --run` 确认无回归
- 视觉验收 (用户用 v2.50.0 app, 看 3 列布局 + TopBar 8 按钮全部有响应)
- Build macOS 双包 (x64 + arm64) + 上传 GitHub release
- 写 lessons learned 到 `docs/lessons-learned/v2.50-overview-redesign.md` (可选, 跟 v2.49 流程一致)

---

## 自审 checklist (每个 task 后)

- [ ] 跑了测试, 全过
- [ ] Lint 干净
- [ ] 没引入新依赖
- [ ] 没改 v2.49 已修的 preload.js 6 个 IPC
- [ ] 用了 CSS token, 没用硬编码颜色
- [ ] 加了 aria-label / role / aria-busy
- [ ] reduced-motion 兜底
- [ ] commit message 走 conventional commits 风格
- [ ] 立即 commit 了, 没堆到 task 末尾

---

**总时间估算**: 半天 (4-5 小时), 跟 spec §10 一致.
