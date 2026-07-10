# Pulse AI Sessions 对话总结 (Daily Digest)

- **日期**: 2026-06-07
- **作者**: Mavis (brainstorming-2)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (Pulse v2.3+)
- **目标特性**: 抽象 "AI session detector", 第一实现 Cursor; 每天 1 次 LLM 调用生成昨日 digest (本地 ollama 默认, 4 个云端 provider 可选); 顶部 banner 展示, 可展开看 session 列表 + 重跑。

## 0. 决策日志 (brainstorming-2 产出)

| 决策点 | 选择 | 备选 + 否决理由 |
|---|---|---|
| AI app 范围 | **抽象 detector + Cursor 第一实现** | 仅 Cursor (v2 加其他 app 难); 一次性多 app (parser 工程量 + schema 风险) |
| LLM provider | **本地 ollama + 4 个云端 (openai / anthropic / deepseek / minimax) 二选一** | 仅 ollama (不能换); 仅云 (成本 + 隐私); 二选一 (本次选择) |
| 触发时机 | **每日 digest (昨天所有 session → 1 段总结)** | 手动 on-demand (零自驱); auto per-session (调用频次太高); 混合 auto + 重生成 (digest 场景不需要) |
| UI 位置 | **顶部 banner (Header 下 FilterBar 上)** | section 混排 (digest 不像 app); modal (隐藏主流程); tray 菜单 (不在视野内) |
| SQLite 库 | **`better-sqlite3`** (成熟, arm64 OK, 走 electron-rebuild) | `node:sqlite` (Node 22.5+ 内置, 但 Electron 35 上还 experimental, 风险) |
| API key 存储 | **Electron `safeStorage`** (OS keychain 加密) | `keytar` (原生模块, arm64 已知问题); 写 state.json 明文 (不存) |
| Backfill | **首次启用 7 天历史 digest 串行生成, 默认开, 可关** | 不 backfill (首日空白); 30 天 (LLM 调用多); 立即 trigger (会卡启动) |
| 历史 digest modal | **v1 不做, spec 标 future** | (决策: 先核心, 历史浏览放 v2) |

## 1. 目标

### 1.1 必须达成

- [A] `src/ai-sessions/` 新目录, 5 个核心模块 (detector / summarizer / digest / storage + cursor/ollama/cloud impl)
- [A] `AISessionDetector` 抽象接口: `isInstalled() / listSessions() / readSession() / filterByLocalDay()`
- [A] `CursorDetector` 第一实现: 解析 `~/Library/Application Support/Cursor/User/workspaceStorage/*/state.vscdb` (SQLite, chat 在 `cursorDiskKV` 表)
- [A] `LLMSummarizer` 抽象接口: `healthcheck() / summarize(sessions, opts)`
- [A] 5 个 provider: `OllamaSummarizer` / `OpenAISummarizer` / `AnthropicSummarizer` / `DeepSeekSummarizer` / `MiniMaxSummarizer`
- [A] `DailyDigestRunner` 编排: detect → group by day → summarize → persist
- [A] 启动时 + 每 24h 跑 1 次 daily digest (catch-up yesterday, idempotent: 同一天已有不重跑)
- [A] 首次启用 backfill 7 天历史 (串行, 可关)
- [A] `<AIDigestBanner />` 组件: 顶部, 折叠/展开, 显示昨日 summary + session count
- [A] 重跑按钮 (🔄) 强制 rerun current digest
- [A] state.json 新字段 `daily_digests: { [dateKey]: Digest }`, 30 天外自动 GC
- [A] API key 经 Electron `safeStorage` 加密存 OS keychain
- [A] 5 个 provider 的 healthcheck 启动时跑, 不健康 → log warn, digest 跳过, 不 crash
- [A] `node:sqlite` (Node 22.5+) 作为 v2 备选, 在 spec 末 note 评估

### 1.2 应该达成 (nice-to-have)

- [B] 设置页 (modal) 让用户改 provider + 输 API key, 不用手动改 config
- [B] 7 天 backfill 进度显示 (Header 图标变 spinner)
- [B] 手动 trigger 全历史重生成 (per-day, 不是一锅)
- [B] Provider 模型列表 (e.g. 选 ollama 时 dropdown 列出 `ollama list` 拿到的模型)

