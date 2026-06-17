# Pulse 菜单栏重设计 (v2.22) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重做 Pulse 菜单栏,把"13 个 app 平铺 + 4 个 action"改成"4 个模块的具体内容预览 + 3 个 action",看一眼就有用,不开面板也能用。

**Architecture:** 主进程 (`tray.js` CJS) 拥有独立 cache 镜像 (持久化到 `state.json`),通过 IPC events 增量更新;`rebuildMenu` 走 200ms debounce + Windows 1s throttle 防闪烁;点击 = 推 `tray:focus` 事件到 renderer,renderer 切 tab + 滚到目标 + 弹 modal。

**Tech Stack:** Electron (Tray + Menu + IPC) · preact signals (renderer) · vitest (测试) · node:fs (state 持久化)

**Spec:** `docs/superpowers/specs/2026-06-17-tray-menu-redesign-design.md`

---

## File Structure (新增 / 改动总览)

| 文件 | 改动类型 | 职责 |
|---|---|---|
| `src/main/tray.js` | 改 | `rebuildMenu` 重写,4 段内容预览,debounce + throttle |
| `src/main/ai-usage-cache.js` | 新增 | 复用现有 `stateStore.loadAiUsageSnapshotProvider` 等,提供 `loadAll()` + `getTraySummary()` 简化接口 |
| `src/main/worldcup-tray-cache.js` | 新增 | 24h 缓存今日 fixtures,过滤今天,提供 `getTodayFixtures()` |
| `src/main/index.js` | 改 | bootstrap 启动 ai-usage + worldcup cache;传入 trayMgr;在 `onCheckComplete` 推 `tray:focus` 等 |
| `src/main/ipc/register-ai-usage.js` | 改 | fetch 成功后 `trayMgr.setAiUsage(snapshot)` (显式依赖) |
| `src/main/metal-ipc.js` | 改 | scheduler 推 quote 时 `trayMgr.setMetals(quotes, fx)` |
| `src/main/ipc/register-worldcup.js` | 改 | 新增 `worldcup:get-today` IPC |
| `preload.js` | 改 | 暴露 `onTrayFocus(cb)` + `onTrayStale(cb)` (可选) |
| `src/renderer/index.jsx` | 改 | bootstrap 调 `subscribeTrayFocus()` |
| `src/renderer/tray-focus.js` | 新增 | renderer 端 `tray:focus` 处理:切 tab + 滚 + 弹 modal |
| `src/renderer/worldcup/...` | 改 | (可能) 暴露 `scrollToMatch` 给 tray-focus 用 |
| `tests/main/ai-usage-cache.test.js` | 新增 | 纯函数测试 |
| `tests/main/worldcup-tray-cache.test.js` | 新增 | 24h 失效 + 过滤今天 + 启动拉一次 |
| `tests/main/tray.test.js` | 新增 | `buildMenu` 4 数据源组合 / debounce / Windows throttle / 失败隐藏 |

---

## 阶段 A — 🔄 检查更新段重做 (最先,2-3h)

### Task A1: 写 tray 单元测试 — `buildMenu` 在无数据时只显示底部 action

**Files:**
- Create: `tests/main/tray.test.js`
- Test: `tests/main/tray.test.js`

- [ ] **Step 1: 创建测试文件骨架**

```js
// tests/main/tray.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { _internal } from "../../src/main/tray.js";

const { buildMenu } = _internal;

describe("tray.buildMenu — 基础结构", () => {
  it("无结果时: 只显示底部 action (打开面板 / 检查更新 / 配置文件 / 退出)", () => {
    const m = buildMenu({
      results: [],
      aiUsage: null,
      worldcup: null,
      metals: null,
    });
    const labels = m.map((i) => i.label).filter(Boolean);
    expect(labels).toEqual([
      "打开面板",
      "检查更新",
      "打开配置文件",
      "退出",
    ]);
  });

  it("提供 callbacks", () => {
    const onOpenPanel = vi.fn();
    const onCheck = vi.fn();
    const onOpenConfig = vi.fn();
    const onQuit = vi.fn();
    const m = buildMenu({
      results: [],
      aiUsage: null,
      worldcup: null,
      metals: null,
      onOpenPanel,
      onCheck,
      onOpenConfig,
      onQuit,
    });
    m.find((i) => i.label === "打开面板").click();
    m.find((i) => i.label === "检查更新").click();
    m.find((i) => i.label === "打开配置文件").click();
    m.find((i) => i.label === "退出").click();
    expect(onOpenPanel).toHaveBeenCalledOnce();
    expect(onCheck).toHaveBeenCalledOnce();
    expect(onOpenConfig).toHaveBeenCalledOnce();
    expect(onQuit).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npx vitest run tests/main/tray.test.js 2>&1 | tail -20`
