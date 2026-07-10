# Cross-Platform Windows Support — Design

**Date:** 2026-06-16
**Status:** Approved (brainstorm complete)
**Author:** Pulse

## 背景与目标

Pulse 目前是 macOS 专用工具（仅 arm64 + x64 macOS）。本设计的目标是**全功能对等地支持 Windows**：Windows 上也要能检测 app 版本 + 一键升级，跟 macOS 功能完全一致。

### 核心决策（brainstorm 确认）

| 决策点 | 选择 |
|---|---|
| 支持范围 | 全功能对等 |
| Windows 升级方案 | winget 为主 |
| app 配置结构 | 合并到一个 app 条目（mac + win 配置共存） |
| UI 外观 | 各平台原生风格（mac vibrancy / win acrylic） |
| 落地节奏 | 分阶段交付（P1→P4） |

### 现状：macOS 耦合点梳理

| 模块 | macOS 现状 | Windows 迁移难度 |
|---|---|---|
| app 定位 | `/Applications/Cursor.app`（`app-paths.js`） | 高 — Windows 装在 Program Files / `%LOCALAPPDATA%` / `%APPDATA%`，每个 app 路径不同 |
| 读已装版本 | `plutil` 读 plist → `installed.json` → `system_profiler`（`installed-version.js`） | 高 — 三命令都没有，换成注册表 / winget list / app-update.yml |
| 在线版本检测 | 12 个 detector，其中 `brew_formulae` / `app_store_lookup` / 读 `.app` bundle 是 mac 专属 | 中 — HTTP 类 detector 可复用；mac 专属 detector 加平台标签跳过 |
| 一键升级 | `brew upgrade`（worker 池跑） | 高 — 对应 winget，重写整套 bulk-upgrade |
| UI 外壳 | `titleBarStyle:'hiddenInset'` + `vibrancy:'under-window'` + 透明（`window.js`） | 中 — vibrancy macOS 专属，Win11 `backgroundMaterial:'acrylic'`，Win10 纯色 |
| 托盘 | Tray 模板图标（`tray.js`） | 低 — Tray 跨平台，图标换 `.ico` |
| safeStorage / keychain | `app.setName("pulse")` 兜底（`index.js:27`） | 低 — Windows 走 DPAPI，keyring napi 已跨平台 |
| AI sessions | 读 Cursor/Codex 的 `.app` bundle 路径 | 中 — 路径加 Windows 分支 |
| 世界杯 / 基金 / 提醒 / AI 用量 | 纯 HTTP + 本地存储 | 低 — 跟平台无关，基本零改动 |

**结论**：HTTP + 本地数据层几乎白送；核心功能（检测 + 升级）整条链路是 macOS 专属，迁移成本集中在此。

---

## 方案选型

**选定方案 A：平台抽象层（Platform Abstraction Layer）。**

引入 `src/platform/` 模块，定义统一接口，macOS 和 Windows 各一个实现，运行时按 `process.platform` 注入。业务代码只依赖统一接口，绝不直接写 `if (process.platform === 'win32')`。

淘汰方案：
- **B（双 worker 分支）**：违反"配置合并到一个 app"决策，平台无关 detector 要复制两份。否决。
- **C（渐进条件分支）**：`if` 蔓延十几个文件，无统一边界，技术债高。适合轻量需求，不适合全功能对等。否决。

---

## §1 平台抽象层核心接口

### 模块结构

```
src/platform/
├── index.js          # 入口：按 process.platform 导出当前平台实现
├── interface.js      # 接口定义（JSDoc 契约，不含实现）
├── macos.js          # macOS 实现（封装现有逻辑，不改行为）
└── windows.js        # Windows 实现（新建）
```

### 统一接口（6 个能力）

