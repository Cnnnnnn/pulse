# P52 自更新 (electron-updater) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⚠️ 实施前置条件:** 本 plan 的完整闭环依赖 **3 个基础设施改造**(见 §0),其中 2 个涉及 GitHub Actions / GitHub Release(外部系统),无法在本地 TDD 完整验证。本 plan 标注哪些 task 可本地完成、哪些需手动验证。

**Goal:** 集成 electron-updater,从 GitHub Releases 检测 Pulse 自身新版,下载后提示用户手动确认安装(半自动档,不依赖代码签名)。解决 menu bar 工具最大的体验断点——用户得手动去 GitHub Releases 下 dmg/exe 重装。

**Architecture:** 新增 `src/main/self-updater.js`(封装 autoUpdater 事件订阅 + 状态机)+ `register-self-update.js`(IPC:状态查询 + 触发下载/安装)。在 `bootstrap/schedulers.js` 加 `startSelfUpdateTimer`(复用 setManagedInterval 范式,启动 + 每 6h 检测一次)。tray 菜单 + DiagnosticsDrawer 显示"Pulse 有新版 vX.Y.Z"+ 下载/安装按钮。

**Tech Stack:** electron-updater (新依赖) / Electron autoUpdater / Node.js (main) / Preact (renderer) / vitest

---

## §0 基础设施改造(前置,3 项)

这三项是 electron-updater 能跑通的硬前提。**Task 1-5 的代码逻辑可本地写+测,但完整闭环(真发版触发更新提示)必须这三项就位。**

### §0.1 package.json build 加 publish 配置

```jsonc
// package.json "build" 节加:
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "<github-owner>",   // ← 需确认 repo owner
      "repo": "AppUpdateChecker-Electron"  // ← 确认 repo 名
    }
    // ... 其余不变
  }
}
```

> electron-builder 有 `publish` 配置后,构建时会自动生成 `latest.yml` / `latest-mac.yml`(electron-updater 拉取的更新元数据)。**没有 publish 配置,即使加了 electron-updater 依赖也不会产生更新文件。**

### §0.2 加 electron-updater 依赖

```bash
npm install electron-updater
```

> electron-builder `^25.0.0` 已在 devDeps,只需加运行时依赖 electron-updater。

### §0.3 release workflow 改造(外部系统,需手动验证)

当前 `.github/workflows/release.yml`:
- 触发于 `v*` tag,构建 mac DMG+ZIP / win NSIS
- 仅上传为 **workflow artifact**(`actions/upload-artifact`)
- 设 `CSC_IDENTITY_AUTO_DISCOVERY: false`(未签名)
- **不创建 GitHub Release,不上传 release assets**

需改为:
1. 构建命令 `--publish never` → `--publish onTag`(electron-builder 自动发 GitHub Release + 传 latest.yml + dmg/exe)
2. 或保留 `--publish never`,单独加 `softprops/action-gh-release` 步骤上传构建产物 + latest.yml
3. 确认 `latest-mac.yml` / `latest.yml` 作为 release asset 上传(electron-updater fetch 这两个文件判断版本)

> **本 plan 无法在本地验证此项**——GitHub Actions 跑通需真实发 tag。建议:Task 1-5 实施完后,发一个 `v2.47.0-test` tag 触发 CI,手动确认 GitHub Release 创建 + latest.yml 上传。

---

## File Structure

**Create:**
- `src/main/self-updater.js` — autoUpdater 封装:事件订阅 + 状态机(idle/checking/downloaded/...)
- `src/main/ipc/register-self-update.js` — IPC:`self-update:get-state` / `self-update:check` / `self-update:install`
- `tests/main/self-updater.test.js` — 状态机纯逻辑(mock autoUpdater)
- `tests/main/register-self-update.test.js`

