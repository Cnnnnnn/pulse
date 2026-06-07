# Pulse AI Sessions 对话总结 (Feature B) 实施计划

- **来源 spec**: `docs/superpowers/specs/2026-06-07-ai-sessions-digest-design.md`
- **日期**: 2026-06-08
- **作者**: Mavis (brainstorming-2 → writing-plans fallback)
- **范围**: 7 phases, 总计 ~12-16h
- **执行策略**: Phase 1-4 自己单线干 (foundation → 数据流走通), Phase 5 UI + Phase 6 cloud 视情况决定 mavis-team

---

## Phase B1 — Foundation + 抽象 (~2h)

### B1a — `src/ai-sessions/` 目录骨架 (~30 min)

**新增**:
- `src/ai-sessions/index.js` — 统一导出, main process 入口
- `src/ai-sessions/detector.js` — 抽象 `AISessionDetector` 类, 跟 spec §4.1 一致
- `src/ai-sessions/summarizer.js` — 抽象 `LLMSummarizer` 类, 跟 spec §4.3 一致
- `src/ai-sessions/prompts.js` — Prompt template 集中 (digest prompt + i18n)
- `src/ai-sessions/digest.js` — `DailyDigestRunner` 编排, 跟 spec §4.5 一致
- `src/ai-sessions/storage.js` — 复用 `state-store.js` + safeStorage helper, 跟 spec §4.6 一致

**测试**:
- `tests/ai-sessions/detector.test.js` — ~20 cases (抽象 contract)
- `tests/ai-sessions/summarizer.test.js` — ~15 cases
- `tests/main/load-smoke.test.js` — +3 cases (新模块 require)

**验证**:
- 跑 vitest 全过
- 手动 require 入口, 不抛

**risk**: 0 (新目录, 跟现有无交集)

### B1b — `state-store.js` 扩 ai_sessions 字段 (~30 min)

**改动**:
- `src/main/state-store.js`:
  - `loadState()` 读 `ai_sessions_config` + `daily_digests` (缺 → fallback)
  - `saveAll()` 持久化时写
  - GC 30 天外的 digest entry
- `src/config/schema.js` — schema 加 `ai_sessions_config: z.object(...).optional()` + `daily_digests: z.record(...).optional()`

**测试**:
- `tests/main/state-store.test.js` — +5 cases (round-trip + fallback + GC)

**验证**:
- 跑全测试不回归
- 手改 state.json 写非法 provider → 启动 fallback

**risk**: 0

---

## Phase B2 — Cursor Detector (~3h)

### B2a — `CursorDetectorImpl` skeleton (~1h)

**新增**:
- `src/ai-sessions/cursor.js` — 跟 spec §4.2 一致
  - `isInstalled()`: 检查 `/Applications/Cursor.app`
  - `listSessions()`: 扫 `~/Library/Application Support/Cursor/User/workspaceStorage/*/state.vscdb`
  - 返回 `SessionMeta[]`: `{ id, file, mtimeMs, sizeBytes, appName }`

**测试**:
- `tests/ai-sessions/cursor-detector.test.js` (part 1) — 6 cases (isInstalled / listSessions 用 mock fs)

**验证**:
- 在用户真实 Cursor 上跑, listSessions 返回正确数量

**risk**: Cursor 路径可能随版本变, 准备 fallback 路径

### B2b — SQLite 解析 + readSession (~1.5h)

**新增**:
- `package.json` 加 `better-sqlite3` dep + electron-rebuild script
- `cursor.js`:
  - `readSession(id)`: 打开 SQLite, SQL `SELECT key, value FROM cursorDiskKV WHERE key LIKE 'aiService.prompts:%'`
  - JSON-parse value → messages array
  - 返回 `Session`: `{ id, appName, startedAt, endedAt, messages }`

**测试**:
- `tests/fixtures/cursor-state.vscdb` (5MB, 脱敏真实 Cursor export)
- `tests/ai-sessions/cursor-detector.test.js` (part 2) — +19 cases (readSession + parse + filter)
- CONTRIBUTING.md — 文档"如何维护 fixture"

