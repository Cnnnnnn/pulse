# Pulse Serenity 面板 — 设计文档

| 日期       | 作者            | 状态     |
| ---------- | --------------- | -------- |
| 2026-06-22 | brainstorming    | 设计已批准,待 writing-plans |

> 本 spec 对应产品路线图 `2026-06-19-product-roadmap-design.md` 外的新增功能(社交媒体信息源),不属 §10 已立项项,本次作为独立切片立项。

## 1. 背景与目的

Serenity(@aleabitoreddit)是 X 上近期人气急升的财经博主,内容为投资分析,语言以英文为主、夹杂 `$NVDA` `$SIVE` 这类股票代码。Pulse v2.24.2 现有 SideNav 7 个 nav item(版本检查 / IT 新闻 / 微博热搜 / 世界杯 / 基金 / 贵金属 / AI 用量)+ 1 个 AI 配置 footer 项 = 8 槽位,加上 DigestDrawer(多 section 聚合视图)与提醒/最近活动(非 SideNav 入口),但**没有社交媒体信息源**;用户想第一时间看到 Serenity 的最新帖,且不读英文。

本设计新增第 8 个 nav item「Serenity」(在 `ai-usage` 之后、`versions` 之前,财经类内容聚在一起,版本检查保持最后):

- 每 5 分钟从多个镜像源拉取 Serenity 最新推文
- 复用现有 `shared-llm.js` 做中文翻译
- 镜像源全挂时降级为「手动粘贴」入口
- 数据自动接入 `DigestDrawer` 与 `DailyDigest`(早报)

本文档是 spec,产出后可由 `writing-plans` skill 转为实施计划。

## 2. 范围与非目标

### 2.1 In Scope

- 新增独立 SideNav 面板(第 8 个 nav item,`🐦 Serenity`),并在 `navStore.js` 的 `NAV_KEYS` 集合加入 `'serenity'`(否则 `setActiveNav('serenity')` 被 guard 拦截)
- 多镜像源抓取(Nitter 派生 / RSSHub / 任意 RSS),自动轮换
- 中文翻译(LLM,懒加载,内存缓存)
- state.json 持久化(LRU 1000 条)
- 设置页「镜像源管理」(增删改 + 测试)
- 失败降级:镜像全挂 → 红条 + 手动粘贴入口
- 与现有 DailyDigest 联动(早报新增 Serenity Top 3)

### 2.2 Out of Scope

- 关注多个博主(本版本只支持 Serenity 一人;架构预留 `handle` 字段)
- 发推 / 回复 / 点赞(只读)
- Watchlist 通知联动(留 UI 钩子,本版本不实现)
- 离线翻译(必须联网调 LLM)
- Linux 平台(沿用项目 §8 不支持)
- 完整 i18n(UI 文案走 `zh-CN` 单语言,留 forward compat)

## 3. 架构

### 3.1 模块划分(5 层)

```
┌─────────────────────────────────────────────────────────┐
│ Renderer                                                 │
│  SideNav 第 8 个 nav item → TwitterSerenityPanel.jsx    │
│    ├─ SerenityTweetList.jsx (虚拟列表 + 翻译按钮)        │
│    ├─ SerenityTweetDetail.jsx (原文/译文切换)            │
│    └─ TwitterSourcesSettings.jsx (设置页镜像源管理)      │
├─────────────────────────────────────────────────────────┤
│ IPC bridge                                               │
│  twitter:fetch / twitter:translate / twitter:list       │
│  twitter:sources:list/add/remove/test                   │
├─────────────────────────────────────────────────────────┤
│ Main process (新增 src/main/twitter-serenity/)           │
│  ├─ tweet-source.js       # TweetSource 抽象接口         │
│  ├─ sources/                                              │
│  │   ├─ nitter-source.js  # Nitter 镜像解析             │
│  │   ├─ rsshub-source.js  # RSSHub JSON 路径            │
│  │   └─ direct-rss-source.js # 任意 ATOM/RSS URL 兜底   │
│  ├─ source-orchestrator.js # 轮询调度 + 镜像轮换 + 重试  │
│  ├─ translator.js         # 调 shared-llm.js            │
│  ├─ cache-store.js        # state.json.twitterCache      │
│  └─ scheduler.js          # 5 分钟轮询 + 失败退避        │
├─────────────────────────────────────────────────────────┤
│ 共享层                                                   │
│  http-client.js (复用,不改构造函数;UA 走 per-request header) │
│  shared-llm.js (复用,加 translateTweet 入口)             │
│  state-store.js (schema 加 twitterCache 字段)            │
└─────────────────────────────────────────────────────────┘
```

