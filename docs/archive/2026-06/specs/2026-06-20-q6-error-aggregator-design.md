# Pulse Q6 错误聚合 + 诊断面板 (2026-06-20)

| 日期       | 作者         | 状态     |
| ---------- | ------------ | -------- |
| 2026-06-20 | brainstorming | 设计中   |

## 1. 背景与目的

Pulse 当前已有基础的 main 进程日志(`src/main/log.js` 写 `~/Library/Application Support/pulse/logs/main-YYYY-MM-DD.log`)和 renderer 端的 `onMainError` toast 推送(`src/main/ipc/register-core.js` 中通过 `installErrorGuardBridge` 转发)。但:

- **没有统一面板**:用户看不到历史错误、不能浏览 / 复制 / 清理,只能等下次 toast
- **renderer 端未捕获错误没聚合**:Preact 的 ErrorBoundary 缺位,渲染崩溃后用户只看到白屏
- **没有 diagnostic 导出**:遇到奇怪 bug 想发给开发者时,没有"一键复制 + 一键导出 zip"

Roadmap `2026-06-19-product-roadmap-design.md §5.1 Q6` (价值 3 / 成本 1 / 风险 1,总分 8) + `§5.1 Q1`(价值 3 / 成本 2 / 风险 1,总分 7)的合并实施 — **错误聚合(核心)+ 诊断面板(展示 + 操作 UI)**。

## 2. 范围与非范围

### 范围内

1. **错误聚合器**(`src/main/error-aggregator.js`):捕获 main + renderer 未捕获错误,按日期 JSONL 写盘,保留 30 天,提供 `query(opts) → {entries, stats}` 接口
2. **Renderer 错误捕获**(`src/renderer/components/ErrorBoundary.jsx`):Preact ErrorBoundary 包 App,捕获组件渲染异常,IPC 上报 main
3. **Main ErrorGuard 桥接扩展**(`src/main/error-guard.js` 已有,扩展):renderer IPC `error:report` + `error:renderer-throw` 全部走同一聚合器
4. **诊断面板**(`src/renderer/components/DiagnosticsDrawer.jsx`):侧栏抽屉,显示错误列表 + stats + 趋势 + "一键复制全部" + "导出 zip"
5. **store signals**:`diagnosticsDrawerOpen`, `errorEntries`, `errorStats`
6. **IPC**: `error:fetch-entries`, `error:copy-all`, `error:export-zip`, `error:clear-old`, `error:open-folder`
7. **App.jsx mount**:`<ErrorBoundary><App ... /></ErrorBoundary>` + `<DiagnosticsDrawer />`
8. **Trigger**:每次错误 → 沿用现有 `onMainError` toast(用户已在用,不破坏)
9. **CSS**: `.diagnostics-drawer` + `.error-entry` blocks
10. **state.json**:不增加新字段(纯文件系统)

### 非范围(留给后续)

- 远程错误上报(Sentry / 自建) — YAGNI,Q6 明确"纯本地"
- 错误去重 / 聚合(同一错误 1 小时内折叠) — YAGNI,先看原始列表
- 按 severity 分类 — YAGNI,所有 error 同等权重
- stack trace 自动 source-map 反解 — YAGNI,需要 sourcemap 构建管线
- 自动 crash reporter 集成 — YAGNI,现有机制足够

## 3. 架构与文件结构

```
src/main/error-aggregator.js           # 核心:append / query / cleanup
src/main/bootstrap/error-init.js       # 启动期 wire(installErrorGuard + process listeners)
src/renderer/error-reporting.js        # 全局 ErrorHandler(send to main via api.errorReport)
src/renderer/components/ErrorBoundary.jsx  # Preact ErrorBoundary
src/renderer/components/DiagnosticsDrawer.jsx  # UI
src/renderer/diagnostics/diagnostics-store.js  # signals

tests/main/error-aggregator.test.js
tests/renderer/DiagnosticsDrawer.test.jsx
tests/renderer/ErrorBoundary.test.jsx
```

**修改**:
- `src/main/index.js`: 启动期 `initErrorAggregator({userDataDir})` + `installErrorGuardBridge` 改为走聚合器
- `src/main/ipc/register-core.js`: 4 个新 IPC handler
- `src/main/error-guard.js`(已有):转发改为聚合器
- `src/main/bootstrap/send-to-renderer.js`:无改动
- `preload.js`:5 个新方法
- `src/renderer/api.js`:5 个 wrapper
- `src/renderer/store/index.js`:re-export diagnostics-store
- `src/renderer/index.jsx`:全局 `window.onerror` + `unhandledrejection` 监听 → `api.errorReport`
- `src/renderer/App.jsx`:包 ErrorBoundary + 挂 DiagnosticsDrawer
- `styles.css`:`.diagnostics-drawer` + `.error-entry` blocks(~80 行)
- `RELEASE-NOTES.md`:新 Unreleased section

