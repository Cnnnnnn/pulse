# Pulse v2.2.0 — Release Notes

---

## v2.2.0 (Phase 28) — 2026-06-07

### Brand: AppUpdateChecker → Pulse

- **productName**: `AppUpdateChecker` → `Pulse`
- **appId**: `com.appupdatechecker` → `com.appupdatechecker.pulse` (org 段保留, 跟老用户已装版不冲突)
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
