# Pulse

macOS / Windows 菜单栏小工具 — 盯着你装的那批 app 的版本，一旦有新版就提醒。

> tray icon 常驻，点开看 13 个 app 的"已装 → 最新"对比，一键升级（macOS 走 `brew upgrade` / Windows 走 `winget upgrade`）。右击任一行可临时静音（按使用频率智能排序）。

## 下载安装

从 [GitHub Releases](https://github.com/Cnnnnnn/pulse/releases/latest) 下载对应平台的安装包：

### macOS (Apple Silicon)

1. 下载 `Pulse-2.19.0-arm64.dmg`
2. 打开 dmg，把 Pulse 拖进 `/Applications/`
3. 首次运行授权：
   - "Pulse 想要访问 .../Applications" — 允许
   - 通知权限（macOS 13+）— 允许，否则收不到更新横幅

> Intel Mac 暂未提供预编译包，可从源码 `npm run build:mac -- --x64` 自行构建。

### Windows

1. 根据你的 CPU 架构下载：
   - **x64**（Intel / AMD）：`Pulse-Setup-2.19.0-x64.exe`
   - **arm64**（Snapdragon X 等）：`Pulse-Setup-2.19.0-arm64.exe`
2. 双击运行安装包
3. 升级走 `winget`（Windows 10 1709+ 自带，需在系统设置里开启）

> 不确定架构？任务管理器 → 性能 → CPU，看右上角"机率"或"体系结构"。

## 它做什么

打开后是个 floating window，列着你配的每个 app：

```
[全部 13] [🤖 AI 工具 3] [🛠 开发者 4] [💬 沟通 2] [📦 其他 0]   ← 顶部 category tab
─────────────────────────────────────────────────────────
已安装   2.5.3        →   2.5.3          已是最新
已安装   3.6.31       →   3.6.31         已是最新
已安装   1.0.0.10155  →   1.0.10051      [升级]   ← 一键升级
已安装   5.0.2        →   5.0.2          已是最新
...
```

- **tray icon 红色 badge** = 有 N 个 app 待升级
- **顶部 category tab** (v2.4+) — 按 8 个分类过滤 (AI 工具 / 开发者 / 浏览器 / 沟通 / 媒体 / 笔记 / 系统 / 其他)，按 `0-9` 数字键快速切
- **每行可点**（行 → 打开 app 官方下载页；按钮 → 升级）
- **检测失败/版本读不准** = 标红，但**上次成功结果**仍在（last-known 缓存）
- **平台原生 UI** — macOS 磨砂玻璃窗口（vibrancy），Windows acrylic 半透明
- **检测源**：
  - macOS：plist → `installed.json` → MMKV/自定义 regex_file → system_profiler（兜底链）
  - Windows：注册表（3 个 Uninstall 根键）→ winget → electron-builder yml

## 提醒 (v2.11+)

**opt-in** — 装上就能用, 0 配置. Header ⏰ 按钮 + 弹 RemindersModal.

- **新建**: `⌘⇧R` 一键打开新建表单 / 标题 + 触发时间 + 4 种重复 (一次 / 每天 / 工作日 / 每周某天)
- **触发**: 到时间系统通知 + Header 红 badge, 状态切 `fired` (待 ✓ 打卡, 避免通知一划就忘)
- **完成**: 一次性 → 自动删; 重复规则 → 算下次时间, 自动切回 pending
- **持久化**: `state.json.reminders[]`, 重启不丢
- **快捷键**: `⌘⇧R` 打开新建 / `Esc` 取消 / `Cmd+Enter` 保存

不跟系统 Reminders.app 同步, 不联动其他模块, 纯本地小工具.

## 最近活动 (v2.11+)

Header 🕒 按钮 — 跨 5 个 tab 统一时间线, 倒序展示"最近我做了什么". 容量走 `config.json.recentActivity.maxEntries` (默认 200).

## AI 编程会话每日总结 (v2.5+)

**opt-in** (默认关闭，不影响老用户)。打开 Header **⚙️** → Settings → 启用。

支持的 LLM provider:

| Provider | 类型 | Auth | 默认 model |
|----------|------|------|-----------|
| OpenAI | 云端 | Bearer | `gpt-4o-mini` |
| Anthropic | 云端 | `x-api-key` | `claude-sonnet-4-5` |
| DeepSeek | 云端 | Bearer (OpenAI 兼容) | `deepseek-chat` |
| MiniMax | 云端 | Bearer (OpenAI 兼容) | `MiniMax-M3` |
| GLM (智谱) | 云端 | Bearer (OpenAI 兼容) | `glm-4.6` |

- **API key 安全**: 走 Electron `safeStorage` (macOS Keychain / Windows DPAPI)
  - 文件位置: `~/Library/Application Support/pulse/ai-keys/<provider>.bin` (mode `0o600`)
  - key 不入 `state.json` (只 safeStorage ref)
- **错误处理**:
  - API key 错 (401/403) → toast "API key 无效,请在设置里更新"
  - LLM 超时 → log warn + skip 当天 banner
  - safeStorage 不可用 → digest 自动 skip

## AI 用量监控 (v2.13+)

Minimax coding plan / GLM 编程套餐的配额实时监控 — Header 切到"AI 用量"tab：

- **双 provider Tab** — Minimax / GLM 各自独立的 5h 滚动窗口 + 周窗口 + 视频/MCP 配额卡
- **进度条 + 倒计时** — 每个窗口的已用百分比 + 距重置时间
- **预计耗尽** — 基于上一轮 snapshot 算 burn rate，预估"按当前速度 N 小时用完"
- **7 天趋势** — sparkline 折线图展示历史用量
- **后台预热** — 启动时自动拉一次（fire-and-forget），进页面就有数据

## 加/改 app

编辑 `config.json`（应用关闭后改，下次启动自动重读）：

```json
{
  "apps": [
    {
      "name": "MyApp",
      "bundle": "MyApp.app",
      "win_bundle": "MyApp",
      "download_url": "https://example.com/download",
      "version_sources": [
        { "type": "installed_json" },
        { "type": "plist" }
      ],
      "detectors": [
        { "type": "brew_formulae", "cask": "myapp" },
        { "type": "electron_yml",  "url": "https://example.com/latest.yml" },
        { "type": "winget_show",   "id": "Publisher.MyApp", "platform": "win" }
      ],
      "winget_id": "Publisher.MyApp"
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
| `html_changelog` | 解析 changelog HTML 页面 | ZCode |
| `winget_show` | Windows winget show --versions | Windows 端通用 |
| `github_release` | GitHub Releases API (tag_name) | 通用 |

## 开发

```bash
npm install
npm run dev          # 起 electron + 自动 rebuild renderer
npm test             # 跑 vitest
npm run build:mac    # 出 .dmg 到 dist/ (Apple Silicon)
npm run build:win    # 出 .exe 到 dist/ (x64 + arm64)
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
│  platform/ (macos | windows)          │
│  WorkerPool (4 worker threads)        │
│  state-store (last-known 持久化)       │
└──────┬───────────────────────────────┘
       │ worker_threads
┌──────▼──────────────────────────────┐
│  detect-worker.js × N                  │
│  → getInstalledVersion (plist/注册表) │
│  → runDetectorChain                   │
│  → compareVersions                    │
│  → result { installed, latest, ... }  │
└───────────────────────────────────────┘
```

详见 [docs/superpowers/specs/](docs/superpowers/specs/)。

## 已知问题 / 限制

- **Linux 不支持** — 用了 macOS / Windows 专属 API
- **CJK 显示依赖系统字体** — 在某些环境跑可能方块字
- **首次跑会并发打多个外部 API** — 没事，但有些公司内网限流可能挂
- **state 文件位置**：`~/Library/Application Support/pulse/state.json` (macOS) / `%APPDATA%/pulse/state.json` (Windows)，删掉等于清缓存
- **升级依赖** — macOS 需 Homebrew (`brew`)；Windows 需 winget (Win10 1709+ 自带)

## License

MIT
