# App Update Checker 重写设计 Spec

- **日期**: 2026-06-05
- **作者**: Mavis (brainstorming-2)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用
- **方案**: A. 全面重写（plugin system + worker_threads + 框架）

## 1. 背景

AppUpdateChecker 是一个 macOS 菜单栏 (tray) Electron 应用，目前 11 个 dev 工具应用需要检测更新。用户报告两个问题：

1. **应用打开很不稳定** — 启动很慢、时快时慢、偶发卡死
2. **7 个 app 检测版本不准确** — Cursor / Kimi / Marvis / WorkBuddy / QClaw / MiniMax Code / QoderWork / ima.copilot

通过 4 轮问诊确认：
- 启动慢/卡顿发生在 launch / first_check / ui_freeze / upgrade 全部 4 个场景 → 架构性
- 7 个不准的 app 分布在 6 种检测策略（redirect / cursor_redirect / app_store / electron_yml / api_json / qclaw_api）
- 用户没具体 case 数据 → 需要"埋点 + 跑一次拿数据"才能精准修

用户选择 **A. 全面重写**（放弃 B. 渐进优化 + 数据驱动调试）。

## 2. 目标

解决两件事：
1. **启动慢 / 卡顿** — 4 个场景全有
2. **7 个 app 检测不准** — 把"检测"变成可独立测试、可插拔、可观测的单元

## 3. 非目标 (YAGNI)

- 远端配置同步
- 多语言 i18n
- 自动更新 (electron-updater)
- Telemetry / crash reporting
- Plugin 热加载
- Linux / Windows 支持
- IPC 加密 / 沙箱

## 4. 整体架构

4 层结构：

```
┌─────────────────────────────────────────────────────────────┐
│ Main Process  (main/)                                       │
│  - lifecycle: app.whenReady, before-quit, window-all-closed│
│  - Tray icon (createTrayIcon)                              │
│  - BrowserWindow (show/hide, 启动即显示, 不等 check)        │
│  - IPC router (handle 'detect' / 'upgrade' / 'config')     │
│  - 不直接跑检测                                              │
└─────────────┬───────────────────────────────────────────────┘
              │ IPC: 'detect'
┌─────────────▼───────────────────────────────────────────────┐
│ Worker Pool  (workers/)                                     │
│  - N 个 worker_threads (默认 max(2, hardwareConcurrency-1)), 队列化任务 │
│  - 任务 = (appCfg, detectorName) 单元                       │
│  - 主进程不阻塞; worker 死掉自动 spawn 新 worker            │
│  - 进度事件: worker → main → renderer                       │
└─────────────┬───────────────────────────────────────────────┘
              │ in-worker
┌─────────────▼───────────────────────────────────────────────┐
│ Detector Plugins  (detectors/)                              │
│  - base class: Detector { name, async detect(ctx) }        │
│  - 10 个内置 detector                                       │
│  - 每个 appCfg 有 detectors[] 数组, 失败时按序 fallback    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Renderer  (renderer/)                                       │
│  - Preact + @preact/signals (轻量, ~5KB)                    │
│  - 状态: signals store (apps, results, checkStatus)         │
│  - 局部更新: 收到 progress 只更新对应 row, 不重渲染整张     │
│  - 启动: 只做 DOMContentLoaded, 不立刻 trigger check       │
└─────────────────────────────────────────────────────────────┘
```

### 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 进程模型 | `worker_threads` | 共享内存 + 启动快 + 通信简单 |
| Worker 数 | 4 (默认) | 不打满 CPU, `navigator.hardwareConcurrency - 1` |
| UI 框架 | Preact + @preact/signals | 比 React 小 10x, signals 天然适合 progress 增量更新 |
| 状态管理 | signals | 单向数据流 + 自动精确更新 |
| 配置格式 | 新 schema `apps[].detectors[]` | 老 config.json 自动迁移 |
| 包管理 | npm | 跟现有 ecosystem 一致 |
| 测试 | vitest | 快、ESM 原生、Preact 生态 |

## 5. Detector Plugin 系统

### Base Class