### 1.3 不会做 (out of scope)

- ❌ Claude desktop / ChatGPT desktop session (用户机器上没装)
- ❌ Aider / Continue / Cline (用户机器上没装, 留 v2)
- ❌ Per-session 单独总结 (跟"每日 digest"互斥, 留 v2)
- ❌ 历史 digest 浏览器 (留 v2)
- ❌ Session 内容搜索 (留 v2)
- ❌ 多语言 prompt (默认 zh-CN, 留 v2)
- ❌ 实时 streaming summary (digest 短, 不需要)
- ❌ iOS / Android (Pulse 是 macOS only)
- ❌ 自动删除老 session / GC SQLite (不碰 Cursor 自己的文件)

## 2. 架构

```
┌──────────────────────────────────────────────────────────────┐
│  src/ai-sessions/  (新目录)                                    │
│  ├── detector.js         抽象: 找 session + 解析              │
│  ├── cursor.js           Cursor impl (第一)                   │
│  ├── summarizer.js       抽象: 调 LLM 出 summary               │
│  ├── provider-ollama.js  本地 ollama impl                     │
│  ├── provider-cloud.js   云端 impl (openai/anthropic/ds/minimax) │
│  ├── digest.js           每日 digest 编排                      │
│  ├── storage.js          持久化 digests + 加密 key            │
│  ├── prompts.js          Prompt template 集中管理              │
│  └── index.js            统一导出 + main process 入口          │
└────────────────────────┬─────────────────────────────────────┘
                         │ expose via IPC
                         ▼
   ┌─────────────────────────────────────┐
   │  main process:                      │
   │  - dailyDigestRunner   cron-like    │  启动后跑 1 次 + 每 24h 1 次
   │  - manual trigger via IPC           │  rerun / backfill
   │  - safeStorage API key mgmt         │
   └────────┬────────────────────────────┘
            │
            ▼
   ┌─────────────────────────────────────┐
   │  renderer:                          │
   │  - <AIDigestBanner />   (顶部)       │  接收 digest 数据
   │  - store.js 新 signal: dailyDigest   │
   └─────────────────────────────────────┘
```

**跟现有架构区别**:
- AI session 是**新维度**, 不进 `src/detectors/` (那是 version detector)
- LLM 调在 main process, 跟现有 `http-client.js` 一致风格
- `src/ai-sessions/` 是 sibling, 不进 `src/main/` 或 `src/renderer/`, 因为跨 main/renderer 都用到 (跟 `src/config/` 同级)

## 3. 数据层

### 3.1 `state.json` 新字段

```json
{
  "...": "...",
  "daily_digests": {
    "2026-06-06": {
      "dateKey": "2026-06-06",
      "generatedAt": 1780846000000,
      "provider": "ollama",
      "model": "qwen3.5:9b",
      "sessionCount": 7,
      "summary": "昨天主要工作:\n- 修 Pulse 的 tray icon ...",
      "sessionIds": ["abc123", "def456"]
    }
  }
}
```

- 顶层新字段, 跟 `mutes` / `last_opened` 平级
- 老 state.json (无 `daily_digests` 字段) → 启动时 `{}` fallback
- GC: 30 天外的 entry 自动清理 (config 可调, 默认 30)
- `safeStorage` 加密的 API key **不**写 state.json, 走单独 ref (`safe-storage:<keyId>`)

### 3.2 `config/apps.json` 扩展 (optional)

`apps.json` 中可加 `aiSession: true` 标记该 app 有 session detector:

```json
{
  "name": "Cursor",
  "bundle": "Cursor.app",
  "download_url": "...",
  "detectors": [...],
  "aiSession": true
}
```

- 缺省 `false`, 不影响现有 detector 流程
- `aiSession: true` 的 app 启动时让 `CursorDetector` 接 (Detector 注册表动态发现)
- v1 只标 Cursor; 其他 app 后加

### 3.3 Cursor session 存储事实