### 3.2 设计原则

1. **TweetSource 接口**:所有镜像源实现同一接口 `{ fetchUserTimeline(handle): Promise<RawTweet[]> }`,返回标准化 `RawTweet`(屏蔽 Nitter / RSSHub / RSS 之间的差异)。新增镜像只需实现一个文件。
2. **镜像轮换状态机**:按时间戳排序记录每个镜像的「上次成功时间 + 连续失败次数」,每次 fetch 时从最健康的开始尝试,失败 N 次后冷却 30 分钟。
3. **数据契约**:`RawTweet → NormalizedTweet → CachedTweet`(三步分离,便于将来换 API 或加缓存层)。
4. **失败可观察**:所有镜像连续失败时,IPC push `twitter:degraded` 到 renderer,面板顶部出现「镜像源不可用」横幅 + 兜底「粘贴单条」按钮。
5. **翻译走异步队列**:避免单个 LLM 调用阻塞 UI;翻译完成的 tweet 通过 IPC push 单条增量更新。
6. **User-Agent per-request**:不改 `HttpClient` 构造函数(避免影响其他调用方),在 `tweet-source.js` 顶部定义常量 `TWITTER_USER_AGENT`(真实浏览器 UA 字符串),各 `sources/*.js` 的 `httpClient.get(url, { headers: { 'User-Agent': TWITTER_USER_AGENT, ... } })` 透传。镜像源若各自需要不同 UA,在对应 source 文件内覆盖。

## 4. 数据契约

### 4.1 NormalizedTweet

```javascript
{
  id: "1748291000000000000",        // tweet 数字 ID,主键
  url: "https://x.com/aleabitoreddit/status/1748291000000000000",
  author: {
    handle: "aleabitoreddit",
    displayName: "Serenity",
    avatarUrl: "https://..."
  },
  text: "I think one more thing to emphasize...",  // 原文(en)
  language: "en",
  publishedAt: "2026-06-22T13:39:00.000Z",         // ISO8601
  fetchedAt: "2026-06-22T13:41:23.000Z",            // 本地拉取时间
  media: [{ type: "image", url: "..." }],          // 空数组如果无图
  metrics: { likes: 0, retweets: 0, replies: 0 },  // 镜像给的(可能缺)
  sourceMirror: "twiiit.com"                        // 哪个镜像拉到的
}
```

### 4.2 state.json 新增字段

```javascript
{
  twitterCache: {
    handle: "aleabitoreddit",
    lastFetchedAt: "2026-06-22T13:41:23.000Z",
    lastSuccessMirror: "twiiit.com",
    consecutiveFailureCount: 0,
    tweets: [NormalizedTweet, ...],    // 按 publishedAt 倒序,LRU 1000
    translations: {                    // 翻译内存缓存(本版本不持久化)
      // "tweetId": { zh: "...", translatedAt: "..." }
    }
  },
  twitterSources: [                    // 镜像源配置
    { id: "nitter-twiiit", type: "nitter", url: "https://twiiit.com", enabled: true, priority: 1 },
    { id: "rsshub-public", type: "rsshub", url: "https://rsshub.app", enabled: true, priority: 2 }
  ]
}
```

### 4.3 Schema 演进

- `state-store-schema.js` 中 `STATE_SCHEMA_VERSION` 由 1 bump 到 2
- 老用户 state.json 通过 forward compat 自动保留旧字段(多余字段保留,缺字段填默认值)
- 增量去重:`mergeTweets(existing, incoming)` 用 `id` 做主键,新帖插前面,旧帖更新 metrics