```js
// detectors/base.js
class Detector {
  static name = 'base';

  constructor(opts = {}) {
    this.timeout = opts.timeout ?? 8000;   // per-detector 短 timeout
  }

  async detect(ctx) { throw new Error('not implemented'); }
}

class DetectContext {
  constructor({ appCfg, arch, http, logger }) {
    this.appCfg = appCfg;
    this.arch = arch;
    this.http = http;            // 统一 HTTP client (带 timeout + JSON helper)
    this.logger = logger;        // 结构化 logger
  }
}

class DetectorResult {
  constructor({ version, raw, source, confidence = 'high', note = '' }) {
    this.version = version;      // string | null
    this.raw = raw;              // 原始响应 (诊断用)
    this.source = source;        // detector 名字
    this.confidence = confidence;// 'high' | 'medium' | 'low'
    this.note = note;            // 解释
  }
}
```

### 10 个内置 Detector

| 类名 | 旧函数 | 行为变化 |
|------|--------|---------|
| `BrewFormulaeDetector` | `brewFormulaeApiVersion` | 拆 cask/timeout 配 |
| `BrewLocalCaskDetector` | `brewCaskInfo` | 拆 timeout，可选禁用 |
| `SparkleAppcastDetector` | `sparkleLatestVersion` | 拆 URL，timeout 独立 |
| `ElectronYmlDetector` | `electronYmlVersion` | 拆 URL |
| `AppStoreLookupDetector` | `appStoreLookupVersion` | 拆 URL |
| `ApiJsonDetector` | `apiJsonVersion` | 拆 URL + 字段名配 |
| `RedirectFilenameDetector` | `redirectVersion` | 拆 URL |
| `CursorRedirectDetector` | `cursorRedirectVersion` | 拆 URL |
| `QClawApiDetector` | `qclawApiVersion` | 拆 URL + body 模板 |
| `AppUpdateYmlDetector` | `versionFromAppUpdateYml` | 内部再做 generic/github fallback |

每个 detector 有**独立 vitest 单元测试**，用 mock http 喂真实响应 fixture。

### 新 config schema

```json
{
  "name": "Cursor",
  "bundle": "Cursor.app",
  "download_url": "https://www.cursor.com/downloads",
  "detectors": [
    { "type": "cursor_redirect", "url": "https://api2.cursor.sh/...", "timeout": 5000 },
    { "type": "app_update_yml" },
    { "type": "brew_formulae", "cask": "cursor" }
  ]
}
```

`detectors[]` 是 fallback 链——按顺序试，第一个高置信度命中即返回。

### 老 config 迁移 (`config/migrate.js`)

| 旧 web_type | 新 detector.type | 额外 |
|---|---|---|
| `redirect` | `redirect_filename` | `url: web_url` |
| `cursor_redirect` | `cursor_redirect` | `url: web_url` |
| `app_store` | `app_store_lookup` | `url: web_url` |
| `electron_yml` | `electron_yml` | `url: web_url` |
| `api_json` | `api_json` | `url: web_url` |
| `qclaw_api` | `qclaw_api` | `url: web_url` |
| `github_release` | `api_json` | `url: web_url`（合并） |
| `brew_api_json` | `brew_formulae` | `cask: brew_cask` |

迁移规则：
- 旧 `web_type` + `web_url` → 映射成单元素 `detectors[]`
- 旧 `sparkle_url` 存在 → 在最前面插 `{ type: 'sparkle_appcast', url: ... }`
- 旧 `brew_cask` 存在 → 在最后插 `{ type: 'brew_formulae', cask: ... }`
- 迁移后**原文件备份为 `config.json.bak`**，**不覆盖**——用户 review 后再决定

### 调度逻辑

```js
// detectors/runner.js
async runDetectorChain(detectors, ctx) {
  const trace = [];   // 每步都记，给诊断用
  for (const det of detectors) {
    const t0 = Date.now();
    try {
      const r = await det.detect(ctx);
      trace.push({ det: det.constructor.name, ms: Date.now()-t0, version: r.version, confidence: r.confidence, note: r.note });
      if (r.version && r.confidence !== 'low') return { result: r, trace };
    } catch (err) {
      trace.push({ det: det.constructor.name, ms: Date.now()-t0, error: err.message });
    }
  }
  return { result: trace.find(t => t.version) ?? null, trace };
}
```

## 6. 主进程 + Worker 隔离

### 主进程职责（只做编排，不做检测）

