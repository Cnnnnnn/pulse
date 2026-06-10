# Codex AI Summary 智能 Title + Topic 拆粒度

- **日期**: 2026-06-10
- **作者**: Mavis
- **状态**: 待用户 review
- **问题来源**: 用户截图发现 AppUpdateChecker-Ele... 仓库下当日只有一个总结节点，title 都是同一个（"【功能优化】总结机制"），所有 codex session 的 title 看起来都一样
- **跟现有 spec 关系**:
  - 配合 `2026-06-10-ai-digest-generation-job-redesign.md` 的 per-session model，新粒度让"按 topic 拆"天然落到 generations.results 数组里
  - 跟 `2026-06-07-ai-sessions-digest-design.md` 冲突点：v1 说 "Per-session 单独总结 ❌ 不做"，本 spec 在 codex 上打开这个口子（且只对 codex）

## 0. 决策日志

| 决策点 | 选择 | 备选 + 否决理由 |
|---|---|---|
| 拆 session 的范围 | **只改 codex detector** | 全改 (cursor/minimax 已经 1 文件 = 1 session, 不需要); 只 cursor (cursor 已经是粒度正确的) |
| 拆 topic 的边界 | **event_msg.user_message timestamp 切** | LLM 切 (慢, 加成本); 等时长切 (没有语义意义) |
| 拆出来的新 id 格式 | `<原 uuid>#topic-<index>` (例如 `019e8131-...#topic-0`) | 新 uuid (破坏 task_key 缓存追溯); 哈希 (不可读) |
| title 抽取来源 | **event_msg.user_message 第一行非噪声文本** | response_item.user.role (那是 AGENTS.md system 注入, 不可用); 文件名 (没语义) |
| 老 cache key 兼容 | **保留 `<appName>:<uuid>` 旧格式失效即可, 新格式走新 cache** | migrate (没必要, 老缓存还在, 只是不被命中, 用户重生成即可) |
| Cursor / minimax-code 拆 topic | **不动** | 一起改 (cursor 1 jsonl = 1 chat, 没多 topic; minimax 是 sqlite row, 也已经是 1 session = 1 chat) |
| 拆出来的 session 数量上限 | **不限制, 但 prompt 时若 > 8 个 sub-session 提示用户手动选** | 硬切 (用户体验差); 全部总结 (LLM 上下文爆炸) |
| 跑批 LLM 行为 | **继续走 engine.js 逐 session 串行** | 批量一次 LLM 切 (违反现有 perSession prompt 协议) |

## 1. 问题陈述

### 1.1 现状

`src/ai-sessions/codex.js` 的 `readSession` 返回的对象**没有 `title` 字段**, fallback 到 `engine._inferTaskTitle` (engine.js:279):

1. 拿 session.title —— Codex 不返回, 跳过
2. 拿第一条非噪声 user 消息首行

但 Codex JSONL 里第一条 `response_item.payload.role === "user"` 的是 **AGENTS.md / IDE selection / 环境变量 system 注入**, 不是真实用户 query。所有 session 看起来都是同样的开头, 所以 fallback title 全都一样。

### 1.2 现状 (粒度)

`rollout-<ts>-<uuid>.jsonl` 一个文件包含 **多次 user_message** (即多次真实 query), 但 `_collectSessions` 把整个文件当 1 个 session, 1 次 LLM call 总结整文件, title 跟 userGoal 都很笼统。

### 1.3 实测

跑 `jq` 看 `~/.codex/sessions/2026/06/01/rollout-2026-06-01T11-19-47-019e8131-...jsonl` (824KB):

- `event_msg.type=user_message`: 4 条 (4 次真实 query)
- `response_item.message.role=user`: 是 AGENTS.md system prompt (跳过)
- `event_msg.type=agent_message`: 12 条 (4 次 query 的 assistant 回复)
- `event_msg.type=task_started/task_complete`: 4 对 (跟 user_message 对齐)

### 1.4 期望行为

1. Codex session 在 listTasks 时显示 4 个 sub-session (每个对应一次真实 user query)
2. 每个 sub-session 的 title 是该次 query 的第一行有意义文本 (不是 AGENTS.md)
3. 跟 Cursor / minimax-code 风格一致: 1 个对话 = 1 个 summary

## 2. 目标

### 2.1 必须达成