## 5. 抓取调度与降级

### 5.1 调度器

```
启动 → 检查是否在 quiet hours → 不在 → 立即触发首次 fetch
        → 之后每 5 分钟一次(setInterval,与 ithome/fund-scheduler 同一模式)
        → 任何时刻用户点面板「刷新」→ IPC 触发 ad-hoc fetch (跳过 quiet hours)
```

quiet hours 默认 `23:00 - 07:00`(本地时区),沿用项目已有约定,如有不同在 `config.json` 暴露。

### 5.2 单次 fetch 流程

```
for mirror of enabledMirrorsByPriority:
  attempt = await mirror.fetch(aleabitoreddit)
  if attempt.success:
    mergeToCache(attempt.tweets)
    mirror.lastSuccessAt = now
    mirror.consecutiveFailures = 0
    return SUCCESS
  else:
    mirror.consecutiveFailures += 1
    log.warn(...)
    continue

// 全失败
cache.consecutiveFailureCount += 1
if cache.consecutiveFailureCount >= 3:
  IPC.push("twitter:degraded")
  notify.error("Serenity 镜像源全部不可用,点击查看")
```

### 5.3 镜像源管理(设置面板)

- 列表显示所有镜像,每行:URL / 类型 / 优先级 / 状态徽章(`✓ 最近成功` / `⚠ 连续失败 N 次` / `⏸ 已禁用`)
- 操作:「测试」按钮触发单镜像 fetch(返回耗时+首条预览);「↑↓」调整优先级;「删除」;「添加新镜像」(URL + 类型下拉)
- 内置默认镜像(首次启动写入 state.json,用户可删):
  - `https://twiiit.com` (nitter 派生, RSS path `/aleabitoreddit/rss`)
  - `https://xcancel.com` (nitter 派生)
  - `https://nitter.poast.org` (nitter 派生)
  - `https://rsshub.app` (公共 RSSHub, route `/twitter/user/aleabitoreddit`)

### 5.4 降级路径

当全镜像连续失败 ≥ 3 次:

1. 面板顶部红色横幅「镜像源不可用,点击手动粘贴」
2. 点击展开 textarea,粘贴推文链接 / 原文
3. 后台解析(正则提取 URL / 作者 / 时间)→ 写入 cache → 触发翻译
4. 用户提交的单条 tweet 标记 `sourceMirror: "manual-paste"` 区分来源

**手动粘贴解析规则**(`manual-paste-parser.js` 内纯函数,3 类输入):

| 输入类型 | 识别正则 | 提取字段 |
|---|---|---|
| X URL | `https?://(?:x|twitter)\.com/([\w]+)/status/(\d+)` | `handle`, `id` |
| Nitter URL | `https?://[\w\.\-]+/([\w]+)/status/(\d+)` | `handle`, `id`(domain 非捕获) |
| 纯文本 | (无 URL 命中) | `id = 'manual-' + sha1(text).slice(0,16)`,`handle = 'unknown'` |

- 时间字段:无 URL 时间戳时 `publishedAt = null`(列表按 `fetchedAt` 排)
- 纯文本类:不抓 metrics,显示空
- 多条粘贴:按行拆分,每行独立解析,失败的行跳过(返回 `{ ok, results, errors }`)

## 6. 翻译与 UI

### 6.1 翻译层

- 入口 `translateTweet(tweet)`:先查内存 LRU(`Map<id, translatedText>` 200 条上限),命中直接返回
- 未命中 → 调 `shared-llm.js.chatCompletion([{role:'system',content:PROMPT},{role:'user',content:text}])`(项目目前未提供专用 translate 入口,本设计**新增** `translate(text, { from, to, preserveTickers })` 包装函数,内部走 `chatCompletion`,单独加在 `shared-llm.js` 导出里)
- **Prompt 设计**(硬编码为 `translator.js` 顶部常量 `TWITTER_TRANSLATE_PROMPT`,**不读 config.json** — 现状 `config.json` 无 `aiDigest` 字段,`shared-llm.js` 也未读 config;硬编码与现有 LLM 用法一致,零迁移成本。A7 prompt 模板化是长期方向,本版本不接):
  ```
  你是中文财经翻译,保留股票代码(如 $NVDA、$SIVE)、人名、公司名不译。
  风格:简洁、信息密度高、不加主观评论。
  输入:{tweet.text}
  输出:只输出中文译文,不加任何前缀。
  ```