```js
// main/index.js
app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', () => showWindow());

  app.dock.hide();
  workerPool.start();
  createTray();
  createWindow();
  // 不在这里 triggerCheck —— 留给 renderer ready 后主动请求
});

ipcMain.handle('check-updates', () => runAllChecks());
ipcMain.handle('brew-upgrade',  (_, cask) => workerPool.enqueue({ type: 'brew-upgrade', payload: { cask } }));
```

### Worker Pool

```js
// workers/pool.js
class WorkerPool {
  constructor({ size = Math.max(2, (navigator.hardwareConcurrency || 4) - 1),
                workerScript }) {
    this.size = size; this.workerScript = workerScript;
    this.workers = []; this.queue = []; this.taskId = 0;
  }

  start() { for (let i = 0; i < this.size; i++) this._spawn(i); }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.taskId, task, resolve, reject });
      this._dispatch();
    });
  }

  _dispatch() {
    const idle = this.workers.findIndex(w => w && !w.busy);
    if (idle < 0 || !this.queue.length) return;
    const item = this.queue.shift();
    this.workers[idle].busy = true;
    this.workers[idle].current = item;
    this.workers[idle].worker.postMessage(item);
  }

  _onMessage(id, msg) {
    const w = this.workers[id];
    if (msg.type === 'progress') {
      mainWindow?.webContents.send('check-progress', msg.payload);
    } else if (msg.type === 'result') {
      w.current.resolve(msg.payload);
      w.busy = false; w.current = null; this._dispatch();
    } else if (msg.type === 'log') {
      log.write(msg.level, msg.text);
    }
  }

  _onError(id, err) {
    if (this.workers[id]?.current) this.workers[id].current.reject(err);
    this._spawn(id);  // 自动 respawn
  }
}
```

### 启动解耦

| 步骤 | 目标耗时 |
|------|---------|
| app.whenReady → tray ready | < 100ms |
| window loadFile → ready-to-show | < 500ms |
| **总冷启动 → 窗口可见** | **< 1.5s** |
| 单次 check 11 个 app | < 10s |

旧 `setTimeout(triggerCheck, 1000)` 取消——renderer ready 后主动调用 `api.checkUpdates()`，check 跟窗口解耦。

### IPC 协议

| 方向 | channel | 含义 |
|------|---------|------|
| renderer → main | `check-updates` | 启动一次完整检查 |
| renderer → main | `brew-upgrade` | 升级单个 cask |
| renderer → main | `get-config` | 读 config |
| renderer → main | `open-url` | 打开外部链接 |
| main → renderer | `check-progress` | 单个 app 检测完成 (含 trace) |
| main → renderer | `check-started` | 整体检查开始 |
| main → renderer | `check-finished` | 整体检查完成 |

### 错误恢复

| 失败点 | 行为 |
|--------|------|
| Worker crash | 自动 respawn, 当前 task reject, 其余 task 继续 |
| 单个 detector timeout (8s) | 标 trace.error, 链上下一个 |
| 整个 check 失败 | 返回空 results, log error, 不 crash |
| 网络全断 | 11 个 app 都标 `no_auto_check` |
| Tray 创建失败 | 不退出, window 里显示 banner 提示 |
| Window 创建失败 | tray 还在, 用户右键菜单可操作 |
| config.json 损坏 | 用默认 `{ check_on_launch: true, apps: [] }`, log error |

### 埋点 + 诊断日志

```
~/Library/Logs/AppUpdateChecker/
  startup.log    # 启动时间分解
  detect.log     # 每个 app × detector 的 trace (默认开 INFO, APP_UPDATE_CHECKER_DEBUG=1 开 DEBUG)
```

```
[startup] 2026-06-05T10:23:45 +0800 tray=45ms window=180ms total=520ms
[detect] 2026-06-05T10:23:46 +0800 app=Cursor det=cursor_redirect ms=234 version=3.6 confidence=high
[detect] 2026-06-05T10:23:46 +0800 app=WorkBuddy det=api_json ms=89 error="404"
[detect] 2026-06-05T10:23:47 +0800 app=WorkBuddy det=app_update_yml ms=12 version=2.1.0 confidence=medium
```

**这是修检测准度的核心武器**——下次 7 个 app 跑完，log 里能直接看到每个 detector 怎么 parse、怎么 fallback、为什么选/不选。

## 7. Renderer 状态管理

### Store (signals)