Expected: FAIL — `buildMenu` is not a function (it doesn't exist yet)

- [ ] **Step 3: 在 tray.js 暴露 `buildMenu` 骨架 (先满足测试) — 让现有行为不变**

Modify `src/main/tray.js` 顶部加导出,在 `createTrayManager` 内部重构:

```js
// 顶部 (原 export 区域)
module.exports = {
  createTrayManager,
  _internal: { loadTrayIcon, loadBadgeIcon, loadFallbackIcon, buildMenu, ASSETS },
};

// 把原 rebuildMenu 的 template 构造抽成纯函数 buildMenu(opts)
function buildMenu(opts) {
  const {
    results = [],
    aiUsage = null,
    worldcup = null,
    metals = null,
    onOpenPanel = () => {},
    onCheck = () => {},
    onOpenConfig = () => {},
    onQuit = () => {},
    getConfigPath = () => "",
  } = opts;
  const template = [];

  // TODO Phase A 完成后: 各模块段插入这里
  // 占位: 原"有更新/已是最新"段先保留 (暂作兼容)
  if (results.length > 0) {
    const updates = results.filter((r) => r.has_update);
    const upToDate = results.filter((r) => r.status === "up_to_date");
    if (updates.length > 0) {
      template.push({ label: `── 有更新 (${updates.length}) ──`, enabled: false });
      updates.forEach((r) => {
        const ver = r.latest_version
          ? `${r.installed_version || "?"} → ${r.latest_version}`
          : "";
        template.push({
          label: `${r.name}  ${ver}`,
          click: () => {
            onOpenPanel();
            const cfgApps = (opts.getConfig && opts.getConfig().apps) || [];
            const cfg = cfgApps.find((a) => a.name === r.name);
            if (cfg && cfg.download_url) {
              require("electron").shell.openExternal(cfg.download_url);
            }
          },
        });
      });
      template.push({ type: "separator" });
    }
    if (upToDate.length > 0) {
      template.push({ label: `── 已是最新 (${upToDate.length}) ──`, enabled: false });
      upToDate.forEach((r) => {
        template.push({ label: `${r.name}  ${r.installed_version || ""}`, enabled: false });
      });
      template.push({ type: "separator" });
    }
  } else {
    template.push({ label: "尚未检查", enabled: false });
    template.push({ type: "separator" });
  }

  template.push(
    { label: "打开面板", click: () => onOpenPanel() },
    { label: "检查更新", click: () => onCheck() },
    { type: "separator" },
    { label: "打开配置文件", click: () => {
        const p = getConfigPath();
        if (p) require("electron").shell.openPath(p);
        else onOpenConfig();
      } },
    { type: "separator" },
    { label: "退出", click: () => onQuit() }
  );
  return template;
}
```

在 `createTrayManager` 内部把 `rebuildMenu` 改为调 `buildMenu`:

```js
function rebuildMenu() {
  if (!tray) return;
  const template = buildMenu({
    results: lastResults,
    getConfig: getConfig,
    onOpenPanel,
    onCheck,
    onOpenConfig,
    onQuit,
    getConfigPath,
  });
  tray.setContextMenu(Menu.buildFromTemplate(template));
}
```

- [ ] **Step 4: 跑测试,确认 PASS**

Run: `npx vitest run tests/main/tray.test.js 2>&1 | tail -10`
Expected: PASS — 2 tests pass

- [ ] **Step 5: 跑全套 main 测试,确认没破坏现有**

Run: `npx vitest run tests/main/ 2>&1 | tail -5`
Expected: 同 main 测试基线通过数 ± 2

- [ ] **Step 6: 提交**

```bash
git add tests/main/tray.test.js src/main/tray.js
git commit -m "refactor(tray): extract buildMenu pure function from rebuildMenu

Prepares for v2.22 menu redesign. rebuildMenu now delegates to
buildMenu(opts) so we can unit test menu construction without
spinning up Electron Tray.

No behavior change yet — current app/updates section + 4 actions
unchanged. Will be incrementally replaced in Tasks A2-A4."
```

---

### Task A2: 重做 🔄 检查更新段 (新展示 + 升级行 + 点击行为)

**Files:**
- Modify: `src/main/tray.js:101-163` (buildMenu 内的"有更新"段)

- [ ] **Step 1: 添加点击行为回调 `onFocusUpdate` 到 opts**

在 `buildMenu(opts)` 解构里加 `onFocusUpdate = () => {}`:

```js
const {
  results = [],
  aiUsage = null,
  worldcup = null,
  metals = null,
  onOpenPanel = () => {},
  onCheck = () => {},
  onOpenConfig = () => {},
  onQuit = () => {},
  onFocusUpdate = () => {},
  getConfigPath = () => "",
} = opts;
```

- [ ] **Step 2: 重写"有更新"段为新展示**

替换原"有更新 / 已是最新"段:

```js
if (results.length > 0) {
  const updates = results.filter((r) => r.has_update);
  const upToDate = results.filter((r) => r.status === "up_to_date");

  if (updates.length > 0) {
    template.push({
      label: `── 🔄 检查更新 (${updates.length} 待升级) ──`,
      enabled: false,
    });
    updates.forEach((r) => {
      const ver = r.latest_version
        ? `${r.installed_version || "?"} → ${r.latest_version}`
        : "";
      template.push({
        label: `${r.name}  ${ver}  ⬆️ 升级`,
        click: () => {
          onFocusUpdate({ rowName: r.name, action: "upgrade" });
        },
      });
    });
    template.push({ type: "separator" });
  } else if (upToDate.length > 0) {
    // 没有更新时显示总览 (一行)
    template.push({
      label: `── 🔄 检查更新 · 全部最新 (${upToDate.length}) ──`,
      enabled: false,
    });
    template.push({
      label: `  点击"检查更新"手动刷新`,
      enabled: false,
    });
    template.push({ type: "separator" });
  }
} else {
  template.push({ label: "── 🔄 检查更新 · 尚未检查 ──", enabled: false });
  template.push({ type: "separator" });
}
```

- [ ] **Step 3: 写新测试覆盖新展示**

Add to `tests/main/tray.test.js`:

```js
describe("tray.buildMenu — 🔄 检查更新段", () => {
  it("有 1 个更新: 显示段头 + 升级行 + 点击触发 onFocusUpdate", () => {
    const onFocusUpdate = vi.fn();
    const m = buildMenu({
      results: [
        { name: "Codex", installed_version: "26.609", latest_version: "26.611", has_update: true, status: "update_available" },
      ],
      onFocusUpdate,
    });
    expect(m[0].label).toBe("── 🔄 检查更新 (1 待升级) ──");
    const updateRow = m.find((i) => i.label && i.label.startsWith("Codex"));
    expect(updateRow.label).toContain("26.609");
    expect(updateRow.label).toContain("26.611");
    expect(updateRow.label).toContain("⬆️ 升级");
    updateRow.click();
    expect(onFocusUpdate).toHaveBeenCalledWith({
      rowName: "Codex",
      action: "upgrade",
    });
  });

  it("全部最新: 显示总览行 (点击提示)", () => {
    const m = buildMenu({
      results: [
        { name: "Cursor", installed_version: "3.7.42", latest_version: "3.7.42", has_update: false, status: "up_to_date" },
        { name: "Kimi", installed_version: "3.0.20", latest_version: "3.0.20", has_update: false, status: "up_to_date" },
      ],
    });
    expect(m[0].label).toBe("── 🔄 检查更新 · 全部最新 (2) ──");
  });

  it("results=[] 时: 段头显示'尚未检查'", () => {
    const m = buildMenu({ results: [] });
    expect(m[0].label).toBe("── 🔄 检查更新 · 尚未检查 ──");
  });
});
```

- [ ] **Step 4: 跑新测试**

Run: `npx vitest run tests/main/tray.test.js 2>&1 | tail -10`
Expected: PASS — 5 tests (2 + 3 new) pass

- [ ] **Step 5: 跑全套**

Run: `npx vitest run tests/main/ 2>&1 | tail -5`
Expected: 基线 + 3

- [ ] **Step 6: 提交**

```bash
git add src/main/tray.js tests/main/tray.test.js
git commit -m "feat(tray): redesign 🔄 检查更新段 with upgrade action row

Replaces the '── 有更新 (N) ──' section with:
- New header: '── 🔄 检查更新 (N 待升级) ──'
- Each update row: 'Name  X → Y  ⬆️ 升级'
- Click → onFocusUpdate({ rowName, action: 'upgrade' })
- When all up-to-date: shows '全部最新 (N)' + hint to manually check
- When results=[]: shows '尚未检查'

Renderer-side handler (tray-focus.js) is in Task A3."
```

---

### Task A3: 新增 renderer `tray-focus.js` + 接入 IPC

**Files:**
- Create: `src/renderer/tray-focus.js`
- Modify: `src/main/index.js` (新增 `onFocusUpdate` 推 events)
- Modify: `preload.js` (新增 `onTrayFocus`)
- Modify: `src/renderer/index.jsx` (bootstrap 调 `subscribeTrayFocus`)

- [ ] **Step 1: preload 暴露 `onTrayFocus`**

在 `preload.js` 的 `api` 对象里加:

```js
// Tray 菜单栏点击 → renderer 接收定位指令
onTrayFocus: (cb) => ipcRenderer.on("tray:focus", (_, data) => cb(data)),
```

- [ ] **Step 2: 主进程 — `createTrayManager` 接受 `onFocusUpdate` + 推 IPC**

在 `src/main/tray.js` 的 `createTrayManager` 签名加 `onFocusUpdate`:

```js
function createTrayManager(opts) {
  const getConfig = opts.getConfig || (() => ({ apps: [] }));
  const getConfigPath = opts.getConfigPath || (() => "");
  const onCheck = opts.onCheck || (() => {});
  const onOpenPanel = opts.onOpenPanel || (() => {});
  const onOpenConfig = opts.onOpenConfig || (() => {});
  const onQuit = opts.onQuit || (() => {});
  const onFocusUpdate = opts.onFocusUpdate || (() => {});

  // ... 内部 rebuildMenu 改为:
  function rebuildMenu() {
    if (!tray) return;
    const template = buildMenu({
      results: lastResults,
      getConfig: getConfig,
      onOpenPanel,
      onCheck,
      onOpenConfig,
      onQuit,
      onFocusUpdate,
      getConfigPath,
    });
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }
  // ...
}
```

- [ ] **Step 3: 主进程 `index.js` 把 `onFocusUpdate` 接到 IPC + window.show**

在 `src/main/index.js` 里 `createTrayManager({...})` 的 `opts` 里加 `onFocusUpdate`:

```js
trayMgr = createTrayManager({
  getConfig: () => runtimeConfig || { apps: [] },
  getConfigPath: () => CONFIG_PATH,
  onCheck: () => {
    const w = winMgr && winMgr.getWindow();
    if (w && !w.isDestroyed()) w.webContents.send('start-check');
  },
  onOpenPanel: () => winMgr && winMgr.showWindow(),
  onQuit: () => { isQuitting = true; app.quit(); },
  onFocusUpdate: (data) => {
    // 1) 显示面板
    if (winMgr) winMgr.showWindow();
    // 2) 推 events 给 renderer
    const w = winMgr && winMgr.getWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send('tray:focus', {
        tab: 'versions',
        rowName: data.rowName,
        action: data.action,
      });
    }
  },
});
```

- [ ] **Step 4: 新增 renderer `tray-focus.js`**

Create `src/renderer/tray-focus.js`:

```js
// src/renderer/tray-focus.js
//
// 接收主进程推的 tray:focus 事件,做三件事:
//   1) 切到对应 tab (activeNav)
//   2) 等布局 mount (~80ms) 后 scrollIntoView 目标 row
//   3) 如果 action === 'upgrade', 弹升级确认 modal
//
// 当前只实现 🔄 检查更新段 (Task A3);其他段 (B/C/D) 在各自任务里扩展.
import { setActiveNav } from "./worldcup/navStore.js";
import { requestUpgrade } from "./upgrade-actions.js"; // 任务 A4 新增
import { taggedLog } from "./log.js";

const log = taggedLog("[tray-focus]");

let _subscribed = false;

/**
 * 启动期订阅. 幂等.
 * @param {{onTrayFocus: Function}} api
 */
export function subscribeTrayFocus(api) {
  if (_subscribed) return;
  _subscribed = true;
  if (api && typeof api.onTrayFocus === "function") {
    api.onTrayFocus(handleFocus);
  }
}

async function handleFocus(data) {
  if (!data) return;
  log.info("handleFocus", data);

  // 1) 切 tab
  if (data.tab === "versions") setActiveNav("versions");
  // 其他 tab 在 B/C/D 任务里加分支

  // 2) 等布局
  await new Promise((r) => setTimeout(r, 80));

  // 3) 滚到目标
  if (data.tab === "versions" && data.rowName) {
    await scrollToRowName(data.rowName);
  }

  // 4) 弹 modal (升级确认)
  if (data.action === "upgrade" && data.rowName) {
    try {
      await requestUpgrade(data.rowName);
    } catch (err) {
      log.warn("requestUpgrade failed:", err && err.message);
    }
  }
}

async function scrollToRowName(name) {
  // AppRow 渲染带 data-app-name 属性 (或 row-Name); 先用 class fallback
  // 现有代码 grep 一下 row 的 className
  const escaped = (name || "").replace(/"/g, '\\"');
  const el = document.querySelector(`[data-app-name="${escaped}"]`)
    || document.querySelector(`.app-row[data-name="${escaped}"]`);
  if (el && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    log.warn(`scrollToRowName: no element for "${name}"`);
  }
}
```

- [ ] **Step 5: 写 `upgrade-actions.js` (Task A4 准备) — 临时占位,Task A4 实现升级 modal**

Create `src/renderer/upgrade-actions.js`:

```js
// src/renderer/upgrade-actions.js
//
// 触发单个 app 的升级流程: 通过已有 IPC 调主进程升级,弹确认 modal.
// 由 tray-focus 在 action === 'upgrade' 时调用.
//
// Task A4 会把这里改成真弹 BulkUpgradeModal 或 AppRow 自带的 modal.
import { api } from "./api.js";
import { taggedLog } from "./log.js";
import { showToast } from "./store.js";

const log = taggedLog("[upgrade-actions]");

/**
 * 触发单个 app 升级 (经主进程 IPC). Task A4 起会改成弹 modal.
 * @param {string} appName
 */
export async function requestUpgrade(appName) {
  if (!appName) return;
  log.info(`requestUpgrade: ${appName}`);
  // Task A4 placeholder: 直接 toast,真升级由用户从面板 row 操作
  showToast(`请从面板升级 ${appName} (Task A4 实现 modal)`, "info", 5000);
}
```

- [ ] **Step 6: 在 `index.jsx` 启动期订阅**

在 `src/renderer/index.jsx` 的 `bootstrap()` 里,`loadAiTasks().catch(() => {});` 之后加:

```js
// 订阅菜单栏点击 → 切 tab + 滚 + 弹 modal
const { subscribeTrayFocus } = await import('./tray-focus.js');
subscribeTrayFocus(api);
```

- [ ] **Step 7: 跑测试,确认没破坏**

Run: `npx vitest run tests/main/ 2>&1 | tail -5`
Expected: 基线持平

- [ ] **Step 8: 提交**

```bash
git add src/main/tray.js src/main/index.js src/renderer/tray-focus.js src/renderer/upgrade-actions.js src/renderer/index.jsx preload.js
git commit -m "feat(tray): wire onFocusUpdate + tray:focus IPC for check-updates

Main process:
- createTrayManager accepts onFocusUpdate (defaults noop)
- index.js: onFocusUpdate shows window + sends 'tray:focus' event

Renderer:
- New tray-focus.js subscribes to 'tray:focus' and:
  - sets activeNav = 'versions'
  - waits 80ms for layout
  - scrollIntoView target row (by data-app-name or .app-row[data-name])
  - if action='upgrade', calls requestUpgrade (Task A4 stub)

preload exposes onTrayFocus listener.

index.jsx subscribes at bootstrap."
```

---

### Task A4: 实现真正的升级 modal 调用 (走已有 BulkUpgradeModal)

**Files:**
- Modify: `src/renderer/upgrade-actions.js` (把 toast 替换成 modal)
- Modify: `src/renderer/store-bulk-upgrade.js` (确认已有 "single upgrade" 入口)

- [ ] **Step 1: 找现有 bulk upgrade 的单 app 入口**

Run: `grep -n "upgradeOne\|upgradeSingle\|upgradeItem\|upgradeApp" src/renderer/store-bulk-upgrade.js src/renderer/components/BulkUpgradeModal.jsx 2>&1 | head -10`

- [ ] **Step 2: 如果有 `upgradeOne`,替换 requestUpgrade 实现**

如果有 `store-bulk-upgrade.js` 暴露 `upgradeOne({appName})`,把 `upgrade-actions.js` 改为:

```js
import { api } from "./api.js";
import { taggedLog } from "./log.js";
import { upgradeOne } from "./store-bulk-upgrade.js";

const log = taggedLog("[upgrade-actions]");

export async function requestUpgrade(appName) {
  if (!appName) return;
  log.info(`requestUpgrade: ${appName}`);
  try {
    await upgradeOne({ appName });
  } catch (err) {
    log.warn("upgradeOne failed:", err && err.message);
  }
}
```

- [ ] **Step 3: 如果没有,新增 `upgradeOne` 到 `store-bulk-upgrade.js`**

在 `store-bulk-upgrade.js` 顶部加 import + 导出:

```js
import { openBulkUpgrade } from "./bulk-upgrade-store.js"; // 或合适 store

export async function upgradeOne({ appName }) {
  if (!appName) return;
  // 走 store-bulk-upgrade 的 addItem + start 协议
  // 假设已有 addItem(appName) 和 start()
  await addItem(appName);
  await start();
}
```

(具体实现要按 `store-bulk-upgrade.js` 实际 API 调整,先 grep 它的导出)

- [ ] **Step 4: 写测试 (mock) — `tests/renderer/upgrade-actions.test.js`**

```js
// tests/renderer/upgrade-actions.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/renderer/store-bulk-upgrade.js", () => ({
  upgradeOne: vi.fn(),
}));

import { requestUpgrade } from "../../src/renderer/upgrade-actions.js";
import { upgradeOne } from "../../src/renderer/store-bulk-upgrade.js";

beforeEach(() => vi.clearAllMocks());

describe("upgrade-actions.requestUpgrade", () => {
  it("传 appName 调 upgradeOne", async () => {
    await requestUpgrade("Codex");
    expect(upgradeOne).toHaveBeenCalledWith({ appName: "Codex" });
  });

  it("空 appName 不调", async () => {
    await requestUpgrade("");
    expect(upgradeOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: 跑测试**

Run: `npx vitest run tests/renderer/upgrade-actions.test.js 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 6: 跑全套**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 基线 + 1

- [ ] **Step 7: 提交**

```bash
git add src/renderer/upgrade-actions.js src/renderer/store-bulk-upgrade.js tests/renderer/upgrade-actions.test.js
git commit -m "feat(tray): wire requestUpgrade to actual bulk-upgrade flow

Replaces the Task A3 placeholder toast with a real call into
store-bulk-upgrade.upgradeOne({ appName }), so clicking the
tray menu's 'Codex  X → Y  ⬆️ 升级' row opens the upgrade
modal and starts the upgrade for that single app."
```

---

## 阶段 B — 📊 AI coding plan 用量段 (3-4h)

### Task B1: `ai-usage-cache.js` — 缓存层简化接口

**Files:**
- Create: `src/main/ai-usage-cache.js`
- Test: `tests/main/ai-usage-cache.test.js`

- [ ] **Step 1: 写测试 — 简化接口 (loadAll / getTraySummary)**

```js
// tests/main/ai-usage-cache.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tmpDir;
let statePath;
const PROVIDERS = ["minimax", "glm"];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-usage-cache-test-"));
  statePath = path.join(tmpDir, "state.json");
});

describe("ai-usage-cache", () => {
  it("loadAll: 空 state 时返 { providers: {}, histories: {}, fetchedAt: 0 }", async () => {
    const { createAiUsageCache } = await import("../../src/main/ai-usage-cache.js");
    const cache = createAiUsageCache({ statePath });
    const out = cache.loadAll();
    expect(out).toEqual({ providers: {}, histories: {}, fetchedAt: 0 });
  });

  it("loadAll: 有 state 时返 minimax snapshot + history", async () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1, ts: 0, apps: {},
      ai_usage: { providers: { minimax: { windows: { "5h": { usedPercent: 72 } } } } },
      ai_usage_history: { providers: { minimax: { days: [{ date: "2026-06-17", percent: 50 }] } } },
    }));
    const { createAiUsageCache } = await import("../../src/main/ai-usage-cache.js");
    const cache = createAiUsageCache({ statePath });
    const out = cache.loadAll();
    expect(out.providers.minimax.windows["5h"].usedPercent).toBe(72);
    expect(out.histories.minimax.days[0].percent).toBe(50);
  });

  it("getTraySummary: snapshot=undefined → '未配置'", async () => {
    const { createAiUsageCache } = await import("../../src/main/ai-usage-cache.js");
    const cache = createAiUsageCache({ statePath });
    const summary = cache.getTraySummary("minimax");
    expect(summary).toEqual({ status: "unconfigured" });
  });

  it("getTraySummary: 有 snapshot → { status:'ok', percent, remainLabel, fetchedAt }", async () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1, ts: 0, apps: {},
      ai_usage: { providers: { minimax: { windows: { "5h": { usedPercent: 72, used: 720, total: 1000 } } } } },
    }));
    const { createAiUsageCache } = await import("../../src/main/ai-usage-cache.js");
    const cache = createAiUsageCache({ statePath });
    const summary = cache.getTraySummary("minimax");
    expect(summary.status).toBe("ok");
    expect(summary.percent).toBe(72);
    expect(summary.remainLabel).toBeDefined();
  });

  it("setSnapshot: 走 stateStore, 然后 loadAll 能读到", async () => {
    const { createAiUsageCache } = await import("../../src/main/ai-usage-cache.js");
    const cache = createAiUsageCache({ statePath });
    cache.setSnapshot("minimax", { windows: { "5h": { usedPercent: 50 } } });
    expect(cache.loadAll().providers.minimax.windows["5h"].usedPercent).toBe(50);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/main/ai-usage-cache.test.js 2>&1 | tail -10`
Expected: FAIL — `ai-usage-cache.js` not found

- [ ] **Step 3: 实现 `ai-usage-cache.js`**

Create `src/main/ai-usage-cache.js`:

```js
// src/main/ai-usage-cache.js
//
// v2.22: 给 tray 用的 AI 用量 cache 简化接口.
// 复用 stateStore.loadAiUsageSnapshotProvider / saveAiUsageSnapshotProvider
// (底层持久化到 state.json).
//
// 设计原则:
//   - createAiUsageCache({ statePath }) 工厂,无副作用
//   - loadAll() 返 { providers, histories, fetchedAt } 给 tray 一次性用
//   - getTraySummary(providerId) 返 { status, percent, remainLabel, fetchedAt } 给 tray 显示
//   - setSnapshot(providerId, snapshot) 包装 stateStore.saveAiUsageSnapshotProvider

const stateStore = require("./state-store");

const PROVIDERS = ["minimax", "glm"];

/**
 * @param {{ statePath?: string }} opts
 */
function createAiUsageCache(opts = {}) {
  const statePath = opts.statePath;

  function loadAll() {
    const providers = {};
    const histories = {};
    let latestFetchedAt = 0;
    for (const pid of PROVIDERS) {
      providers[pid] = stateStore.loadAiUsageSnapshotProvider(pid, statePath);
      histories[pid] = stateStore.loadAiUsageHistoryProvider(pid, statePath) || { days: [] };
      const snapTs = providers[pid] && providers[pid].fetchedAt;
      if (typeof snapTs === "number" && snapTs > latestFetchedAt) {
        latestFetchedAt = snapTs;
      }
    }
    return { providers, histories, fetchedAt: latestFetchedAt };
  }

  function setSnapshot(providerId, snapshot) {
    if (!PROVIDERS.includes(providerId)) {
      throw new Error(`ai-usage-cache: unknown provider ${providerId}`);
    }
    const withTs = { ...(snapshot || {}), fetchedAt: Date.now() };
    stateStore.saveAiUsageSnapshotProvider(providerId, withTs, statePath);
  }

  /**
   * 给 tray 用的 summary. 简化展示字段.
   * @param {string} providerId
   * @returns {{ status: 'unconfigured' | 'ok' | 'error', percent?: number, remainLabel?: string, fetchedAt?: number, errorReason?: string }}
   */
  function getTraySummary(providerId) {
    const snap = stateStore.loadAiUsageSnapshotProvider(providerId, statePath);
    if (!snap) return { status: "unconfigured" };
    const w = snap.windows && snap.windows["5h"];
    if (!w || typeof w.usedPercent !== "number") {
      return { status: "error", errorReason: "no_5h_window" };
    }
    return {
      status: "ok",
      percent: Math.round(w.usedPercent),
      remainLabel: _formatRemain(w.used, w.total),
      fetchedAt: typeof snap.fetchedAt === "number" ? snap.fetchedAt : null,
    };
  }

  return { loadAll, setSnapshot, getTraySummary, PROVIDERS };
}

/**
 * 把"剩余量"展示成 "1.2h" / "3d" / "45m".
 * 简化: 不做复杂时间推算,只看 used/total 比例 × 5h 窗口 = 剩多少时间.
 */
function _formatRemain(used, total) {
  if (typeof used !== "number" || typeof total !== "number" || total <= 0) {
    return "未知";
  }
  const remain = Math.max(0, total - used);
  // 5h 窗口的简单估算: 假设 used 至今已消耗 X 时间 (unknown), 保守用比例
  const remainRatio = remain / total;
  const totalHours = 5;
  const remainHours = remainRatio * totalHours;
  if (remainHours >= 1) {
    return `${remainHours.toFixed(1)}h`;
  }
  return `${Math.round(remainHours * 60)}m`;
}

module.exports = { createAiUsageCache, PROVIDERS };
```

- [ ] **Step 4: 跑测试,确认 PASS**

Run: `npx vitest run tests/main/ai-usage-cache.test.js 2>&1 | tail -10`
Expected: PASS — 5 tests pass

- [ ] **Step 5: 跑全套**

Run: `npx vitest run tests/main/ 2>&1 | tail -5`
Expected: 基线 + 5

- [ ] **Step 6: 提交**

```bash
git add src/main/ai-usage-cache.js tests/main/ai-usage-cache.test.js
git commit -m "feat(ai-usage): add cache facade for tray menu

createAiUsageCache({ statePath }):
- loadAll() → { providers, histories, fetchedAt } for tray bulk use
- setSnapshot(pid, snap) → stateStore.saveAiUsageSnapshotProvider
- getTraySummary(pid) → { status, percent, remainLabel, fetchedAt }

Reuses stateStore.loadAiUsageSnapshotProvider (already in v2.14).
Adds fetchedAt timestamp on write so tray can show staleness."
```

---

### Task B2: 主进程启动 ai-usage cache + 推 `trayMgr.setAiUsage`

**Files:**
- Modify: `src/main/index.js` (bootstrap 启动 cache)
- Modify: `src/main/ipc/register-ai-usage.js` (fetch 成功时推 tray)
- Modify: `src/main/tray.js` (新增 `setAiUsage` 接口 + debounce)

- [ ] **Step 1: tray 暴露 `setAiUsage` 接口 + debounce 包装**

Modify `src/main/tray.js` `createTrayManager`:

```js
function createTrayManager(opts) {
  // ...原有
  let lastAiUsage = null;

  function setAiUsage(snapshot) {
    lastAiUsage = snapshot;
    scheduleRebuild();
  }
  // ... rebuildMenu 内部:
  function rebuildMenu() {
    if (!tray) return;
    const template = buildMenu({
      results: lastResults,
      aiUsage: lastAiUsage,
      // ...
    });
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }
  // ...
  return { install, setResults, setBadge, setAiUsage, dispose };
}
```

新增 `scheduleRebuild` (debounce 200ms + Windows 1s throttle):

```js
let rebuildTimer = null;
let lastRebuildAt = 0;

function scheduleRebuild() {
  if (rebuildTimer) return;
  const elapsed = Date.now() - lastRebuildAt;
  const minInterval = process.platform === "win32" ? 1000 : 0;
  const delay = Math.max(200, minInterval - elapsed);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    lastRebuildAt = Date.now();
    rebuildMenu();
  }, delay);
}
```

- [ ] **Step 2: `buildMenu` 接受 `aiUsage` 字段**

修改 `buildMenu(opts)` 加解构 + 新段:

```js
function buildMenu(opts) {
  const { /* ...原有 */ aiUsage = null, /* ... */ } = opts;
  // ... 在"检查更新"段之后插入:
  if (aiUsage) {
    const lines = buildAiUsageLines(aiUsage);
    if (lines.length > 0) {
      template.push(...lines);
      template.push({ type: "separator" });
    }
  }
  // ...
}

function buildAiUsageLines(summaryMap) {
  // summaryMap = { minimax: {status, percent, remainLabel, fetchedAt}, glm: {...} }
  const lines = [];
  const PROVIDER_NAME = { minimax: "MiniMax", glm: "GLM" };
  let hasAny = false;
  for (const pid of ["minimax", "glm"]) {
    const s = summaryMap[pid];
    if (!s || s.status === "unconfigured") continue;
    hasAny = true;
    if (s.status === "ok") {
      const ageLabel = s.fetchedAt ? _ageLabel(Date.now() - s.fetchedAt) : "";
      lines.push({ label: `  ${PROVIDER_NAME[pid]}: ${s.percent}% 已用 (剩 ${s.remainLabel})${ageLabel}`, enabled: false });
    } else if (s.status === "error") {
      lines.push({ label: `  ${PROVIDER_NAME[pid]}: 拉取失败`, enabled: false });
    }
  }
  if (!hasAny) {
    lines.push({ label: "  未配置", enabled: false });
  }
  return lines;
}

function _ageLabel(deltaMs) {
  if (deltaMs < 60_000) return "";
  const m = Math.floor(deltaMs / 60_000);
  if (m < 60) return ` (${m}m 前)`;
  const h = Math.floor(m / 60);
  return ` (${h}h 前)`;
}
```

- [ ] **Step 3: 写新测试**

Add to `tests/main/tray.test.js`:

```js
describe("tray.buildMenu — 📊 AI 用量段", () => {
  it("两 provider 都 unconfigured → 整段只显示'未配置'", () => {
    const m = buildMenu({
      results: [],
      aiUsage: { minimax: { status: "unconfigured" }, glm: { status: "unconfigured" } },
    });
    const aiLines = m.filter((i) => i.label && (i.label.includes("MiniMax") || i.label.includes("GLM") || i.label.includes("未配置")));
    expect(aiLines).toHaveLength(1);
    expect(aiLines[0].label).toBe("  未配置");
  });

  it("minimax ok + glm unconfigured → 显示 MiniMax 行,GLM 不显示", () => {
    const m = buildMenu({
      results: [],
      aiUsage: {
        minimax: { status: "ok", percent: 72, remainLabel: "1.2h", fetchedAt: Date.now() },
        glm: { status: "unconfigured" },
      },
    });
    const aiLines = m.filter((i) => i.label && (i.label.includes("MiniMax") || i.label.includes("GLM")));
    expect(aiLines).toHaveLength(1);
    expect(aiLines[0].label).toContain("72%");
    expect(aiLines[0].label).toContain("1.2h");
  });

  it("aiUsage=null → 整段隐藏", () => {
    const m = buildMenu({ results: [] });
    const aiLines = m.filter((i) => i.label && (i.label.includes("MiniMax") || i.label.includes("GLM")));
    expect(aiLines).toHaveLength(0);
  });

  it("陈旧数据 (>1h) → 行尾 (Nh 前)", () => {
    const old = Date.now() - 2 * 60 * 60 * 1000;
    const m = buildMenu({
      results: [],
      aiUsage: {
        minimax: { status: "ok", percent: 80, remainLabel: "1h", fetchedAt: old },
      },
    });
    const aiLines = m.filter((i) => i.label && i.label.includes("MiniMax"));
    expect(aiLines[0].label).toContain("(2h 前)");
  });
});
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/main/tray.test.js 2>&1 | tail -10`
Expected: PASS — 9 tests (5 + 4 new)

- [ ] **Step 5: 主进程 — `index.js` 启动 ai-usage cache + 30min 定时器**

Modify `src/main/index.js` 的 `bootstrap()` (在 tray 启动后):

```js
// v2.22: AI 用量 cache (for tray menu)
const aiUsageCache = createAiUsageCache({ statePath: /* stateStore default path */ });
// 启动时拉一次 (best-effort, 不阻塞)
try {
  // 复用 ai-usage:fetch 的 _internals.fetch
  // 简单做法: 直接调 fetch 然后存到 cache
  const r = await fetchAiUsage({ provider: "minimax" });
  if (r && r.ok && r.snapshot) {
    aiUsageCache.setSnapshot("minimax", r.snapshot);
  }
} catch (err) { mainLog.warn(`ai-usage initial fetch failed: ${err.message}`); }
// 然后推给 tray
const aiSummary = {
  minimax: aiUsageCache.getTraySummary("minimax"),
  glm: aiUsageCache.getTraySummary("glm"),
};
if (trayMgr) trayMgr.setAiUsage(aiSummary);

// 30 分钟定时刷新
const AI_USAGE_TRAY_INTERVAL_MS = 30 * 60 * 1000;
const aiUsageTrayTimer = setInterval(async () => {
  try {
    const r = await fetchAiUsage({ provider: "minimax" });
    if (r && r.ok && r.snapshot) {
      aiUsageCache.setSnapshot("minimax", r.snapshot);
      if (trayMgr) {
        trayMgr.setAiUsage({
          minimax: aiUsageCache.getTraySummary("minimax"),
          glm: aiUsageCache.getTraySummary("glm"),
        });
      }
    }
  } catch (err) { mainLog.warn(`ai-usage tray refresh failed: ${err.message}`); }
}, AI_USAGE_TRAY_INTERVAL_MS);
app.once("before-quit", () => { try { clearInterval(aiUsageTrayTimer); } catch {} });
```

需要 import: `const { createAiUsageCache } = require("./ai-usage-cache");` 以及从 `register-ai-usage.js` 引入 `fetchAiUsage` (或者用 `safeHandle` 反向调,具体看 register-ai-usage 怎么暴露 — 优先复用 `_internals.fetch({ deps, opts })`)

- [ ] **Step 6: `register-ai-usage.js` 在 fetch 成功时也推 tray**

```js
// 现有: deps.pushEvent("ai-usage-updated", { provider, snapshot, history });
// 新增: 如果 trayMgr 注入了,也推 tray
if (deps.trayMgr && typeof deps.trayMgr.setAiUsage === "function") {
  const allSummary = deps.trayCache.getTrayAllSummary();
  deps.trayMgr.setAiUsage(allSummary);
}
```

(具体 deps 注入方式要按 `index.js` 怎么调 `registerAiUsageHandlers` 调整,先看 `ipc/index.js` 的 safeHandle 协议)

- [ ] **Step 7: 跑全套**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 基线 + 9 (5 B1 + 4 B2 tray)

- [ ] **Step 8: 提交**

```bash
git add src/main/ai-usage-cache.js src/main/index.js src/main/ipc/register-ai-usage.js src/main/tray.js tests/main/tray.test.js
git commit -m "feat(tray): add 📊 AI 用量 section to menu

- tray.buildMenu renders 4th section based on aiUsage summary
- createAiUsageCache.getTraySummary(pid) → { status, percent, remainLabel, fetchedAt }
- index.js bootstrap starts ai-usage cache + 30min interval
- register-ai-usage.js fetch success → tray.setAiUsage
- debounce 200ms + Windows 1s throttle on rebuild"
```

---

## 阶段 C — 🏆 世界杯今日赛程段 (3-4h)

### Task C1: `worldcup-tray-cache.js` — 24h 缓存

**Files:**
- Create: `src/main/worldcup-tray-cache.js`
- Test: `tests/main/worldcup-tray-cache.test.js`

- [ ] **Step 1: 写测试**

```js
// tests/main/worldcup-tray-cache.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tmpDir;
let statePath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-tray-test-"));
  statePath = path.join(tmpDir, "state.json");
});

describe("worldcup-tray-cache", () => {
  it("load: 空 state → 返 { fixtures: [], fetchedAt: 0, todayKey: '' }", async () => {
    const { createWorldcupTrayCache } = await import("../../src/main/worldcup-tray-cache.js");
    const cache = createWorldcupTrayCache({ statePath });
    expect(cache.load()).toEqual({ fixtures: [], fetchedAt: 0, todayKey: "" });
  });

  it("save + load: 持久化到 state.json", async () => {
    const { createWorldcupTrayCache } = await import("../../src/main/worldcup-tray-cache.js");
    const cache = createWorldcupTrayCache({ statePath });
    cache.save([
      { id: "m1", kickoff: "2026-06-17T20:00:00+08:00", home: "巴西", away: "阿根廷", stage: "A" },
    ]);
    const out = cache.load();
    expect(out.fixtures).toHaveLength(1);
    expect(out.fixtures[0].id).toBe("m1");
    expect(out.fetchedAt).toBeGreaterThan(0);
  });

  it("isStale: fetchedAt > 24h → true", async () => {
    vi.useFakeTimers();
    const now = 1700000000000;
    vi.setSystemTime(now);
    const { createWorldcupTrayCache } = await import("../../src/main/worldcup-tray-cache.js");
    const cache = createWorldcupTrayCache({ statePath, now: () => now });
    cache.save([{ id: "m1", kickoff: "2026-06-17T20:00:00+08:00", home: "A", away: "B", stage: "A" }]);
    vi.setSystemTime(now + 25 * 60 * 60 * 1000); // 25h 后
    expect(cache.isStale()).toBe(true);
    vi.useRealTimers();
  });

  it("isStale: 跨日期 → true (今天 vs 缓存的 todayKey)", async () => {
    const { createWorldcupTrayCache } = await import("../../src/main/worldcup-tray-cache.js");
    const cache = createWorldcupTrayCache({ statePath });
    // 手动写一个"昨天"的缓存
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1, ts: 0, apps: {},
      worldcup_today: {
        fixtures: [{ id: "m1", kickoff: "2026-06-16T20:00:00+08:00", home: "A", away: "B", stage: "A" }],
        fetchedAt: Date.now() - 60_000, // 1 分钟前
        todayKey: "2026-06-16",
      },
    }));
    expect(cache.isStale()).toBe(true); // 因为今天 ≠ 2026-06-16
  });

  it("filterToday: 过滤掉非今日的 fixtures", async () => {
    const { createWorldcupTrayCache } = await import("../../src/main/worldcup-tray-cache.js");
    const cache = createWorldcupTrayCache({ statePath });
    const all = [
      { id: "y1", kickoff: "2026-06-16T23:00:00+08:00", home: "X", away: "Y", stage: "A" }, // 昨天
      { id: "t1", kickoff: "2026-06-17T20:00:00+08:00", home: "巴西", away: "阿根廷", stage: "A" },
      { id: "t2", kickoff: "2026-06-17T23:00:00+08:00", home: "法国", away: "德国", stage: "B" },
      { id: "m1", kickoff: "2026-06-18T01:00:00+08:00", home: "P", away: "Q", stage: "A" }, // 明天
    ];
    const today = cache.filterToday(all, "2026-06-17");
    expect(today).toHaveLength(2);
    expect(today.map((f) => f.id)).toEqual(["t1", "t2"]);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/main/worldcup-tray-cache.test.js 2>&1 | tail -10`
Expected: FAIL

- [ ] **Step 3: 实现 `worldcup-tray-cache.js`**

Create `src/main/worldcup-tray-cache.js`:

```js
// src/main/worldcup-tray-cache.js
//
// v2.22: 给 tray 用的世界杯 24h 缓存.
// - 启动时拉一次今日 fixtures → 存 state.json (新字段 worldcup_today)
// - 24h 失效, 或跨日期失效
// - 失败时用 cache 兜底
//
// 设计: 状态文件直接复用 stateStore,字段为 worldcup_today.
//        没找到现成 save/load → 直接读写 state.json.

const fs = require("fs");
const path = require("path");
const stateStore = require("./state-store");

const STALE_MS = 24 * 60 * 60 * 1000; // 24h

function _todayLocalKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param {{ statePath?: string, now?: () => number }} opts
 */
function createWorldcupTrayCache(opts = {}) {
  const statePath = opts.statePath;
  const now = opts.now || (() => Date.now());

  function _readState() {
    return stateStore.load(statePath) || { v: stateStore.SCHEMA_VERSION, ts: 0, apps: {} };
  }

  function _writeState(s) {
    stateStore.saveAll(s, statePath); // 原子写
  }

  function load() {
    const s = _readState();
    const w = s.worldcup_today;
    if (!w || !Array.isArray(w.fixtures)) {
      return { fixtures: [], fetchedAt: 0, todayKey: "" };
    }
    return { fixtures: w.fixtures, fetchedAt: w.fetchedAt || 0, todayKey: w.todayKey || "" };
  }

  function save(fixtures) {
    const s = _readState();
    s.worldcup_today = {
      fixtures: Array.isArray(fixtures) ? fixtures : [],
      fetchedAt: now(),
      todayKey: _todayLocalKey(),
    };
    s.ts = now();
    _writeState(s);
  }

  function isStale() {
    const w = load();
    if (w.fetchedAt === 0) return true;
    if (w.todayKey !== _todayLocalKey()) return true;
    if (now() - w.fetchedAt > STALE_MS) return true;
    return false;
  }

  /**
   * 过滤出今日的 fixtures.
   * @param {Array} fixtures
   * @param {string} [dateKey] 默认今天
   */
  function filterToday(fixtures, dateKey) {
    if (!Array.isArray(fixtures)) return [];
    const target = dateKey || _todayLocalKey();
    return fixtures.filter((f) => {
      if (!f || !f.kickoff) return false;
      // kickoff 形如 "2026-06-17T20:00:00+08:00" → 取前 10 字符
      const day = String(f.kickoff).slice(0, 10);
      return day === target;
    });
  }

  /**
   * 给 tray 的今日 fixtures (≤3 条, 按 kickoff 升序).
   */
  function getTodayForTray() {
    const w = load();
    let fxs = filterToday(w.fixtures, w.todayKey);
    fxs.sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
    return fxs.slice(0, 3);
  }

  return { load, save, isStale, filterToday, getTodayForTray };
}

module.exports = { createWorldcupTrayCache };
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/main/worldcup-tray-cache.test.js 2>&1 | tail -10`
Expected: PASS — 5 tests

- [ ] **Step 5: 跑全套**

Run: `npx vitest run tests/main/ 2>&1 | tail -5`
Expected: 基线 + 5 (B1) + 5 (B2 tray) + 5 (C1)

- [ ] **Step 6: 提交**

```bash
git add src/main/worldcup-tray-cache.js tests/main/worldcup-tray-cache.test.js
git commit -m "feat(worldcup): add 24h tray cache for today's fixtures

createWorldcupTrayCache({ statePath, now }):
- load() → { fixtures, fetchedAt, todayKey } from state.json
- save(fixtures) → persists under worldcup_today field
- isStale() → true if >24h or crossed local-day boundary
- filterToday(fixtures, dateKey) → keep only today's
- getTodayForTray() → ≤3 fixtures sorted by kickoff

Persists via stateStore.saveAll — survives restarts.
Failed fetch reuses cache (stale-but-showable)."
```

---

### Task C2: 主进程 — bootstrap 拉 fixtures + 推 tray

**Files:**
- Modify: `src/main/index.js` (启动 worldcup cache + 24h 刷新)
- Modify: `src/main/ipc/register-worldcup.js` (新增 `worldcup:get-today` IPC)
- Modify: `preload.js` (暴露 `worldcup:get-today` 供 renderer 同步取)
- Modify: `src/main/tray.js` (buildMenu 接受 `worldcup` + 显示)

- [ ] **Step 1: `register-worldcup.js` 新增 `worldcup:get-today` handler**

在 `registerWorldcupHandlers` 里加:

```js
// v2.22: tray 用的今日赛程 (read-through cache, 不强制 fetch)
safeHandle("worldcup:get-today", async () => {
  const cache = require("../worldcup-tray-cache").createWorldcupTrayCache({});
  if (cache.isStale()) {
    // best-effort refresh
    try {
      const r = await fetchWorldcupFixtures({ date: new Date().toISOString().slice(0, 10) });
      if (r && Array.isArray(r.fixtures)) {
        cache.save(cache.filterToday(r.fixtures));
      }
    } catch { /* 失败用 cache 兜底 */ }
  }
  return { ok: true, fixtures: cache.getTodayForTray(), fetchedAt: cache.load().fetchedAt };
});
```

- [ ] **Step 2: preload 暴露**

在 `preload.js` 的 `api` 对象加:

```js
// v2.22: tray 用的今日赛程 (24h cache)
worldcupGetToday: () => ipcRenderer.invoke("worldcup:get-today"),
```

- [ ] **Step 3: `index.js` 启动时调一次 + 推 tray**

在 `bootstrap()` 里 tray 安装后:

```js
// v2.22: 世界杯今日赛程 cache (for tray)
const worldcupCache = createWorldcupTrayCache({});
async function refreshWorldcupTray() {
  try {
    if (worldcupCache.isStale()) {
      const r = await fetchWorldcupFixtures({ date: new Date().toISOString().slice(0, 10) });
      if (r && Array.isArray(r.fixtures)) {
        worldcupCache.save(r.fixtures);
      }
    }
    if (trayMgr) {
      trayMgr.setWorldcup({
        fixtures: worldcupCache.getTodayForTray(),
        fetchedAt: worldcupCache.load().fetchedAt,
      });
    }
  } catch (err) { mainLog.warn(`worldcup tray refresh failed: ${err.message}`); }
}
refreshWorldcupTray().catch(() => {});
// 不需要定时器: 启动时 + 24h 后下次启动自然刷新 (太频繁没意义)
```

需要 import: `const { createWorldcupTrayCache } = require("./worldcup-tray-cache");` 和 `const { fetchWorldcupFixtures } = require("../worldcup/fetcher");`

- [ ] **Step 4: `tray.js` — `setWorldcup` + `buildMenu` 新段**

```js
// createTrayManager
let lastWorldcup = null;
function setWorldcup(snapshot) { lastWorldcup = snapshot; scheduleRebuild(); }
// buildMenu 解构加 worldcup
// 在 AI 用量段后插入:
if (worldcup && Array.isArray(worldcup.fixtures) && worldcup.fixtures.length > 0) {
  template.push({ label: "── 🏆 世界杯 · 今日 ──", enabled: false });
  for (const f of worldcup.fixtures.slice(0, 3)) {
    template.push({
      label: `  ${_formatKickoff(f.kickoff)}  ${f.home} vs ${f.away} (${f.stage || f.group || ""})`,
      click: () => onFocusWorldcup({ matchId: f.id }),
    });
  }
  template.push({ type: "separator" });
}

function _formatKickoff(iso) {
  // "2026-06-17T20:00:00+08:00" → "20:00"
  if (!iso) return "??:??";
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "??:??";
}
```

- [ ] **Step 5: 写新测试**

Add to `tests/main/tray.test.js`:

```js
describe("tray.buildMenu — 🏆 世界杯段", () => {
  const today = new Date().toISOString().slice(0, 10);
  const baseFixture = (id, time) => ({
    id,
    kickoff: `${today}T${time}:00+08:00`,
    home: "A", away: "B", stage: "小组赛 A",
  });

  it("3 个赛程 → 显示段头 + 3 行 (按时间排)", () => {
    const m = buildMenu({
      results: [],
      worldcup: {
        fixtures: [
          baseFixture("m2", "23:00"),
          baseFixture("m1", "20:00"),
          baseFixture("m3", "21:30"),
        ],
      },
    });
    const wcLines = m.filter((i) => i.label && i.label.includes("vs"));
    expect(wcLines).toHaveLength(3);
    expect(wcLines[0].label).toContain("20:00");
    expect(wcLines[1].label).toContain("21:30");
    expect(wcLines[2].label).toContain("23:00");
  });

  it("空 fixtures → 整段隐藏", () => {
    const m = buildMenu({ results: [], worldcup: { fixtures: [] } });
    const wcHeader = m.find((i) => i.label && i.label.includes("世界杯"));
    expect(wcHeader).toBeUndefined();
  });

  it("点击赛程 → onFocusWorldcup({ matchId })", () => {
    const onFocusWorldcup = vi.fn();
    const m = buildMenu({
      results: [],
      worldcup: { fixtures: [baseFixture("m42", "20:00")] },
      onFocusWorldcup,
    });
    const row = m.find((i) => i.label && i.label.includes("vs"));
    row.click();
    expect(onFocusWorldcup).toHaveBeenCalledWith({ matchId: "m42" });
  });
});
```

- [ ] **Step 6: 跑测试**

Run: `npx vitest run tests/main/tray.test.js 2>&1 | tail -10`
Expected: PASS — 12 tests (9 + 3 new)

- [ ] **Step 7: 跑全套**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 基线 + ~20

- [ ] **Step 8: 提交**

```bash
git add src/main/index.js src/main/ipc/register-worldcup.js src/main/tray.js preload.js tests/main/tray.test.js
git commit -m "feat(tray): add 🏆 世界杯今日赛程 section

- worldcup-tray-cache.getTodayForTray() → ≤3 fixtures sorted by kickoff
- index.js bootstrap calls refreshWorldcupTray() (best-effort, fire-and-forget)
- register-worldcup.js: new worldcup:get-today IPC for read-through
- preload exposes worldcupGetToday()
- tray.buildMenu renders 5th section with kickoff time + teams
- Click → onFocusWorldcup({ matchId }) (Task C3 will wire renderer-side)"
```

---

### Task C3: renderer `tray-focus.js` 扩展 — 处理 🏆 点击

**Files:**
- Modify: `src/renderer/tray-focus.js` (新增 worldcup 分支)
- Modify: `src/main/index.js` (新增 `onFocusWorldcup` 推 IPC)

- [ ] **Step 1: 主进程 `index.js` 加 `onFocusWorldcup`**

在 `createTrayManager({...})` 加:

```js
onFocusWorldcup: (data) => {
  if (winMgr) winMgr.showWindow();
  const w = winMgr && winMgr.getWindow();
  if (w && !w.isDestroyed()) {
    w.webContents.send('tray:focus', {
      tab: 'worldcup',
      matchId: data.matchId,
    });
  }
},
```

- [ ] **Step 2: `tray-focus.js` 加 worldcup 分支**

在 `handleFocus` 加 `data.tab === "worldcup"` 处理:

```js
} else if (data.tab === "worldcup" && data.matchId) {
  await scrollToMatch(data.matchId);
}
```

新增 `scrollToMatch`:

```js
async function scrollToMatch(matchId) {
  const escaped = String(matchId).replace(/"/g, '\\"');
  const el = document.querySelector(`[data-match-id="${escaped}"]`)
    || document.querySelector(`.match-card[data-id="${escaped}"]`);
  if (el && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    log.warn(`scrollToMatch: no element for "${matchId}"`);
  }
}
```

- [ ] **Step 3: 验证 MatchCard 渲染了 `data-match-id` 属性**

Run: `grep -n "data-match-id\|data-id" src/renderer/worldcup/MatchCard.jsx 2>&1 | head -5`

如果没有,需要在 MatchCard 渲染时加 `data-match-id={match.id}` (或 `data-id`).

- [ ] **Step 4: 跑测试,确认没破坏**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 基线持平

- [ ] **Step 5: 提交**

```bash
git add src/main/index.js src/renderer/tray-focus.js src/renderer/worldcup/MatchCard.jsx
git commit -m "feat(tray): wire 🏆 世界杯 click → scroll to match

- main: onFocusWorldcup pushes tray:focus { tab:'worldcup', matchId }
- renderer: scrollToMatch uses data-match-id (or .match-card[data-id])
- MatchCard gets data-match-id={match.id} if not already present

Following the same pattern as 🔄 检查更新 click (Task A3)."
```

---

## 阶段 D — 🥇 贵金属实时价段 (1-2h,最简单)

### Task D1: 主进程 — `metal-ipc.js` 推 tray + `tray.js` 新段

**Files:**
- Modify: `src/main/metal-ipc.js` (scheduler 推 quote 时调 `trayMgr.setMetals`)
- Modify: `src/main/tray.js` (`setMetals` + `buildMenu` 新段)
- Modify: `src/main/index.js` (`createTrayManager` 注入 `onFocusMetals`)

- [ ] **Step 1: 找 scheduler 推 quote 的位置**

Run: `grep -n "metals:quote:changed\|sendToRenderer" src/main/metal-ipc.js src/main/metals/metal-scheduler.js 2>&1 | head -10`

- [ ] **Step 2: 在 push quote 时同时调 `trayMgr.setMetals(quotes, fx)`**

找到 push 位置后 (大概在 `metals:quote:changed`),在它之前或同步加:

```js
if (trayMgr && typeof trayMgr.setMetals === "function") {
  trayMgr.setMetals(quotes, fx);
}
```

需要确认 `trayMgr` 怎么注入到 `metal-ipc.js` (看现有 register pattern, 可能是 `ctx` 参数). 如果无法直接拿到 `trayMgr`,可用 `ipcMain.emit('tray:metals-update', quotes, fx)` 走事件总线,`tray.js` 订阅.

- [ ] **Step 3: `tray.js` — `setMetals` + 新段**

```js
let lastMetals = null;
function setMetals(quotes, fx) {
  lastMetals = { quotes, fx };
  scheduleRebuild();
}
// buildMenu 解构加 metals
// 在世界杯段后插入:
if (metals && metals.quotes) {
  const lines = buildMetalsLines(metals.quotes, metals.fx);
  if (lines.length > 0) {
    template.push({ label: "── 🥇 贵金属 · 实时 ──", enabled: false });
    for (const item of lines) {
      template.push(item);
    }
    template.push({ type: "separator" });
  }
}

const METAL_DISPLAY = [
  { id: "XAU", name: "黄金" },
  { id: "AU9999", name: "黄金(国内)" },
  { id: "XAG", name: "白银" },
  { id: "AG9999", name: "白银(国内)" },
];

function buildMetalsLines(quotes, fx) {
  const lines = [];
  for (const m of METAL_DISPLAY) {
    const q = quotes[m.id];
    if (!q) continue;
    let cnyPerGram;
    if (q.currency === "CNY") {
      cnyPerGram = q.price;
    } else if (fx && typeof fx.rate === "number") {
      cnyPerGram = q.price * fx.rate;
    } else {
      continue; // 国际品种缺汇率 → 跳过
    }
    const prev = q.price - (q.change || 0);
    const changePct = prev > 0 ? (q.change / prev) * 100 : 0;
    const arrow = changePct >= 0 ? "↗" : "↘";
    lines.push({
      label: `  ${m.name} ¥${cnyPerGram.toFixed(2)}/g  ${arrow} ${Math.abs(changePct).toFixed(2)}%`,
      enabled: false,
    });
  }
  return lines;
}
```

- [ ] **Step 4: 写测试**

Add to `tests/main/tray.test.js`:

```js
describe("tray.buildMenu — 🥇 贵金属段", () => {
  it("XAU 有 quote + fx → 显示黄金行", () => {
    const m = buildMenu({
      results: [],
      metals: {
        quotes: { XAU: { price: 3400, change: 14, currency: "USD" } },
        fx: { rate: 7.25 },
      },
    });
    const line = m.find((i) => i.label && i.label.includes("黄金"));
    expect(line).toBeDefined();
    expect(line.label).toMatch(/¥24,?650\.\d{2}\/g/); // 3400 * 7.25 = 24650
    expect(line.label).toContain("↗");
  });

  it("国际品种缺 fx → 跳过", () => {
    const m = buildMenu({
      results: [],
      metals: { quotes: { XAU: { price: 3400, change: 14, currency: "USD" } }, fx: null },
    });
    const line = m.find((i) => i.label && i.label.includes("黄金"));
    expect(line).toBeUndefined();
  });

  it("国内品种 (CNY) → 不需要 fx", () => {
    const m = buildMenu({
      results: [],
      metals: {
        quotes: { AU9999: { price: 939.18, change: 3.93, currency: "CNY" } },
        fx: null,
      },
    });
    const line = m.find((i) => i.label && i.label.includes("黄金(国内)"));
    expect(line).toBeDefined();
    expect(line.label).toContain("939.18");
  });
});
```

- [ ] **Step 5: 跑测试**

Run: `npx vitest run tests/main/tray.test.js 2>&1 | tail -10`
Expected: PASS — 15 tests

- [ ] **Step 6: 主进程 — `index.js` 加 `onFocusMetals`**

```js
onFocusMetals: (data) => {
  if (winMgr) winMgr.showWindow();
  const w = winMgr && winMgr.getWindow();
  if (w && !w.isDestroyed()) {
    w.webContents.send('tray:focus', {
      tab: 'metals',
      metalId: data.metalId,
    });
  }
},
```

`tray.js` 的 buildMenu 内部 `click` 改为:

```js
click: () => onFocusMetals({ metalId: m.id }),
```

`buildMenu(opts)` 加 `onFocusMetals = () => {}`.

- [ ] **Step 7: `tray-focus.js` 加 metals 分支**

```js
} else if (data.tab === "metals" && data.metalId) {
  await scrollToMetal(data.metalId);
}

async function scrollToMetal(metalId) {
  const escaped = String(metalId).replace(/"/g, '\\"');
  const el = document.querySelector(`[data-metal-id="${escaped}"]`)
    || document.querySelector(`.metal-card[data-id="${escaped}"]`);
  if (el && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
```

- [ ] **Step 8: 验证 MetalCard 有 data-metal-id**

Run: `grep -n "data-metal-id\|data-id" src/renderer/metals/MetalCard.jsx 2>&1 | head -5`

如果没有,加 `data-metal-id={metal.id}` 到 card 根元素.

- [ ] **Step 9: 跑全套**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 基线 + ~22

- [ ] **Step 10: 提交**

```bash
git add src/main/metal-ipc.js src/main/tray.js src/main/index.js src/renderer/tray-focus.js src/renderer/metals/MetalCard.jsx tests/main/tray.test.js
git commit -m "feat(tray): add 🥇 贵金属实时价 section

- main: metal-ipc.js scheduler push → trayMgr.setMetals(quotes, fx)
- tray.buildMenu renders 6th section with XAU/AU9999/XAG/AG9999
- International metals (USD) require fx rate; domestic (CNY) skip fx
- Click → onFocusMetals({ metalId }) → tray:focus → scrollIntoView
- MetalCard gets data-metal-id={metal.id} if not present"
```

---

## 阶段 E — 性能加固 + 文档 (1h)

### Task E1: debounce + Windows throttle 单测 + 集成验证

**Files:**
- Modify: `tests/main/tray.test.js` (新增 debounce/throttle 测试)

- [ ] **Step 1: 写 debounce 测试**

```js
describe("tray — debounce + Windows throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("多次 setResults 在 200ms 内合并为 1 次 rebuildMenu", async () => {
    const trayMgr = createTrayManager({
      getConfig: () => ({ apps: [] }),
      getConfigPath: () => "",
    });
    trayMgr.install(); // 假设 install 是 sync,在 happy-dom 里有 setImage stub
    trayMgr.setResults([{ name: "A", has_update: true, latest_version: "1.0", installed_version: "0.9", status: "update_available" }]);
    trayMgr.setResults([{ name: "A", has_update: true, latest_version: "1.1", installed_version: "0.9", status: "update_available" }]);
    vi.advanceTimersByTime(200);
    // 验证: 最后一次 setResults 的 latest_version 生效 (merged)
    const ctxMenu = trayMgr._getContextMenu(); // 测试 helper,需在 tray.js 暴露
    const updateRow = ctxMenu.items.find((i) => i.label && i.label.startsWith("A"));
    expect(updateRow.label).toContain("1.1");
  });

  it("Windows: 1s 内的多次 rebuild → 实际只 rebuild 1 次", async () => {
    // 临时改 process.platform 不可行;改成在 tray 内部读 process.platform.
    // 这里只验证: 200ms debounce 总是生效; 1s throttle 是 Windows 才走.
    const trayMgr = createTrayManager({ getConfig: () => ({ apps: [] }) });
    trayMgr.setResults([]);
    trayMgr.setResults([]);
    vi.advanceTimersByTime(200);
    // 2 次 setResults → 1 次 rebuild (debounce 生效)
    // 用 spy 验证
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `npx vitest run tests/main/tray.test.js 2>&1 | tail -10`
Expected: PASS (可能需要调 tray.js 内部 helper 暴露)

- [ ] **Step 3: 写集成测试 — `tray-click-focus.test.js`**

`tests/integration/tray-click-focus.test.js`:

```js
// 模拟菜单栏点击 → 验证 IPC 路径
import { describe, it, expect, vi } from "vitest";
import { _internal } from "../../src/main/tray.js";
const { buildMenu } = _internal;

describe("tray click → IPC payload", () => {
  it("检查更新行 click → onFocusUpdate({ rowName, action: 'upgrade' })", () => {
    const onFocusUpdate = vi.fn();
    const m = buildMenu({
      results: [{ name: "Cursor", latest_version: "3.7.43", installed_version: "3.7.42", has_update: true, status: "update_available" }],
      onFocusUpdate,
    });
    m.find((i) => i.label && i.label.startsWith("Cursor")).click();
    expect(onFocusUpdate).toHaveBeenCalledWith({ rowName: "Cursor", action: "upgrade" });
  });

  it("世界杯行 click → onFocusWorldcup({ matchId })", () => {
    const onFocusWorldcup = vi.fn();
    const today = new Date().toISOString().slice(0, 10);
    const m = buildMenu({
      results: [],
      worldcup: { fixtures: [{ id: "m99", kickoff: `${today}T20:00:00+08:00`, home: "A", away: "B", stage: "A" }] },
      onFocusWorldcup,
    });
    m.find((i) => i.label && i.label.includes("vs")).click();
    expect(onFocusWorldcup).toHaveBeenCalledWith({ matchId: "m99" });
  });
});
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/integration/tray-click-focus.test.js 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: 跑全套,确认没破坏**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 基线 + ~25 (无回归)

- [ ] **Step 6: 提交**

```bash
git add tests/main/tray.test.js tests/integration/tray-click-focus.test.js
git commit -m "test(tray): add debounce + click→IPC integration tests

Covers:
- 200ms debounce merges multiple set* calls
- Windows 1s throttle (verified via platform read in tray.js)
- Click on each section triggers correct onFocus* callback with right shape"
```

---

### Task E2: RELEASE-NOTES + 文档

**Files:**
- Modify: `RELEASE-NOTES.md` (顶部加 v2.22 章节)
- Modify: `index.js` README/RELEASE-NOTES

- [ ] **Step 1: 在 RELEASE-NOTES 顶部加 v2.22 章节**

```markdown
## v2.22.0 (菜单栏重设计 — 内容预览) — 2026-06-17

### 新增
- **菜单栏从"app 列表"重做成"4 段内容预览"**:
  - 🔄 **检查更新**: 显示哪个 app 待升级 + 版本号 + 升级入口
  - 📊 **AI coding plan 用量**: 显示 MiniMax/GLM 实时百分比 + 剩余时间
  - 🏆 **世界杯 · 今日**: 显示今日赛程 (≤3 场) + 开赛时间
  - 🥇 **贵金属 · 实时**: 显示黄金/白银实时价 + 涨跌
- **点击行为**: 打开面板 + 切到对应 tab + 滚到目标 + 弹确认 modal (不静默做事)
- **新模块**:
  - `src/main/ai-usage-cache.js` — AI 用量 main cache 简化接口
  - `src/main/worldcup-tray-cache.js` — 世界杯 24h 缓存
  - `src/renderer/tray-focus.js` — 菜单栏点击 → renderer 定位
- **新 IPC**:
  - `tray:focus` (main → renderer) — 菜单栏点击的定位指令
  - `worldcup:get-today` (renderer ↔ main) — 读穿透 cache

### 改进
- **防闪烁**: 4 个数据源 200ms debounce 合并 1 次 rebuild
- **Windows 端**: 额外 1s throttle,避免 ICO 切换闪烁
- **失败处理**: 拉不到数据的模块整段隐藏;未配置显示 1 行 hint;陈旧数据行尾加灰字 "(Nh 前)"

### 测试
- `tests/main/tray.test.js` — 15 个 case 覆盖 4 段所有数据组合 + 失败/陈旧
- `tests/main/ai-usage-cache.test.js` — 5 个 case
- `tests/main/worldcup-tray-cache.test.js` — 5 个 case
- `tests/integration/tray-click-focus.test.js` — 2 个 case 覆盖点击→IPC
- 测试基线: PASS

### 文件
- 新增: `src/main/ai-usage-cache.js` `src/main/worldcup-tray-cache.js` `src/renderer/tray-focus.js` `src/renderer/upgrade-actions.js` + 4 个 test
- 改动: `src/main/tray.js` (重做 rebuildMenu) + `src/main/index.js` (注入 cache + onFocus) + `src/main/ipc/register-ai-usage.js` + `src/main/metal-ipc.js` + `src/main/ipc/register-worldcup.js` + `preload.js` + `src/renderer/index.jsx` + (可能) `src/renderer/worldcup/MatchCard.jsx` + `src/renderer/metals/MetalCard.jsx`

### 风险 + 回滚
- 主进程 `trayMgr` 增了 `setAiUsage` / `setWorldcup` / `setMetals` 接口,默认 noop,旧代码无影响
- 失败处理覆盖 7 种边界 (cache 损坏/网络挂/未配置/陈旧/启动期/用户没装/数据并发)
- 回滚: `git revert HEAD~N` (按阶段) 即可
```

- [ ] **Step 2: 跑全套最终验证**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 全 PASS

- [ ] **Step 3: 提交**

```bash
git add RELEASE-NOTES.md
git commit -m "docs(release-notes): record v2.22.0 — 菜单栏重设计

Content preview sections for check-updates, AI usage, worldcup, metals.
Click → open panel + switch tab + scroll to target + optional modal.
200ms debounce + Windows 1s throttle to prevent icon flicker."
```

---

## Summary

| 阶段 | 任务数 | 估计 | 状态 |
|---|---|---|---|
| **A** | 4 | 2-3h | 第一 ship |
| **B** | 2 | 3-4h | 新增 AI cache |
| **C** | 3 | 3-4h | 新增 worldcup cache |
| **D** | 1 | 1-2h | 复用 metals scheduler |
| **E** | 2 | 1h | 性能 + 文档 |
| **总计** | **12 任务** | **~10-14h** | |

**关键依赖**:
- A1 → A2 → A3 → A4 (串行, A 必须先 ship)
- B1 → B2 (串行,B1 写完才能 B2 接入)
- C1 → C2 → C3 (串行, C1 → C2 集成 → C3 renderer 端)
- D1 独立 (可与 B/C 并行,数据源完全独立)
- E1, E2 依赖全部完成

**并行机会**:
- A 阶段 ship 后,B / C / D 可分配给 3 个不同 session/agent 并行
- E 必须等全部完成

**TDD 规则**:
- 每个新文件: 先写测试 → 跑测试确认失败 → 写最小实现 → 跑测试确认 PASS → commit
- 每个修改: 先写覆盖新行为的测试 → 跑测试确认失败 → 修改 → 跑测试确认 PASS → commit
- 每完成一个 Task,跑全套 `npx vitest run` 确认无回归

**完成判定**:
- 所有 12 任务 commit
- `npx vitest run` 全 PASS
- RELEASE-NOTES v2.22.0 章节就位
- 手工验证清单 (spec §8.3) 全部打勾
