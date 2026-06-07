# Bulk Upgrade 设计 Spec

- **日期**: 2026-06-06
- **作者**: Mavis (brainstorming-2)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (AppUpdateChecker v2.x)
- **目标特性**: 一键批量升级所有有更新的 app

## 1. 背景

AppUpdateChecker v2.0.0 已有 11 个 dev 工具 app 的更新检测：
- 4 个 brew cask: Cursor, Kimi, CodexBar, CC Switch
- 7 个其他源: Codex, MiniMax Code, QoderWork, WorkBuddy, Marvis, QClaw, IMA

**当前痛点**：检测出"X 有更新"后，用户必须：
- brew app → 打开 Terminal → `brew upgrade --cask <name>` 逐个
- sparkle app → 打开 app 等自带 updater 弹
- app store app → 打开 App Store 找更新
- 其它 → 手动去官网

每次升级 4-5 个 app 是 5-10 次手动操作。

**用户确认方向**：A. 新功能 → 每日重复动作 → 一键 Bulk Upgrade

## 2. 目标

提供"一个按钮升级所有有更新的 app"的能力：

1. 顶部一个 "Upgrade All (N)" 按钮，N = 有更新的 app 数
2. 点击打开 modal，按数据源分组列出可升级 app
3. 每行可勾选/取消；某些源（如 `redirect_filename`）无可执行升级路径 → 灰选
4. "Upgrade N apps" 开始顺序执行
5. 每行实时状态：pending → running → done / failed / skipped
6. 完成后汇总 + 失败可单独 Retry

## 3. 非目标 (YAGNI)

- **不**做定时/计划升级（cron + 后台跑）—— 风险高，单步可控优先
- **不**做并发升级 —— brew mutex / sparkle 弹窗会冲突
- **不**做 undo / 备份 —— 用户自己负责
- **不**做 config 开关（默认开；per-app opt-out 后续再说）
- **不**做升级前 pre-check（磁盘空间、网络等）—— 留给 brew 自己
- **不**做 mas CLI 集成 —— 直接走 `macappstore://` 深链

## 4. 整体流程

```
[renderer]                                 [main]
                                              
appState (apps with updates)                 
        │                                    
        ├─ count N ──> <BulkUpgradeButton>   
        │                                    
        └─ click ──> <BulkUpgradeModal>      
                          │                   
                          │ bulk-upgrade:start 
                          │ [{id, name, source, 
                          │   current, latest,  
                          │   cask, bundleId,   
                          │   trackId}, ...]    
                          ├───────────────────> bulk-upgrade.js
                          │                    runBulkUpgrade()
                          │                         │
                          │                         ├─ for each item:
                          │                         │    getActionForApp(item)
                          │                         │    exec (brew/open/mas)
                          │                         │    catch error
                          │                         │
                          │  bulk-upgrade:progress │◄──── per-item done
                          │  {id, status, error?}  │
                          │                         │
                          │  bulk-upgrade:done     │◄──── all done
                          │  {succeeded, failed,   │
                          │   skipped, cancelled}  │
                          │                         
                          └─ cancel ──────────────> stop after current item
```

## 5. UX 细节

### 5.1 按钮

- 位置：顶部 header，"Check Now" 右侧
- 文案：
  - N > 0: `Upgrade All (N)`（主色，可点）
  - N = 0: `All up to date`（灰态，disabled）
  - 进行中: `Upgrading 3/7...`（disabled，显示进度）
- 不在主列表行内重复按钮

### 5.2 Modal

- 标题: "Bulk Upgrade (N apps)"
- 分组：按 source type 分 section（brew / sparkle / app_store / electron / manual）
- 每行 schema：
  ```
  [✓] Cursor         3.6.31 → 3.7.12     [brew]
  [✓] CodexBar       0.32.3 → 0.32.4     [sparkle]
  [ ] WorkBuddy      1.0.0 → 1.1.0       [electron]   (no auto-upgrade)
  ```
- 状态（升级中/后）：
  ```
  [✓] Cursor         3.6.31 → 3.7.12     [done]
  [↻] Kimi           3.0.14 → 3.0.15     [running...]
  [✗] CC Switch      3.16.0 → 3.16.1     [failed: cask not installed]
  [—] WorkBuddy                              [skipped: no auto-upgrade]
  ```
- 失败行带 "Retry" 按钮
- 底部：
  - 升级前：`Cancel` + `Upgrade N apps`（主按钮）
  - 升级中：`Cancel` + `Running 3/7`（disabled 状态）
  - 完成后：`Close` + 汇总文字 `3 succeeded, 1 failed, 2 skipped`