- 失败处理:LLM 调用失败 → 原文下方显示「翻译失败,点击重试」(不阻塞 UI)
- 批量翻译:打开面板时,只翻译可见的 5 条,滚动到底再翻译下 5 条,避免一次性把 token 用光

### 6.2 UI 层

**SideNav**:新增第 8 个 nav item,icon `🐦`,label `Serenity`,右上角 badge 显示「上次拉取 N 分钟前 / 新帖数」,可在 Settings 关闭 badge

**面板 `TwitterSerenityPanel.jsx`**:
- 顶部状态条:「3 分钟前 · 镜像 twiiit.com · 共 28 条」(全挂时变红)
- 列表(虚拟滚动):
  - 每条 card:头像 + 名字 + 相对时间(如 `3h ago`) + 文本
  - 默认显示中文译文(灰字标记「已 AI 翻译」),hover 出现「查看原文」按钮
  - 卡片底部:`💬 12  ↩ 5  ❤️ 80  ·  🔗 原文链接`
  - 媒体图片:内联预览,点击放大
- 顶部「强制刷新」按钮(打破 5 分钟间隔)
- 顶部「翻译全部」按钮(用户主动触发全量翻译,带进度条)

**设置页 `TwitterSourcesSettings.jsx`**:见 §5.3

### 6.3 与现有功能联动

- **DailyDigest**:`daily-summary-job.js` 增加 `twitterSerenity` section,选 Top 3 最新推文 → 翻译 → 拼进早报文案(对齐 §6.2 已落地的 `DailyDigestSettings`)
- **DigestDrawer**:复用 `DigestDrawer.jsx` 现有 section 模式,新增 `SerenitySection`(Top 5 最新 + 翻译)
- **Watchlist 钩子**:每条 tweet 右边预留「🔔 关注」按钮,本版本不联动,只留事件钩子

## 7. 错误处理

| 错误类 | 处理 |
|---|---|
| 镜像 HTTP 4xx/5xx | 单镜像失败计数,不弹通知,继续轮换 |
| 全镜像失败 ≥ 3 次 | IPC push `twitter:degraded` + 面板顶部红条 + `notify.error` |
| LLM 翻译失败 | 单条 tweet 显示「翻译失败,点击重试」 |
| LLM 配额耗尽 | 静默降级(只显示原文),settings 加提示 |
| 网络断 | 复用 `http-client.js` 超时(5s)+ retry(2 次) |
| state.json 损坏 | 复用 Q8 已落的 `state-store-schema.js` |

## 8. 可观测性

- 日志:`log.info('twitter:fetch success', { mirror, count, durationMs })`
- 错误聚合:`error-aggregator.js` 自动捕获未捕获异常,新分类 `twitter.serenity.*`
- DiagnosticsDrawer(已落地的 Q6)自动显示新分类

## 9. 测试

### 9.1 单元测试(vitest,沿用 happy-dom + @testing-library/preact)

| 文件 | case 数 | 覆盖 |
|---|---|---|
| `tweet-source.js` | 6 | RawTweet → NormalizedTweet 转换、空字段、缺字段、超长文本、XSS payload |
| `sources/nitter-source.js` | 5 | 解析 RSS XML(mock nitter-rss 响应)、空响应、字段缺失 |
| `sources/rsshub-source.js` | 5 | 解析 RSSHub JSON mock、空响应、字段缺失 |
| `source-orchestrator.js` | 7 | 镜像轮换、失败计数、全失败触发 degraded、单镜像 cooldown |
| `translator.js` | 5 | LLM mock、内存 LRU、prompt 模板注入、失败重试、懒加载 |
| `cache-store.js` | 6 | LRU 淘汰、增量合并、schema bump 兼容 |
| `scheduler.js` | 4 | quiet hours 跳过、手动刷新跳过 quiet hours、首次触发、错误隔离 |

