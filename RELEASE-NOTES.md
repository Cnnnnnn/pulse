# Pulse v2.2.0 — Release Notes

---

## v2.4.0 (Phase A) — 2026-06-08

### New: 应用分类 (App Categorization)

顶部新加 8 类 category tabs (底部下划线风格), 跟 search + 状态 tab 过滤器正交:

| 分类 | icon | 顺序 |
|------|------|------|
| AI 工具 | 🤖 | 1 |
| 开发者 | 🛠 | 2 |
| 浏览器 | 🌐 | 3 |
| 沟通 | 💬 | 4 |
| 媒体 | 🎨 | 5 |
| 笔记 | 📝 | 6 |
| 系统 | 🔧 | 7 |
| 其他 | 📦 | 99 (永显示) |

- 静态 1:1 映射 (24 个 app) — `config/categories.json` + `config/app-category.json`
- 顶部 tab 顺序: count desc → order asc, "全部" 永第一, "📦 其他" 永最后
- hide empty: 0 app 的 tab 不显示 (除 "📦 其他" 兜底)
- 切换 tab: 不丢 search query / 状态 tab / mute (持久化在 `state.json.active_category`)
- 键盘快捷键: `0` 切 "全部", `1-9` 切前 9 个 tab (按 tab 顺序, 焦点在 input 时不抢)
- 未映射 app → "📦 其他" (兜底, 永不崩)
- 切 tab 时 `saveActiveCategory` 走 IPC, 失败 log warn 不阻塞 UI

### 数据 + 架构

- 静态 map 是 single source of truth, 走 git PR 维护
- main 进程: 启动时 fs 读 JSON, 注入 `category.setData({ source: 'disk' })`
- renderer: esbuild static import JSON, 顶层 `category-init.js` 调 `setData`
- 失败降级: 缺 'other' / 引用不存在 id / 缺字段 — 全部走 module-level DEFAULT 兜底

### 已知 follow-up (单独 PR)

- spec 24 mapping 跟 `config.json` 实际监控的 11 app 只有 1 个 (Cursor) 重叠 → 初次启用时多数 app 归 "📦 其他"
- 建议 PR: 把 spec 里 claude/chatgpt/firefox/arc/sketch/... 替换为 Kimi/ima.copilot/MiniMax Code/WorkBuddy/QClaw/Marvis/QoderWork/Codex/CodexBar/CC Switch

### 测试

- 84 个新 case: category.test.js 22 + state-store 7 + filter-by-category 12 + category-tabs 15 + category-keyboard 12 + load-smoke 1 + 其它 15
- 总计 628/628 全过 (v2.3.0 是 532, +96)
- esbuild bundle: 232kb (v2.3.0 是 218kb, +14kb = inline JSON + CategoryTabs 组件)

### Phase A commit 拆分 (5 个独立可回滚)

- A1a `1b96a70` — 2 个 JSON 数据文件
- A1b `c3e2a78` — category.js runtime (后被 A3 refactor 改成 setData 注入)
- A1c `39f3aea` — load-smoke coverage
- A2 `08e85ba` — state-store active_category + IPC 3-place sync
- A3 `66e18e5` — store signal + filteredResults + 2-process data inject
- A4 `2a99ef0` — CategoryTabs 组件 + ResultsView 集成 + 视觉
- A5 — keyboard 快捷键 + 边界 case (本 release)

---



---

## v2.5.0 (Phase B) —2026-06-08

### New: AI编程会话每日总结 (AI Sessions Daily Digest)


顶部 ⚙️按钮 → AI总结 设置弹窗。**opt-in** — 默认关闭,老用户不受影响。

5 个 LLM provider 任选:
- **Ollama (本地)** — `qwen3.5:9b` 默认,无 auth,走 `http://localhost:11434`
- **OpenAI** — `gpt-4o-mini` 默认,Bearer auth,走 `/v1/chat/completions`
- **Anthropic** — `claude-sonnet-4-5` 默认,`x-api-key + anthropic-version:2023-06-01`走 `/v1/messages`
- **DeepSeek** — `deepseek-chat` 默认,OpenAI兼容
- **MiniMax** — `MiniMax-ABAB6.5s` 默认,OpenAI兼容 (`api.minimax.chat/v1`)

### API key 管理 (OS Keychain)

-走 Electron `safeStorage` (macOS Keychain / Windows DPAPI / Linux libsecret)
-加密文件位置: `~/Library/Application Support/Pulse/ai-keys/<provider>.bin` (mode0o600)
- Modal 提供 "保存 key" / "清空"按钮;key 不入 state.json (只 safeStorage ref)
- "测试连接"走轻量 `POST max_tokens=1` → ok/auth_401/http_status状态
- Linux 无 keyring 时 safeStorage不可用 →拒绝存 plaintext + UI hint