- 路径: `~/Library/Application Support/Cursor/User/workspaceStorage/<hash>/state.vscdb` (SQLite)
- 路径: 同目录 `workspace.json` (workspace 元数据)
- Chat messages: SQLite 表 `cursorDiskKV`, key 形如 `aiService.prompts:<composer-uuid>`, value 是 JSON 字符串
- 解析流程:
  1. 列出所有 `<hash>` 子目录
  2. 对每个, 用 `better-sqlite3` 打开 `state.vscdb`
  3. `SELECT key, value FROM cursorDiskKV WHERE key LIKE 'aiService.prompts:%'`
  4. JSON-parse value → `[{ role, content, timestamp }]`
  5. 时间过滤: `value.some(msg => msg.timestamp >= yesterday && msg.timestamp < today)`
- 性能: SQLite 单文件 ~100MB, SQL filter 后只读必要行, 不全 load

**风险**:
- Cursor v0.x 改 schema 频繁, impl 需 schema version 检测 (e.g. 缺 `aiService.prompts` 表 → log warn + 跳过)
- `better-sqlite3` 是 native module, arm64 需 electron-rebuild; Electron 35 已知 nativeImage SIGTRAP, 准备好 `--build-from-source` 兜底
- 大量 session 时 SQL 慢, 加 `LIMIT 1000` 防止爆

## 4. Runtime 层

### 4.1 `src/ai-sessions/detector.js` (抽象)

```js
export class AISessionDetector {
  constructor({ appName, detectorImpl }) { /* ... */ }

  async isInstalled() { return this.impl.isInstalled(); }
  async listSessions() { return this.impl.listSessions(); }  // SessionMeta[]
  async readSession(id) { return this.impl.readSession(id); }  // Session
  filterByLocalDay(sessions, dateKey) { /* local-tz YYYY-MM-DD */ }
}
```

`SessionMeta`: `{ id, file, mtimeMs, sizeBytes, appName }`
`Session`: `{ id, appName, startedAt, endedAt, messages: [{role, content, ts}] }`

### 4.2 `src/ai-sessions/cursor.js` (第一实现)

```js
export class CursorDetectorImpl {
  appName = 'cursor';
  isInstalled() { /* 检查 /Applications/Cursor.app */ }
  listSessions() { /* 扫 workspaceStorage/*/state.vscdb */ }
  readSession(id) { /* SQL query + parse */ }
}
```

**SQL 查询**:
```sql
SELECT key, value FROM cursorDiskKV
WHERE key LIKE 'aiService.prompts:%'
ORDER BY key;
```

`mtimeMs` 从 file stat 拿, 用于 "时间过滤" (避免 read 全文再 filter)。

### 4.3 `src/ai-sessions/summarizer.js` (抽象)

```js
export class LLMSummarizer {
  constructor({ provider, config, httpClient }) { /* ... */ }
  async healthcheck() { return this.impl.healthcheck(); }
  async summarize(sessions, opts) { return this.impl.summarize(sessions, opts); }
}
```

### 4.4 5 个 provider impl

#### `provider-ollama.js` (本地)

```js
// HTTP POST http://localhost:11434/api/chat
// body: { model, messages: [{role, content}], stream: false }
// auth: 无
// 响应: { message: { content: string } }
```

#### `provider-cloud.js` (云端通用)

```js
// 4 个 providerId 路由, 走 OpenAI 兼容协议
// (anthropic 实际是 Anthropic Messages API, 跟 OpenAI 略不同, 单独 path)
//
// openai:   POST https://api.openai.com/v1/chat/completions
// deepseek: POST https://api.deepseek.com/v1/chat/completions
// minimax:  POST https://api.minimax.chat/v1/chat/completions
// anthropic: POST https://api.anthropic.com/v1/messages
//
// auth: Bearer <api-key>  (Anthropic: x-api-key + anthropic-version header)
```

**MiniMax 备注**:
- 走 OpenAI 兼容协议, 跟 deepseek 同一段代码 path
- `https://api.minimax.chat/v1/chat/completions` 拿 user message + 返回 content
- API key 申请: https://api.minimax.chat (MiniMax 开放平台)
- 默认 model: `MiniMax-ABAB6.5s` (config 可改, e.g. `M2`, `abab-7`)

### 4.5 `src/ai-sessions/digest.js` (编排)