### 9.2 集成测试

- 启动 → scheduler 首次 fetch → 镜像 mock 返回 5 条 → 写入 cache → IPC 推到 renderer
- 3 个镜像全部 mock 失败 → `twitter:degraded` 事件触发 + `state.consecutiveFailureCount == 3`
- LLM 翻译 1 条 → IPC push 单条更新 → renderer 渲染译文
- state.json 缺 `twitterCache` 字段 → 启动写入空 defaults,旧字段保留
- 手动粘贴单条 → 解析 → 写入 cache → 触发翻译 → 渲染

### 9.3 手动验收

- 启动 app,挑一个镜像改成假 URL,观察 fallback 行为
- 打开 Serenity 面板,触发「翻译全部」,用 mock provider 观察调用次数
- 在 quiet hours(默认 23:00-7:00)期间启动 app,验证首次 fetch 被跳过
- DailyDigest 时间到点触发,验证 Serenity Top 3 出现在早报里

## 10. 文件改动清单

### 10.1 新增

- `src/main/twitter-serenity/tweet-source.js`
- `src/main/twitter-serenity/sources/nitter-source.js`
- `src/main/twitter-serenity/sources/rsshub-source.js`
- `src/main/twitter-serenity/sources/direct-rss-source.js`
- `src/main/twitter-serenity/source-orchestrator.js`
- `src/main/twitter-serenity/translator.js`
- `src/main/twitter-serenity/cache-store.js`
- `src/main/twitter-serenity/scheduler.js`
- `src/main/twitter-serenity/manual-paste-parser.js` (降级路径纯函数解析器)
- `src/main/twitter-serenity/index.js` (入口 + IPC 注册)
- `src/renderer/twitter-serenity/TwitterSerenityPanel.jsx`
- `src/renderer/twitter-serenity/SerenityTweetList.jsx`
- `src/renderer/twitter-serenity/SerenityTweetDetail.jsx`
- `src/renderer/twitter-serenity/TwitterSourcesSettings.jsx`
- `src/renderer/twitter-serenity/store.js`
- `src/renderer/twitter-serenity/serenity-section.jsx` (DigestDrawer section)
- `tests/main/twitter-serenity/*.test.js` (7 文件)
- `tests/renderer/twitter-serenity/*.test.jsx` (3 文件)

### 10.2 修改

- `src/main/state-store-schema.js`:新增 `twitterCache` / `twitterSources` 字段,bump `STATE_SCHEMA_VERSION` 到 2
- `src/main/index.js`:注册 `twitter-serenity/index.js`,启动 scheduler,推送 `twitter:degraded` 事件
- `src/main/digest/aggregate.js`:增加 `twitterSerenity` section(选 Top 3 最新翻译推文拼进早报文案;`daily-summary-job.js` 调 aggregate,无需单独改)
- `src/renderer/digest/DigestDrawer.jsx`:挂载 `SerenitySection`
- `src/renderer/components/SideNav.jsx`:在 `NAV_ITEMS` 数组的 `ai-usage` 之后、`versions` 之前插入第 8 项 `{ key: 'serenity', icon: '🐦', label: 'Serenity', tooltip: 'Serenity 财经推文 + AI 中文翻译' }`
- `src/renderer/worldcup/navStore.js`:`NAV_KEYS` 集合加入 `'serenity'`(否则 `setActiveNav('serenity')` 被 guard 拦截)
- `src/renderer/components/Settings.jsx`(或类似):嵌入 `TwitterSourcesSettings`
- `src/ai/shared-llm.js`:新增 `translate(text, { from, to, preserveTickers })` 包装函数,内部走 `chatCompletion`,**prompt 由调用方传入**(twitter-serenity 的 translator.js 传 `TWITTER_TRANSLATE_PROMPT` 常量);不读 config.json

## 11. 风险评估