```js
// renderer/store.js
import { signal, computed } from '@preact/signals';

export const apps = signal([]);                // 从 config 加载
export const results = signal(new Map());      // name → result (Map for O(1) update)
export const checkStatus = signal('idle');     // 'idle' | 'running' | 'done' | 'error'
export const checkStartTime = signal(null);
export const checkDuration = signal(null);

export function applyProgress(result) {
  const next = new Map(results.value);
  next.set(result.name, result);
  results.value = next;
}

export function resetCheck() {
  results.value = new Map();
  checkStatus.value = 'running';
  checkStartTime.value = Date.now();
}

export function finishCheck() {
  checkStatus.value = 'done';
  checkDuration.value = Date.now() - checkStartTime.value;
}

export const resultsBySection = computed(() => {
  const list = [...results.value.values()];
  return buildSections(list);
});
```

### 组件树（Preact）

```
<App>
  <Header />
  {checkStatus === 'idle' && <EmptyState />}
  {checkStatus === 'running' && <Skeleton />}
  {checkStatus === 'done' && <ResultsView />}
  {checkStatus === 'error' && <ErrorBanner />}

<ResultsView>
  {resultsBySection.map(sec =>
    <Section key={sec.key} section={sec} />
  )}

<Section>
  <SectionHeader section={sec} />
  {sec.items.map(r =>
    <AppRow key={r.name} result={r} />   // 只订阅 results.get(r.name)
  )}

<AppRow>
  <AppAvatar bundle={result.bundle} name={result.name} />
  <AppInfo result={result} />
  <AppVersions result={result} />
  <AppAction result={result} />
```

**关键不变量**：`<AppRow>` 内部组件只读 `result` 这一个 signal，11 个 progress 触发 11 次 `applyProgress` 时，**只重渲染那 1 个 row，其他 row 不动**。

### Icon 加载

```jsx
// renderer/hooks/useIcon.js
const iconCache = new Map();

export function AppAvatar({ bundle, name }) {
  const [src, setSrc] = useState(iconCache.get(bundle) || null);
  useEffect(() => {
    if (iconCache.has(bundle)) { setSrc(iconCache.get(bundle)); return; }
    let cancelled = false;
    api.getAppIcon(bundle).then(icon => {
      if (cancelled || !icon) return;
      iconCache.set(bundle, icon);
      setSrc(icon);
    });
    return () => { cancelled = true; };
  }, [bundle]);

  return src
    ? <div class="app-avatar"><img src={src} alt="" /></div>
    : <div class="app-avatar" style={{ background: nameColor(name) }}>{nameInitial(name)}</div>;
}
```

### 启动流程

```js
// renderer/index.jsx
import { render } from 'preact';
import { App } from './App';
import { apps, checkStatus, resetCheck, applyProgress, finishCheck } from './store';

async function bootstrap() {
  const cfg = await api.getConfig();
  apps.value = cfg.apps;

  render(<App />, document.getElementById('app'));

  api.onCheckProgress(applyProgress);
  api.onStartCheck(() => triggerCheck());

  if (cfg.check_on_launch) triggerCheck();
}

async function triggerCheck() {
  resetCheck();
  try {
    await api.checkUpdates();
    finishCheck();
  } catch (err) {
    checkStatus.value = 'error';
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
```

### 升级并行化

旧 `for...of` 串行 await → 新 `Promise.allSettled` 并发（concurrency=2 防 brew lock）。

```jsx
async function upgradeAll() {
  const updatable = [...results.value.values()].filter(r => r.has_update && r.brew_cask);
  const tasks = updatable.map(r =>
    api.brewUpgrade(r.brew_cask).then(ok => ({ name: r.name, ok }))
  );
  const settled = await Promise.allSettled(tasks);
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      applyProgress({ name: s.value.name, /* 标"已升级" */ });
    }
  }
}
```

**风险**：brew upgrade 并发可能触发 brew 自身的 lockfile 竞争。**用一组小数据实测 brew lock 兼容性后再调**。

## 8. 错误处理

### 统一 Error Shape

```js
// detectors/errors.js
class DetectorError extends Error {
  constructor({ detector, reason, httpStatus, raw, note = '' }) {
    super(`${detector}: ${reason}`);
    this.detector = detector;
    this.reason = reason;          // 'timeout' | 'parse' | 'http_4xx' | 'http_5xx' | 'network' | 'no_version'
    this.httpStatus = httpStatus;
    this.raw = raw;
    this.note = note;
  }
}
```

