# IT 新闻「已读 / 新文章」标记 设计 Spec

- **日期**: 2026-06-14
- **作者**: Mavis (brainstorming-2)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (Pulse v2.x)
- **目标特性**: IT 新闻卡片上分别标记 (1) 用户点过外部链接 = "已读"、(2) 本轮 refresh 期间新增 = "新文章"，并把"已读 / 总" 数字显示在侧边日期

## 1. 背景

IT 新闻 tab 现在是 RSS-like 列表流，用户有 3 个痛点：

1. **无法分辨哪些已看过** —— 卡片没有"已读"信号，反复刷新一遍后还是分不清
2. **无法分辨哪些是新的** —— 列表里 50 条不知道哪些是这次刷新加的
3. **侧边日期数字**只显示总数，没法知道"今天我看了多少 / 还没看多少"

## 2. 目标

2 个独立标记（语义不同，存储方式也不同）：

| 标记 | 含义 | 存储 |
|---|---|---|
| **已读** | 用户点了标题/阅读原文（打开了外部链接） | **持久化** — `state.json.ithome_news.articles[id].readAt` |
| **新文章** | 本轮 refresh 期间加入列表的文章 | **ephemeral** — 纯 renderer signal，切 tab/切日期即清空 |

视觉：
- 已读卡片：meta 行加 `已读` tag + 标题变灰
- 新文章卡片：meta 行加 `新` tag + 卡片左侧 3px 彩色边杠
- 侧边日期 badge：默认 `20`，当 `readCount > 0` 时显示 `20 (已读 5)`

## 3. 非目标 (YAGNI)

- 不做 "未读" 反向操作（"标为未读"按钮） —— 用户没要求
- 不做"已读 N 天后自动重置" —— 持久化就是持久化
- 不做"新文章邮件/通知" —— 仅在 tab 内显示
- 不做"哪些是我看过的"全局统计 —— 仅在卡片 + 侧边显示
- 不做"N 分钟前的相对时间" —— pubDate 已在卡上显示
- 不做"在新文章 tab 里只看 NEW" 过滤 —— 用户没要求 filter
- 不在 favorites 列表里"新文章"特殊处理 —— favorites 是另外的视图
- 不在收藏/摘要的 recent 事件里加"已读"独立 kind —— 跟最近活动正交

## 4. UX 行为

### 4.1 已读 (readAt)

- 触发：用户在卡片上**点标题** 或 **点"阅读原文"** → 调 `window.api.openUrl(article.link)`
  - 调 `openUrl` **之前** 先调 `markIthomeRead(article.id)`：乐观更新 renderer signal + 异步 fire-and-forget IPC 落盘
  - 如果 `openUrl` 因为没注册方法 fallback 到 `window.open`，**也**算已读（用户意图相同）
- 效果：卡上 meta 行多 `已读` tag，标题变灰（`is-read` class）
- 撤销：不支持
- 持久化：写 `state.json.ithome_news.articles[id].readAt = Date.now()`
  - 重复点击 → **不更新** `readAt`（幂等，避免时间戳漂移）
  - RSS / 列表页刷新时 `_mergeArticles` 保留 `readAt` 字段（与 `body` / `excerpt` 同等处理）
  - 收藏 → `toggleFavorite` 时 snapshot 整个 article 包含 `readAt`
- 跨 session：app 重启后从 articles 派生 `ithomeReadIds`

### 4.2 新文章 (newIds)

- 触发：每次 `loadIthomeNews()` 完成后做一次 diff
  - 把 "上次 articles 的 id 集合" vs "这次 articles 的 id 集合" 相比
  - 差集 = 新增 = 写入 `ithomeNewIds`
- 取消 NEW（在以下任一情况）:
  - 用户**点过**该文章（打开外部链接）→ 单独从 `ithomeNewIds` 移除
  - 用户**切换 tab**（news ↔ favorites）→ 全部清空
  - 用户**切换日期** → 全部清空
- 效果：卡上 meta 行多 `新` tag，卡片左侧 3px 紫色边杠（`is-new` class）
- 首次启动 / app 重启：`lastSeenIds` 是空集 → 不会把所有现存文章都标 NEW（因为新 session 没有"上次"的快照）
  - 这意味着 app 重启后，原本的 NEW 都不再 NEW —— **用户接受**这个行为（与"切走 tab 取消"同一类）
- 不持久化

### 4.3 侧边数字