### 5.3 取消行为

- 用户按 modal 关闭（X / Esc）→ 发 `bulk-upgrade:cancel`
- main 进程在当前 item 完成后停下
- 已 done 的行保留状态；未跑的标 `cancelled`

## 6. 各源动作映射

| source type | action | 备注 |
|---|---|---|
| `brew_formulae` | `child_process.exec("brew upgrade --cask <cask>")` | 顺序，5min timeout |
| `brew_local_cask` | 同上 | 同上 |
| `sparkle_appcast` | `shell.openPath("/Applications/<name>.app")` | 让 app 自带 updater 弹 |
| `app_store_lookup` | `shell.openExternal("macappstore://apps.apple.com/app/id<trackId>")`<br>失败回退 `https://apps.apple.com/app/id<trackId>` | trackId 来自 app_store_lookup |
| `electron_yml` (autoUpdater) | `shell.openPath("/Applications/<name>.app")` | 假设有内置 updater |
| `qclaw_api` / `api_json` (electron) | 同上 | 同上 |
| `redirect_filename` / `app_update_yml` / 无明确源 | **noop** | 标 `skipped: no auto-upgrade`，checkbox disabled |

**判断逻辑**集中在 `bulk-upgrade-actions.js` 纯函数 `getActionForApp(item)`：

```js
function getActionForApp(item) {
  const src = item.source;
  if (src === 'brew_formulae' || src === 'brew_local_cask') {
    return { type: 'brew', cmd: 'brew', args: ['upgrade', '--cask', item.cask] };
  }
  if (src === 'sparkle_appcast') {
    return { type: 'open', path: `/Applications/${item.bundleName}.app` };
  }
  if (src === 'app_store_lookup') {
    return { type: 'mas', trackId: item.trackId, appName: item.name };
  }
  if (src === 'electron_yml' || src === 'qclaw_api' || src === 'api_json') {
    return { type: 'open', path: `/Applications/${item.bundleName}.app` };
  }
  return { type: 'none', reason: 'no auto-upgrade' };
}
```

## 7. 文件改动

| 路径 | 操作 | 说明 |
|---|---|---|
| `src/main/bulk-upgrade-actions.js` | **new** | 纯函数 `getActionForApp(item)`，返回 action 对象 |
| `src/main/bulk-upgrade.js` | **new** | `runBulkUpgrade(items, onProgress, signal)` 顺序执行器，per-app try/catch + 5min timeout + AbortSignal 支持 |
| `src/main/ipc.js` | edit | 加 `bulk-upgrade:start` / `bulk-upgrade:cancel` 2 个 handler |
| `src/preload.js` | edit | 暴露 `window.bulkUpgrade.{start, cancel, onProgress, onDone}` |
| `src/renderer/components/BulkUpgradeButton.jsx` | **new** | 顶部按钮，从 `appState` 算 N |
| `src/renderer/components/BulkUpgradeModal.jsx` | **new** | 弹窗，订阅 progress 事件 |
| `src/renderer/App.jsx` | edit | 挂按钮 + modal state |
| `src/config/schema.js` | **不动** | v1 不加 config 字段 |
| `tests/main/bulk-upgrade-actions.test.js` | **new** | 10+ case 覆盖各 source |
| `tests/main/bulk-upgrade.test.js` | **new** | mock child_process，顺序 / 超时 / 部分失败 / 取消 |
| `tests/renderer/BulkUpgradeModal.test.jsx` | **new** | happy-dom，渲染 / 勾选 / 进度 |
| `tests/renderer/BulkUpgradeButton.test.jsx` | **new** | count / disabled |

## 8. 数据结构

### IPC event: `bulk-upgrade:start`

**Request**:
```js
[
  { id: 'cursor', name: 'Cursor', source: 'brew_formulae', 
    current: '3.6.31', latest: '3.7.12', cask: 'cursor' },
  { id: 'codexbar', name: 'CodexBar', source: 'sparkle_appcast',
    current: '0.32.3', latest: '0.32.4', bundleName: 'CodexBar' },
  { id: 'ima', name: 'IMA', source: 'app_store_lookup',
    current: '2.5.0', latest: '2.5.1', trackId: 1234567890 },
  // ...
]
```

**字段来源**：
- `id` / `name` / `source` — `appState` 里的 app config
- `current` / `latest` — `DetectorResult` 里的 version 字段
- `cask` — `detectors[].cask`（brew_formulae 提取时已存）
- `bundleName` — `name + '.app'` 派生（或读 `app_path` 的 basename）
- `trackId` — `app_store_lookup` 探测器结果（需在 `pickReleaseNotes` 旁加 `pickTrackId` 提取）

