# App Rollback · 升级备份 + 一键回滚 (2026-06-14)

## Problem

Pulse v2.11 的 app update 模块现在能检查 + 升级，但**没有后悔药**：

1. 升级完发现新版本卡顿 / 缺功能 / 兼容性破坏，只能等下一个修复版
2. brew 升级的 app 没法用 `brew switch` 之外的方式回滚（macOS 上 brew cask 升级后旧版被 GC 掉）
3. DMG 装的 app (Cursor / Marvis / WorkBuddy) 升级后旧 `.app` 被新文件覆盖，无法找回
4. 用户最多的是"我装的新版有 bug 想回去"，但 Pulse 不暴露任何回滚入口

## Goal

新增 **🕒 版本历史 + 一键回滚**：

- 升级**前**自动备份旧版本 `.app` 到 `~/Library/Application Support/Pulse/backups/`
- state.json 新增 `versionHistory[app]`，记录每次升级的 `from` / `to` / 备份路径 / 占用
- 每个 app 最多保留 **2 个历史版本**（cap，超出删最旧）
- AppRow 新增 **🕒 历史** 按钮（仅 brew 安装的 app 显示）
- 点击打开 `VersionHistoryDrawer`，倒序显示历史，**带"回滚"按钮**
- 回滚：杀进程 → Trash 当前新 .app → cp 旧 .app 回去 → 更新 installed_version → 单 app recheck → toast 通知

## Non-Goals (Out of Scope)

1. ❌ App Store / sparkle / electron_yml / app_update_yml / api_json 的回滚（不同升级机制，备份了也用不上）
2. ❌ 备份加密（本地 fs，macOS 已有 FileVault）
3. ❌ 备份云同步（跨设备兼容性问题）
4. ❌ 自动回滚（崩溃计数器，复杂度过高）
5. ❌ 备份 integrity check / 压缩
6. ❌ 备份占用报警 / 全局备份管理 UI
7. ❌ Header 全局"备份管理"入口
8. ❌ 备份删除的快捷键 / 自动化 GC
9. ❌ 备份版本号 diff / changelog 对比
10. ❌ 30 秒"撤销升级"按钮

## Design Decisions (Brainstormed)

| Decision | Choice | Rationale |
|---|---|---|
| 备份范围 | **只备份 brew 安装的 app** | DMG 装的也能备份，但非 brew 升级路径下备份的 .app 不会被新装替换（孤儿），没意义 |
| 备份方式 | **`cp -R` 整个 .app** | macOS 上最快、最直白；不用 tar/zip 节省开销 |
| 备份位置 | **`app.getPath('userData')/backups/<bundle>/<from>.app/`** | 跟 state.json 同级，路径在 `app ready` 后解析 |
| Cap 策略 | **每 app 留 2 个历史版本** | 平衡磁盘占用（典型 .app 100-500MB）和回滚选择 |
| 升级前 hook 位置 | **`runBulkUpgrade` 在 brew action 执行前** | 跟 `onProgress` / `signal` 同一层，备份失败 best-effort 不阻塞升级 |
| 回滚期间 app 还在跑 | **`osascript 'quit app'`, 5s 后 `kill -9`** | 给用户文档保存机会，超时硬杀 |
| 删除目标 .app 方式 | **`shell.trashItem`** (Electron API) | macOS Trash 可恢复；比 `rm -rf` 友好 |
| 数据持久化 | **`state.json.versionHistory` 顶层字段** | 跟 `mutes` / `last_opened` / `active_category` 平级 |
| UI 入口 | **AppRow 加 🕒 按钮 + 弹 VersionHistoryDrawer** | 复用现有 `AITasksDrawer` 模式 |
| Drawer 行展示 | **倒序，"当前"为第 1 行** | 跟 `RemindersModal` 一致 |
| 回滚后同步 | **更新 installed_version + 单 app recheck + recent activity 推送** | 复用现有 `worker.detect-app` task |
| 备份失败时 | **log warn, 升级继续, 不写 history** | 备份是 best-effort |
| Race condition | **state.json 加 `rollbackInProgress` 锁** | 避免双击回滚同 app 撞车 |

## Data Model

### `state.json.versionHistory` (新顶层字段, 持久化)

```ts
type VersionHistory = Record<string, VersionEntry[]>

interface VersionEntry {
  from: string         // 升级前 installed_version
  to: string           // 升级后 latest_version
  at: number           // 升级完成时间 (unix ms)
  backupPath: string   // ~/Library/Application Support/Pulse/backups/<bundle>/<from>.app
  source: string       // detector 源, e.g. "brew_formulae"
  sizeBytes: number    // 备份大小, 给 UI 展示
}
```

### 倒序规则

`versionHistory[app]` 数组里**第 0 个是当前装的新版本**（unshift），第 1 个是"上次升级前的版本"，依此类推。cap=2 时最多 2 条。

### 文件系统布局

```
~/Library/Application Support/Pulse/
├── state.json
├── backups/                         # 新增
│   ├── Cursor.app/
│   │   ├── 3.6.31.app/              # 整个 .app bundle 副本
│   │   └── 3.6.30.app/
│   ├── Kimi.app/
│   │   └── 1.2.3.app/
│   └── ...
```