- [A] `codex.js` 智能抽 title: 优先 `event_msg.user_message.message` 第一行非噪声文本
- [A] `codex.js` 把 1 个 JSONL 拆成 N 个 sub-session (N = 该 JSONL 里 `event_msg.user_message` 数量)
- [A] sub-session 的 `id` 格式: `<original-uuid>#topic-<index>` (0-based)
- [A] sub-session 的 `startedAt / endedAt`: 该 topic 时间窗内 messages 的 min/max ts
- [A] sub-session 的 `messages`: 包含 1 条 user (来自 user_message) + N 条 assistant (来自 agent_message / response_item.assistant)
- [A] 跳过 system 注入 (`response_item.user.role === "user"` 的 AGENTS.md 之类不进 messages)
- [A] 0 个 user_message 的 JSONL → 1 个 session (跟现状一致, 不要丢)
- [A] task_key (`codex:<id>`) 跟 content_hash 配套更新, 老 cache 失效但不报错
- [A] 测试: 拆 topic (3 fixture jsonl, N=1/4/8) + title 去噪 (~10 case)

### 2.2 不做

- ❌ Cursor 拆 topic (已经粒度正确)
- ❌ minimax-code 拆 topic (sqlite 1 row = 1 chat)
- ❌ LLM prompt 改 (perSession 协议不变)
- ❌ 老 task_summaries cache migrate (失效自然淘汰)
- ❌ sub-session 数量上限 (留给 v2)

## 3. 设计

### 3.1 JSONL 内部 sub-session 切分算法

输入: 1 个 codex JSONL, 内含若干行
输出: N 个 sub-session (N = `event_msg.user_message` 数量, 至少 1)

算法:

```
events = []  // 解析所有行
for line in jsonl:
  if line.type === 'event_msg' && line.payload.type === 'user_message':
    events.push({ kind: 'user', ts: line.timestamp, content: line.payload.message })
  elif line.type === 'event_msg' && line.payload.type === 'agent_message':
    events.push({ kind: 'assistant', ts: line.timestamp, content: line.payload.message })
  elif line.type === 'response_item' && line.payload.type === 'message':
    role = line.payload.role
    if role === 'user':
      // 这是 AGENTS.md system 注入, 跳过
      continue
    if role === 'assistant':
      events.push({ kind: 'assistant', ts: line.timestamp, content: extractText(line.payload.content) })

// 按 ts 排序
events.sort by ts

// 按 user 切分
sub_sessions = []
current = null
for ev in events:
  if ev.kind === 'user':
    if current: sub_sessions.push(current)
    current = { messages: [{role:'user', content:ev.content, ts:ev.ts}] }
  else:
    if current:
      current.messages.push({role:'assistant', content:ev.content, ts:ev.ts})
    else:
      // assistant 在 user 之前 (e.g. artifact), skip or attach to "previous topic"
      // 简单起见: 创建一个"no user" stub topic 挂在末尾
      continue  // 或者放进首个 topic
if current: sub_sessions.push(current)

// fallback: 0 user → 整个文件当 1 session
if sub_sessions.length === 0:
  sub_sessions = [{ messages: [/* 全部 assistant messages */] }]

// 组装 Session schema
for i, sub in sub_sessions:
  ts_list = sub.messages.map(m => m.ts).filter(t => t > 0)
  session = {
    id: `${original_uuid}#topic-${i}`,
    startedAt: min(ts_list) || 0,
    endedAt: max(ts_list) || 0,
    messages: sub.messages,
    title: _extractCodexTitle(sub.messages),
    // workspaceDir / file 由 detector.js base 透传
  }
```

### 3.2 title 智能抽取 (`_extractCodexTitle`)

```js
function _extractCodexTitle(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  // 1. 优先 user message (在 codex 这里 user 一定是真实 query, 不是 system)
  for (const msg of messages) {
    if (msg.role !== 'user') continue;
    const line = _firstMeaningfulLine(msg.content);
    if (line) return line.slice(0, 48);
  }
  // 2. fallback: 第一条 assistant text 的首行
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    const line = _firstMeaningfulLine(msg.content);
    if (line) return line.slice(0, 48);
  }
  return '';
}