**验证**:
- `electron-rebuild` 不报错
- 在用户真实 Cursor 上 readSession 出 messages
- 截一段真实输出看 schema

**risk**: 
- `better-sqlite3` Electron 35 + arm64 已知问题 (memory 已记) → 准备 `--build-from-source` 兜底
- Cursor schema 改 → log warn + skip 该 workspace

### B2c — filterByLocalDay helper (~30 min)

**改动**:
- `detector.js` 抽象类加 `filterByLocalDay(sessions, dateKey)` 方法
- 实现: `Intl.DateTimeFormat` 本地时区, 过滤 mtimeMs

**测试**:
- `tests/ai-sessions/detector.test.js` — +3 cases (跨时区边界)

---

## Phase B3 — Ollama Provider (~2h)

### B3a — `OllamaSummarizer` 实现 (~1h)

**新增**:
- `src/ai-sessions/provider-ollama.js` — 跟 spec §4.4 "Provider 1" 一致
  - `healthcheck()`: `HTTP GET http://localhost:11434/api/tags`, 200 = ok
  - `summarize(sessions, opts)`: `HTTP POST /api/chat`, body `{model, messages, stream: false}`
  - timeout 120s, retry 1 次
  - 复用现有 `src/main/http-client.js` 风格

**测试**:
- `tests/ai-sessions/provider-ollama.test.js` — ~20 cases
- 用 `nock` 或自建 mock HTTP server 模拟响应

**验证**:
- 在用户真实 ollama 上跑通, 用 qwen3.5:9b 出 1 个简单 summary
- 手动 kill ollama, 跑 healthcheck → 返回 `{ok: false, error: 'ECONNREFUSED'}`

**risk**: ollama HTTP API 偶尔 stream, spec 已确定用 non-stream (关闭)

### B3b — healthcheck 启动时跑 (~30 min)

**改动**:
- `src/main/index.js`: 启动时 `await summarizer.healthcheck()`, 失败 log warn
- 启动不阻塞, healthcheck 异步 (3s timeout)

**测试**:
- 手动验证 (1 case)

**risk**: 0 (不阻塞启动)

### B3c — Config schema 加 aiSessions (~30 min)

**改动**:
- `src/config/schema.js` 顶层加 `ai_sessions: z.object({ enabled, provider, ollama, cloud }).optional()`
- 跟 spec §3.2 / §6.1 一致
- 缺省: enabled=false, provider=ollama

**测试**:
- 已有 schema tests 加 2 cases

---

## Phase B4 — Daily Digest 编排 (~2h)

### B4a — `DailyDigestRunner.runOne()` (~45 min)

**改动**:
- `src/ai-sessions/digest.js`:
  - 收集所有 enabled detector 的 sessions
  - 按本地日历日 group
  - 找 "yesterday" (今天 - 1) 的 sessions
  - 0 个 → 跳过 return null
  - 已有 digest → 跳过 return existing
  - 调 `summarizer.summarize(sessions, opts)`
  - 写 `state.json.daily_digests[dateKey]`
  - 返回新 digest

**测试**:
- `tests/ai-sessions/digest.test.js` — ~15 cases
- 0 session 跳过 / 已存在跳过 / LLM 失败 fallback / 正常 path

**验证**:
- mock 1 个 detector + 1 个 summarizer, 端到端跑 1 个完整 runOne

**risk**: 0 (编排逻辑, 全 mockable)

### B4b — main process cron + bootstrap (~45 min)

**改动**:
- `src/main/index.js`:
  - 启动时: `if (config.aiSessions.enabled) await dailyDigestRunner.bootstrap()`
  - `setInterval(scheduleNextDigest, 24h)`
  - 启动一次 + 每 24h 一次

**测试**:
- 手动验证 (1 case): 启 Pulse, 跑 1 个 digest, 查 state.json

**risk**: setInterval 在 app 隐藏时是否运行? Electron 一般会, 验证下

### B4c — 手动 rerun IPC + backfill IPC (~30 min)

**新增**:
- `src/main/ipc.js`:
  - `ipcMain.handle('ai-sessions:rerun', handler)` — 强制 rerun yesterday
  - `ipcMain.handle('ai-sessions:backfill', (e, days) => handler)` — 串行 N 天