| 方法 | 职责 | macOS 实现 | Windows 实现 |
|---|---|---|---|
| `resolveAppPath(bundle)` | app 安装路径 | `/Applications/Cursor.app` 拼接（现有 `app-paths.js`） | 按 `installLocation` 查注册表 + 兜底 Program Files / `%LOCALAPPDATA%` |
| `getInstalledVersion(appCfg)` | 读已装版本 | plist → installed.json → system_profiler（现有链） | 注册表 `DisplayVersion` → winget list → app-update.yml |
| `getAppIcon(appPath)` | 图标 dataUrl | sips 转 icns→PNG（现有） | `app.getFileIcon()` + `toDataURL()`（Windows 无 SIGTRAP） |
| `getUpgradeAction(appCfg, detectResult)` | 产出升级动作 | 现有 `bulk-upgrade-actions.js`（brew/mas/open） | 新增 winget 分支 |
| `execUpgrade(action)` | 执行升级 | 现有 `defaultExec`（brew execFile） | 新增 winget execFile |
| `getWindowOptions()` | 窗口视觉参数 | `{ vibrancy, titleBarStyle:'hiddenInset', transparent }` | `{ backgroundMaterial:'acrylic'（Win11）/ 纯色（Win10）, titleBarStyle:'hidden' }` |

### 注入方式

在 bootstrap 阶段一次性解析当前平台，传入所有需要的地方（`createWindowManager` / `registerIpcHandlers` / `WorkerPool` workerData）。业务代码拿到的是已绑定实现，不自己判断平台：

```js
// src/platform/index.js
const impl = process.platform === 'win32'
  ? require('./windows')
  : require('./macos');
module.exports = impl;
```

### 设计原则

1. **macOS 端零行为变更**：`macos.js` 把现有逻辑搬进去包一层，不重写。现有测试全绿是硬约束。
2. **detector 不在平台层**：detector（在线版本检测）保持现有架构，只加平台标签。平台层只管"本地"的事（路径、已装版本、图标、升级）。
3. **worker 线程用平台层**：`workerData` 传 `platform` 而非 `arch`，detector chain 按 `platform` 过滤。

---

## §2 Windows 版本检测方案

### 已装版本检测链（优先级从高到低）

复用现有 `version_sources` 配置机制，Windows 端新增三种 source type：

| source type | 数据来源 | 命令/路径 | 适用场景 |
|---|---|---|---|
| `registry_version` | Windows 注册表 | `reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{GUID}" /v DisplayVersion` | 大多数 installer 装的 app |
| `winget_list` | winget 本地清单 | `winget list --id <packageId> --exact` | 通过 winget 装的 app |
| `windows_app_yml` | Electron app 内嵌 yml | `%LOCALAPPDATA%\<AppName>\app-update.yml` | Electron 应用（对应 mac 的 `app_update_yml`） |

**fallback 链**（不配 `version_sources`，或配了但当前平台全部被过滤掉时自动走）：

```
registry_version (HKCU + HKLM + WOW6432 三处)
  → winget_list
  → windows_app_yml
```

跟 macOS `plist → installed.json → system_profiler` 同构：先读 app 自带元数据，再查系统数据库，最后兜底。

**平台过滤后的兜底**：`version_sources` 经 `platform` 过滤后可能为空（mac 上配了 win-only source，或反之）。此时 `getInstalledVersion` 应回落到当前平台的默认 fallback 链，而非直接返回 null。这保证一个 app 在某平台即便没显式配 source，也能尝试自动探测。

### 注册表查询关键细节

Windows app 版本信息散落注册表三个位置，全查：

```
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*              (系统级 64 位)
HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*   (系统级 32 位)
HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*              (用户级)
```

匹配策略：用 `DisplayName` 或 `InstallLocation` 匹配 app 名。匹配不精确（不同 app 命名不同），所以**优先用 `version_sources` 显式配置 GUID**，注册表全局扫描只做兜底。

### config.json 配置形态（合并到一个 app）

以 Cursor 为例，同一 app 条目同时带 mac 和 win 配置：

```json
{
  "name": "Cursor",
  "bundle": "Cursor.app",
  "win_bundle": "Cursor",
  "winget_id": "Anysphere.Cursor",
  "detectors": [
    { "type": "cursor_redirect", "url": "...{arch_short}..." },
    { "type": "brew_formulae", "cask": "cursor", "platform": "mac" },
    { "type": "winget_show", "id": "Anysphere.Cursor", "platform": "win" }
  ],
  "version_sources": [
    { "type": "plist", "platform": "mac" },
    { "type": "registry_version", "reg_path": "HKCU\\...\\{GUID}", "platform": "win" }
  ]
}
```

