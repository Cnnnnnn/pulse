# Codex Desktop 任务栏 thread title 数据链路溯源

> 目标：把 Codex Desktop 显示在侧边栏/任务栏的 thread title 字段，从 SQLite 存储到 UI 字符串渲染的**整条数据链路**用真实文件路径 + 行号画清楚。
> 截止时间：2026-06-10
> 仓 HEAD：`0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e`（openai/codex@main）
> 前置研究：`/tmp/mavis-deep-research/20260610-170518-codex-thread-title/final.md`

---

## 0. 关键结论（TL;DR）

1. **Codex Desktop（侧边栏 / 任务栏的 renderer）是 closed-source**，**不在** `openai/codex` 仓中。`openai/codex` 仓里只有 `codex-rs/`（Rust CLI / TUI / app-server）+ `package.json`（Node 包装）。"Codex Desktop" 的 `.app` bundle 是从 `https://persistent.oaistatic.com/codex-app-prod/Codex.dmg` 下载安装的（见 `codex-rs/cli/src/desktop_app/mac.rs:8`）。这意味着 `if (!item.title)`（issue #25456）那段 renderer 缓存逻辑**无法在 `openai/codex` 中定位 path:line**——它在私有的 Electron renderer 里。
2. **`openai/codex` 仓能完整 trace 的链路是「持久化层 + 协议层 + TUI」**：SQLite `state_5.sqlite` 的 `threads.title` 列 → `ThreadStore::update_thread_metadata` → `codex_app_server::thread_set_name` 入口 → 写回 SQLite + rollout JSONL → 通过 `ServerNotification::ThreadNameUpdated` 推回请求连接。
3. **三个"如果改这里"的入口**（§5）按"最小风险 → 最大杠杆"排序：
   - 最小风险：TUI `/rename` slash 命令已能改 title，问题只在 Desktop 不订阅。改 `codex-rs/tui/src/chatwidget/interaction.rs:305` 让 `/rename` 写完后强制 invalidate 一次 thread-list 缓存，零协议改动。
   - 中等：往 app-server 协议加一个 `ThreadListInvalidate` notification，Desktop 端只要 `thread/list` 收到就 re-render。需要 OpenAI 加 schema 字段。
   - 最大杠杆（也是 #24202 真正解）：把 `thread/name/updated` notification 从 "只发给请求连接" 改成 "广播到所有打开的 renderer 进程"。一行 core API 改动，副作用需要小心评估（要不要全网通知 vs 限本机 + 仅相关 thread）。

---

## 1. 数据流图（SQLite → store → IPC → renderer → UI 字符串）

### 1.1 持久化层 Schema

**1. `state_5.sqlite` 是唯一权威 SQLite DB。**（文件名常量）

- `codex-rs/state/src/lib.rs:84` —— `pub const STATE_DB_FILENAME: &str = "state_5.sqlite";`
- `codex-rs/state/src/runtime.rs` 提供 `runtime_db_paths` 拼接 `CODEX_SQLITE_HOME` 环境变量覆盖目录。

**2. `threads` 表的 schema（35 个 migration 中的第 1 个）。**

- `codex-rs/state/migrations/0001_threads.sql:1-19` —— `CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER, source TEXT, model_provider TEXT, cwd TEXT, title TEXT NOT NULL, sandbox_policy TEXT, ...)`。
- 注意 `title TEXT NOT NULL` —— 写入必须是非空字符串，empty title 不允许（`extract.rs:97` 的"如果空就用 first user message"逻辑正是为了满足这个 NOT NULL 约束）。
- `codex-rs/state/src/model/thread_metadata.rs:299-301` —— `if self.title != other.title { diffs.push("title"); }` 用于审计"title 字段被改了"的事件。

### 1.2 title 字段的写入路径（按入口分类）

#### 入口 A：用户通过 CLI TUI `/rename` slash 命令改 title

```
TUI SlashCommand::Rename
  → codex-rs/tui/src/slash_command.rs:31  `Rename,` (enum variant)
  → codex-rs/tui/src/slash_command.rs:89  `SlashCommand::Rename => "rename the current thread"`
  → codex-rs/tui/src/chatwidget/slash_dispatch.rs:657  `let Some(name) = normalize_thread_name(&args) else { ... }`
  → codex-rs/tui/src/chatwidget/interaction.rs:305  `let Some(name) = normalize_thread_name(&name) else { ... }`
  → 调用 codex-rs/core/src/util.rs:109  `pub fn normalize_thread_name(name: &str) -> Option<String>`（trim 后空 → None）
  → 走 app-server RPC `thread/setName`（与入口 B 共享）
```

> 关键观察：`/rename` 是 **TUI 独占** 的入口，**不是** app-server 公开的 RPC；它内部也是通过 app-server 通道写的（详情看 TUI 的 `app_server_session.rs`，继承自线程启动时建立的 connection）。Desktop 端没有等价的 slash 命令 — 它的重命名入口只可能是用户手动在 UI 上改（如果 UI 提供了这个 affordance）或者通过 app-server 协议 RPC。

#### 入口 B：app-server JSON-RPC `thread/setName`（外部触发 — #24202 唯一稳定入口）

> **校正**：前置研究 final.md 写的是 `thread/name/set`（斜杠顺序），仓里的实际 method 名是 `thread/setName`（camelCase）。两者语义相同，但 method 字符串不同。`gh api` 验证后是 `thread/setName` 这一点在 §6 引用中给出。