- `preload.js` + `api.js` — 暴露 `rerunDigest / backfill`

**改动**:
- `dailyDigestRunner.runBackfill(days=7)` — 串行 + sleep 5s 防爆
- 进度推 IPC 事件 `ai-digest-progress`

**测试**:
- `tests/ai-sessions/digest.test.js` — +5 cases (backfill 串行 / 进度)

---

## Phase B5 — UI Banner (~1.5h)

### B5a — `<AIDigestBanner />` 组件 (~45 min)

**新增**:
- `src/renderer/components/AIDigestBanner.jsx` — 跟 spec §5.1 一致
- `styles.css` — `.ai-digest-banner` + `.ai-digest-banner.loading` + `.ai-digest-content` + `.rerun-btn`

**测试**:
- `tests/renderer/ai-digest-banner.test.jsx` — ~15 cases (loading / has / no / 折叠 / 展开 / 重跑)

**验证**:
- playwright 渲染截屏, 视觉对 (跟设计稿)

**risk**: 重跑按钮位置 (右上? 内嵌?)

### B5b — store + bootstrap (~30 min)

**改动**:
- `src/renderer/store.js`:
  - 新 `dailyDigest = signal(null)`
  - 新 `digestLoading = signal(false)`
  - 新 `aiSessionsEnabled = signal(false)` (从 config 读)
  - `setDailyDigest(d)` / `setDigestLoading(b)` setters
- `src/renderer/index.jsx`:
  - 启动时 `loadDailyDigest()` 从 `state.json.daily_digests[dateKey]` 拿昨日那个
  - 监听 IPC `ai-digest-updated` 事件 → 更新 `dailyDigest`

**测试**:
- 1 e2e: "启 Pulse → digest 写入 → 重启 → 还原" (在 `tests/integration/`)

### B5c — `<App />` 集成 (~15 min)

**改动**:
- `src/renderer/App.jsx`:
  - 在 `<Header />` 下, `<FilterBar />` 上插 `<AIDigestBanner />`
  - 传 `digest / loading / onRerun` props

**验证**:
- 启 Pulse 截屏

---

## Phase B6 — Cloud Providers + safeStorage (~2.5h)

### B6a — safeStorage helper (~30 min)

**新增**:
- `src/ai-sessions/storage.js`:
  - `saveApiKey(providerId, apiKey)` — safeStorage.encryptString → 写文件
  - `loadApiKey(providerId)` — 读文件 → safeStorage.decryptString
  - `clearApiKey(providerId)` — unlink
  - 文件位置: `app.getPath('userData')/ai-keys/<provider>.bin`

**测试**:
- `tests/ai-sessions/storage.test.js` — ~10 cases (round-trip / 缺 key / 损坏文件)

**验证**:
- 手动存 1 个 key, 重启 app, 读出来, 一致

**risk**: safeStorage 在 Linux 不可用 (无 keyring) → log error + 提示用环境变量, spec §7 已记录

### B6b — `ProviderCloud` 实现 (~1h)

**新增**:
- `src/ai-sessions/provider-cloud.js`:
  - 4 个 providerId 路由 (openai / anthropic / deepseek / minimax)
  - 走 OpenAI 兼容协议 (openai / deepseek / minimax)
  - Anthropic 单独 path (x-api-key + anthropic-version header)
  - 从 `storage.loadApiKey(providerId)` 拿 key
  - `healthcheck()` + `summarize(sessions, opts)` 跟 ollama 一样 interface

**测试**:
- `tests/ai-sessions/provider-cloud.test.js` — ~15 cases
- 4 个 provider 各 3-4 cases
- mock HTTP server 模拟 200 / 401 / 429 / 500

**验证**:
- 在用户真实 cloud key 上跑 1 个测试 (用 minimax 因最便宜)
- 故意输错 key → healthcheck fail, digest skip

**风险**:
- MiniMax API 实际 endpoint 跟 spec 假设的可能不同, 跑通前 verify base URL
- Anthropic streaming 跟 OpenAI 不同, 确认 non-stream path 一致

### B6c — Settings modal (~1h)