文件名用 `from` 版本号不是 `to`：符合"我手头有 3.6.31，能 rollback 到这个"的直觉。

### 不影响 `changelog_history`

`state.json.apps[app].changelog_history` (Phase 18) 保留不动，正交：
- `changelog_history`: 每个版本的 changelog（什么变了）
- `versionHistory`: 用户的 app 版本演进（我装过什么版本 + 备份在哪）

## Flow

### 升级流（改 `runBulkUpgrade`）

```
runBulkUpgrade(items)
  for each item:
    action = getActionForApp(item)
    if action.type === 'brew' and cask:
      ① backupOldVersion(bundle, installedVersion)    # NEW, best-effort
         # cp -R /Applications/<bundle>.app
         #   → .../backups/<bundle>/<installedVer>.app/
         # 失败 → log warn, continue (不阻塞)
         pruneOldBackups(bundle, keep=2)              # 超 cap 删最旧
      ② brew upgrade --cask <cask>                     # 已有
      ③ 读 /Applications/<bundle>/Contents/Info.plist  # 用 worker 已有逻辑
         拿新 installed_version
      ④ recordUpgrade(app, from, to, backupPath)       # NEW
         # state.json.versionHistory[app].unshift({...})
    else if action.type === 'open' / 'open_url' / 'mas':
      不备份, 不记录 history
```

### 回滚流

```
renderer: user clicks "回滚到 3.6.31" in AppRow → "rollback-app" IPC
    │
    ▼
ipcMain.handle("rollback-app", (appName, toVersion))
  entry = versionHistory[appName].find(e => e.to === toVersion)
  if !entry or !fs.existsSync(entry.backupPath):
    return { ok: false, reason: "backup_missing" }

  bundle = appsCfg.find(a => a.name === appName).bundle
  target = /Applications/<bundle>

  set rollbackInProgress = true
  try:
    ① isAppRunning(bundle)   # pgrep -f <bundle>
       if running: osascript 'quit app "<name>"', wait 3s, kill -9 if alive
    ② 备份当前 (现在的 installed) → .../backups/<bundle>/rollback-prev-<ts>.app/
       # 关键: 用户回滚后再次回滚也能找回
    ③ shell.trashItem(target)   # 不真删, 走 Trash
    ④ cp -R entry.backupPath → target
    ⑤ updateStateAfterRollback(appName, toVersion)
       # state.json.apps[appName].installed_version = toVersion
    ⑥ singleAppRecheck(appName)  # 用 worker.detect-app
    ⑦ recentActivity.push({ kind: "app-rollback", ref: appName, label: ... })
    ⑧ sendToRenderer("version-history-updated", ...)
    ⑨ toast: "Cursor 已回滚到 3.6.31"
  catch err:
    return { ok: false, reason: "threw", error: err.message }
  finally:
    set rollbackInProgress = false
```

### 错误处理矩阵

| 失败点 | 行为 |
|---|---|
| 备份旧版本时 fs 错误 | log warn, 继续升级, 不写 history |
| 升级后读新 Info.plist 失败 | 升级仍标 succeeded, 不写 history |
| 回滚时 backup 已被用户删 | `{ ok: false, reason: "backup_missing" }` |
| 回滚时新 .app 删不掉 (系统锁定) | 提示"请关闭 X 后重试" |
| 回滚时新 .app 已不存在 (用户自己删) | 跳过 trash, 直接 cp |
| 同 app 两次回滚并发 | 第二个 pending, `rollbackInProgress` 锁 |
| `pruneOldBackups` 时旧备份删不掉 | log warn, 不影响升级, 累积下次 |
| `kill -9` 不了 | 5s 后放弃, 提示"请手动关闭 X" |

## UI Behavior

### AppRow 🕒 按钮

仅当 `state.json.versionHistory[app].length > 0` **且** `app.source in ['brew_formulae', 'brew_local_cask']` 时显示。

```
┌────────────────────────────────────────────────────────────┐
│ [icon] Cursor                3.6.31 → 3.6.32 (新)         │
│        Brew · 12 天前更新                                   │
│        [changelog 摘要...]                                  │
│        [查看 release notes ↗]  [🕒 历史]  [升级 ↻]          │
└────────────────────────────────────────────────────────────┘
```

### VersionHistoryDrawer

复用 `AITasksDrawer` 模式：header + 倒序 list + close。

```
┌──────────────────────────────────────────┐
│  ← Cursor · 版本历史                  ✕  │
├──────────────────────────────────────────┤
│  当前 · 3.6.32                           │  ← 第 1 行, 无回滚按钮
│  2 天前从此版升上来                        │
│  备份: 460 MB                             │
│                                          │
│  ──── 3.6.31                  [回滚] [🗑]│  ← 有备份
│  4 天前升级到此版, 备份完整 (478 MB)       │
│  [查看 changelog ▼]                      │
│                                          │
│  ──── 3.6.30                  [🗑]      │  ← 备份丢失
│  9 天前升级到此版, 备份已丢失              │
│                                          │
├──────────────────────────────────────────┤
│  共 3 条记录, 占用 938 MB                 │
│  [清空该 app 全部备份]                    │
└──────────────────────────────────────────┘
```