**Progress event** `bulk-upgrade:progress`:
```js
{ id: 'cursor', status: 'running' }
{ id: 'cursor', status: 'done', durationMs: 12400, output: '...' }
{ id: 'kimi', status: 'failed', error: 'Cask kimi not installed', output: '...' }
```

**Done event** `bulk-upgrade:done`:
```js
{ 
  succeeded: ['cursor', 'kimi'],
  failed: [{id: 'cc-switch', error: '...'}],
  skipped: ['workbuddy'],
  cancelled: false
}
```

## 9. 错误处理

| 场景 | 行为 |
|---|---|
| 单个 app 失败 | catch error，状态 `failed`，继续下一个 |
| brew 5min 超时 | kill child process，标 `failed: timeout` |
| `shell.openPath` 路径不存在 | 标 `failed: app not found at <path>` |
| `macappstore://` 失败 | 自动回退到 `https://` URL，再失败则标 `failed` |
| 用户取消 | 当前 item 完成后停下，未跑的标 `cancelled`，已 done 的保留 |
| main 进程崩了 | renderer 5s 无 progress 事件 → 弹错误提示 |

stdout/stderr 截前 4KB 存 progress 事件，UI 行末尾有 "view output" 链接展开。

## 10. 测试策略

### 10.1 Unit

**`bulk-upgrade-actions.test.js`** (10+ cases):
- 6 种 source type 各一个 case
- 未知 source → `none`
- missing `cask` / `trackId` / `bundleName` → fallback
- brew source 优先级（`brew_formulae` vs `brew_local_cask`）

**`bulk-upgrade.test.js`** (~12 cases):
- happy path：3 app 全成功
- 1 个失败：继续后面，最后汇总正确
- 1 个 timeout：标 failed
- 取消：跑到第 2 个时 cancel，第 1 个 done / 第 2 个 running / 第 3 个 cancelled
- empty list：直接 done
- mock `child_process.exec` 验证 cmd + args

### 10.2 Component

**`BulkUpgradeButton.test.jsx`** (4 cases):
- N=0 disabled
- N=3 显示 `Upgrade All (3)`
- 升级中 disabled + 显示 `Upgrading X/Y...`
- click 打开 modal

**`BulkUpgradeModal.test.jsx`** (~10 cases):
- 初始 render
- checkbox toggle
- 收到 progress event 更新行状态
- done 事件触发汇总 footer
- failed 行有 Retry 按钮
- 点击 Retry 重跑该 app

### 10.3 跳过

- 真实 brew 执行（破坏性）—— 单元测试 mock
- E2E 真实 modal → 真 brew —— 风险太大，CI 不跑

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `brew upgrade` 是破坏性的 | 确认 modal + 每行可取消 + 显示 current→latest |
| 顺序慢（10 app × 30s = 5min） | Cancel 路径 + 进度可见 + 用户预期明确 |
| Sparkle open 不弹更新 | 文档说明「取决于 app」，失败有明确 message |
| App Store 深链不稳 | `macappstore://` 失败自动回退 `https://` |
| main 崩了 renderer 卡死 | 5s 无 progress 弹错误 + 强制关 modal |
| per-app 同时 cancel + done | AbortSignal 只在每个 item 结束后检查，避免半完成态 |

## 12. 实施计划（顺序）

1. **`bulk-upgrade-actions.js`** (30 min) —— 纯函数最稳，先打地基 + 10+ unit test
2. **`bulk-upgrade.js`** (1.5h) —— mock exec 测试顺序 / 超时 / 取消
3. **IPC + preload** (30 min) —— 2 个 handler + 暴露 API
4. **`BulkUpgradeButton.jsx`** (30 min) —— 简单按钮 + 4 case 测试
5. **`BulkUpgradeModal.jsx`** (1.5h) —— 最复杂，先 happy-dom 测渲染 + 勾选 + 进度
6. **集成 + 全测** (30 min) —— `npm test` + 手动跑一次（用 brew upgrade 一个真实 app）
7. **build + 验证** (30 min) —— `./scripts/build.sh` 出 dmg + 跑一次

**总计：5-6h**

## 13. 后续 (out of scope)

- Per-app opt-out 配置（`bulk_upgrade_skip: true`）
- 升级前磁盘空间 / 网络检查
- mas CLI 集成
- 定时升级 / 后台 cron
- 升级历史持久化（state.json 记录何时升过）
- 通知 click → 触发对应 bulk upgrade action