- `win_bundle`：Windows 的 app 标识（注册表 DisplayName / exe 名），跟 `bundle`（macOS `.app` 名）分开
- `winget_id`：winget 包 ID，升级用
- 每个 detector / version_source 加**可选** `platform` 字段，缺省 = 通用。运行时过滤：只跑 `platform === 当前平台` 或没标 platform 的

### 在线版本检测：新增 detector

| 新 detector | 数据来源 | 命令/接口 |
|---|---|---|
| `winget_show` | winget 仓库在线版本 | `winget show <id> --versions` 取第一条 |
| `github_release` | GitHub Releases API | `api.github.com/repos/{owner}/{repo}/releases/latest` |

`winget_show` 是 Windows 端 `brew_formulae` 对应物。`github_release` 是通用的（很多 Electron app 发在 GitHub，mac/win 都能用，但 Windows 端更需要它——缺 app_store_lookup 这种通用源）。

### 平台过滤机制

在 `detector-chain.js` 的 `runDetectorChain` 加一步过滤：

```js
for (const detCfg of detectors) {
  if (detCfg.platform && detCfg.platform !== currentPlatform) {
    trace.push({ det: detCfg.type, ms: 0, skipped: 'platform' });
    continue;
  }
  // ... 现有逻辑不变
}
```

同样在 `installed-version.js` 的 `version_sources` 循环加 `platform` 过滤。

### YAGNI

- **不做 winget 作为唯一源**：winget 在很多机器上版本旧或没装，不能假设它一定可用。注册表 + app 内嵌 yml 才是底层兜底。
- **不做 winget upgrade 自动确认**：winget 升级弹 UAC 需用户点确认。只触发，不等完成（跟 macOS `brew upgrade` 语义一致）。

---

## §3 winget 升级子系统

### 升级动作映射（`getUpgradeAction`）

现有 `bulk-upgrade-actions.js` 按 `source` 字段决策。Windows 端加 winget 路径：

| source / app 配置 | 动作 | 命令 |
|---|---|---|
| 有 `winget_id` | `{ type: 'winget', id }` | `winget upgrade --id <id> --exact --silent --accept-package-agreements --accept-source-agreements` |
| Electron app（`electron_yml` / `windows_app_yml`） | `{ type: 'open', path }` | 启动 app 让内置 updater 跑（跟 macOS 语义一致） |
| 有 `release_url` | `{ type: 'open_url', url }` | 打开下载页 |
| 以上都没有 | `{ type: 'none', reason }` | 跳过 |

优先级：`winget_id` > `open(app)` > `open_url` > `none`。跟 macOS `brew_formulae > app_store > sparkle > electron(open) > none` 对齐。

### winget 命令参数

```
winget upgrade --id <id> --exact --silent --accept-package-agreements --accept-source-agreements
```

- `--silent`：抑制 installer 交互界面（否则每个 app 弹 installer 向导要点 N 次）
- `--accept-package-agreements` / `--accept-source-agreements`：自动接受协议
- `--exact`：精确匹配 ID
- **不加 `--include-unknown`**：默认遇到"已装版本未知"跳过，这个行为是对的

### UAC 处理

| 安装范围 | UAC 行为 | 应对 |
|---|---|---|
| 用户级（`--scope user`） | 不弹 UAC | 正常执行，winget 完成即 done |
| 系统级（`--scope machine`） | 弹 UAC | 正常执行，**不等 UAC 结果**——跟 macOS brew 语义一致 |

退出码处理：
- 退出码 0 → `succeeded`
- 退出码非 0 且 stderr 含 "elevation" / "administrator" → `skipped`（用户拒绝提权，不算失败）
- 退出码非 0 其它 → `failed`

### 升级后状态刷新

保持现有行为：升级完不自动重新检测版本（依赖下次定时检查）。**YAGNI**，不引入复杂状态同步。

### IPC 统一