## 4. 数据流

### 写入路径

```
[main uncaught]               [renderer uncaught]
   ↓                             ↓
process.on('uncaughtException')  window.onerror / unhandledrejection / ErrorBoundary
   ↓                             ↓ (via api.errorReport)
error-aggregator.append({source, ts, level, message, stack, context})
   ↓
fs.appendFileSync(`${userDataDir}/logs/errors-${ymd}.jsonl`, JSON.stringify(entry) + '\n')
   ↓ (memory cache)
   ↓
sendToRenderer('error:appended', {date, count, latest})
   ↓
DiagnosticsDrawer signal updates → toast (现有 onMainError 通道)
```

### 查询路径

```
api.errorFetchEntries({since, limit, level}) 
  → IPC 'error:fetch-entries' 
  → aggregator.query(opts) 
  → readDirSync(logs) + readFileSync + parse JSONL (按 since 过滤 + limit 截断) 
  → return {entries, stats}
```

### 清理路径

```
app boot / daily / manual
  → aggregator.cleanup(retentionDays=30)
  → readDirSync + unlinkSync 旧文件
```

## 5. 错误 entry 格式

```json
{
  "id": "err_2026-06-20_153012_xyz",     // sha-prefix for dedupe
  "ts": 1750413012000,
  "source": "main" | "renderer",
  "level": "error" | "warn" | "unhandled",
  "message": "Cannot read property 'x' of undefined",
  "stack": "Error: ...\n  at ...\n  at ...",
  "context": {
    "url": "/Users/me/...",               // optional, file path involved
    "componentStack": "Preact component tree (renderer only)",
    "appVersion": "2.2.0",
    "platform": "darwin",
    "arch": "arm64"
  }
}
```

## 6. IPC 接口

| Channel                | Direction       | Payload     | Response                  |
| ---------------------- | --------------- | ----------- | ------------------------- |
| `error:fetch-entries`  | renderer → main | `{since?, limit?, level?}` | `{ok, entries, stats}` |
| `error:copy-all`       | renderer → main | (none)      | `{ok, text}`              |
| `error:export-zip`     | renderer → main | `{since?}`  | `{ok, path}`              |
| `error:clear-old`      | renderer → main | `{retentionDays?}` | `{ok, removed}`     |
| `error:open-folder`    | renderer → main | (none)      | `{ok}` (uses shell.openPath) |

**preload**:
```js
errorFetchEntries: (opts) => ipcRenderer.invoke("error:fetch-entries", opts),
errorCopyAll: () => ipcRenderer.invoke("error:copy-all"),
errorExportZip: (opts) => ipcRenderer.invoke("error:export-zip", opts),
errorClearOld: (opts) => ipcRenderer.invoke("error:clear-old", opts),
errorOpenFolder: () => ipcRenderer.invoke("error:open-folder"),
errorReport: (entry) => ipcRenderer.invoke("error:report", entry),  // renderer → main direct
onErrorAppended: (cb) => ipcRenderer.on("error:appended", (_, data) => cb(data)),
```

## 7. 诊断面板 UI

```
┌─ Diagnostics (12 errors today) ───────────── [×]┐
│ [Refresh] [Copy All] [Export ZIP] [Open Folder] │
│ Last 24h: 5 errors | Total: 12                   │
│ ─────────────────────────────────────────────── │
│ 15:30:12 [main] error                            │
│   Cannot read property 'x' of undefined          │
│   at detector-chain.js:243                        │
│   [Copy]                                          │
│ ─────────────────────────────────────────────── │
│ 14:22:08 [renderer] unhandled                    │
│   TypeError: ...                                  │
│   component: AITasksDrawer                       │
│   [Copy]                                          │
│ ...                                              │
│ [Clear > 30 days old]                            │
└──────────────────────────────────────────────────┘
```

## 8. 错误处理

| 场景                          | 行为                                        |
| ----------------------------- | ------------------------------------------- |
| 主进程错误 + JSONL 写盘失败   | 双重 fallback:memory + console.warn,绝不阻塞 |
| renderer IPC 上报失败          | 静默吞掉(避免错误链),console.error log     |
| diagnostics 面板加载 entries 失败 | 显示 "无法加载错误日志" + 重试按钮       |
| export-zip 失败(磁盘满)       | 返回 {ok:false, reason},UI 显示 toast       |
| retention cleanup 失败         | log warn + 下次重试,不影响 app            |