- 原本：`{count}` 单一 badge
- 改为：
  - `readCount === 0` → `{count}`（不变）
  - `readCount > 0` → `{count} (已读 {readCount})`
  - `readCount === count` → 仍显示 `20 (已读 20)`，不特殊处理（全标为已读是正常状态）
- 视图模式 = favorites 时仍按原逻辑（favorites 列表无"已读"概念），**不**显示已读数字

## 5. 架构

### 5.1 数据流：已读

```
用户点标题 / 阅读原文
  ↓
NewsArticleRow.openLink() 
  ↓ (同步)
markIthomeRead(id) → 更新 ithomeReadIds signal
  ↓ (异步, fire-and-forget)
window.api.ithomeMarkRead({ id }) → IPC: ithome:mark-read
  ↓
register-ithome.js: newsStore.markArticleRead(id)
  ↓
state.json.ithome_news.articles[id].readAt = now
  ↓
loadIthomeNews (下次) → articles[id].readAt 重新派生出 signal
```

### 5.2 数据流：新文章

```
bootstrapIthomeTab() / refreshIthomeNews() 
  ↓
fetchDayNews() / refresh() 成功
  ↓
loadIthomeNews() 拉 articles
  ↓
diff(ithomeArticles.value, 新 articles) → 找出新 id
  ↓
ithomeNewIds.value = { ...ithomeNewIds.value, [新 id]: true }
  ↓
NewsArticleRow 重新渲染 → 显示 NEW
```

### 5.3 数据流：取消 NEW

| 触发 | 处理 |
|---|---|
| 用户切到 favorites tab | `setIthomeViewMode("favorites")` → `ithomeNewIds.value = {}` |
| 用户切到 news tab | `setIthomeViewMode("news")` → `ithomeNewIds.value = {}` |
| 用户切日期 | `setIthomeSelectedDate` / `setIthomeFavoriteSelectedDate` → 清空 |
| 用户点文章（开外链） | `markIthomeRead` 里同时 `ithomeNewIds.value[id] = false` |

> 注意：**切 tab 时不能直接 `ithomeNewIds.value = {}`** —— 用户可能已经在 news tab 看了一堆 NEW，切到 favorites 又切回 news，按"切走即视为扫过"的设计就全部取消。这是用户明确接受的。

### 5.4 主进程 schema

`state.json.ithome_news.articles[id]` 新增字段：
- `readAt: number` —— ms 时间戳

`state.json.ithome_news.articles[id].favorites[id].article` 也继承 readAt 字段（与 `body` 同等逻辑）。

`_mergeArticles` (RSS + 列表) 保留 readAt，方式：

```js
articles[item.id] = {
  ...item,                                       // 新解析的
  excerpt: prev?.excerpt || item.excerpt || "",
  body: prev?.body || item.body || "",
  readAt: prev?.readAt || item.readAt || 0,     // ← 新增
  fetchedAt: prev?.fetchedAt || now,
  updatedAt: now,
};
```

## 6. 文件改动

| 路径 | 操作 | 说明 |
|---|---|---|
| `src/main/ithome/news-store.js` | edit | 新增 `markArticleRead(id, statePath)`；`_mergeArticles` 保留 `readAt` |
| `src/main/ipc/register-ithome.js` | edit | 新增 `ithome:mark-read` handler |
| `preload.js` | edit | 暴露 `ithomeMarkRead: (id) => invoke("ithome:mark-read", id)` |
| `src/renderer/ithome/store.js` | edit | 新增 `ithomeReadIds` / `ithomeNewIds` signals + `markIthomeRead(id)`；`loadIthomeNews` 派生 readIds + diff newIds；`setIthomeViewMode` / `setIthomeSelectedDate` / `setIthomeFavoriteSelectedDate` 清空 newIds |
| `src/renderer/ithome/NewsArticleRow.jsx` | edit | 加 `is-read` / `is-new` class + 渲染 `已读` / `新` tag；`openLink` 前调 `markIthomeRead` |
| `src/renderer/ithome/NewsSidebar.jsx` | edit | 数字 badge 加 `(已读 N)` 后缀 |
| `src/renderer/ithome/news-utils.js` | edit | 新增 `readCountForDate(articles, readIds, dateKey)` 纯函数 |
| `styles.css` | edit | `.ithome-row.is-read` 标题灰；`.ithome-row.is-new` 左边 3px 边杠 + 紫底色；`.ithome-row-tag--read` / `.ithome-row-tag--new` chip 颜色 |
| `tests/main/ithome-news-store.test.js` | edit | +3 case: `markArticleRead` 写 readAt / 幂等 / `_mergeArticles` 保留 readAt |
| `tests/renderer/ithome-news-utils.test.js` | edit | +3 case: `readCountForDate` 基本 / 空 / 全已读 |
| `tests/renderer/ithome-news-article-row.test.jsx` | edit | +2 case: 已读时 title 灰 + meta tag；新时左边杠 + meta tag |
| `tests/renderer/ithome-news-store.test.js` | **new** | +5 case: `markIthomeRead` 同步更新 signal + 调 IPC；`loadIthomeNews` diff → newIds；切 viewMode 清空 newIds；切日期清空；markRead 移除单条 newId |