**行交互**：
- `回滚`: 二次确认 modal（"将退出 Cursor 并替换为 3.6.31，确定吗？"）→ 调 `rollback-app` IPC
- `🗑`: 单条删（确认）→ 删 entry + rm -rf 备份目录
- `清空该 app 全部备份`: 二次确认 → 删所有 entry + rm -rf `backups/<bundle>/`

### BulkUpgradeModal 文案

现有"将升级 N 个 app"加一行：
> "💾 升级前会备份当前版本，最多保留 2 个历史版本 (约 1GB / 5 个 app)"

## Architecture

### 新文件

- `src/main/backup.js` — backupOldVersion / pruneOldBackups / ensureBackupDir / backupDir
- `src/main/version-history.js` — recordUpgrade / listHistory / deleteEntry / getTotalSize
- `src/main/rollback.js` — restoreFromBackup / isAppRunning / killAppGraceful / doRollback
- `src/renderer/components/VersionHistoryDrawer.jsx` — 列表 + 行交互

### 改文件

- `src/main/state-store.js` — 加 `versionHistory` 字段读写 / 兼容老 state.json
- `src/main/bulk-upgrade.js` — brew action 执行前调 backup + recordUpgrade hook
- `src/main/ipc/register-core.js` — 3 个新 IPC handler
- `src/renderer/components/AppRow.jsx` — 🕒 按钮（条件渲染）
- `src/renderer/components/BulkUpgradeModal.jsx` — 加备份提示文案
- `src/renderer/store/index.js` (或合适位置) — 暴露 `versionHistory` 给 UI

### IPC

```
"get-version-history"  (appName)  → { entries: VersionEntry[] }
"rollback-app"         (appName, toVersion)
                                → { ok, reason?, error? }
"delete-backup"        (appName, version)
                                → { ok, reason? }
"version-history-updated"  (event, payload) 推送: appName + entries
```

## Testing

### 单元（vitest）

| 模块 | 文件 | 覆盖 |
|---|---|---|
| `backup.js` | `tests/main/backup.test.js` | 路径生成 / cap prune 顺序 / 不存在 bundle / cp 失败 log warn / path 拼接 |
| `version-history.js` | `tests/main/version-history.test.js` | recordUpgrade 写入 + cap / listHistory 倒序 / deleteEntry 同步 fs |
| `rollback.js` | `tests/main/rollback.test.js` | restoreFromBackup cp / rm 失败 throw / app running 检测 / trashItem 调用 |
| `state-store.js` (扩) | `tests/main/state-store.test.js` | `versionHistory` 字段 round-trip / 缺字段视 `{}` / 跟 mutes 互不干扰 |

### 集成

| 文件 | 测什么 |
|---|---|
| `tests/main/bulk-upgrade-with-backup.test.js` | brew action 时 backup 钩子被调 / 非 brew 不调 / backup 失败升级仍 succeeded |
| `tests/ipc/rollback-app.test.js` | 正常回滚 / backup 缺失 / app 还在跑 / 用户中断 |

### 不做

- ❌ 端到端 e2e（真装 DMG）→ 体积大、flake，留到手动 QA
- ❌ Worker 层的备份 → worker 是 detector，不该碰 fs
- ❌ Drawer 视觉 snapshot 测试 → 跟现有 `AITasksDrawer` 一样不做

### 手工 QA 清单

1. 装一个 brew cask app（e.g. `kakoune`），手动让它有 update，bulk upgrade
2. 检查 `~/Library/Application Support/Pulse/backups/<bundle>/<oldver>.app/` 存在
3. UI 上点 🕒 → 看到 1 条 history
4. 升到第 3 个版本 → 检查 cap=2，最旧被删
5. 回滚到中间版本 → 杀 app、cp 旧 → 重启 app 确认
6. kill -9 app → 回滚应提示"请手动关闭"
7. rm -rf backup 目录 → Drawer 显示"备份已丢失"，回滚按钮消失
8. App Store app (e.g. Things) → Drawer 入口不显示

## Implementation Steps

1. 写 `src/main/backup.js` + `tests/main/backup.test.js`
2. 写 `src/main/version-history.js` + 扩 `state-store.js` 加 `versionHistory` 字段
3. 改 `bulk-upgrade.js`：在 brew action 真正执行前调 backup + recordUpgrade
4. 写 `src/main/rollback.js` + `tests/main/rollback.test.js`
5. 扩 `register-core.js`：3 个新 IPC handler
6. 写 `src/renderer/components/VersionHistoryDrawer.jsx` + store 扩
7. 改 `AppRow.jsx`：加 🕒 按钮（仅 brew source）
8. 改 `BulkUpgradeModal.jsx`：加备份提示文案
9. 跑 `npx vitest run` + `npm run build:renderer` 验证
10. PR 描述里贴手工 QA 清单