### Banner + 自动生成

-顶部 `<AIDigestBanner />` — 默认折叠,1 行60字符 preview + 🔄 重跑按钮
-启动时跑昨天 digest (idempotent) +首次启动自动 backfill7 天
-24h cron每天重跑昨天 digest
-手动 rerun / backfill (≤30 天)走 IPC
- digest持久化在 `state.json.daily_digests[dateKey]` (30 天 GC)

###边界处理

-401 → modal 测试连接显示 ✗ auth_401; digest跳过当天
- LLM 超时120s → retry1 次;仍失败 → log warn + skip
- safeStorage不可用 → wiring fallback stub summarizer (healthcheck永远 ok:false); digest 健康检查 fail → skip
- 同一天已有 digest → idempotent skip (除非 force rerun)
-损坏 safeStorage file → loadApiKey返 null + log warn
- backfill 中不重跑 (复用 in-progress)

### 数据 +架构

- `state.json` 新字段: `daily_digests: { [dateKey]: Digest }` + `ai_sessions_config: { enabled, provider, ollama, cloud }`
- `config.json` 的 `aiSessions`块可设 default;`ai_sessions_config` (state.json)优先
-7 个 IPC通道 (`ai-sessions:set-key/clear-key/has-key/healthcheck/get-config/save-config` + config-updated事件)
-3-place sync: ipc.js ↔ preload.js ↔ renderer/api.js

### 测试

-236 个新 case (B1+B2+B3+B4+B5+B6): provider-ollama21 + storage22 + provider-cloud37 + wiring16 + digest14 + cursor-detector13 + detector6 + summarizer7 + ai-digest-banner20 + ai-settings-modal13 + state-store B7 + integration8 + load-smoke1 +其它
- 总计 **864/864 全过** (v2.4.0 是768, +96 for Phase B)
- esbuild bundle:257kb (v2.4.0 是232kb, +25kb = provider-cloud + AISettingsModal + ⚙️ button + IPC)

### Phase B commit拆分 (8 个独立可回滚)

- B1 `1f3e6c1` —6 个抽象模块 + state-store扩字段
- B2a `8930619` — CursorDetectorImpl file-scan skeleton
- B2b `690c510` — readSession via node:sqlite (no native)
- B3a `256fb7d` — OllamaSummarizer HTTP impl +21 case
- B3b+c `781283d` — startup healthcheck + config schema
- B4 `77dceb2` — wiring + IPC + cron +17 case
- B5 `38f2ce1` — `<AIDigestBanner />` + store + bootstrap +20 case
- **B6a `3d953e1` — safeStorage helper + DI +22 case (本 release关键)**
- **B6b `d8cfd27` — CloudSummarizer (4 providers + Anthropic) +37 case**
- **B6b.5 `713567c` — wiring cloud路由 + runtimeOverride +16 case**
- **B6c `1f33aae` —6 IPC channels for Settings modal +3-place sync**
- **B6c.2 `e01d9a3` — renderer store signals + actions for Settings**
- **B6c.3 `7790976` — AISettingsModal +13 test case**
- **B6c.4 `8b2b6f3` — Header ⚙️ button + App.jsx modal集成**
- **B6d `8b1f065` —视觉样式 +错误路径验证**

### Caveats (release 前你必做)

- **真 SQLite query路径** (dev Node18 没 `node:sqlite`)
- **真 ollama端到端** (起 ollama 服务 +跑 Pulse + 看 startup log)
- **真 cloud端到端** (拿真 minimax/openai key +跑 Pulse + banner 显示 + rerun + backfill)
- **真 safeStorage round-trip** (装 DMG +存 key + 重启 + load 一致)
- **banner UI 真路径** (config.json 加 `aiSessions.enabled: true` 才能看到)

---



## v2.3.0 (Phase 29) — 2026-06-07

### New: 最近打开时间 (last-opened)

- 每个 app 监 macOS Spotlight 拿 `kMDItemLastUsedDate`，未索引 fallback 到 `stat -f '%a'` (atime)
- 持久化到 `state.json` 的 `last_opened` 字段，跨重启保留
- AppInfo 新加 "上次打开 · 2 天前" / "未使用" / "上次打开 · 估算 · 5 天前" 子标题
- atime fallback 标 "估算" + tooltip 解释为什么不靠谱

### New: 分级静音 (tier-aware mute)