```js
export class DailyDigestRunner {
  constructor({ detectors, summarizer, storage, config, log }) { /* ... */ }

  // 跑昨天 digest (或指定 dateKey)
  async runOne(dateKey) { /* detect → group → summarize → persist */ }

  // 跑 backfill (默认最近 7 天)
  async runBackfill(days = 7) { /* 串行, 每 runOne + sleep 5s */ }

  // 启动时: 跑昨天 (idempotent) + 可选 backfill
  async bootstrap() { /* ... */ }

  // 24h 定时
  start() { /* setInterval */ }
}
```

**幂等**: 检查 `state.daily_digests[dateKey]`, 存在就跳过 (除非手动 rerun 强制)

### 4.6 `src/ai-sessions/storage.js` (持久化)

```js
// 复用现有 state-store.js 的 loadState / saveAll
// 加密 key: safeStorage.encryptString(apiKey) → Buffer
// 解密: safeStorage.decryptString(buffer) → apiKey
```

## 5. UI 层

### 5.1 `src/renderer/components/AIDigestBanner.jsx`

```jsx
export function AIDigestBanner({ digest, loading, onRerun }) {
  if (loading) return <div class="ai-digest-banner loading">⏳ 生成昨日 AI 总结...</div>;
  if (!digest) return null;  // 没数据不显示
  return (
    <details class="ai-digest-banner">
      <summary>
        <span class="banner-icon">📅</span>
        <span class="banner-title">昨日 AI 总结</span>
        <span class="banner-count">({digest.sessionCount} sessions)</span>
        <span class="banner-preview">— {digest.summary.split('\n')[0]?.slice(0, 60)}...</span>
        <button onClick={onRerun} class="rerun-btn" title="重新生成">🔄</button>
      </summary>
      <div class="ai-digest-content">{digest.summary}</div>
      <div class="ai-digest-meta">
        {digest.provider} · {digest.model} · {formatTime(digest.generatedAt)}
      </div>
    </details>
  );
}
```

### 5.2 `src/renderer/components/App.jsx` 改动

```jsx
<Header />
<AIDigestBanner digest={dailyDigest.value} loading={digestLoading.value} onRerun={handleRerun} />
<FilterBar />
<ResultsView />
```

### 5.3 `src/renderer/store.js` 新 signal

```js
export const dailyDigest = signal(null);  // 昨日 digest
export const digestLoading = signal(false);
export const aiSessionsEnabled = signal(false);
```

**Bootstrap**: `loadConfig()` + `loadState()` 拿到 daily_digests, 选 yesterday 那个赋给 `dailyDigest`

**Update**: IPC 事件 `ai-digest-updated` → 更新 `dailyDigest`

### 5.4 `src/renderer/api.js` 新方法

```js
aiSessions: {
  rerunDigest: () => ipcRenderer.invoke('ai-sessions:rerun'),
  backfill: (days) => ipcRenderer.invoke('ai-sessions:backfill', days),
}
```

## 6. State + 持久化

### 6.1 `state.json` (顶层新字段)

```json
{
  "mutes": {},
  "last_opened": {},
  "active_category": "all",
  "ai_sessions_config": {
    "enabled": true,
    "provider": "ollama",
    "ollama": { "model": "qwen3.5:9b", "baseUrl": "http://localhost:11434" },
    "cloud": { "provider": "openai", "model": "gpt-4o-mini" }
  },
  "daily_digests": {
    "2026-06-06": { "...": "..." }
  }
}
```

- `ai_sessions_config` 是用户配置 (LLM 选哪个)
- `daily_digests` 是 LLM 输出缓存
- API key 不在 state.json, 走 safeStorage ref

### 6.2 safeStorage API key 管理

```js
// 存
const buffer = safeStorage.encryptString(apiKey);
fs.writeFileSync(path.join(app.getPath('userData'), 'ai-keys', `${providerId}.bin`), buffer);

// 读
const buffer = fs.readFileSync(path.join(...));
const apiKey = safeStorage.decryptString(buffer);
```

- 文件位置: `~/Library/Application Support/Pulse/ai-keys/<provider>.bin`
- 加密走 OS keychain, 用户重装系统后丢, 需重新输
- 用户可手动删除 (config 提供"清空所有 keys"按钮)

### 6.3 IPC 通道