function _firstMeaningfulLine(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // 复用 cursor 的去噪规则
    if (/^#/.test(line)) continue;        // markdown 标题
    if (/^<[^>]+>$/.test(line)) continue; // 单行 <tag>
    if (/^<[a-z_]+>/i.test(line)) continue; // <tag>...</tag> 开头
    if (/^\/Users\//.test(line)) continue; // 绝对路径
    if (/^https?:\/\//i.test(line)) continue; // URL
    return line.replace(/\s+/g, ' ').slice(0, 60);
  }
  return null;
}
```

> 注: Codex JSONL 里 `response_item.user` 是 AGENTS.md system prompt, **不进 messages**; 真 user input 走 `event_msg.user_message`, 进 messages. 所以上面 "优先 user message" 拿到的就是真实 query.

### 3.3 `codex.js` 改动概览

**新增 helpers**:
- `_extractCodexTitle(messages)` — 上面算法
- `_firstMeaningfulLine(text)` — 跟 cursor 共用规则 (内联实现, 避免跨文件 require)
- `_extractResponseContent(content)` — 跟 `_extractContent` 类似, 把 array content 抽 text

**改 `readSession(id)` 行为**:

旧: parse 整个 JSONL → 1 个 session (无 title, 含 system injection)
新: parse 整个 JSONL → N 个 sub-session (按 user_message 切, 含 title, 不含 system injection)

但 engine.js 期望 `readSession(id)` 返 1 个 Session. 需要新接口:

**方案 A**: `readSession` 仍然返 1 个, 但 listSessions 把 sub-session 都列出来, 每个 sub-session 有自己的 id, readSession 按 sub-session id 找.

**方案 B**: 改 engine.js 支持多 session return, 复杂.

**选 A**. 改 listSessions:

```js
async listSessions() {
  // 扫所有 rollout-*.jsonl
  // 对每个文件, parse 一次拿到 sub-sessions
  // 每个 sub-session 输出一个 meta: { id: `${uuid}#topic-${i}`, file, mtimeMs, sizeBytes }
}

async readSession(id) {
  // id 可能是 `${uuid}#topic-${index}` 格式
  // parse 文件, 找到 index 对应的 sub-session, return
}
```

### 3.4 `_localDayStart` 跟 sub-session 的交互

`detector.filterByLocalDay` 用 `endedAt || startedAt || mtimeMs` 判定. Sub-session 的 endedAt 是该 topic 窗口内最后一条 ts. 这意味着:

- 一个 824KB JSONL 里 4 个 sub-session 散在不同时段
- 比如 topic-0 是 11:19-11:30, topic-3 是 14:00-14:25
- 按 dateKey='2026-06-01' 过滤: 4 个都落在当天, 都返回
- 按 dateKey='2026-06-02' 过滤: 0 个

逻辑正确, 不需要改.

### 3.5 task_summaries cache 兼容性

老 cache key: `codex:019e8131-...-uuid` (engine.js:212)
新 cache key: `codex:019e8131-...-uuid#topic-0`

老的 cache 条目**不会被命中** (新 sub-session id 不一样), 但也不会被错误复用 (engine.js:236 `cacheMap[taskKey]`). 行为:

- 老 cache entry 残留 state.json 里, 占点空间 (~几 KB)
- 用户对 sub-session 重新生成 → 新 cache entry 创建
- 老 cache entry 30 天后被 GC (state-store.js:381 已有 task_summaries GC 逻辑)

不主动删老 key, 让它自然淘汰. 简单 + 安全.

### 3.6 content_hash 跟 stale 判定

`engine._contentHash(session)` 用 messages 序列算 djb2 hash. Sub-session 的 messages 是该 topic 窗口内的子集, hash 不同, 老 cache 自然 stale (UI 标 "内容变了, 可重新生成").

不需要额外迁移逻辑.

## 4. 文件改动清单

### 4.1 改 `src/ai-sessions/codex.js`

- 加 `_extractCodexTitle` / `_firstMeaningfulLine` / `_extractResponseContent`
- 改 `_parseCodexJsonl`: 同时返 `{ originalUuid, workspaceDir, subSessions: [{ id, startedAt, endedAt, messages, title }] }`
- 改 `readSession(id)`: 解析 `#topic-<N>` 格式, 返对应 sub-session
- 改 `listSessions()`: parse 文件时跑一次, 给每个 sub-session 输出 meta

### 4.2 新增 `tests/ai-sessions/codex-detector.test.js`

(~12 cases)

- listSessions: fixture 4-topic jsonl → 4 sub-session meta
- readSession: 按 `#topic-0` / `#topic-3` 拿到不同 sub-session
- title 抽取: fixture 含 "permissions / env / ide_selection" 开头 → 不命中, 命中真正 query 首行
- 0 user_message 的 jsonl → 1 个 stub sub-session (不进 listTasks 时跟现状一致, 还是 fallback 整文件)
- 1 user_message + N assistant → 1 sub-session
- 重复 user_message (用户复制粘贴 retry) → 还是 2 sub-session (each a topic), 不去重
- assistant 在 user 之前 → 挂到下一个 topic 或第一个 stub
- 损坏 JSONL 行 → 跳过, 不 crash
- content_hash 跨 sub-session 不同 (确认 stale 检测工作)

### 4.3 新增 fixtures

- `tests/fixtures/codex/rollout-4-topics.jsonl` (~10KB, 4 user_message + 12 agent_message, 跨 1 小时)
- `tests/fixtures/codex/rollout-0-topics.jsonl` (~5KB, 只有 agent_message)
- `tests/fixtures/codex/rollout-1-topic.jsonl` (~3KB, 1 user + 3 agent)

## 5. 边界 / 错误处理

| 场景 | 行为 |
|---|---|
| JSONL 解析失败 | engine._collectSessions 已捕获, log warn, skip 该文件 |
| 0 user_message | 返 1 个 stub sub-session (messages = 全部 assistant), title 从首条 assistant 抽 |
| 100+ user_message (长 session) | 不切, 一次性列 100+ sub-session, UI 让用户手动选 (out of scope: 智能合并相邻 topic) |
| assistant 在 user 之前 | 放进第一个 sub-session (或下一个, 选第一个简单) |
| timestamp 解析失败 | ts=0, 不影响切分 (按出现顺序), startedAt/endedAt 可能=0 |
| 老 cache entry 残留 | 不主动删, 让 GC 清理 |
| Workspace dir 变化 | session_meta 的 cwd 是整个 JSONL 级别, 透传给每个 sub-session |

## 6. 测试策略

### 6.1 单元测试

新增 `tests/ai-sessions/codex-detector.test.js`:

- 拆 topic 正确性 (3 fixture 各跑一遍)
- title 去噪 (5 case: AGENTS.md / permissions / env / ide_selection / 路径 / URL / 真 query)
- readSession 按 `#topic-N` 索引
- 损坏行容错

### 6.2 回归测试

跑现有 `tests/ai-sessions/engine.test.js` 确认:
- `_toTaskCard` / `_taskKeyOf` / `_contentHash` 行为不变 (sub-session 也是 Session schema, 兼容)
- `_collectSessions` 拿到 sub-session list, 进 `_toTaskCard` 渲染卡片正常

### 6.3 手工验证

`npm start` 后:
- 当天有 4 个 codex sub-session 的, 显示 4 张卡片, title 各自不同
- 老 cache 不报错 (state.json 老 key 残留, GC 30 天)
- 重跑按钮正常, 重新生成后 cache entry 更新

## 7. 实施顺序 (进 writing-plans)

预计 3-4 phases, 每 phase 1 commit:

1. **Phase 1**: 改 `codex.js` 加 `_extractCodexTitle` + 改 `_parseCodexJsonl` 返多 sub-session + 改 `readSession` 按 id 索引
2. **Phase 2**: 改 `listSessions` 输出 sub-session meta
3. **Phase 3**: 写 fixtures + 单测 (12 case)
4. **Phase 4**: 跑全套测试 + 手工验证 (`npm test` + `npm start` 观察 UI)

每 phase 独立可编译可测, 中间不破现有功能.

## 8. 开放问题 (后续 v2 处理)

- sub-session 数量上限 / 智能合并相邻 topic: 留 v2
- LLM prompt 是否给 sub-session 加 context (上次 topic 摘要): 留 v2
- Cursor / minimax-code 是否需要拆 topic: 留 v2 (看用户反馈)
- task_summaries 老 key 主动迁移 vs 自然淘汰: 选自然淘汰, 简单安全

## 9. 设计原则摘要

1. **小改动, 不破现有架构** — 只动 codex.js, engine.js / store.js / UI 都不动
2. **跟 cursor / minimax-code 行为对齐** — 都是 "1 个对话 = 1 个 summary"
3. **cache 兼容性安全** — 老 key 自然淘汰, 不主动迁移
4. **system 注入彻底跳过** — response_item.user.role 不进 messages
5. **perSession 协议不变** — engine.js 一次还是收 1 个 session (sub-session 也是 Session schema)