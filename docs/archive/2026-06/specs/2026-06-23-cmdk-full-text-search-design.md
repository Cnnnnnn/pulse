# Pulse v2.28 — 全文搜索 Cmd+K (A3) 设计

| 日期       | 作者         | 状态   |
| ---------- | ------------ | ------ |
| 2026-06-23 | brainstorming | 设计中 |

## 1. 背景与动机

Pulse 在本地累积了大量文本（IT之家新闻 ~3000 条/月含正文、AI 会话总结、用户提醒标题、基金名称等），但**完全没有检索能力**。用户想找"上周看过的那篇 Cursor 性能优化的新闻"或"之前做过的某个 AI 任务总结"，只能一条条翻。

路线图 `docs/superpowers/specs/2026-06-19-product-roadmap-design.md` §6.1 将本项标记为 **A3「全文搜索 Cmd+K」，评分 价值3/成本2/风险1/总分7，🟢 Next**。

**目标**：Cmd+K（macOS）/ Ctrl+K（Windows）唤起全局搜索 modal，跨本地持久化文本检索，命中高亮 + 切面板滚动定位。

## 2. 范围

### 2.1 搜索源（基于真实 state.json 调查）

**第一梯队（索引主体，含实时 upsert）**：

| 源 | state.json 路径 | 搜索字段 | id | 真实量级 |
| --- | --- | --- | --- | --- |
| IT 新闻 articles | `ithome_news.articles{}` | title + excerpt + body | URL | ~2940 条/月 |
| IT 新闻 summaries | `ithome_news.summaries{}` | abstract + keywords + domain + impact | URL | ~52 条 |
| IT 新闻 favorites | `ithome_news.favorites{}` | 含完整 article+summary 快照 | URL | ~18 条 |
| AI 任务总结 | `task_summaries{}` | title + userGoal + outcome | taskKey | 3~几十条 |
| 提醒 | `reminders[]` | title | id(16hex) | 0~几十条 |

**第二梯队（启动索引，不做实时 upsert，低频变更可接受重启重建）**：

| 源 | state.json 路径 | 搜索字段 | id |
| --- | --- | --- | --- |
| 基金持仓 | `funds.holdings[]` | name + note? | id(12hex) |
| 受监控 apps | `apps{}` (按 name key) | name | name |

**明确排除**（调查依据）：
- 微博热搜：纯内存无 id，实时流，几小时过期
- 早报 digest sections：不持久化，纯派生子集（内容来自其他源）
- worldcupBets note：文本几乎为空
- 各类缓存/数值字段（classify_llm_cache / ai_usage / worldcup_*）

### 2.2 In scope

- `src/main/search/` 新模块：inverted index（Map + bigram 分词）+ 启动时构建 + 新数据实时 upsert
- `src/renderer/search/` 新组件：搜索 modal（左侧来源栏 + 右侧结果列表）+ 键盘导航
- 搜索源：见 §2.1 第一 + 第二梯队
- 跳转：复用 `tray-focus.js` 模式，切面板 + 滚动 + 高亮（需补 `data-*-id` 属性）
- 唤起：Cmd+K (macOS) / Ctrl+K (Windows) 全局快捷键

### 2.3 Out of scope (YAGNI)

- 不引入分词库（bigram 零依赖）
- 索引不落盘（内存 Map，重启重建）
- 不做搜索历史/建议/自动补全
- 不搜微博热搜、早报 digest
- 不做跨设备同步
- 第二梯队源不做实时 upsert（重启重建即可）

## 3. 索引架构

### 3.1 模块结构（主进程）

```
src/main/search/
├── tokenizer.js       # 分词: bigram(中文) + 空格(英文) + 停用词
├── search-index.js    # inverted index: Map + doc store + buildFromState
└── register-search.js # IPC: search:query / search:upsert / search:rebuild
```

每个文件单一职责，可独立单测。

### 3.2 文档模型

每条可搜索记录抽象成 **Doc**：

```js
{
  id: "news:https://ithome.com/0/963/990.htm",   // 复合 key: "<source>:<nativeId>"
  source: "news" | "ai-task" | "reminder" | "fund" | "app",
  nativeId: "https://...",                          // 原始 id（跳转用）
  title: "Cursor 性能优化更新",                      // 主标题（权重高）
  snippet: "本次更新主要针对...",                    // 展示用摘要（预存）
  searchText: "Cursor性能优化更新 本次更新主要...",  // 拼接后整体分词
  payload: { navTarget, dateMs, ... }               // 跳转 + 展示元数据
}
```