**Modify:**
- `src/main/bootstrap/schedulers.js` — 加 `startSelfUpdateTimer`
- `src/main/bootstrap/index.js` — 启动时调用 startSelfUpdateTimer
- `src/main/tray.js` — menu 加"Pulse 有新版"行(条件渲染)
- `src/renderer/components/DiagnosticsDrawer.jsx` — 加更新提示 + 下载/安装按钮
- `src/renderer/api.js` / `preload.js` — 桥接 self-update IPC

**外部(§0):**
- `package.json` — publish 配置 + electron-updater 依赖
- `.github/workflows/release.yml` — 发 GitHub Release

---

## Task 1: self-updater.js 状态机封装

**Files:**
- Create: `src/main/self-updater.js`
- Test: `tests/main/self-updater.test.js`

> **设计:autoUpdater 是 Electron/electron-updater 的单例,难直接单测。本模块封装一个"状态机 reducer"纯函数,把 autoUpdater 事件映射到状态,纯函数可测;副作用(订阅事件、调 quitAndInstall)在接线层,不在纯函数里。**

- [ ] **Step 1: Write the failing test**

```js
// tests/main/self-updater.test.js
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  INITIAL_UPDATE_STATE,
  reduceUpdateState,
  compareVersions,
} = require("../../src/main/self-updater");

describe("self-updater", () => {
  describe("compareVersions", () => {
    it("新版本 > 当前 → 1 (hasUpdate)", () => {
      expect(compareVersions("2.47.0", "2.46.0")).toBe(1);
    });
    it("相同版本 → 0", () => {
      expect(compareVersions("2.46.0", "2.46.0")).toBe(0);
    });
    it("旧版本 < 当前 → -1", () => {
      expect(compareVersions("2.45.0", "2.46.0")).toBe(-1);
    });
    it("含预发布标签也正确比较", () => {
      expect(compareVersions("2.47.0-beta", "2.46.0")).toBe(1);
    });
  });

  describe("reduceUpdateState", () => {
    it("初始状态 idle, 无可用更新", () => {
      expect(INITIAL_UPDATE_STATE.status).toBe("idle");
      expect(INITIAL_UPDATE_STATE.available).toBe(false);
    });

    it("UPDATE_AVAILABLE 事件 → available + 记录 version/info", () => {
      const next = reduceUpdateState(INITIAL_UPDATE_STATE, {
        type: "UPDATE_AVAILABLE",
        version: "2.47.0",
        releaseNotes: "修复",
      });
      expect(next.status).toBe("available");
      expect(next.available).toBe(true);
      expect(next.version).toBe("2.47.0");
      expect(next.releaseNotes).toBe("修复");
    });

    it("UPDATE_NOT_AVAILABLE → idle, available=false", () => {
      const s = { status: "available", available: true, version: "2.47.0" };
      const next = reduceUpdateState(s, { type: "UPDATE_NOT_AVAILABLE" });
      expect(next.available).toBe(false);
      expect(next.status).toBe("idle");
    });

    it("DOWNLOAD_PROGRESS → downloading + 记录 percent", () => {
      const next = reduceUpdateState(
        { status: "available", available: true, version: "2.47.0" },
        { type: "DOWNLOAD_PROGRESS", percent: 45 },
      );
      expect(next.status).toBe("downloading");
      expect(next.downloadPercent).toBe(45);
    });

    it("UPDATE_DOWNLOADED → downloaded, 可安装", () => {
      const next = reduceUpdateState(
        { status: "downloading", available: true, version: "2.47.0" },
        { type: "UPDATE_DOWNLOADED" },
      );
      expect(next.status).toBe("downloaded");
      expect(next.readyToInstall).toBe(true);
    });

    it("ERROR → error 状态 + 记录 message", () => {
      const next = reduceUpdateState(INITIAL_UPDATE_STATE, {
        type: "ERROR",
        message: "网络失败",
      });
      expect(next.status).toBe("error");
      expect(next.error).toBe("网络失败");
    });

    it("CHECKING_FOR_UPDATE → checking", () => {
      const next = reduceUpdateState(INITIAL_UPDATE_STATE, { type: "CHECKING" });
      expect(next.status).toBe("checking");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/self-updater.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// src/main/self-updater.js
/**
 * P52 — Pulse 自身更新封装.
 *
 * 分两层:
 *  - 纯函数层 (本文件): reduceUpdateState 把 autoUpdater 事件映射到状态机, compareVersions 版本比较.
 *  - 接线层 (bootstrap): require electron-updater, 订阅事件, dispatch action, 暴露 IPC.
 *
 * 半自动档 (phase 1): 检测+下载+提示手动确认安装. mac 未签名时 quitAndInstall 需用户交互.
 */

const INITIAL_UPDATE_STATE = {
  status: "idle", // idle | checking | available | downloading | downloaded | error
  available: false,
  version: null,
  releaseNotes: null,
  downloadPercent: 0,
  readyToInstall: false,
  error: null,
  lastCheckedAt: null,
};

function compareVersions(remote, local) {
  // 简单语义版本比较, 去掉预发布后缀比主体
  const norm = (v) => String(v || "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const r = norm(remote);
  const l = norm(local);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return 1;
    if ((r[i] || 0) < (l[i] || 0)) return -1;
  }
  return 0;
}

function reduceUpdateState(state, action) {
  switch (action.type) {
    case "CHECKING":
      return { ...state, status: "checking", error: null };
    case "UPDATE_AVAILABLE":
      return {
        ...state,
        status: "available",
        available: true,
        version: action.version || null,
        releaseNotes: action.releaseNotes || null,
        lastCheckedAt: Date.now(),
      };
    case "UPDATE_NOT_AVAILABLE":
      return {
        ...INITIAL_UPDATE_STATE,
        lastCheckedAt: Date.now(),
      };
    case "DOWNLOAD_PROGRESS":
      return {
        ...state,
        status: "downloading",
        downloadPercent: typeof action.percent === "number" ? action.percent : state.downloadPercent,
      };
    case "UPDATE_DOWNLOADED":
      return {
        ...state,
        status: "downloaded",
        readyToInstall: true,
        downloadPercent: 100,
      };
    case "ERROR":
      return { ...state, status: "error", error: action.message || "unknown" };
    default:
      return state;
  }
}

module.exports = {
  INITIAL_UPDATE_STATE,
  reduceUpdateState,
  compareVersions,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/self-updater.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/self-updater.js tests/main/self-updater.test.js
git commit -m "feat(p52): self-updater 状态机纯函数 (compareVersions + reducer)"
```

