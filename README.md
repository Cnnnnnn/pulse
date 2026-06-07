# AppUpdateChecker

macOS 菜单栏小工具 — 盯着你装的那批 app，一旦有新版就提醒。

> tray icon 常驻，点开看 11 个 app 的"已装 → 最新"对比，一键 `brew upgrade` 升级。

## 它做什么

打开后是个 floating window，列着你配的每个 app：

```
已安装   2.5.3        →   2.5.3          已是最新
已安装   3.6.31       →   3.6.31         已是最新
已安装   1.0.0.10155  →   1.0.10051      [升级]   ← 一键 brew upgrade
已安装   5.0.2        →   5.0.2          已是最新
...
```

- **tray icon 红色 badge** = 有 N 个 app 待升级
- **每行可点**（行 → 打开 app 官方下载页；按钮 → 升级）
- **检测失败/版本读不准** = 标红，但**上次成功结果**仍在（last-known 缓存）
- **检测源**：plist → `~/Library/Application Support/{bundleId}/installed.json` → MMKV/自定义 regex_file → system_profiler（兜底链）

## 装上

下载 `.dmg` 拖进 `/Applications/`。首次运行授权：
- "AppUpdateChecker 想要访问 .../Applications" — 给
- 通知权限（macOS 13+）— 给，否则收不到更新横幅

## 加/改 app

编辑 `config.json`（应用关闭后改，下次启动自动重读）：

```json
{
  "apps": [
    {
      "name": "MyApp",
      "bundle": "MyApp.app",
      "download_url": "https://example.com/download",
      "version_sources": [
        { "type": "installed_json" },
        { "type": "plist" }
      ],
      "detectors": [
        { "type": "brew_formulae", "cask": "myapp" },
        { "type": "electron_yml",  "url": "https://example.com/latest.yml" }
      ]
    }
  ]
}
```

`version_sources` 决定"已装版本"从哪里读（按顺序尝试，第一个非空 wins）。`detectors` 决定"最新版本"从哪里查（high confidence 命中即停，否则 fallback）。详见 [docs/](docs/) 里的 detector 文档。

## 它支持哪些检测方式（detector）

| Type | 用法 | 例 |
|------|------|----|
| `brew_formulae` | Homebrew cask API | Cursor / Kimi / CodexBar |
| `sparkle_appcast` | macOS Sparkle feed | Codex / QClaw |
| `electron_yml` | electron-builder latest-mac.yml | MiniMax Code / Marvis |
| `app_store_lookup` | iTunes lookup API | IMA (从 app id 查) |
| `api_json` | 通用 JSON API (顶层 `version` 字段) | WorkBuddy |
| `redirect_filename` | 跟 HEAD 重定向，从文件名提取 | Kimi |
| `cursor_redirect` | Cursor 专用（major track → brew 覆盖）| Cursor |
| `qclaw_api` | QClaw 私有 API | QClaw |
| `app_update_yml` | electron-updater 通用 | 通用 |
| `brew_local_cask` | 读本地 brew metadata | 通用 |

## 开发

```bash
npm install
npm run dev          # 起 electron + 自动 rebuild renderer
npm test             # 跑 vitest
npm run build        # 出 .dmg 到 dist/
```

`scripts/` 里有几个一次性工具：
- `record-fixtures.js` — 把真实 API 响应 dump 到 `tests/fixtures/`，给 unit test 当 fixture
- `startup-bench.js` — 跑 N 次启动，量 startup median
- `brew-lock-bench.js` — brew upgrade 并发 2 vs 3 vs 4 实测

## 架构（粗略）

```
┌─────────────┐
│  Renderer   │  Preact + signals
│ (App.jsx)   │  bootstrap → getCachedState → render
└──────┬──────┘
       │ IPC (preload.js 桥)
┌──────▼──────────────────────────────┐
│           Main Process                │
│  index.js → ipc.js → window/tray     │
│  WorkerPool (11 worker threads)       │
│  state-store (last-known 持久化)       │
└──────┬───────────────────────────────┘
       │ worker_threads
┌──────▼──────────────────────────────┐
│  detect-worker.js × N                  │
│  → getInstalledVersion (plist chain) │
│  → runDetectorChain                   │
│  → compareVersions                    │
│  → result { installed, latest, ... }  │
└───────────────────────────────────────┘
```

详见 [docs/superpowers/specs/](docs/superpowers/specs/)。

## 已知问题 / 限制

- **不支持 Linux/Windows** — 用了 macOS 专属命令（`plutil` / `system_profiler`）
- **CJK 显示依赖系统字体** — 在某些 Linux 桌面跑可能方块字
- **首次跑会并发打 11 个外部 API** — 没事，但有些公司内网限流可能挂
- **state 文件位置**：`~/Library/Application Support/AppUpdateChecker/state.json`，删掉等于清缓存
- **brew upgrade 需要先装 homebrew** — 否则按钮点了会失败

## License

MIT