### 用户可见错误

| 错误 | 展示 | 交互 |
|------|------|------|
| 单个 app 检测失败 | 行内状态显示 "检测失败" | tooltip 显示 trace + reason |
| 整个 check 失败 | header 红色 banner | "重试" 按钮 |
| 配置损坏 | banner "config 错误" | "打开 config" 按钮 |
| 升级失败 | 行内红 badge + 原因 | "打开下载页" 按钮 (回退) |
| Worker 死了 | 不显示 (自动 respawn) | log 记录 |
| 网络全断 | 所有 app 标 "无法检测" | 1 个 banner 提示 |

## 9. 测试

### 单元测试 (vitest)

```
tests/detectors/
  brew-formulae.test.js
  sparkle-appcast.test.js
  electron-yml.test.js
  app-store-lookup.test.js
  api-json.test.js
  redirect-filename.test.js
  cursor-redirect.test.js
  qclaw-api.test.js
  app-update-yml.test.js
  brew-local-cask.test.js
```

**关键做法**：用真实 API 响应存成 fixture（commit 进 `tests/fixtures/`），mock http 喂这些 fixture。**离线能跑、不依赖网络**。

fixture 来源：
- 一次性脚本 `scripts/record-fixtures.js` 跑 1 次，把真实响应 dump 下来
- 之后所有测试都用录制的 fixture
- 检测 API 变了的信号：实际跑一次 + 对比 fixture diff

### 集成测试

```
tests/integration/
  worker-pool.test.js        # 队列化、task 失败不 crash、respawn
  detector-chain.test.js     # 完整 fallback 链, 验证 trace
  config-migrate.test.js     # 11 个老 config 都跑得通
```

### E2E

不引入 Playwright（成本高）。用 vitest 单元 + 集成覆盖到 ≥ 80% 即可。

## 10. 验收标准

| 类别 | 指标 | 目标 | 对比旧版 |
|------|------|------|---------|
| 启动 | 冷启动到窗口可见 | **< 1.5s** | 旧: 3-10s+, 经常 hang |
| 启动 | tray ready | < 100ms | 旧: 同步在主线程, 偶尔卡 |
| Check | 11 个 app 完整 | **< 10s** | 旧: 15s+ 经常 |
| Check | 单 detector timeout | 8s 硬上限 | 旧: 15s 容易拖死 |
| 准确度 | 7 个不准的 app | **至少 6/7 修准** | 用真实数据回归 |
| 准确度 | 4 个准的 app | 保持准 | 单元测试 + fixture 锁住 |
| 稳定性 | 启动 100 次 | 0 crash, 0 tray 丢失 | 自动化跑 |
| 稳定性 | 断网启动 | 不 crash, 显式提示 | 旧: 11 个全 timeout 15s |
| 稳定性 | worker crash | 自动 respawn, check 继续 | 旧: 主进程可能卡死 |

## 11. 迁移路径

| Phase | 内容 | 估时 |
|-------|------|------|
| 0 | 脚手架：Preact + signals + vitest + worker pool 骨架 | 0.5 天 |
| 1 | **10 个 detector class** + 单元测试 + fixture | 2-3 天 |
| 2 | Worker pool 集成到主进程 + IPC 协议落地 | 1 天 |
| 3 | Renderer 重写（Preact + signals + 局部更新） | 1-2 天 |
| 4 | config 迁移 migrate.js + .bak 备份 | 0.5 天 |
| 5 | 启动埋点 + `~/Library/Logs/AppUpdateChecker/` 诊断日志 | 0.5 天 |
| 6 | **跑一次拿真实数据 → 逐个修 7 个 app** | 1-2 天 |
| 7 | 升级并发化（concurrency=2, 实测 brew lock） | 0.5 天 |
| 8 | electron-builder 打 .dmg + 验收 checklist | 0.5 天 |
| **总** | | **8-12 工作日** |

**Phase 1 是大头**：10 个 detector 迁移 + 单元测试是最重的工作。
**Phase 6 是关键**：基于真实 trace 修 7 个 app，**这一步不能跳过**——这是把"修准"的猜测变成"修准"的事实。

## 12. 风险 + 缓解 + 回滚