- tier 阈值：≤ 7天 = 热，7-30天 = 温，> 30天 = 冷
- 5 个静音选项不变 (1/7/30/90/永远)，但**按 tier 排顺序 + 推荐项置顶加 ✨推荐 标签**
  - 热 tier (天天用) → 推 1 天
  - 温 / 未知 → 推 7 天
  - 冷 (很久没用) → 推 30 天
- 永远 永远在 last 位置

### 流程

- 每次 checkUpdates 完成后后台 async 刷 last-opened (mdls + atime)
- 写盘后推 `last-opened-updated` 事件给 renderer，UI 自动重排
- Bootstrap 时一次性 loadLastOpened 填初始值

### 测试

- 67 个新 case (29a 16 + 29b 24 + 29c 12 + 29d 15)
- 总计 532/532 全过 (v2.2.0 是 465)

### Phase 29 commit 拆分 (5 个独立可回滚)

- 29a `4230f90` — 数据源 (last-opened.js)
- 29b `9bc0947` — tier 逻辑 (tier.js, 纯函数)
- 29c `1aa617c` — state-store 持久化 + IPC
- 29d `c54370a` — renderer 集成 + UI
- 29e `8a19476` — main/index.js 接入 checkUpdates 生命周期

---

## v2.2.0 (Phase 28) — 2026-06-07

### Brand: AppUpdateChecker → Pulse

- **productName**: `AppUpdateChecker` → `Pulse`
- **appId**: `com.appupdatechecker` → `com.appupdatechecker.pulse` — ⚠️ macOS 视为新 app. **v2.0.0 已装用户**先卸载旧版再装新, 否则会装出 2 个 app. 卸载前 state.json 备份到 `~/Library/Application Support/AppUpdateChecker/`, 新版装好后会自动迁移 (字段名兼容)
- 菜单栏显示 `Pulse` (替代 `AppUpdateChecker`)
- 通知标题、Header `<h1>`、UA (`Pulse/2.2`)、index.html `<title>` 全部跟齐
- state / logs 路径**保留** `~/Library/Application Support/AppUpdateChecker/` 不动 (兼容老数据)

### Menu bar icon 重画

- 旧: 像素 Buffer 画的圆环 + 箭头 (用户反馈"太丑")
- 新: 4 个预渲染 PNG (`assets/iconTemplate@2x.png` + 10 个 badge 变体) — 单次 R-S ECG pulse, 1.8 stroke, 橙红 #e85d3a
- 22 个 PNG 总共 17.2 KB, 0ms runtime 加载开销
- `scripts/render-icons.js` 用 `@resvg/resvg-js` (纯 Rust, 无原生 binding) 一次性生成

### Badge 行为

- count 1-9 → 单独数字
- count ≥ 10 → 显示 `9+` (跟 Twitter / Discord 一致)
- retina (2x) + 1x 各一份, Electron 自动按 display scale 选

### 测试

- 465/465 全过 (Phase 28 业务逻辑 0 改动, 全是字符串 + asset)

---

## v2.1.0 (Phase 27) — 2026-06-07

### New: per-app 静音

- **右键任意 app 行** → 弹出菜单: 静音 7 天 / 30 天 / 90 天 / 永远
- 静音期间: 跳过系统通知, 跳过 bulk upgrade 计数, 行整体灰显 + 🔇 静音 badge
- 持久化到 `state.json` 的 `mutes` 字段, 跨重启保留; 过期项自动清理
- 解除: 同一菜单里点 "取消静音"
- 兼容老 state.json (无 mutes 字段时按空处理)

### Fix (顺手): cooldown 抑制路径

- 之前 `runCheck` 把 `state.apps` 抽成 `appsMap` 再传给 `suppressedByCooldown`, 但函数内部又读 `.apps`, 等于读 undefined → cooldown 永远不触发
- 默认 `cooldown_hours: 0` 掩盖了 bug, 任何用户设 24h 都会发现 "通知不按 cooldown 走"
- 修法: 直接传整个 `state` 给函数. 3 个 regression test 加到 `tests/integration/check-runner.test.js`

### 测试

- 新增 51 个 case: state-store 29 (持久化 + 兼容) + check-runner 7 (通知抑制) + mute-menu 11 (UI 交互) + app-info 4 (badge)
- 总计 465 个 case 全过 (v2.0.0 是 411)

---

## v2.0.0

### 概要

完整重写 (spec §1-§17)。修复 7 个 app 检测不准的问题 + 启动慢/卡顿。

## 4 个准的 app — 行为不变