---

## Task 2: autoUpdater 接线 (bootstrap)

**Files:**
- Modify: `src/main/bootstrap/schedulers.js` — 加 `startSelfUpdateTimer`
- Modify: `src/main/bootstrap/index.js` — 启动调用

> **本 task 接线 electron-updater,无法纯单测(依赖 electron 运行时 + 网络)。测试策略:接线逻辑尽量薄,核心状态转换由 Task 1 纯函数覆盖;本 task 只验证"函数存在 + 不抛错 + 用 setManagedInterval"。**

- [ ] **Step 1: 加 startSelfUpdateTimer 到 schedulers.js**

在 schedulers.js 末尾(module.exports 之前)加:

```js
// ---- P52: Pulse 自更新 ----

/**
 * P52: 启动自更新检测. 复用 setManagedInterval 范式, 启动时检测一次 + 每 6h 复检.
 * 半自动档: 检测+下载, 不自动 quitAndInstall (等用户在 UI 点安装).
 * @param {object} deps { autoUpdater (可选注入测试), getCurrentVersion, intervalMs }
 * @returns {{ stop, triggerNow }}
 */
function startSelfUpdateTimer(deps = {}) {
  const {
    autoUpdater,
    getCurrentVersion,
    intervalMs = 6 * 60 * 60 * 1000, // 6h, 跟 auto-check 一致
  } = deps;

  if (!autoUpdater) {
    // 生产: require electron-updater. 测试环境注入 mock.
    try {
      const { autoUpdater: au } = require("electron-updater");
      deps.autoUpdater = au;
    } catch {
      // electron-updater 未安装 (§0.2 未完成) → 静默跳过, 不阻断启动
      return { stop() {}, triggerNow() {} };
    }
  }

  const updater = deps.autoUpdater;
  updater.autoDownload = true; // 检测到新版自动下载, 但不自动安装
  updater.autoInstallOnAppQuit = false;

  // 事件 → (由 IPC 层订阅状态, 这里只触发 check)
  async function checkOnce() {
    try {
      await updater.checkForUpdates();
    } catch {
      /* 网络失败静默, 下个周期再试 */
    }
  }

  // setManagedInterval 范式 (参考 startAutoCheckTimer)
  const { setManagedInterval } = require("../timer-registry");
  const handle = setManagedInterval(checkOnce, intervalMs, {
    label: "self-update",
    file: __filename,
    line: __LINE__ || 0,
  });

  // 启动时延迟 30s 检测一次 (避免跟启动检测抢资源)
  const initialTimer = setTimeout(checkOnce, 30000);

  return {
    stop() {
      if (handle && handle.stop) handle.stop();
      clearTimeout(initialTimer);
    },
    triggerNow: checkOnce,
  };
}
```