| channel | 方向 | 用途 |
|---|---|---|
| `ai-sessions:healthcheck` | renderer→main | 检查当前 provider 健康 |
| `ai-sessions:rerun` | renderer→main | 强制 rerun yesterday digest |
| `ai-sessions:backfill` | renderer→main | 触发 N 天 backfill |
| `ai-sessions:set-key` | renderer→main | 存 API key 到 safeStorage |
| `ai-digest-updated` | main→renderer | digest 写盘后推, UI 更新 |

## 7. 边界 / 错误处理

| 场景 | 行为 |
|---|---|
| `better-sqlite3` rebuild 失败 (arm64) | 启动 fail-fast, log error, 给出 `npm rebuild better-sqlite3 --runtime=electron --target=35.0.0 --dist-url=...` 命令 |
| ollama 不在 `localhost:11434` | healthcheck 返回 `{ok: false, error: 'ECONNREFUSED'}`, digest 跳过, log warn, UI 不显示 banner |
| 云端 API key 错 | healthcheck 返回 `{ok: false, error: '401'}`, digest 跳过, 弹一次性 toast 提示用户更新 key |
| LLM 调用超时 (120s) | retry 1 次, 仍超时 → log warn + skip day |
| LLM 输出为空 / 截断 | 用 fallback: "AI 总结生成失败, 详见日志" |
| 同一天已有 digest | skip (idempotent) |
| Backfill 中启动新 backfill | 复用现有 in-progress, 不重跑 |
| Cursor SQLite 读失败 (损坏文件) | 跳过该 workspace, log warn, 其他 workspace 继续 |
| Cursor schema 改 (找不到 `cursorDiskKV` 表) | log warn + skip, daily digest 全空 |
| safeStorage 不可用 (Linux 没 keyring) | 拒绝存 key, log error, 提示用环境变量 |
| API key 文件损坏 | 删旧 key, 提示重输 |
| 时区: 用户跨时区 | 本地日历日 (用 `Intl.DateTimeFormat`), 不 UTC |
| 0 session 昨天 | 不生成 digest, banner 不显示 |
| LLM 返回超长 (e.g. 5000 token) | 截到 800 token 留 buffer, 多余丢弃 |

## 8. 测试策略

### 8.1 新增测试 (~140 cases)

**`tests/ai-sessions/detector.test.js`** (~20):
- 抽象 contract: listSessions / readSession / filterByLocalDay
- 多 detector 注册到 registry
- 异常 app 名字 → empty list

**`tests/ai-sessions/cursor-detector.test.js`** (~25):
- 用 fixture `state.vscdb` (脱敏真实 Cursor export)
- isInstalled: true/false
- listSessions: 列出所有 workspace 的 prompt sessions
- readSession: 解析 messages
- filterByLocalDay: 时间边界
- 损坏 SQLite: catch + log warn
- schema 不匹配 (无 `cursorDiskKV` 表): graceful skip

**`tests/ai-sessions/summarizer.test.js`** (~15):
- 抽象 contract: healthcheck + summarize
- 5 个 provider 都注册
- 错误时 (network / 4xx / 5xx) 重试

**`tests/ai-sessions/provider-ollama.test.js`** (~20):
- mock HTTP server
- healthcheck: 200 / 500 / ECONNREFUSED
- summarize: 流式响应 / 非流 / 超时
- 默认 model fallback
- baseUrl 改 (e.g. 远程 ollama)

**`tests/ai-sessions/provider-cloud.test.js`** (~15):
- 4 个 providerId 都测 (openai / anthropic / deepseek / minimax)
- 401 / 429 / 500 错误 path
- anthropic 单独 header (`x-api-key`, `anthropic-version`)
- 其它 3 走 OpenAI 兼容协议

**`tests/ai-sessions/digest.test.js`** (~20):
- runOne: 正常 path
- 幂等: 跑 2 次同一天, 只 1 个 entry
- 0 session 跳过
- LLM 失败 → 不写盘 + log warn
- backfill 串行 7 天
- backfill 中途 LLM 失败 → 已成功的保留, 失败的 skip

**`tests/ai-sessions/storage.test.js`** (~10):
- daily_digests round-trip
- GC 30 天外的 entry
- 缺字段 fallback
- safeStorage mock: encrypt / decrypt round-trip