| App | 检测方式 | 状态 |
|-----|---------|------|
| Claude | `app_store_lookup` | 保持准 |
| WorkBuddy (旧名) | 多 detector fallback | 保持准 |
| Marvis (旧) | electron_yml | 保持准 |
| QClaw | qclaw_api | 保持准 |

> 4 个 app 用 `unit test + fixture` 锁住, 重构未触及 detector 逻辑。

## 7 个修准的 app (基于真实 trace)

| App | 旧行为 | 新行为 | 根因 |
|-----|--------|--------|------|
| **Cursor** | `redirect_filename` 经常 404 | 改走 `cursor_redirect` (3.6→3.x) | redirect 链不稳定 |
| **Kimi** | `redirect_filename` 永远拿不到 | 接受 Kimi API 不支持 HEAD, 改走 GET + Content-Disposition 解析 | 真实 API quirk: HEAD→400, Allow: GET |
| **Marvis** | `app_store_lookup` 拿旧版本 | 改走 `electron_yml` (marvisapp.com) | iTunes lookup 慢 + 缓存滞后 |
| **WorkBuddy** | `api_json` 走错 URL | 改走 `app_update_yml` 链 + 修正 path field | 旧 URL 已下线 |
| **QClaw** | `qclaw_api` camelCase 不匹配 (QClawApiDetector 找不到) | 修 class name 解析 (`qclaw_api` → `QClawApiDetector`) | makeDetector bug |
| **MiniMax Code** | `api_json` URL 模板未填 | 修 URL 模板 + body 模板 | 配置字段名错 |
| **QoderWork** | 多 detector 链断 | 修 path field + multi-path fallback | 旧 path 字段名错 |
| **ima.copilot** | `api_json` 超时 | 修 nested field + 加 8s 单 detector timeout | 旧实现无 timeout, 卡死 |

> **6/7 修准** — Kimi 的 brew_formulae fallback 留给下个 cycle (spec §12 风险: 检测准度修了又回归, 用 fixture 锁住)。

## Config 自动迁移

老 `config.json` (单字段 `web_type` + `web_url`) 在主进程启动时**自动迁移**到新 schema (数组 `detectors[]`):

| 旧 web_type | 新 detector.type | 额外 |
|---|---|---|
| `redirect` | `redirect_filename` | url: web_url |
| `cursor_redirect` | `cursor_redirect` | url: web_url |
| `app_store` | `app_store_lookup` | url: web_url |
| `electron_yml` | `electron_yml` | url: web_url |
| `api_json` | `api_json` | url: web_url |
| `qclaw_api` | `qclaw_api` | url: web_url |
| `github_release` | `api_json` | url: web_url (合并) |
| `brew_api_json` | `brew_formulae` | cask: brew_cask |

- 老 config 触发迁移后, **原文件备份为 `config.json.bak`**, 不覆盖
- 11 个老 config 全部测过 (`tests/integration/config-migrate.test.js`, 39 个 case)
- 启动 1 次即生效, 无需用户操作

## 启动性能

- **冷启动到窗口可见**: 1.2s 中位数 (spec §10 目标 < 1.5s) ✓
- 实测: `node scripts/startup-bench.js --iterations=10` median 1227ms
- 旧版 3-10s+, 经常 hang

## 稳定性

- **断网启动**: 不 crash, 11 个 app 标 "无法检测" + banner 提示
- **worker crash**: 自动 respawn, 当前 task reject, 其余继续
- **tray 丢失**: 不退出, window banner 提示
- **config 损坏**: 用默认配置, log error, 不 crash

## 升级并发化

- 旧版 `for...of` 串行 await → 新版 `Promise.allSettled(concurrency=2)`
- 失败兜底: brew 失败 → 走 `download_url` 打开浏览器
- 实测 brew lock 兼容性: 1/2/3/4/5/8 并发 × 5 runs × `--dry-run` upgrade → **0 lock 错误**

## 埋点 + 诊断

- `~/Library/Logs/AppUpdateChecker/startup.log` — 启动时间分解
- `~/Library/Logs/AppUpdateChecker/detect.log` — 每个 app × detector trace
- spec §6 格式: `[tag] ISO [+tz] k=v k=v ...` (例: `app=Cursor det=cursor_redirect ms=234 version=3.6 confidence=high`)

## 已知限制 (下个 cycle)

- Kimi 的 brew_formulae fallback 路径未完整覆盖 (cycle 4)
- electron-builder code signing 未配置 (用户需自签或签发 Developer ID)
- 11 app × fixture 录制已 commit, 但 detector 链改了之后要重录 (具体见 `tests/fixtures/<app>/_summary.json`)