**设计要点**：
- `id` 用 `<source>:<nativeId>` 复合 key，避免跨源 id 碰撞，是 upsert 去重依据。
- `searchText` 把可搜索字段拼成一个字符串再分词，靠标题词项权重提升保证标题命中排序靠前。
- `snippet` 预存展示短摘要（IT新闻用 excerpt，AI任务用 userGoal 截断），查询时直接取。

### 3.3 倒排索引数据结构

```js
const index = new Map();       // token → Set<docId>    全文倒排
const docs = new Map();        // docId → Doc           正排（取展示数据）
const titleTokens = new Map(); // token → Set<docId>    标题专用倒排（权重）
```

**两套倒排**：标题命中 +2 分，全文命中 +1 分，按总分降序。标题词项数 << 全文词项，多出内存可忽略。

### 3.4 构建时机

启动时 `bootstrap()` 调 `searchIndex.buildFromState(stateStore.load())`：
1. 遍历 `ithome_news.articles` → upsert（favorites/summaries 同 URL 去重，favorites 优先含 summary 快照）
2. 遍历 `task_summaries` → upsert
3. 遍历 `reminders` → upsert
4. 遍历 `funds.holdings` → upsert（仅 name）
5. 遍历 `apps` keys → upsert（仅 name）

**降级**：构建失败（state.json 读不了等）→ 索引为空，搜索返空结果，不阻塞启动。

## 4. 查询、排序与展示

### 4.1 查询流程（纯函数 `query(index, queryString, { source, limit })`）

```
1. tokenize(queryString) → queryTokens[]
2. queryTokens 为空 → 返空（占位态）
3. 收集候选 doc:
   for each token in queryTokens:
     全文命中: index.get(token) → docId 计 +1 分
     标题命中: titleTokens.get(token) → docId 额外 +2 分
4. AND 语义: 只保留所有 queryToken 都命中的 doc
5. 按总分降序; 同分按 payload.dateMs 降序 (新的在前)
6. source 过滤: 若 source 非空 → 只留该 source 的 doc
7. 截 limit 条 (默认 50)
```

**AND 语义**：所有 queryToken 都得命中才进结果，避免"搜'Cursor 更新'返回所有含 Cursor 或含更新的"。

### 4.2 返回结构

```js
{
  results: [
    { id, source, title, snippet, score, matchedSnippet }
  ],
  counts: { news: N, "ai-task": N, reminder: N, fund: N, app: N }
}
```

`matchedSnippet`：从 `searchText` 定位首个命中 token，前后各取 ~30 字符，命中 token 包 `<mark>`，前后被截断加 `...`。前端用 `dangerouslySetInnerHTML` 渲染（本地数据 + DOMPurify 兜底，项目已依赖 dompurify）。

### 4.3 分词器（`tokenizer.js`）

```js
function tokenize(text) {
  // 1. 英文/数字: 按 \s+ 和标点切, 转小写
  // 2. 中文连续段 ([\u4e00-\u9fff]): bigram 滑动窗口
  // 3. 停用词过滤 (的/了/是/和/在/有/the/a/an/is/of, ~30 个常量)
  // 4. 去重
}
```

**CJK 判定**：`[\u4e00-\u9fff]` 区间判定中文。日文假名/韩文不处理（Pulse 文本几乎纯中文+英文）。

### 4.4 高亮片段生成（`highlight.js`）

独立纯函数 `makeSnippet(searchText, queryTokens, { radius = 30 })`，边界覆盖：无命中（返 title 截断）、命中在开头/结尾、多 token 命中、超长文本。

## 5. 前端组件

### 5.1 布局（C 方案：左侧来源栏 + 右侧结果列表）

```
┌─────────────────────────────────────┐
│ 🔍 [搜索框____________________]  Esc │
├──────────┬──────────────────────────┤
│ 全部  14 │  📰 Cursor 性能优化更新     │
│ 📰新闻 12│     ...本次更新主要...      │
│ 🤖AI   2 │  ─────────────────────     │
│ ⏰提醒 0 │  📰 Kimi 推送性能补丁       │
│ 📊基金 0 │     ...Moonshot AI...      │
│          │  ...                       │
└──────────┴──────────────────────────┘
```

左侧栏显示每个源 + 命中数；右侧是当前选中源的结果列表（默认"全部"）。

### 5.2 卡片密度（B 方案：标题 + 一行命中片段）

每条 ~56px：
```
📰 Cursor 性能优化更新              2天前
   ...本次更新主要针对 macOS 上的性能优化...
```