| 风险 | 缓解 | 回滚 |
|------|------|------|
| Preact + signals 新依赖 | 选成熟版本, pin version | 切回 vanilla + 手动局部 re-render |
| worker_threads 通信复杂 | 写好 message schema, 跑集成测试 | 退化为主进程直接 await (牺牲并发) |
| 老 config 不兼容 | 自动迁移 + .bak 备份 | 用户手动恢复 .bak |
| **行为差异**（fallback 链 vs 旧的"第一个非空返回"） | 跑回归对比, release notes 写明 | config 加 `legacy_mode: true` 开关 |
| brew lock 与并发升级冲突 | concurrency=2, 实测 | 退化到串行 |
| 检测准度修了又回归 | 单元测试 + fixture 锁住 | 暂时关掉某个 detector (`enabled: false`) |

## 13. 验收 Checklist

- [ ] 冷启动到窗口可见 < 1.5s (10 次取中位数)
- [ ] 11 app check 完整 < 10s
- [ ] 7 个不准的 app 至少 6 个修准 (基于真实 log 对比)
- [ ] 4 个准的 app 保持准 (单元测试不挂)
- [ ] 断网启动不 crash
- [ ] worker crash 自动 respawn (用测试脚本主动 kill worker)
- [ ] 老 config.json 自动迁移成功 (11 个老配置都验证过)
- [ ] `~/Library/Logs/AppUpdateChecker/` 有完整启动 + detect log
- [ ] vitest 覆盖每个 detector, 离线可跑
- [ ] electron-builder 出 .dmg 成功, 在干净 macOS 上能装能跑

## 14. 关键文件清单 (新)

```
src/
  main/
    index.js              # lifecycle
    tray.js               # tray icon
    window.js             # BrowserWindow
    ipc.js                # IPC handlers
    log.js                # 诊断日志
  workers/
    pool.js               # WorkerPool
    detect-worker.js      # 单个 worker 入口
  detectors/
    base.js               # Detector base class
    errors.js             # DetectorError
    brew-formulae.js
    brew-local-cask.js
    sparkle-appcast.js
    electron-yml.js
    app-store-lookup.js
    api-json.js
    redirect-filename.js
    cursor-redirect.js
    qclaw-api.js
    app-update-yml.js
    runner.js             # runDetectorChain
  config/
    schema.js             # config schema + validation
    migrate.js            # 老 config → 新 config
  preload.js
  renderer/
    index.jsx
    App.jsx
    store.js
    selectors.js
    components/
      Header.jsx
      Section.jsx
      AppRow.jsx
      AppAvatar.jsx
      AppInfo.jsx
      AppVersions.jsx
      AppAction.jsx
      EmptyState.jsx
      Skeleton.jsx
      ErrorBanner.jsx
    hooks/
      useIcon.js
    styles.css
tests/
  detectors/              # 10 个 detector 单测
  integration/            # worker-pool, detector-chain, config-migrate
  fixtures/               # 真实 API 响应录制
scripts/
  record-fixtures.js      # 一次性脚本: 录制真实 API 响应
docs/
  superpowers/
    specs/
      2026-06-05-app-update-checker-rewrite-design.md   # 本文件
config.json                # 新 schema, 老 config 自动迁移生成
config.json.bak            # 老 config 备份
```

## 15. 关键文件清单 (待删除)

```
main.js                    # 拆分到 main/
checker.js                 # 拆分到 detectors/
renderer.js                # 拆分到 renderer/
index.html                 # 替换为 renderer 入口
```

## 16. 决策日志

| 决策 | 选项 | 选定 | 原因 |
|------|------|------|------|
| 重写 vs 渐进 | A. 全面重写 / B. 渐进优化 / C. 只修启动 | A | 用户选择 |
| 进程模型 | worker_threads / child_process / 主进程直接 await | worker_threads | 共享内存 + 启动快 |
| UI 框架 | Preact / React / Vue / vanilla | Preact + signals | 轻量 + 天然适合 progress 增量 |
| 状态管理 | signals / zustand / redux | signals | 自动精确更新, 少 50% 模板代码 |
| 升级并发 | 串行 / Promise.all / Promise.allSettled(concurrency=2) | allSettled(concurrency=2) | 平衡速度与 brew lock 兼容性 |
| Detector base 选型 | class / function / factory | class | 静态属性 name, 易扩展 |

## 17. 后续

下一步：调用 **writing-plans** skill，把本 spec 转化成 8 个 Phase 的实施计划（任务清单、依赖关系、并行机会、验收点）。