> 在 module.exports 加 `startSelfUpdateTimer`。

- [ ] **Step 2: index.js 启动时调用**

在 bootstrap() 的 scheduler 启动区(startAutoCheckTimer 附近)加:

```js
  // P52: 自更新检测
  const { startSelfUpdateTimer } = require("./schedulers");
  startSelfUpdateTimer({ getCurrentVersion: () => app.getVersion() });
```

- [ ] **Step 3: Smoke test (不抛错)**

Run: `node -e "const { startSelfUpdateTimer } = require('./src/main/bootstrap/schedulers'); const t = startSelfUpdateTimer({ autoUpdater: { checkForUpdates: async()=>{}, autoDownload:true, autoInstallOnAppQuit:false } }); t.stop(); console.log('ok');"`
Expected: 输出 `ok`(注入 mock autoUpdater 不抛错)

> 若 electron-updater 未安装(§0.2 未做),生产路径会 try/catch 静默跳过——这是预期行为,不阻断启动。

- [ ] **Step 4: Commit**

```bash
git add src/main/bootstrap/schedulers.js src/main/bootstrap/index.js
git commit -m "feat(p52): startSelfUpdateTimer 接线 electron-updater (6h 周期, 半自动)"
```

---

## Task 3: IPC register-self-update

**Files:**
- Create: `src/main/ipc/register-self-update.js`
- Modify: `src/main/ipc/index.js`
- Test: `tests/main/register-self-update.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/main/register-self-update.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

const registerPath = require.resolve("../../src/main/ipc/register-self-update.js");

function loadHandlers(selfUpdaterController) {
  vi.resetModules();
  delete require.cache[registerPath];
  const { registerSelfUpdateHandlers } = require(registerPath);
  const handlers = {};
  const safeHandle = (ch, fn) => { handlers[ch] = fn; };
  registerSelfUpdateHandlers({ safeHandle, controller: selfUpdaterController });
  return handlers;
}

describe("register-self-update IPC", () => {
  it("self-update:get-state 返回当前状态", async () => {
    const controller = {
      getState: vi.fn(() => ({ status: "downloaded", version: "2.47.0", readyToInstall: true })),
    };
    const handlers = loadHandlers(controller);
    const r = await handlers["self-update:get-state"]({});
    expect(r.ok).toBe(true);
    expect(r.state.version).toBe("2.47.0");
    expect(r.state.readyToInstall).toBe(true);
  });

  it("self-update:check 调用 controller.checkNow", async () => {
    const controller = { checkNow: vi.fn(async () => ({ ok: true })) };
    const handlers = loadHandlers(controller);
    const r = await handlers["self-update:check"]({});
    expect(r.ok).toBe(true);
    expect(controller.checkNow).toHaveBeenCalled();
  });

  it("self-update:install 调用 controller.quitAndInstall", async () => {
    const controller = { quitAndInstall: vi.fn() };
    const handlers = loadHandlers(controller);
    const r = await handlers["self-update:install"]({});
    expect(r.ok).toBe(true);
    expect(controller.quitAndInstall).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/register-self-update.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write register-self-update.js**

```js
// src/main/ipc/register-self-update.js
/**
 * P52 — 自更新 IPC. controller 由 bootstrap 注入 (持有 autoUpdater + 状态机).
 *   self-update:get-state  当前更新状态
 *   self-update:check      立即检测
 *   self-update:install    退出并安装已下载的更新
 */