标题（含高亮）+ 一行 matchedSnippet（高亮命中词）+ 来源标签 + 时间。

### 5.3 组件结构

```
src/renderer/search/
├── SearchModal.jsx       # 顶层: 输入框 + 左侧来源栏 + 右侧结果 + 键盘导航
├── SearchSourceBar.jsx   # 左侧来源栏 (命中数 + 键盘 1-5)
├── SearchResultList.jsx  # 右侧结果列表 (50 条上限, 不用虚拟化)
├── SearchResultRow.jsx   # 单条卡片
├── searchStore.js        # signals: query/activeSource/results/counts/selectedIndex/isOpen
└── search-nav.js         # 跳转逻辑 (切面板 + 滚动 + 高亮)
```

### 5.4 状态机（`searchStore.js`）

```js
// signals
isOpen          // Cmd+K 唤起/关闭
query           // 输入框文本
activeSource    // null | "news" | "ai-task" | "reminder" | "fund" | "app"
results         // query() 返回
counts          // 各源命中数
selectedIndex   // 键盘高亮行 (右侧列表内)
isSearching     // 防抖期 loading

// actions
openModal() / closeModal()
setQuery(q)              // 防抖 150ms 后 IPC query
setActiveSource(s)       // null=全部; 切源后重新 query (单源重新匹配, 非过滤全源结果)
moveSelection(delta)     // ↑↓
enterSelection()         // Enter → search-nav 跳转
```

**防抖**：150ms，避免每键 IPC。本地索引 <50ms，防抖主要避免空查询/快速连打。

### 5.5 键盘导航

| 键 | 行为 | 焦点要求 |
| --- | --- | --- |
| Cmd+K / Ctrl+K | 唤起/关闭 | 全局 |
| Esc | 关闭 | modal 内 |
| ↑ / ↓ | 右侧列表移动高亮 | 输入框或列表 |
| Enter | 跳转当前高亮项 | 任意 |
| Tab | 焦点切到左侧来源栏 | — |
| 1-5 | 切源（1=全部 2=新闻 3=AI任务 4=提醒 5=基金）| **仅左侧栏聚焦时** |

**数字键冲突处理**：输入框聚焦时数字键是正常输入；只有 Tab 切到左侧栏后数字键才触发切源。不冲突。

### 5.6 跳转实现（复用 `tray-focus.js` 模式）

`src/renderer/search/search-nav.js` 的 `navigateToResult(result)`：

```js
switch (result.source) {
  case "news":
    setNav("ithome");
    scrollAndHighlight(`[data-article-id="${cssEscape(nativeId)}"]`);
    break;
  case "ai-task":
    openAITasksDrawer(); scrollAndHighlight(`[data-task-key="${nativeId}"]`);
    break;
  case "reminder":
    openRemindersModal(); scrollAndHighlight(`[data-reminder-id="${nativeId}"]`);
    break;
  case "fund":  setNav("funds"); scrollAndHighlight(`[data-fund-code="${payload.code}"]`); break;
  case "app":   setNav("versions"); scrollAndHighlight(`[data-app-name="${nativeId}"]`); break;
}
closeModal();
```

`scrollAndHighlight` 复用 `tray-focus.js` 的滚动 + 3 秒黄色脉冲高亮（`.match-row-highlight` CSS 已有）。

### 5.7 前置工作：补 `data-*-id` 属性

现状：仅 `MatchCard` 有 `data-match-key`。需补：

| 组件 | 加什么 | 选择器用 |
| --- | --- | --- |
| `NewsArticleRow.jsx` | `data-article-id={article.id}` | news 跳转 |
| `ReminderRow` (RemindersModal 内) | `data-reminder-id={r.id}` | reminder 跳转 |
| `AITasksDrawer` 的 task 行 | `data-task-key={taskKey}` | ai-task 跳转 |
| `FundRow` / 持仓行 | `data-fund-code={code}` | fund 跳转 |
| `AppRow.jsx` | `data-app-name={name}` | app 跳转 |

## 6. 集成点