## 9. 测试

### 单元测试(纯函数)

- `error-aggregator.test.js` (8+ cases)
  - append creates/uses today's file
  - query filters by since + limit
  - query computes stats correctly
  - cleanup removes old files
  - cleanup keeps recent files
  - corrupt JSONL line is skipped (don't crash)
  - concurrent appends don't corrupt file
  - entry id format is stable

- `ErrorBoundary.test.jsx` (4+ cases)
  - child error → fallback rendered
  - child error → main notified
  - no error → normal children rendered
  - error thrown in nested component → caught

- `DiagnosticsDrawer.test.jsx` (5+ cases)
  - closed = nothing rendered
  - open = empty list shows "no errors"
  - open + entries = list rendered
  - copy-all button copies text
  - export-zip triggers IPC

### 集成测试

- error:report → append → query 拿到
- process.on('uncaughtException') → append
- cleanup on boot removes old files

### 手动 e2e

1. Settings → Diagnostics → 触发一个测试错误 → 看到 toast + 抽屉中有一条
2. 关闭抽屉,点击 footer 的 "诊断" 按钮,看到完整列表
3. "Copy All" → 粘贴确认是 JSON
4. "Export ZIP" → finder 打开压缩包
5. 设置 retention = 7 天 → 触发 cleanup → 旧文件被删

## 10. 文件清单

**新增**:
- `src/main/error-aggregator.js` (核心,150 行)
- `src/main/bootstrap/error-init.js` (启动 wire,30 行)
- `src/renderer/error-reporting.js` (全局错误监听,40 行)
- `src/renderer/components/ErrorBoundary.jsx` (40 行)
- `src/renderer/components/DiagnosticsDrawer.jsx` (180 行)
- `src/renderer/diagnostics/diagnostics-store.js` (signals)
- `tests/main/error-aggregator.test.js` (8+ tests)
- `tests/renderer/ErrorBoundary.test.jsx` (4+ tests)
- `tests/renderer/DiagnosticsDrawer.test.jsx` (5+ tests)

**修改**:
- `src/main/index.js`(启动 + cleanup)
- `src/main/ipc/register-core.js`(+5 safeHandle)
- `src/main/error-guard.js`(扩展走聚合器)
- `preload.js`(+6 method)
- `src/renderer/api.js`(+6 wrapper)
- `src/renderer/store/index.js`(+1 export)
- `src/renderer/index.jsx`(+全局监听)
- `src/renderer/App.jsx`(+ErrorBoundary + DiagnosticsDrawer)
- `styles.css`(+~80 行)
- `RELEASE-NOTES.md`(+1 section)

## 11. 风险与缓解

| 风险                                | 缓解                                                       |
| ----------------------------------- | ---------------------------------------------------------- |
| JSONL 文件无限增长                  | 30 天 retention + boot 时 cleanup                          |
| 错误日志暴露用户隐私(路径/token)   | 记录但 mask 敏感字段(API key 等),context 中不存 raw 输入 |
| 错误时序错乱导致 panel UI 不一致    | entry id 自带 timestamp 排序 + last-write-wins 缓存       |
| 主进程 IO 错误反而产生更多错误       | 聚合器内 try/catch + memory fallback,失败时仅 console.warn |
| 用户隐私(导出 zip 包含本地路径)     | 导出内容只含堆栈 + message(已 sanitize),不包含 state.json |
| 启动期 cleanup 错误                 | 单独 try/catch 包住,失败不影响 bootstrap                   |

## 12. Self-Review

1. **范围检查**:Q6 + Q1 合并是否过大?— 不大,aggregator 是纯 IO 抽象,UI 是标准 list 渲染,可拆分清晰。
2. **占位符**:无 TBD。
3. **内部一致性**:aggregator 输出 → IPC 返回 → drawer 渲染,链路单一。
4. **歧义**:entry id 用时间戳前缀还是 sha?— 用时间戳前缀(human-readable),结合 ts 字段可重排。
5. **TypeScript exhaustiveness**:JS 项目,无需 `never`,但 ErrorBoundary fallback 走 `getDerivedStateFromError` 标准 Preact pattern。

## 13. Handoff

Spec 完成后:
1. 用户审阅
2. 调用 `writing-plans` 技能,产 plan
3. plan 批准后,subagent-driven 实施