```
client (Desktop / CLI / orchestrator)
  → JSON-RPC: {"method": "thread/setName", "params": {"threadId": "...", "name": "..."}}
  → codex-rs/app-server-protocol/src/protocol/v2/thread.rs:663
    `pub struct ThreadSetNameParams { pub thread_id: String, pub name: String }`

  → app-server 收到 → codex-rs/app-server/src/request_processors/thread_processor.rs:484
    `pub(crate) async fn thread_set_name(`
    拿到 request_id 和 params，转给 internal handler

  → codex-rs/app-server/src/request_processors/thread_processor.rs:1437
    `async fn thread_set_name_response_inner(`
    调用 `codex_core::util::normalize_thread_name(&name)`（line 1445）拒绝空字符串

  → codex-rs/app-server/src/request_processors/thread_processor.rs:1450-1458
    `self.thread_manager.update_thread_metadata(thread_id,
        StoreThreadMetadataPatch { name: Some(Some(name.clone())), ..Default::default() },
        /*include_archived*/ false)`

  → codex-rs/core/src/thread_manager.rs:480
    `pub async fn update_thread_metadata(...)` — 路由层
    hot thread → `thread.update_thread_metadata(patch, include_archived)` (line 493)
    cold thread → `state.thread_store.update_thread_metadata(...)` (line 499)

  → codex-rs/thread-store/src/store.rs:109
    `async fn update_thread_metadata(&self, params: UpdateThreadMetadataParams)`

  → codex-rs/thread-store/src/local/update_thread_metadata.rs:184
    `async fn apply_metadata_update(...)` — 把 patch 合并到 metadata 对象
    line 242-243: `if let Some(name) = patch.name { metadata.title = name.unwrap_or_default(); }`
    line 245-247: `if let Some(title) = patch.title { metadata.title = title; }`
    line 307-312: `state_db.upsert_thread(&metadata).await?` （主写入）

  → 双写分支（line 94-96）`if let Some(name) = name { apply_thread_name(...).await?; }`
    → codex-rs/thread-store/src/local/update_thread_metadata.rs:497
      `async fn apply_thread_name(store, thread_id, name)`
      line 502-513: state_db.update_thread_title(thread_id, &name)
      line 516-520: append_thread_name(codex_home, thread_id, &name)  ← 写 session_index.jsonl

  → codex-rs/state/src/runtime/threads.rs:572
    `pub async fn update_thread_title(&self, thread_id, title)`
    line 577: `sqlx::query("UPDATE threads SET title = ? WHERE id = ?")`
    ← 这一行就是真正写 SQLite `threads.title` 列的 SQL

  → codex-rs/rollout/src/session_index.rs:29
    `pub async fn append_thread_name(codex_home, thread_id, name)`
    line 50-65: `append_session_index_entry` 打开 ~/.codex/session_index.jsonl
    line 60-62: 写 `serde_json::to_string(&SessionIndexEntry { id, thread_name, updated_at })`
    ← 这是 #25950 → PR #26075 修的"second source of truth"
```

#### 入口 C：app-server 自动从 first user message 派生 title

```
新 turn 收到 EventMsg::UserMessage
  → codex-rs/state/src/extract.rs:91
    `EventMsg::UserMessage(user) => {`
    line 97-101:
      `if metadata.title.is_empty() {
          let title = strip_user_message_prefix(user.message.as_str());
          if !title.is_empty() { metadata.title = title.to_string(); }
      }`
  → 这条路径只在 title 字段当前为空时生效
  → 写入路径仍是 `state_db.upsert_thread(&metadata)`
```

### 1.3 title 字段的读取路径（用于 thread list 渲染）

> 这是**最关键的"加载 sidebar"路径**。每个 thread list refresh 都会跑一次。

```
list_threads request
  → codex-rs/thread-store/src/local/list_threads.rs:21
    `pub(super) async fn list_threads(store, params)`
    走 list_rollout_threads（line 50）从 rollout JSONL 拿到 page.items

  → codex-rs/thread-store/src/local/list_threads.rs:78-92
    `let thread_ids = items.iter().map(|t| t.thread_id).collect::<HashSet>();`
    `if let Some(state_db_ctx) = store.state_db().await {`
      `for &thread_id in &thread_ids {`
        `let Ok(Some(metadata)) = state_db_ctx.get_thread(thread_id).await else { continue; };`
        `if let Some(title) = distinct_thread_metadata_title(&metadata) { names.insert(...); }`
      `} }`

    **优先从 SQLite `threads` 表读**（line 83-92），distinct 的"非空"才算 name

  → codex-rs/thread-store/src/local/list_threads.rs:93-100
    `if names.len() < thread_ids.len()`
    `&& let Ok(legacy_names) = find_thread_names_by_ids(codex_home, &thread_ids).await`
    `for (thread_id, title) in legacy_names { names.entry(thread_id).or_insert(title); }`

    **SQLite 缺的部分从 session_index.jsonl 反向补**（line 93-100）
    `find_thread_names_by_ids` 在 codex-rs/rollout/src/session_index.rs:84
    → 该函数读 session_index.jsonl 的所有行，HashMap 收集 thread_id → 最新的非空 thread_name

  → codex-rs/thread-store/src/local/list_threads.rs:101-105
    `for thread in &mut items { if let Some(title) = names.get(&thread.thread_id).cloned() {`
      `set_thread_name_from_title(thread, title); } }`

  → codex-rs/thread-store/src/local/helpers.rs:186
    `pub(super) fn set_thread_name_from_title(thread: &mut StoredThread, title: String)`
    把 `thread.name = Some(title)` 写入返回对象
```

> 关键观察：list_threads 路径**完全在 server 端**完成"SQLite + session_index.jsonl 二合一"逻辑，Desktop 客户端只看到最终拼好的 `StoredThread { name: Some(...) }`。**也就是说，#25456 的"renderer 缓存"问题必须发生在 client 端，**server 已经返回了正确数据，client 把响应当成了 stale。

### 1.4 写入回环：ThreadNameUpdated 通知的发送范围

```
app-server 处理 thread/setName 成功后（前面路径 §1.2 入口 B）
  → codex-rs/app-server/src/request_processors/thread_processor.rs:489
    `match self.thread_set_name_response_inner(params).await {`
    line 490-500:
      `Ok((response, notification)) => {`
        `self.outgoing.send_response(request_id.clone(), response).await;`
        `if let Some(notification) = notification {`
          `self.outgoing.send_server_notification(`
            `ServerNotification::ThreadNameUpdated(notification)).await;`
        `}`

  → `self.outgoing` 是**当前 connection 的 outgoing sink**（per-connection 写入队列）
  → notification **只发给发起这次 RPC 的那个连接**，不会 fan-out 到所有订阅该 thread 的连接
```

> 关键观察：这是 **#24202 的真因**。`thread/name/updated` 在协议层是设计为"回声给请求方"的，不是"广播给所有 viewer"。所以**即使** Desktop 端 app-server 监听的是 WebSocket / UDS，**也只会在**"自己发起的 setName 请求"那一帧收到通知。如果改名来自另一个进程（另一个 `codex app-server` 实例、CLI、orchestrator），Desktop 进程**永远不会收到**通知。

### 1.5 TUI 这一侧的 title 渲染（**唯一在 openai/codex 中能找到的 renderer**）

> TUI 不是 Desktop，但 TUI 是同构的 title 渲染实现，可以用来反推 Desktop 的 contract。

```
TUI 收到 thread/list 响应
  → codex-rs/tui/src/app_server_event_targets.rs  （订阅 ServerNotification 的 target 分发）
  → codex-rs/tui/src/chatwidget/protocol.rs  （chat widget 的 protocol 监听）
  → codex-rs/tui/src/chatwidget/session_flow.rs  （处理 ThreadNameUpdated 事件）
```

> 这三个文件的精确 path:line 因为 plan 时间预算关系，在 8-question explore agent 报告里没保留。我没能在本任务窗口内用 `git grep` 二次确认。但 explore agent 报告的语义是"明确的、文件存在的"。**此处降级为"文件存在 + role 描述"，等 verifier 二次确认。**

---

## 2. 关键文件清单（≥5 个，每个 path:line + role 一句话）

| # | path:line | role |
| --- | --- | --- |
| 1 | `codex-rs/cli/src/desktop_app/mac.rs:8-10` | **Codex Desktop .app bundle 下载 URL**。硬编码 `https://persistent.oaistatic.com/codex-app-prod/Codex.dmg` (arm64) / `Codex-latest-x64.dmg` (x64)。**这是 `openai/codex` 仓关于 Codex Desktop 的"全部"代码**——一个 .dmg launcher，不是源码。 |
| 2 | `codex-rs/cli/src/main.rs:151` | `App(app_cmd::AppCommand)` —— `codex app` 子命令的 clap 定义入口。 |
| 3 | `codex-rs/cli/src/app_cmd.rs:19,23` | `crate::desktop_app::run_app_open_or_install(workspace, cmd.download_url_override).await` —— `codex app` 真正做的事：调 desktop_app 模块下载 + 打开 .dmg。 |
| 4 | `codex-rs/state/src/lib.rs:84` | `pub const STATE_DB_FILENAME: &str = "state_5.sqlite";` —— 唯一权威 SQLite 文件名常量。 |
| 5 | `codex-rs/state/migrations/0001_threads.sql:1-19` | `threads` 表 schema，`title TEXT NOT NULL`。35 个 migrations 中的第 1 个；后续 migration 加列不加 title。 |
| 6 | `codex-rs/state/src/runtime/threads.rs:572-583` | `update_thread_title` —— **真正写 `UPDATE threads SET title = ? WHERE id = ?` SQL** 的函数（title 列的"权威写入点"）。 |
| 7 | `codex-rs/state/src/runtime/threads.rs:468-557` | `upsert_thread` —— `INSERT INTO threads (...) ON CONFLICT(id) DO NOTHING`（首创建路径），bind `metadata.title.as_str()`（line 540）。 |
| 8 | `codex-rs/thread-store/src/local/update_thread_metadata.rs:184-353` | `apply_metadata_update` —— patch → metadata 合并 → upsert 的合并逻辑；line 242-247 是 `name` 字段（`Option<Option<String>>`）写入 `metadata.title` 的核心 5 行。 |
| 9 | `codex-rs/thread-store/src/local/update_thread_metadata.rs:497-521` | `apply_thread_name` —— 显式重命名时的"双写"：state_db.update_thread_title（line 504）+ append_thread_name 写 session_index.jsonl（line 516）。 |
| 10 | `codex-rs/rollout/src/session_index.rs:29-46` | `append_thread_name` —— 打开 `~/.codex/session_index.jsonl` 追加一行 `{ id, thread_name, updated_at }`。 |
| 11 | `codex-rs/rollout/src/session_index.rs:84-113` | `find_thread_names_by_ids` —— 反向补齐逻辑：从 session_index.jsonl 末尾向前扫，找每个 thread_id 对应的最新非空 thread_name。 |
| 12 | `codex-rs/thread-store/src/local/list_threads.rs:78-105` | thread list 加载的"二合一"逻辑：先 SQLite `get_thread` 取 distinct title，缺的部分从 session_index.jsonl 补，最后 `set_thread_name_from_title` 写回每条 item。 |
| 13 | `codex-rs/thread-store/src/local/helpers.rs:177` | `distinct_thread_metadata_title(metadata) -> Option<String>` —— "非空才算 name"的判别函数。 |
| 14 | `codex-rs/thread-store/src/local/helpers.rs:186` | `set_thread_name_from_title(thread, title)` —— 把 merged 后的 name 写回 `StoredThread.name`。 |
| 15 | `codex-rs/app-server/src/request_processors/thread_processor.rs:484-505` | `thread_set_name` outer —— JSON-RPC 入口；处理响应 + 发送 ThreadNameUpdated 通知。 |
| 16 | `codex-rs/app-server/src/request_processors/thread_processor.rs:1437-1469` | `thread_set_name_response_inner` —— normalize 名字 → 调 thread_manager.update_thread_metadata → 组 ThreadNameUpdatedNotification 返回值。 |
| 17 | `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:663` | `pub struct ThreadSetNameParams { pub thread_id: String, pub name: String }` —— RPC 参数定义。 |
| 18 | `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:1349` | `pub struct ThreadNameUpdatedNotification { pub thread_id: String, #[ts(optional)] pub thread_name: Option<String> }` —— 通知 payload 定义。 |
| 19 | `codex-rs/app-server-transport/src/transport/mod.rs:67-71` | `pub enum AppServerTransport { Stdio, UnixSocket { socket_path }, WebSocket { bind_address }, Off }` —— transport 矩阵定义。 |
| 20 | `codex-rs/app-server-transport/src/transport/unix_socket.rs:15,79` | `use tokio_tungstenite::accept_async;` + `let websocket_stream = match accept_async(stream).await` —— **UnixSocket transport 实际是 WebSocket-over-UDS**（UDS 接收后 upgrade 到 WebSocket 协议）。 |
| 21 | `codex-rs/cli/src/main.rs:510` | `#[arg(long = "listen", value_name = "URL", ...)]` —— `--listen stdio://` / `--listen unix://...` / `--listen ws://...` / `--listen off` 四个值的 clap flag。 |
| 22 | `codex-rs/tui/src/slash_command.rs:31,89` | `Rename,` enum variant + `SlashCommand::Rename => "rename the current thread"` —— TUI 端的 `/rename` 命令注册。 |
| 23 | `codex-rs/tui/src/chatwidget/interaction.rs:305` | TUI 收到 rename 输入后 `normalize_thread_name` 校验，失败回 `None`。 |
| 24 | `codex-rs/tui/src/chatwidget/slash_dispatch.rs:657` | TUI `/rename` slash 命令的 input parser，调用 `normalize_thread_name(&args)`。 |
| 25 | `codex-rs/core/src/util.rs:109-116` | `pub fn normalize_thread_name(name: &str) -> Option<String>` —— trim 后空字符串 → `None`（拒绝空 title）。 |
| 26 | `codex-rs/state/src/extract.rs:91-103` | `EventMsg::UserMessage` 派生 title 逻辑：`if metadata.title.is_empty() { ... metadata.title = ... }`。 |
| 27 | `codex-rs/core/src/thread_manager.rs:480-511` | `update_thread_metadata` 路由层：hot thread 走 CodexThread，cold thread 走 state.thread_store。 |
| 28 | `codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs:135,174` | `pub struct Thread { ... pub name: Option<String>, ... }` —— thread list / thread read RPC 返回的 Thread 对象 schema。 |

---

## 3. Issue #25456 的 `if (!item.title)` 真实上下文定位

### 3.1 诚实结论：**该代码不在 `openai/codex` 仓中**

- 仓根目录的 `ls` 只显示 `codex-rs/` 子目录 + 根级 `package.json` / `pnpm-workspace.yaml` 等 monorepo 文件（无 `apps/desktop/` 或 `codex_app/`）。
- 全仓 grep `item.title` / `listedTitle` / `cached.has(conversationId)` 0 hit（前置研究 + track-b 独立 grep 4,881 个源文件）。
- 仓里与 "title cache" 概念最接近的是 §1.3 描述的 server-side list_threads 合并逻辑（`list_threads.rs:78-105`），但那不是 renderer cache，是"SQLite + JSONL 二合一"的服务端逻辑，每次 refresh 重新算，没有"已经显示过就不再更新"的 cache。
- Codex Desktop 的 `.app` bundle 从 `https://persistent.oaistatic.com/codex-app-prod/Codex.dmg` 下载（`codex-rs/cli/src/desktop_app/mac.rs:8`），里面是**私有的 Electron renderer 代码**（TS / TSX / JS / JSX），OpenAI 不开源。

### 3.2 仓里能给的间接证据

虽然**不能**直接定位 `if (!item.title)` 这一行，但**可以**根据 server contract 推断 renderer 期望的数据形态：

- **返回数据形态**（`codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs:135,174`）：`Thread { name: Option<String>, ... }` —— `name` 是 `Option<String>`，可能是 `None`（空 title）或 `Some("...")`。
- **服务端的 "distinct name" 语义**（`codex-rs/thread-store/src/local/helpers.rs:177` `distinct_thread_metadata_title`）："非空 + 显式 rename 优先"。这意味着如果用户在 UI 上改了一次 title，server 端发回的 `Thread.name` 应当是 `Some("用户新 title")` 而不是 `None`。
- **session_index.jsonl 反向补**（`codex-rs/rollout/src/session_index.rs:84-113`）：如果 SQLite 的 title 是空、但 session_index.jsonl 里显式 rename 过，list 返回的 `Thread.name` 也会是 `Some("...")` 而非 `None`。

### 3.3 #25456 reporter 描述的 renderer 伪代码

> 来源：GitHub Issue #25456 reporter (kpg1t) 在 issue body 提供的代码片段（**非 openai/codex 仓代码**）：

```ts
if (cached.has(conversationId)) {
  update(conversationId, item => {
    if (!item.title && listedTitle) item.title = listedTitle;  // ← bug 在这一行
  });
  return;
}
```

### 3.4 反推：renderer bug 应当怎么修

> 这是基于 server contract 的推断，不是从 openai/codex 找出的代码。

正确的"更新条件"应当是 `if (listedTitle && item.title !== listedTitle) item.title = listedTitle;` —— 即**不**区分 item.title 当前是 undefined / 空 / 旧值，**只要 server 给的 listedTitle 跟当前显示不一致就覆盖**。

但**这段代码不在 openai/codex 仓中**。修这个 bug 的 PR 应当发到 Codex Desktop 私有仓，或者通过 OpenAI 内部 issue tracker。Track-b-pr-risk 的独立分析给出了同样结论。

---

## 4. Issue #24202 协议层在 Desktop 端的真实监听情况

### 4.1 协议层：app-server transport 实际能力

> **校正**：前置研究 final.md 说"UnixSocket 是 experimental，跨进程可行"，没具体说 UDS 上的协议层。Track-a 进一步确认：**UnixSocket 实际是 WebSocket-over-UDS**，不是 raw JSON-RPC。

| Transport | CLI flag | 实现位置 | 协议 | 跨进程？ | Desktop 用？ |
| --- | --- | --- | --- | --- | --- |
| `Stdio` | `--listen stdio://`（默认） | `codex-rs/app-server-transport/src/transport/stdio.rs` | 原始 JSON-RPC over stdin/stdout | ❌ | ❌（Desktop 是另一个 .app 进程） |
| `UnixSocket` | `--listen unix://PATH` | `codex-rs/app-server-transport/src/transport/unix_socket.rs:15,79` | **WebSocket-over-UDS**（UDS 收到后 `accept_async` 升级） | ✅（本机） | ❓ 公开来源未确认 |
| `WebSocket` | `--listen ws://IP:PORT` | `codex-rs/app-server-transport/src/transport/websocket.rs` | WebSocket | ✅（局域网/本机） | ❓ 公开来源未确认 |
| `Off` | `--listen off` | 关闭 transport | — | — | — |

> 来源：`codex-rs/app-server-transport/src/transport/mod.rs:67-71` 定义 enum；`codex-rs/app-server-transport/src/transport/unix_socket.rs:15` `use tokio_tungstenite::accept_async;` + line 79 `let websocket_stream = match accept_async(stream).await` 是关键证据。

### 4.2 Desktop 实际使用什么 transport？**公开来源未确认**

- `codex-rs/cli/src/main.rs:151` 的 `App(app_cmd::AppCommand)` 仅调 `desktop_app::run_app_open_or_install` 下载 .dmg 然后 `open -a`，**不会** spawn 一个 in-process `codex app-server`。
- `codex-rs/cli/src/desktop_app/mac.rs:80-103` 的 `open_codex_app` 把 deep link `codex://threads/new?path=...` 传给 macOS，macOS 启动 `.app` bundle。
- **`.app` bundle 内部的 app-server 启动方式公开来源未披露**。可能：① Desktop 内嵌一个 stdio 模式 app-server 子进程；② Desktop 自己开 unix socket 或 websocket 模式 app-server 监听；③ Desktop 干脆不走 app-server，用别的 IPC 通道。
- **结论**：要回答"Desktop 实际用什么 transport"，需要逆向分析 Codex.app bundle 里的 Electron 代码。**openai/codex 仓没有这个信息**。

### 4.3 通知 fan-out 的真实情况（**最关键的 #24202 事实**）

无论 Desktop 用什么 transport 启动 app-server，**`ThreadNameUpdated` 通知的发送策略是"只发给发起请求的 connection"**。这是 server-side 行为，与 transport 无关：

```
codex-rs/app-server/src/request_processors/thread_processor.rs:489-501
  Ok((response, notification)) => {
    self.outgoing.send_response(request_id.clone(), response).await;
    if let Some(notification) = notification {
      self.outgoing.send_server_notification(
        ServerNotification::ThreadNameUpdated(notification)).await;
    }
    Ok(None)
  }
```

- `self.outgoing` 是**当前 connection** 的 outgoing 队列（per-connection struct）。
- `send_server_notification` 只把 notification 放进**这一条 connection** 的写队列。
- **没有代码路径** 把 ThreadNameUpdated 广播给所有打开的 connection / 所有订阅该 thread 的 viewer。

这意味着 **#24202 的"外部 orchestrator 改 title → Desktop live refresh" 在当前 server 协议下根本不可能**：
1. 外部 orchestrator 启自己独立的 `codex app-server --listen unix://...` → 写 SQLite + JSONL 成功（路径 §1.2 入口 B）→ **不会**通知 Desktop 端 app-server（不同进程）。
2. 同一 `codex app-server` 进程内：Desktop 也起 connection，但 Desktop 没发 `thread/setName` 请求（是 orchestrator 发的）→ **不会**收到通知（fan-out 不存在）。

**唯一** Desktop 能 live-refresh 的场景：Desktop 自己发起 `thread/setName` RPC，且恰好没 cache 命中（即 §3.4 那个 if 条件不满足的窗口外）。其他所有场景都需要 Desktop 重启 / 重新打开 thread。

### 4.4 TUI 一侧的对照（#24202 不是 100% 无解的证据）

TUI 是单进程（不跨进程 IPC），TUI 进程内不同的 "connection" 概念不存在 — TUI 内部直接通过 `app_server_session.rs` 的 channel 拿通知。所以 TUI 端的 `/rename` live-refresh 实际是工作的（前提是 §1.2 入口 A 走的那条 TUI→app-server 路径是 in-process）。**这是 #24202 的反例：TUI 不受影响，影响的只有跨进程的 Desktop 场景。**

---

## 5. 三个"如果改这里"的入口（最小风险 → 最大杠杆）

### 5.1 入口 1（最小风险）：让 TUI `/rename` 写完后强制 invalidate thread-list 缓存

- **位置**：`codex-rs/tui/src/chatwidget/interaction.rs:305`（rename 输入处理）或 `codex-rs/tui/src/chatwidget/slash_dispatch.rs:657`（slash 派发）。
- **改动**：在调用 `app_server_session.send_request(ThreadSetNameParams { ... })` 之后，紧接着发一个 `ThreadListInvalidate` 内部消息（不一定走 RPC），强制 thread-list widget 重新 `thread/list`。
- **成本评估**：
  - **协议**：零改动（不发新 RPC、不改 schema）。
  - **代码量**：5-15 行（chatwidget 加 1 个 listener + 1 个 invalidate 消息）。
  - **风险**：只在 TUI 路径生效；Desktop 端不受影响。
  - **影响**：`/rename` 后 sidebar 立即更新（**目前 TUI 大概率已经 work**，所以这条更多是"如果 TUI 也坏了"的兜底）。
- **能不能解决 #25456**：**不能**。#25456 是 Desktop renderer 的 closed-source bug，TUI 不受影响。

### 5.2 入口 2（中等风险）：往 app-server 协议加 `ThreadListInvalidate` notification，Desktop 端订阅

- **位置**：`codex-rs/app-server-protocol/src/protocol/v2/thread.rs` 加新 struct + `codex-rs/app-server/src/lib.rs` 枚举；handler 复用 `thread_set_name` 的代码路径，在 outer 函数里多加一行 send_server_notification。
- **改动方案**（伪代码）：

  ```rust
  // codex-rs/app-server-protocol/src/protocol/v2/thread.rs
  pub struct ThreadListInvalidateNotification { pub reason: String }

  // codex-rs/app-server/src/request_processors/thread_processor.rs:484
  pub(crate) async fn thread_set_name(...) {
      match self.thread_set_name_response_inner(params).await {
          Ok((response, notification)) => {
              self.outgoing.send_response(...).await;
              if let Some(notification) = notification {
                  self.outgoing.send_server_notification(
                      ServerNotification::ThreadNameUpdated(notification)).await;
              }
              // ↓ 新增这一段
              self.outgoing.send_server_notification(
                  ServerNotification::ThreadListInvalidate(
                      ThreadListInvalidateNotification { reason: "thread_set_name".to_string() }
                  )).await;
              Ok(None)
          }
          ...
      }
  }
  ```

- **成本评估**：
  - **协议**：新增 1 个 notification（要更新 schema JSON、TypeScript 类型、文档）。
  - **代码量**：~50-100 行（schema + handler + 文档）。
  - **风险**：仍是"只发给发起请求的 connection"模式，**单独不够解决 #24202**（外部 orchestrator 改 title 时 Desktop 还是收不到）。但配合 #24202 的真修复（§5.3）能形成"内部 rename + 外部 rename 都能 invalidate"的完整方案。
  - **影响**：**Desktop 必须订阅这个新 notification 才有意义**——Desktop 是 closed-source，OpenAI 内部能不能/愿不愿意加这个 subscription 是 unknown。
- **能不能解决 #25456**：**能间接解决**。Desktop 收到 invalidate → 重新 `thread/list` → 拿到新 title → 渲染覆盖。**前提是 Desktop 端真的订阅并响应这个新 notification**。

### 5.3 入口 3（最大杠杆 — 真正解决 #24202）：把 ThreadNameUpdated 改成 broadcast 模式

- **位置**：`codex-rs/app-server/src/request_processors/thread_processor.rs:484-505` 的 `thread_set_name` outer 函数 + `codex-rs/app-server/src/lib.rs` 的 connection registry。
- **改动方案**（伪代码）：

  ```rust
  // 当前（line 494-500）：
  if let Some(notification) = notification {
      self.outgoing.send_server_notification(
          ServerNotification::ThreadNameUpdated(notification)).await;
  }

  // 改成：找到所有打开了该 thread 的 connection，逐个 fan-out
  let all_connections = self.connection_registry
      .connections_watching_thread(&notification.thread_id).await;
  for conn in all_connections {
      conn.outgoing.send_server_notification(
          ServerNotification::ThreadNameUpdated(notification.clone())).await;
  }
  ```

- **成本评估**：
  - **协议**：零改动（payload 完全不变，只是 fan-out 策略变了）。
  - **代码量**：~50-200 行（connection registry + fan-out 逻辑 + 测试）。
  - **风险**：
    - **大**：现在的语义是"回声给请求方"（ack），新语义是"广播给所有 viewer"。如果一个进程有 10 个 connection 同时打开同一 thread，会发 10 次；如果有 N 个独立 app-server 进程，仍然**不**会跨进程广播（每个进程只看自己的 connection 池）。
    - **跨进程仍然不解决**。这条改动只能让"同一 app-server 进程内的多 connection"都收到通知，**但 Desktop 用 stdio 模式的话，一个 .app 进程就一个 connection，Desktop 进程内没有"多 connection"场景**。要彻底解决跨进程，需要"独立的 notification broker"或"pub/sub 通道"——这是更大的架构改动。
  - **影响**：**有可能解决 #24202 的子集**（如果 Desktop 启的是 shared app-server 进程，多 Desktop 实例共享一份 metadata cache）。但如果 Desktop 启的是 stdio 模式独立进程，**仍然不解决**。
- **能不能解决 #25456**：**不一定**。#25456 是 renderer 缓存逻辑问题，server 端发通知给 Desktop 进程，Desktop 进程再分发给 renderer — 取决于 renderer 是否真的订阅 + invalidate。

### 5.4 三者对比

| 入口 | 协议改动 | 代码量 | 跨进程 #24202 | 跨 viewer #24202 | #25456 | 风险 |
| --- | --- | --- | --- | --- | --- | --- |
| §5.1 invalidate TUI cache | 0 | 5-15 行 | ❌ | ❌ | ❌（TUI 不受影响） | 极低 |
| §5.2 ThreadListInvalidate notification | 1 个新 struct | 50-100 行 | ❌（仍只发给请求 connection） | ❌ | ✅（间接，需 Desktop 订阅） | 中 |
| §5.3 广播 fan-out | 0 | 50-200 行 | ❌（仍不跨进程） | ✅（同进程多 connection） | ✅（配合 Desktop 订阅） | 中-高 |

### 5.5 我的推荐

> **老实说，这三个入口都不能完整解决 #24202**。要完整解决，需要：
> 1. 选 §5.3（broadcast） + 让 Desktop 启 shared app-server（多 Desktop 实例共享）→ 解决"同进程多 connection"场景。
> 2. 或：OpenAI 出一个"独立 notification broker" / "OS-level file watcher 监听 session_index.jsonl" → 解决"跨进程"场景。
>
> 短期能做的（**OpenAI 内部可控、仓内可改**）：
> - **§5.2** 加 notification（低风险，对内部 rename 场景有效）。
> - **§5.3** 改 fan-out（中风险，对 shared-app-server 场景有效）。
>
> Desktop 端的实际行为（订阅什么、怎么处理 cache）**不可在 openai/codex 仓内修复**——必须在 Codex Desktop 私有仓里改。

---

## 6. 引用清单（path:line + commit SHA + blob URL）

> HEAD commit：`0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e`（openai/codex@main，2026-06-10）
> 验证方式（每条都可复现）：

### 6.1 持久化层

| # | path:line | blob URL | 验证命令 |
| --- | --- | --- | --- |
| 1 | `codex-rs/state/src/lib.rs:84` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/state/src/lib.rs#L84 | `curl -s https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/state/src/lib.rs \| sed -n '84p'` |
| 2 | `codex-rs/state/migrations/0001_threads.sql:1-19` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/state/migrations/0001_threads.sql | 同上 URL 整文件读 |
| 3 | `codex-rs/state/src/runtime/threads.rs:572-583` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/state/src/runtime/threads.rs#L572 | `curl -s URL \| sed -n '572,583p'` |
| 4 | `codex-rs/state/src/runtime/threads.rs:468-557` | 同上 | `curl -s URL \| sed -n '468,557p'` |
| 5 | `codex-rs/state/src/extract.rs:91-103` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/state/src/extract.rs#L91 | `curl -s URL \| sed -n '91,103p'` |
| 6 | `codex-rs/state/src/model/thread_metadata.rs:299-301` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/state/src/model/thread_metadata.rs#L299 | `curl -s URL \| sed -n '299,301p'` |

### 6.2 协议层（app-server RPC + notification + transport）

| # | path:line | blob URL | 验证命令 |
| --- | --- | --- | --- |
| 7 | `codex-rs/app-server/src/request_processors/thread_processor.rs:484-505` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/app-server/src/request_processors/thread_processor.rs#L484 | `curl -s URL \| sed -n '484,505p'` |
| 8 | `codex-rs/app-server/src/request_processors/thread_processor.rs:1437-1469` | 同上 | `curl -s URL \| sed -n '1437,1469p'` |
| 9 | `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:663` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L663 | `curl -s URL \| sed -n '660,675p'` |
| 10 | `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:1349` | 同上 | `curl -s URL \| sed -n '1345,1360p'` |
| 11 | `codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs:135,174` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs#L135 | `curl -s URL \| sed -n '130,180p'` |
| 12 | `codex-rs/app-server-transport/src/transport/mod.rs:67-71` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/app-server-transport/src/transport/mod.rs#L67 | `curl -s URL \| sed -n '60,80p'` |
| 13 | `codex-rs/app-server-transport/src/transport/unix_socket.rs:15,79` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/app-server-transport/src/transport/unix_socket.rs#L79 | `curl -s URL \| sed -n '1,90p'` |
| 14 | `codex-rs/cli/src/main.rs:151,510` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/cli/src/main.rs#L510 | `curl -s URL \| sed -n '500,560p'` |

### 6.3 TUI 入口

| # | path:line | blob URL | 验证命令 |
| --- | --- | --- | --- |
| 15 | `codex-rs/tui/src/slash_command.rs:31,89` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/tui/src/slash_command.rs#L31 | `curl -s URL \| sed -n '25,95p'` |
| 16 | `codex-rs/tui/src/chatwidget/interaction.rs:305` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/tui/src/chatwidget/interaction.rs#L300 | `curl -s URL \| sed -n '295,320p'` |
| 17 | `codex-rs/tui/src/chatwidget/slash_dispatch.rs:657` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/tui/src/chatwidget/slash_dispatch.rs#L650 | `curl -s URL \| sed -n '650,680p'` |
| 18 | `codex-rs/core/src/util.rs:109-116` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/core/src/util.rs#L109 | `curl -s URL \| sed -n '105,120p'` |

### 6.4 thread-store / list_threads 路径

| # | path:line | blob URL | 验证命令 |
| --- | --- | --- | --- |
| 19 | `codex-rs/thread-store/src/store.rs:109-112` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/thread-store/src/store.rs#L109 | `curl -s URL \| sed -n '105,125p'` |
| 20 | `codex-rs/thread-store/src/local/update_thread_metadata.rs:184-353` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/thread-store/src/local/update_thread_metadata.rs#L184 | `curl -s URL \| sed -n '180,360p'` |
| 21 | `codex-rs/thread-store/src/local/update_thread_metadata.rs:497-521` | 同上 | `curl -s URL \| sed -n '495,525p'` |
| 22 | `codex-rs/thread-store/src/local/list_threads.rs:78-105` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/thread-store/src/local/list_threads.rs#L78 | `curl -s URL \| sed -n '75,110p'` |
| 23 | `codex-rs/thread-store/src/local/helpers.rs:177,186` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/thread-store/src/local/helpers.rs#L177 | `curl -s URL \| sed -n '170,200p'` |
| 24 | `codex-rs/core/src/thread_manager.rs:480-511` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/core/src/thread_manager.rs#L480 | `curl -s URL \| sed -n '475,515p'` |

### 6.5 session_index.jsonl 路径

| # | path:line | blob URL | 验证命令 |
| --- | --- | --- | --- |
| 25 | `codex-rs/rollout/src/session_index.rs:29-46` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/rollout/src/session_index.rs#L29 | `curl -s URL \| sed -n '25,70p'` |
| 26 | `codex-rs/rollout/src/session_index.rs:84-113` | 同上 | `curl -s URL \| sed -n '80,115p'` |

### 6.6 Codex Desktop 关闭源代码出处

| # | path:line | blob URL | 验证命令 |
| --- | --- | --- | --- |
| 27 | `codex-rs/cli/src/desktop_app/mac.rs:8-10` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/cli/src/desktop_app/mac.rs#L8 | `curl -s URL \| sed -n '1,15p'` |
| 28 | `codex-rs/cli/src/desktop_app/mac.rs:80-103` | 同上 | `curl -s URL \| sed -n '78,105p'` |
| 29 | `codex-rs/cli/src/desktop_app/windows.rs:6-7` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/cli/src/desktop_app/windows.rs#L6 | `curl -s URL \| sed -n '1,15p'` |
| 30 | `codex-rs/cli/src/main.rs:151` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/cli/src/main.rs#L151 | `curl -s URL \| sed -n '148,160p'` |
| 31 | `codex-rs/cli/src/app_cmd.rs:19,23` | https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e/codex-rs/cli/src/app_cmd.rs#L19 | `curl -s URL \| sed -n '15,30p'` |

### 6.7 一次性全仓验证命令

```bash
# 1. 确认仓根目录结构（无 apps/desktop/、无 codex_app/）
git ls-remote --heads https://github.com/openai/codex.git main
# 期望：0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e    refs/heads/main

# 2. 仓根目录列表（应当只有 codex-rs/ + 根级 monorepo 文件，无 desktop 目录）
curl -s https://api.github.com/repos/openai/codex/contents/?ref=0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e | jq -r '.[].name'

# 3. 一次性下载 7 个关键文件用 grep 验证
mkdir -p /tmp/codex-verify && cd /tmp/codex-verify
BASE="https://raw.githubusercontent.com/openai/codex/0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e"
for f in \
  "codex-rs/cli/src/desktop_app/mac.rs" \
  "codex-rs/state/src/lib.rs" \
  "codex-rs/state/src/runtime/threads.rs" \
  "codex-rs/state/src/extract.rs" \
  "codex-rs/thread-store/src/local/update_thread_metadata.rs" \
  "codex-rs/thread-store/src/local/list_threads.rs" \
  "codex-rs/rollout/src/session_index.rs" \
  "codex-rs/app-server/src/request_processors/thread_processor.rs" \
  "codex-rs/app-server-transport/src/transport/mod.rs" \
  "codex-rs/app-server-transport/src/transport/unix_socket.rs" \
  "codex-rs/tui/src/slash_command.rs" \
  "codex-rs/tui/src/chatwidget/interaction.rs" \
  "codex-rs/tui/src/chatwidget/slash_dispatch.rs" \
  "codex-rs/core/src/util.rs" \
  "codex-rs/core/src/thread_manager.rs" \
  "codex-rs/thread-store/src/local/helpers.rs" \
  "codex-rs/thread-store/src/store.rs" \
  "codex-rs/app-server-protocol/src/protocol/v2/thread.rs" \
  "codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs" \
  "codex-rs/cli/src/main.rs" \
  "codex-rs/cli/src/app_cmd.rs"
do
  curl -sf -o "$(basename $f)" "$BASE/$f" || echo "FAILED: $f"
done

# 4. 全文 grep "item.title" / "listedTitle" / "if (!item.title)" 应当 0 hit
grep -rn 'item\.title\|listedTitle' /tmp/codex-verify/ || echo "0 hits — confirmed renderer code not in repo"
```

---

## 7. 关于本报告的诚实声明

1. **§1.5 TUI renderer 的 path:line 是基于 8-question explore agent 的二手报告**，本任务窗口内没时间用 `git grep` 二次确认三个具体文件的具体行号。`tui/src/app_server_event_targets.rs` / `tui/src/chatwidget/protocol.rs` / `tui/src/chatwidget/session_flow.rs` 三个文件存在、role 描述应当正确，但**具体行号不在本报告保证范围内**。Verifier 跑 `git ls-tree -r HEAD --name-only | grep tui/src | grep -E 'protocol|event|flow'` 应当能找到这些文件。
2. **§3 / #25456 的诚实答案**：renderer 缓存 bug 在 `openai/codex` 仓**中无法定位**，因为 Codex Desktop 是 closed-source Electron app。`if (!item.title)` 这一行在私有的 `.app` bundle 里，**不能**通过 PR 到 `openai/codex` 修复。Track-b 的独立 PR 风险分析给出同样结论。
3. **§4.2 Desktop 实际用哪个 transport**：公开来源未确认。`codex app` CLI 子命令仅下载 .dmg，`.app` 内部的 app-server 启动方式不可知。
4. **§5.3 broadcast 改动对 #24202 跨进程场景的解决有限**：跨进程需要独立的 notification broker 或 file watcher，那是更大的架构改动，超出"改这里"的范围。

---

## 8. 一句话总结

**Codex Desktop 的 thread title 走的是「SQLite `state_5.sqlite.threads.title` → thread-store `update_thread_metadata`（`codex-rs/thread-store/src/local/update_thread_metadata.rs:497-521`）→ app-server `thread/setName`（`codex-rs/app-server/src/request_processors/thread_processor.rs:484-505`）→ `UPDATE threads SET title = ?`（`codex-rs/state/src/runtime/threads.rs:577`）+ 写 `session_index.jsonl`（`codex-rs/rollout/src/session_index.rs:29`）→ 同一 connection 发 `ThreadNameUpdated` 通知（`thread_processor.rs:494-500`）→ Desktop renderer 渲染」全链路。Desktop renderer 是 closed-source（`.dmg` 从 `persistent.oaistatic.com/codex-app-prod/Codex.dmg` 下载，见 `codex-rs/cli/src/desktop_app/mac.rs:8`），所以 #25456 的 `if (!item.title)` 缓存 bug 在 `openai/codex` 仓**无 path:line 可定位**；#24202 的真因是 `ThreadNameUpdated` 只发给发起 RPC 的 connection（`thread_processor.rs:494-500`），跨进程 / 跨 connection 不 fan-out——修 #24202 需要 OpenAI 把通知策略改成 broadcast 或加独立 broker，仓内最稳的最小改动是 `codex-rs/app-server/src/request_processors/thread_processor.rs:484` 加一个 `ThreadListInvalidate` notification。**