**统一成 `app-upgrade`**：renderer 不感知底层是 brew 还是 winget，item 里带 `upgradeMethod` 字段让 main 路由。

改动点：

| 文件 | 改动 |
|---|---|
| `bulk-upgrade-actions.js` | `getActionForApp` 加 winget 分支；`buildAppPath` 按 platform 分（mac `/Applications/x.app` / win 注册表查 `InstallLocation`） |
| `bulk-upgrade.js` | `defaultExec` 加 `winget` action type 分支 |
| `src/workers/task-handlers.js` | 加 `winget-upgrade` task type |
| `src/main/ipc/register-core.js` | 统一 `app-upgrade` handler，按 `upgradeMethod` 路由 brew/winget |
| `src/renderer/store-bulk-upgrade.js` | `isUpgradableSource` 加 win 相关 source |

---

## §4 UI / 窗口 / 打包

### 窗口配置（`getWindowOptions` 平台分支）

| 特性 | macOS（保持现状） | Windows |
|---|---|---|
| 标题栏 | `titleBarStyle: 'hiddenInset'` | `titleBarStyle: 'hidden'` + `titleBarOverlay` |
| 背景 | `vibrancy: 'under-window'` + `transparent: true` | Win11: `backgroundMaterial: 'acrylic'`；Win10: 纯色 `backgroundColor: '#1e1e2e'` |
| 任务栏 | `skipTaskbar: false` | 同 |
| 关闭行为 | 拦截 close → hide | **相同**——tray 常驻 |

Win10/11 判断简化：直接设 `backgroundMaterial: 'acrylic'`，Electron 在不支持版本上静默忽略降级纯色。不需要运行时判断。

CSS：加 `body.platform-win` class（renderer 启动时按平台注入），覆盖背景相关变量给纯色 fallback。

### 托盘图标

| 特性 | macOS | Windows |
|---|---|---|
| 格式 | PNG（template image） | **ICO**（含 16/32/48 多尺寸） |
| 深色模式 | template image 自动反色 | 亮色 + 暗色两套图标，监听 `themeChanged` 切换 |
| 点击行为 | `tray.on('click')` 打开面板 | 相同 |

新增 `assets/icon.ico`。badge 图标同理出 Windows 版。

### app 图标提取

`sips` macOS 专属。Windows 端用 Electron 原生 `app.getFileIcon()`（Windows 无 SIGTRAP bug，原生 API 可用）。这是平台层 `getAppIcon` 的 Windows 实现。

### renderer 平台感知

main 通过 preload 暴露 `process.platform`：

```js
// preload.js 新增
contextBridge.exposeInMainWorld('platformInfo', {
  platform: process.platform,  // 'darwin' | 'win32'
});
```

renderer 里 `useIcon`、升级按钮文案、行点击行为按 `window.platformInfo.platform` 分支。`useIcon` 硬编码 `/Applications/` 拼接换成走平台层路径。

### 打包（electron-builder）

```jsonc
{
  "mac": { /* 现有不变 */ },
  "win": {
    "icon": "assets/icon.ico",
    "target": ["nsis"]
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true
  }
}
```

`npm run build` 改为按平台出包：

```json
"build": "npm run build:renderer && electron-builder --mac --win"
```

开发时本机只 build 当前平台。

### CI 构建

**Windows 包走 GitHub Actions 的 `windows-latest` runner**，不在 macOS 上用 Wine 交叉编译（不稳定）。

### YAGNI

- **不做自动更新（electron-updater）**：Pulse 自身更新走 GitHub Release 手动下
- **不做 MSIX / Microsoft Store**：先出 NSIS exe
- **不做 ARM64 Windows 包**：Windows on ARM 用户极少，只出 x64

---

## §5 分阶段交付计划

每个阶段结束时 app 都能跑、测试全绿，不留半成品。

### P1 — 平台抽象层 + 外壳能跑（macOS 零行为变更）

**目标**：现有 macOS 逻辑收进 `platform/macos.js`，Windows 端放占位实现（返回 null / 默认值），app 在 Windows 能启动、显示窗口、托盘出来。**版本检测此时在 Windows 不工作（全标 not_installed），预期行为。**