function registerSelfUpdateHandlers(ctx) {
  const { safeHandle, controller } = ctx;
  if (typeof safeHandle !== "function") return;
  if (!controller) return; // 自更新未启用 (electron-updater 未装) → 不注册

  safeHandle("self-update:get-state", async () => {
    try {
      return { ok: true, state: controller.getState() };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("self-update:check", async () => {
    try {
      const r = await controller.checkNow();
      return r || { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("self-update:install", async () => {
    try {
      controller.quitAndInstall();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerSelfUpdateHandlers };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/register-self-update.test.js`
Expected: PASS

- [ ] **Step 5: Wire + Commit**

ipc/index.js: 在 registerIpcHandlers 里加 controller 注入。**注意:** controller 需在 bootstrap 创建(autoUpdater + 状态机),通过 deps 传入 ctx。实施时确认 index.js 能拿到 controller。

```bash
git add src/main/ipc/register-self-update.js src/main/ipc/index.js tests/main/register-self-update.test.js
git commit -m "feat(p52): self-update:get-state/check/install IPC"
```

---

## Task 4: preload + api 桥接

**Files:**
- Modify: `preload.js`, `src/renderer/api.js`

- [ ] **Step 1: preload.js 加**

```js
  selfUpdateGetState: () => ipcRenderer.invoke("self-update:get-state"),
  selfUpdateCheck: () => ipcRenderer.invoke("self-update:check"),
  selfUpdateInstall: () => ipcRenderer.invoke("self-update:install"),
```

- [ ] **Step 2: api.js 加**

```js
    selfUpdateGetState: pick(overrides, "selfUpdateGetState"),
    selfUpdateCheck: pick(overrides, "selfUpdateCheck"),
    selfUpdateInstall: pick(overrides, "selfUpdateInstall"),
```

- [ ] **Step 3: Build check + Commit**

```bash
git add preload.js src/renderer/api.js
git commit -m "feat(p52): preload + api 桥接 self-update"
```

---

## Task 5: UI (tray + DiagnosticsDrawer) + 全量回归

**Files:**
- Modify: `src/main/tray.js` — 条件渲染"Pulse 有新版 vX.Y.Z → 点击打开 DiagnosticsDrawer"
- Modify: `src/renderer/components/DiagnosticsDrawer.jsx` — 更新状态 + 下载进度 + 安装按钮

- [ ] **Step 1: tray.js 加更新提示行**

在 `buildMenu` 的 summary line 附近,加条件渲染:若 updateState.available → 加一行 "Pulse 有新版 vX.Y.Z" + 点击 onFocusUpdate。

> tray.js 的 menu 构建是纯函数,updateState 通过 opts 传入。需确认 createTrayManager 在状态变化时 rebuild menu(updateState 变化时触发 rebuild)。

- [ ] **Step 2: DiagnosticsDrawer 加更新 UI**

```jsx
  const [updateState, setUpdateState] = useState(null);

  useEffect(() => {
    if (!api.selfUpdateGetState) return;
    api.selfUpdateGetState().then((r) => {
      if (r && r.ok) setUpdateState(r.state);
    }).catch(() => {});
  }, []);

  // JSX (在 drawer 顶部):
  {updateState && updateState.available && (
    <div class="diag-self-update">
      <div class="diag-self-update-info">
        Pulse 有新版 v{updateState.version}
        {updateState.status === "downloading" && ` (下载中 ${updateState.downloadPercent}%)`}
      </div>
      {updateState.status === "downloaded" && (
        <button class="btn btn-primary btn-sm" onClick={() => api.selfUpdateInstall()}>
          退出并安装
        </button>
      )}
      <button class="btn btn-ghost btn-sm" onClick={() => api.selfUpdateCheck()}>
        重新检测
      </button>
    </div>
  )}
```

- [ ] **Step 3: Add CSS**

```css
.diag-self-update {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 10px; margin-bottom: 10px;
  background: linear-gradient(90deg, rgba(40,167,69,.1), transparent);
  border-radius: 6px; font-size: 12px;
}
.diag-self-update-info { flex: 1; min-width: 120px; }
```

- [ ] **Step 4: Full suite + build**

Run: `npx vitest run && npm run build:renderer`
Expected: 全量 PASS(rollback flaky 已知)

- [ ] **Step 5: Commit**

```bash
git add src/main/tray.js src/renderer/components/DiagnosticsDrawer.jsx styles.css
git commit -m "feat(p52): tray + DiagnosticsDrawer 更新提示 + 安装按钮"
```

---

## §手动验证清单(本地 TDD 无法覆盖)

实施完 Task 1-5 后,以下需手动验证:

1. **§0.1-0.3 基建就位** — package.json publish 配置 + electron-updater 安装 + release.yml 改造
2. **发测试 tag** — `git tag v2.47.0-test && git push origin v2.47.0-test`,确认 GitHub Actions 跑通,创建 GitHub Release,latest-mac.yml 作为 asset 上传
3. **本地装旧版** — 装 v2.46.0,启动,确认 30s 后触发检测
4. **确认更新提示** — 看到"Pulse 有新版 v2.47.0-test"
5. **下载+安装** — 点安装,确认 quitAndInstall 工作(mac 未签名时 Gatekeeper 可能拦截,phase 1 接受手动确认)
6. **无更新场景** — 当前已是最新,确认无提示(idle)

---

## Self-Review Notes

**Spec coverage (对照 v2 roadmap §3.2):**
- ✅ electron-updater 集成:Task 2
- ✅ GitHub Releases provider:§0.1 publish 配置
- ✅ 复用 scheduler:Task 2 startSelfUpdateTimer(setManagedInterval)
- ✅ tray + 诊断面板 UI:Task 5
- ✅ 半自动档(下载+提示,不自动装):autoDownload=true + autoInstallOnAppQuit=false

**风险与边界:**
1. **§0 三项基建是硬前提** — 代码全写完也跑不通,除非 publish 配置 + release workflow 就位。这是 plan 顶部警告的原因。
2. **mac 未签名** — quitAndInstall 在未签名 mac build 上可能被 Gatekeeper 拦截,需用户右键打开。phase 1 接受。P51 签名落地后升级体验。
3. **autoUpdater 单例难测** — 状态机抽成纯函数(Task 1)可测,接线层(Task 2)靠 smoke test + 手动验证。
4. **electron-updater require 失败** — 若 §0.2 未做,try/catch 静默跳过,不阻断启动。降级友好。
5. **controller 生命周期** — Task 3 的 controller 需在 bootstrap 创建并注入 ctx,实施时确认 index.js deps 传递链路。

**未实施说明:** 本 plan 按用户决定**只写文档不实施**。代码就绪度:Task 1(纯函数)可立即 TDD 实施;Task 2-5 依赖 §0 基建,建议基建就位后再实施。