## 7. 测试策略

### 7.1 Unit (main)

**ithome-news-store.test.js (+3)**
- `markArticleRead` 第一次写 readAt
- `markArticleRead` 重复调 → readAt 不变（幂等）
- `_mergeArticles` 保留旧 readAt，不被新解析项覆盖

### 7.2 Unit (renderer utils)

**ithome-news-utils.test.js (+3)**
- `readCountForDate(articles, readIds, dateKey)`：3 个 articles 2 个已读 → 2
- 空 articles → 0
- `readIds` 全部命中 → count

### 7.3 Component (renderer)

**ithome-news-article-row.test.jsx (+2)**
- 卡片已读 → `.is-read` class + 标题颜色变灰 + meta 行有 `已读` text
- 卡片新 → `.is-new` class + meta 行有 `新` text

**ithome-news-store.test.js (+5)** — happy-dom
- `markIthomeRead(id)` → `ithomeReadIds.value[id]` truthy + IPC 被调一次
- `loadIthomeNews` 后 → 旧 articles 没的 id 在 `ithomeNewIds`
- `setIthomeViewMode("favorites")` 后 → `ithomeNewIds` 为空
- `setIthomeSelectedDate(otherKey)` 后 → `ithomeNewIds` 为空
- `markIthomeRead(id)` 同时把 `ithomeNewIds.value[id]` 移除

## 8. 风险

| 风险 | 缓解 |
|---|---|
| IPC 失败 (markArticleRead) → signal 仍乐观更新 → 下次重启丢状态 | 接受（用户本地 IPC 失败极少；不是数据丢失，是"已读" 状态丢） |
| `_mergeArticles` 保留 readAt 但新解析项里也有 readAt → 误覆盖 | 显式 `prev?.readAt || item.readAt || 0`，新项不会带 readAt |
| 切 tab 清空 newIds 跟用户预期不符（"我才看一眼切走再回来就全变旧"） | 用户已明确接受"切走即视为扫过"的语义；与 RSS 阅读器一致 |
| `ithomeNewIds` 数据结构用 object 还是 Set | 用 object `{ [id]: true }`，signal 浅比较友好（Set 的 mutation 不会触发 signal 更新） |
| favorites 列表里 `favorites[id].article.readAt` 没同步 | favorites toggle 已 spread 整个 article，readAt 自动继承；但 favorites 内 article 单独修改 readAt 时要写回 favorites（与 `attachArticleBody` 一致） |
| 切 favorites tab 时 `articles` 不会刷新，但 newIds 已清空 → 切换很突兀 | 接受（用户确认过"切走即视为扫过"） |
| `styles.css` 已 6130 行，加 3 个新 class 有命名冲突风险 | 用 `--read` / `--new` 修饰类（与现有 `.ithome-row-tag` 同前缀），无冲突 |

## 9. 实施顺序

1. `news-store.js` + IPC + preload: `markArticleRead` (+3 unit test) — 30min
2. `news-utils.js` + `NewsSidebar.jsx` 数字 badge (+3 unit test) — 20min
3. `store.js` signals + `markIthomeRead` + 切 tab/日期清空 (+5 store test) — 1h
4. `NewsArticleRow.jsx` 视觉 + openLink 调 markRead (+2 component test) — 30min
5. `styles.css` 3 个新 class — 15min
6. 全测 + build + 手动点开 app 抽卡验证 — 30min

**总计: ~3h**

## 10. 后续 (out of scope)

- 标为未读按钮
- 新文章过滤 tab
- "上次刷新增量" 全局数字（顶栏）
- 新文章邮件 / notification
- 已读后自动隐藏"AI 总结"按钮
- favorites 内 article 单独的"已读" 标记（与 articles 共享，但 UI 不显示）