改动范围：
- 新建 `src/platform/` 四个文件（index / interface / macos / windows）
- `macos.js`：把 `app-paths.js` / `installed-version.js` / `app-icon.js` / `bulk-upgrade-actions.js` / `window.js` 现有逻辑包一层，**原文件保留**作为 macos.js 内部调用
- `window.js`：固定参数改调 `platform.getWindowOptions()`
- `preload.js`：加 `platformInfo`
- 打包：加 `win` / `nsis` 配置（detectors/sources 还没 win 版本，Windows 上 config 正常加载但检测全失败）

**验收**：macOS 上 1590 测试全绿（零行为变更）；Windows 上 `electron .` 启动，看到窗口和托盘。

### P2 — Windows 版本检测链

**目标**：Windows 上能读出已装版本 + 在线最新版本，UI 能显示"已装 → 最新"对比。

改动范围：
- `src/detectors/winget-show.js`（新）+ `github-release.js`（新）
- `detector-chain.js`：加 `platform` 过滤
- `installed-version.js`：加 `registry_version` / `winget_list` / `windows_app_yml` 三个 source
- `src/platform/windows.js`：实现 `resolveAppPath`（注册表查 `InstallLocation`）、`getInstalledVersion`（reg query）
- `config/schema.js`：`VALID_DETECTOR_TYPES` 加新 type；version_source 加 `platform` 字段
- `config.json`：给现有 11 个 app 逐个补 `win_bundle` / `winget_id` / win 版 detectors+sources

**验收**：Windows 上至少 5 个主流 app（Cursor / VS Code 这类）能正确显示已装版本和在线版本。

### P3 — winget 升级

**目标**：Windows 上能一键 winget upgrade，bulk-upgrade 弹窗可用。

改动范围：
- `bulk-upgrade-actions.js`：`getActionForApp` 加 winget 分支
- `bulk-upgrade.js`：`defaultExec` 加 `winget` action type
- `task-handlers.js` / IPC：统一成 `app-upgrade`（mac brew + win winget 共一条）
- `renderer/store-bulk-upgrade.js`：`isUpgradableSource` 加 win source
- 升级按钮文案按平台走（"brew upgrade" / "winget upgrade"）

**验收**：Windows 上勾选 app → 一键 winget upgrade → UAC 后完成；macOS 升级功能不受影响。

### P4 — UI 打磨 + 图标 + CI

**目标**：Windows 端视觉体验达标 + 打包分发链路打通。

改动范围：
- `assets/icon.ico`（新）+ badge ICO 资源
- `platform/windows.js`：实现 `getAppIcon`（getFileIcon）、托盘深浅色切换
- `styles.css`：`body.platform-win` 的背景 fallback 变量
- `useIcon.js`：路径拼接走平台层
- `.github/workflows/`：加 Windows 构建作业
- `package.json`：`build` 脚本最终化

**验收**：GitHub Actions 出 `.exe` 安装包；Windows 上视觉无违和（图标、背景、标题栏）。

### 阶段依赖

```
P1 (地基) ──→ P2 (检测) ──→ P3 (升级)
                                    │
                                    └→ P4 (UI/打包)
```

- P1 是硬前置——平台层没建好，后面阶段没地方接
- P2 → P3 有依赖（升级要知道检测结果）
- P4 的资源准备（ICO、CI workflow）可提前跟 P2/P3 并行

### 测试策略

沿用现有 vitest 约定：每个新模块配单元测试，平台分支用依赖注入 mock（现有代码大量用 `deps = {}` 注入 fs/exec/spawn，Windows 端同样 mock `reg query` / `winget` 的 execFile 输出）。

---

## 不做（YAGNI 汇总）

- winget 作为唯一版本源（注册表 + app yml 才是兜底）
- winget upgrade 自动确认 / 等 UAC 结果
- 升级后自动重新检测版本
- electron-updater 自身自动更新
- MSIX / Microsoft Store 分发
- ARM64 Windows 包
- 运行时区分 Win10/11（靠 Electron 静默降级）