| 风险 | 等级 | 缓解 |
|---|---|---|
| Nitter 全部失效时面板无内容 | 高 | 镜像轮换 + 手动粘贴降级入口 |
| RSSHub 公共实例偶尔限流 | 中 | 镜像轮换,单镜像 ≤ 30 分钟冷却 |
| LLM 翻译偶尔失败 | 低 | 单条重试,不影响列表 |
| LLM 配额耗尽 | 低 | 静默降级只显示原文 |
| state.json schema bump 兼容 | 极低 | 已用 forward compat 模式 |
| 用户自己加的镜像里有恶意 URL | 中 | 设置页「测试」按钮只返回耗时+首条预览,不渲染富文本 |
| 推文含 XSS payload | 中 | 渲染走 `dompurify`(已在 dependencies 中) |

## 12. 验收与发布

- 单 spec → 单 plan → 单 PR
- 发版随 v2.25 或 v2.26(视优先级,需在 `writing-plans` 阶段确定)
- 合入前:`npm run test` 全绿 + 手动验收清单全过
- 合入后:在 `2026-06-19-product-roadmap-design.md` §10 实施状态附录增加本条对账

## 13. 未来扩展(本版本不做)

- 关注多个博主(架构预留 `handle` 字段,UI 增加 handle 切换器)
- Watchlist 通知联动(已留事件钩子)
- 离线小模型兜底(对齐路线图 A6,但成本 3 风险 3 暂不做)
- 推文情感分析 + 自动 tag
- 与 wechat-hot / ithome 联动做"财经早报"专属 channel

## 14. Brainstorming 决策记录

### Step 1 现状核对(发现 spec 与代码的偏差)

核对 `src/renderer/components/SideNav.jsx` / `state-store-schema.js` / `shared-llm.js` / `http-client.js` / `config.json` / `navStore.js` 后发现:

| 偏差 | spec 原文 | 代码现状 | 处理 |
|---|---|---|---|
| 面板计数 | "已有 9 个面板 / 新增第 10 项" | SideNav 实为 7 nav + 1 footer = 8 槽位 | 改对数字,见 §1 / §2.1 |
| Prompt 存储 | `config.json.aiDigest.prompts.twitterTranslate` | config.json 无 aiDigest 字段,shared-llm 也不读 config | 硬编码 translator.js 常量,见 §6.1 |
| User-Agent | "http-client 新加 twitterUserAgent" | HttpClient 构造函数无 userAgent 字段 | per-request header,不改构造函数,见 §3.2 原则 6 |
| daily-summary 联动 | 改 `daily-summary-job.js` | aggregate 纯函数在 `aggregate.js`,job 调它 | 改 aggregate.js 而非 job,见 §10.2 |
| NAV_KEYS | 未提 | `navStore.js` 的 NAV_KEYS 是 Set 且未 export,setActiveNav 有 guard | NAV_KEYS 加 'serenity',见 §2.1 / §10.2 |

### Step 3 澄清问题(4 个关键决策)

| # | 问题 | 用户选 |
|---|---|---|
| 1 | 面板计数数字怎么改 | 改对数字(7 nav + 1 footer,新增为第 8 个 nav item) |
| 2 | Prompt 模板存哪里 | 硬编码在 translator.js(与 shared-llm 现状一致,零迁移) |
| 3 | User-Agent 怎么加 | per-request header(不改 HttpClient 构造函数) |
| 4 | handle / displayName 确认 | `aleabitoreddit` + `Serenity`(按 spec 原文) |

### Step 4 默认决策(未单独问,直接定)

| 项 | 决策 | 理由 |
|---|---|---|
| 手动粘贴解析规则 | 3 类输入(X URL / Nitter URL / 纯文本),见 §5.4 | spec §5.4 原文未给正则,补全 |
| SideNav 第 8 项位置 | `ai-usage` 之后、`versions` 之前 | 财经内容聚在一起,版本检查保持最后 |
| Schema bump | 1 → 2 | 加 twitterCache / twitterSources 两字段 |
| daily-summary 改 aggregate.js 而非 job | aggregate 是纯函数,job 已调它 | 最小改动面 |

### Step 5 分节批准

spec 经上述修订后整体批准,状态从「设计中」→「设计已批准,待 writing-plans」。下一步走 `writing-plans` skill 转 implementation plan。