**新增**:
- `src/renderer/components/AISettingsModal.jsx` — 改 provider / 输 key / 测 healthcheck
- `Header.jsx` 加 1 个 ⚙️ 按钮 (跟 "重新跑" 区分)

**测试**:
- 5-6 个手动 case (UI 集成)

**风险**: 输入 modal 风格跟现有保持一致, 复用 `prompt() / modal` 框架 (如有)

---

## Phase B7 — Backfill + Polish + e2e (~2h)

### B7a — Backfill UI (~30 min)

**改动**:
- 启动时检测 `daily_digests` 空 && `config.aiSessions.enabled` → 自动跑 backfill 7 天
- Header ⚙️ 旁边加 1 个 ⏳ spinner (backfill 中), 显示进度 "3/7"
- 进度走 IPC 事件 `ai-digest-progress` (Phase B4c 已实现)

**测试**:
- 1 e2e: 第一次启动, daily_digests 空, backfill 自动跑 3 天, 验证 state.json

**risk**: 启动时 backfill 可能慢 (7 * 30s = 3.5min), 用户体验差; 考虑延迟到第一次 check 之后

### B7b — 错误处理 + 视觉细节 (~30 min)

- API key 错 → 一次性 toast "更新你的 API key", 不弹 modal
- LLM 超时 → log warn + skip + UI 不显示当天 banner
- Banner 折叠时 summary 截 60 字符, 完整版在展开里
- 视觉对: 跟 WeeklyBanner 风格一致, 同样 padding/border

**测试**:
- 手动验证

### B7c — README + RELEASE-NOTES + 全测试 (~30 min)

- `RELEASE-NOTES.md` 加 v2.5.0 (Phase B) 章节
- README 更新 (新加 AI digest 描述)
- `npx vitest run` 全过
- `npm run build:renderer && npm run build` 出新 DMG
- 装 DMG, 跑 1 次 digest, 截屏

---

## 总测试 case

| 新增 | ~140 case (spec §8.1) |
|---|---|
| 现有更新 | +8 case (state-store + load-smoke + integration e2e) |
| **总** | **+148 case** (Feature A 2.7x 体量, 符合 spec 估算) |

## 风险汇总

1. **`better-sqlite3` Electron 35 + arm64** — 已知 nativeImage SIGTRAP 同一类, 准备 `--build-from-source`. **高优先级**, 跑 Phase B2 第一时间 verify
2. **Cursor schema 改** — `cursorDiskKV` 表可能改名, impl 需 graceful skip
3. **Cloud API cost** — minimax / openai / anthropic / deepseek 都有 cost, daily digest 1 次/天成本低, 但 backfill 7 天 1 次性 cost 较高
4. **MiniMax API 实际 endpoint** — 跟 spec 假设可能不同, Phase B6 第一时间 verify
5. **safeStorage 不可用** (Linux 无 keyring) — 拒绝存 key, 提示用 env var, spec §7 已记录
6. **sqlite fixture 维护** — 每次 Cursor 大版本可能要重新 export, CONTRIBUTING.md 写明

## 决策默认值 (v1 拍板, 后续可调)

- backfill 默认 7 天, 可关
- digest GC 默认 30 天保留
- 5 个 provider 都开 (用户 config 选 1)
- ollama 默认 model: `qwen3.5:9b`
- cloud 默认 model:
  - openai: `gpt-4o-mini`
  - anthropic: `claude-sonnet-4-5`
  - deepseek: `deepseek-chat`
  - minimax: `MiniMax-ABAB6.5s`
- prompt 输出语言: zh-CN (config 可改)
- Banner 默认折叠, 1 行 summary 截 60 字符
- 启动时 backfill 立即跑, 用户首次启 Pulse 等 1-3 min 看见历史 digest

## 实施顺序 (跟 Phase A 配合)

- A 完成后, Pulse 顶部 banner 区已就位
- B 完成后, 该区域多 1 个 `<AIDigestBanner />` 组件
- A + B 都完成后, 主窗口顶部是: Header / AIDigestBanner / CategoryTabs / FilterBar / SectionList
- 顺序建议: A 先 (small), B 后 (big); 实施时每 phase 跑通, A5d + B7c 是 release gate