**`tests/renderer/ai-digest-banner.test.jsx`** (~15):
- loading / has-digest / no-digest 三态
- 折叠/展开
- 重跑按钮触发 callback
- 0 session 不渲染
- meta line 显示 provider + model + 时间

### 8.2 现有测试更新

**`tests/main/load-smoke.test.js`** (+3 cases):
- `src/ai-sessions/*.js` 都 require OK

**`tests/main/state-store.test.js`** (+5 cases):
- daily_digests 读写
- ai_sessions_config 读写
- 缺字段 fallback
- GC 30 天

**`tests/integration/...`**: 1 个 e2e: "启动 → first run → backfill 3 天 → 重启 → 读出来"。

### 8.3 关键测试 fixtures

- `tests/fixtures/cursor-state.vscdb` (~5MB, 脱敏: 替换真实 message 内容为 lorem ipsum)
- 维护成本: 每次 Cursor 大版本更新可能 fixture 失效, 写在 CONTRIBUTING.md

## 9. 实施 phases (后续, 进 writing-plans)

预计 6-8 phases (Feature B 比 A 大, 多):

1. **Foundation** — `src/ai-sessions/` 目录骨架 + detector/summarizer 抽象 + 测试 (~30 case)
2. **Cursor detector** — first impl, 真实解析 SQLite + fixture (~25 case)
3. **Ollama provider** — 本地 LLM 调通 + healthcheck (~20 case)
4. **Daily digest runner** — main process cron + 编排 + storage (~30 case)
5. **UI banner** — renderer 集成 + 顶部 banner + 重跑 (~15 case)
6. **Cloud providers** — openai / anthropic / deepseek / minimax + safeStorage (~20 case)
7. **Backfill + nice-to-have** — 首次启用 7 天 backfill + settings modal (~10 case)
8. **Polish** — 视觉 / 错误 / 性能 + e2e (~10 case)

每 phase 1 commit, 独立可 rollback。

## 10. 开放问题 (后续 phase 处理, 不阻塞 spec 落地)

- 是否要 backfill N 天前的**逐日** digest, 还是只生成一锅合并? (决策: 逐日, 每 runOne)
- Prompt template 是否给用户提供自定义? (out of scope v1)
- LLM 调用失败时是否发通知? (log warn 即可, 不打扰)
- Cursor schema 变更怎么探测? (v2: 加 schema version 字段, 启动时 log)
- `node:sqlite` (Node 22.5+) 何时切换? (v2 评估, 跟 better-sqlite3 性能对比)
- 是否支持 session 内容**用户主动 redact**? (out of scope v1)

## 11. 设计原则摘要

1. **AI session 是新维度, 不进 `src/detectors/`** — 避免目录含义模糊
2. **抽象在前, 实现在后** — 1 个 detector (Cursor) 跑通后再加其他
3. **默认本地, 云端可选** — 隐私优先 + 灵活性
4. **Idempotent** — 同一天跑 2 次不重复
5. **LLM 失败不崩** — log + skip, 不影响 Pulse 主流程
6. **API key 不落盘明文** — safeStorage 加密
7. **跟现有架构对齐** — main process 调 LLM, renderer 只渲染, IPC 跟现有风格一致
8. **跟 Phase 28/29 + Feature A 风格一致** — 同样 spec 格式 / 同样 phase 拆法 / 同样测试量级

## 12. 备选技术 (v2 评估, 记录)

| 决策 | 当前 | 备选 | 何时切 |
|---|---|---|---|
| SQLite 库 | `better-sqlite3` | `node:sqlite` (Node 22.5+ 内置) | Electron 35+ 稳定后, 跑 benchmark 确认性能 |
| Prompt storage | 硬编码 in `prompts.js` | DB / user-editable | 用户要求自定义时 |
| Digest 存储 | state.json 顶层 | 独立 `digests.json` | >10MB 时拆文件 (现在 ~50KB, 不急) |
| API key 存储 | safeStorage | keytar / 1Password CLI | 用户要求统一密码管理器时 |
| API key fallback | 强制走 safeStorage | 环境变量 `PULSE_LLM_KEY` | 自动化场景 (CI) |