| 位置 | 改动 |
| --- | --- |
| `src/main/index.js` bootstrap | 启动时 `searchIndex.buildFromState(stateStore.load())` + 注册 `registerSearchIpc` |
| `preload.js` + `api.js` | 暴露 `searchQuery(q, {source})` / `searchUpsert(doc)` |
| `src/renderer/AppShell.jsx` | 全局 Cmd+K/Ctrl+K 监听 + 挂 `<SearchModal />` |
| `src/renderer/index.jsx` | bootstrap 订阅（若需） |
| `news-store.js` | merge articles / attach summary / mark favorite 时 → `api.searchUpsert` |
| `ai-sessions/engine.js` 或 task_summaries 写盘点 | 生成总结成功后 → `api.searchUpsert` |
| `reminders.js` | create/update 后 → `api.searchUpsert` |
| `NewsArticleRow`/`ReminderRow`/`AITasksDrawer`/`FundRow`/`AppRow` | 补 `data-*-id` 属性 |
| `styles.css` | 搜索 modal 样式（复用现有 modal/卡片样式变量）|

### 6.1 实时 upsert 接入范围

**第一梯队 3 个源**（高频）：
- IT 新闻：`news-store` 写盘点 upsert
- AI 任务：生成总结成功后 upsert
- 提醒：create/update 后 upsert

**第二梯队**（funds/apps）：首版**只启动索引，不做实时 upsert**。用户改基金名要等下次重启。YAGNI 取舍，后续要加很容易。

## 7. IPC 通道

| 通道 | 方向 | 入参 | 返回 |
| --- | --- | --- | --- |
| `search:query` | renderer→main | `{ q: string, source?: string }` | `{ results: [], counts: {} }` |
| `search:upsert` | renderer→main | `Doc` | `void`（fire-and-forget）|
| `search:rebuild` | renderer→main（可选，诊断用）| — | `void` |

无 main→renderer 推送（查询是拉模式，renderer 主动 query）。

## 8. 测试

### 8.1 `tokenizer.js`（纯函数，~8 case）
- 英文按空格切 + 小写
- 中文 bigram（"人工智能" → 人工/工智/智能）
- 停用词过滤（的/the）
- 混合中英文
- 空字符串/纯停用词 → 空数组
- 去重

### 8.2 `search-index.js`（~10 case）
- buildFromState：从 state 构建索引
- upsert：新增/更新 doc（同 id 覆盖）
- query：AND 语义、标题权重、source 过滤、limit
- counts：各源命中数
- favorites/articles 同 id 去重
- 空查询返空

### 8.3 `highlight.js`（纯函数，~6 case）
- 无命中返 title 截断
- 命中在开头/结尾
- 多 token 命中
- 超长文本截断 + ...
- `<mark>` 标签正确包裹

### 8.4 renderer 组件（~8 case）
- SearchModal：Cmd+K 唤起、Esc 关闭、输入防抖
- SearchSourceBar：1-5 切源（仅聚焦时）、命中数显示
- SearchResultRow：高亮渲染、点击跳转
- searchStore：状态流转

### 8.5 不需要测试的
- `inQuietHours` 等已有模块
- DOMPurify（外部库）
- tray-focus 滚动（已有 MatchCard 覆盖）

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 启动构建慢（3k 条 tokenize）| 中 | 中 | 预估 ~50-100ms，可接受；若超 200ms 改异步构建（不阻塞 bootstrap）|
| 内存膨胀（索引 + 正排）| 低 | 中 | 单 doc searchText 平均 ~200 字 × 3k = ~600KB 文本 + 索引，总计 <5MB，可忽略 |
| bigram 误召回（搜"工智"命中）| 低 | 低 | 实际用户不会搜中间 bigram；AND 语义 + 排序保证相关结果靠前 |
| data-*-id 补全遗漏导致跳转失败 | 中 | 中 | scrollAndHighlight 找不到元素时 fallback：只切面板不滚动 + console.warn |
| 跳转目标未渲染（如提醒未打开 modal）| 中 | 中 | navigateToResult 先 ensure 目标可见（打开 drawer/modal）再 scroll |

## 10. 验收标准

- [ ] `tokenizer.js` 8+ case 单测全过
- [ ] `search-index.js` 10+ case 单测全过
- [ ] `highlight.js` 6+ case 单测全过
- [ ] renderer 组件 8+ case 单测全过
- [ ] 全套现有测试无回归（`npm test` 基线不下降）
- [ ] 手工 e2e：Cmd+K 唤起 → 搜"性能" → 命中新闻+AI任务 → 按 2 切新闻源 → Enter 跳转滚动高亮
- [ ] 启动构建索引 <200ms（手工 console.time 量）

## 11. 与路线图对账

本设计对应 `docs/superpowers/specs/2026-06-19-product-roadmap-design.md` §6.1 的 **A3**。完成后在该路线图 §10 实施状态附录把 A3 从"❌ 未开始"翻转为"✅ 已落地"，并在 §6.1 概览表"动工"列更新。
