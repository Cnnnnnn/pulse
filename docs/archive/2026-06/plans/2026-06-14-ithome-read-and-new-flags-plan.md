# IT 新闻「已读 / 新文章」标记 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Generated from spec `docs/superpowers/specs/2026-06-14-ithome-read-and-new-flags-design.md`.

**Goal:** 在 IT 新闻卡片上分别标记"已读 / 新文章"，并在侧边日期 badge 显示"已读 N"后缀。

**Architecture:**
- 已读 (`readAt`) 持久化到 `state.json.ithome_news.articles[id].readAt`，主进程新增 `markArticleRead` + IPC
- 新文章 纯 renderer signal (`ithomeNewIds`)，每次 `loadIthomeNews` diff 产生，切 tab / 切日期清空
- 视觉 (css): `.is-read` 标题变灰 + meta 行 `已读` tag；`.is-new` 左侧 3px 紫边杠 + meta 行 `新` tag
- TDD: 先写失败测试，再写实现

**Tech Stack:** Electron / Preact / @preact/signals / vitest / happy-dom (renderer)

---

## File Structure

**New files:**
- `tests/renderer/ithome-news-store.test.js` — store signals 行为测试

**Modified files (按依赖顺序):**
- `src/main/ithome/news-store.js` — 加 `markArticleRead` + `_mergeArticles` 保留 readAt
- `src/main/ipc/register-ithome.js` — 加 `ithome:mark-read` handler
- `preload.js` — 暴露 `ithomeMarkRead`
- `src/renderer/ithome/news-utils.js` — 加 `readCountForDate` 纯函数
- `src/renderer/ithome/store.js` — 加 signals + `markIthomeRead` + 清空逻辑
- `src/renderer/ithome/NewsSidebar.jsx` — 数字 badge 加 `(已读 N)` 后缀
- `src/renderer/ithome/NewsArticleRow.jsx` — 视觉 + openLink 前调 markRead
- `styles.css` — `.is-read` / `.is-new` / tag 样式

**Test files:**
- `tests/main/ithome-news-store.test.js` — +3 case (markRead / 幂等 / _mergeArticles 保留)
- `tests/renderer/ithome-news-utils.test.js` — +3 case (readCountForDate)
- `tests/renderer/ithome-news-article-row.test.jsx` — +2 case (is-read / is-new 视觉)
- `tests/renderer/ithome-news-store.test.js` — 5 case (markRead / diff / 切 tab / 切日期 / markRead 移除 newId)

---

## Task 1: 主进程 — `markArticleRead` (TDD)

**Files:**
- Modify: `src/main/ithome/news-store.js`
- Test: `tests/main/ithome-news-store.test.js`

- [ ] **Step 1: Write failing test — markArticleRead 第一次写 readAt**

在 `tests/main/ithome-news-store.test.js` 末尾追加：

```js
describe("ithome news-store markArticleRead", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {
            "https://www.ithome.com/0/1/a.htm": {
              id: "https://www.ithome.com/0/1/a.htm",
              title: "A",
              dateKey: "2026-06-13",
            },
          },
          summaries: {},
        },
      }),
    );
  });

  it("markArticleRead 第一次写入 readAt", () => {
    const r = newsStore.markArticleRead("https://www.ithome.com/0/1/a.htm", p);
    expect(r.ok).toBe(true);
    const article = newsStore.getArticle("https://www.ithome.com/0/1/a.htm", p);
    expect(typeof article.readAt).toBe("number");
    expect(article.readAt).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/ithome-news-store.test.js -t "markArticleRead 第一次写入 readAt"`
Expected: FAIL — `newsStore.markArticleRead is not a function`

- [ ] **Step 3: Implement minimal markArticleRead**

在 `src/main/ithome/news-store.js` 的 `attachArticleBody` 函数之前插入：

```js
function markArticleRead(id, statePath) {
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const cur = _normalizeNews(_readStateRaw(statePath).ithome_news);
  if (!cur.articles[id] && !(cur.favorites && cur.favorites[id])) {
    return { ok: false, reason: "article_not_found" };
  }
  const articles = { ...cur.articles };
  if (articles[id] && !articles[id].readAt) {
    articles[id] = {
      ...articles[id],
      readAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  const favorites = { ...(cur.favorites || {}) };
  if (favorites[id] && favorites[id].article && !favorites[id].article.readAt) {
    favorites[id] = {
      ...favorites[id],
      article: {
        ...favorites[id].article,
        readAt: Date.now(),
      },
    };
  }
  const news = { ...cur, articles, favorites, ts: Date.now() };
  _writeNews(news, statePath);
  return { ok: true };
}
```

并在 `module.exports` 里加 `markArticleRead,`：

```js
module.exports = {
  RSS_URL,
  loadAll,
  refresh,
  fetchDay,
  getArticle,
  saveSummary,
  toggleFavorite,
  isFavorited,
  attachArticleBody,
  markArticleRead,
  _pruneArticles,
  MAX_ARTICLES_PER_DAY,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/ithome-news-store.test.js -t "markArticleRead 第一次写入 readAt"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ithome/news-store.js tests/main/ithome-news-store.test.js
git commit -m "feat(news-store): markArticleRead writes readAt once (idempotent)"
```

---

## Task 2: 主进程 — `markArticleRead` 幂等 (TDD)

**Files:**
- Test: `tests/main/ithome-news-store.test.js`

- [ ] **Step 1: Add failing test — repeated markArticleRead 不会改 readAt**

在 Task 1 那个 `describe` 块内继续追加：

```js
  it("markArticleRead 重复调用不更新 readAt（幂等）", async () => {
    const r1 = newsStore.markArticleRead("https://www.ithome.com/0/1/a.htm", p);
    const t1 = newsStore.getArticle("https://www.ithome.com/0/1/a.htm", p).readAt;
    // 等待足够时间让 Date.now() 变化
    await new Promise((resolve) => setTimeout(resolve, 5));
    const r2 = newsStore.markArticleRead("https://www.ithome.com/0/1/a.htm", p);
    const t2 = newsStore.getArticle("https://www.ithome.com/0/1/a.htm", p).readAt;
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(t2).toBe(t1);
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/main/ithome-news-store.test.js -t "幂等"`
Expected: PASS (Task 1 的 `!articles[id].readAt` 已经保证了幂等)

> 如果失败：在 `markArticleRead` 里把 `!articles[id].readAt` 条件改为已实现。

- [ ] **Step 3: Commit**

```bash
git add tests/main/ithome-news-store.test.js
git commit -m "test(news-store): markArticleRead idempotency"
```

---

## Task 3: 主进程 — `_mergeArticles` 保留 readAt (TDD)

**Files:**
- Test: `tests/main/ithome-news-store.test.js`

- [ ] **Step 1: Add failing test — _mergeArticles 保留 readAt**

```js
describe("ithome news-store _mergeArticles preserves readAt", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("刷新时 _mergeArticles 保留旧 readAt", () => {
    const id = "https://www.ithome.com/0/1/a.htm";
    const oldReadAt = 1000;
    writeFileSync(
      p,
      JSON.stringify({
        v: 1,
        apps: {},
        mutes: {},
        ithome_news: {
          ts: 1,
          articles: {
            [id]: { id, title: "old", dateKey: "2026-06-13", readAt: oldReadAt, fetchedAt: 1 },
          },
          summaries: {},
        },
      }),
    );
    const cur = newsStore.loadAll(p);
    const merged = newsStore._mergeArticles(cur, [{ id, title: "new", dateKey: "2026-06-13", excerpt: "" }], 2000);
    expect(merged[id].readAt).toBe(oldReadAt);
    expect(merged[id].title).toBe("new"); // 其它字段被覆盖
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/ithome-news-store.test.js -t "保留 readAt"`
Expected: FAIL — `merged[id].readAt` undefined

- [ ] **Step 3: Modify _mergeArticles in news-store.js**

修改 `src/main/ithome/news-store.js` 里的 `_mergeArticles`：

```js
function _mergeArticles(cur, parsed, now) {
  const articles = { ...cur.articles };
  for (const item of parsed) {
    const prev = articles[item.id];
    articles[item.id] = {
      ...item,
      excerpt: prev?.excerpt || item.excerpt || "",
      body: prev?.body || item.body || "",
      readAt: prev?.readAt || item.readAt || 0,
      fetchedAt: prev?.fetchedAt || now,
      updatedAt: now,
    };
  }
  return articles;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/ithome-news-store.test.js`
Expected: ALL PASS (含 Task 1, 2, 3)

- [ ] **Step 5: Commit**

```bash
git add src/main/ithome/news-store.js tests/main/ithome-news-store.test.js
git commit -m "feat(news-store): _mergeArticles preserves readAt across refresh"
```

---

## Task 4: IPC + preload — `ithome:mark-read`

**Files:**
- Modify: `src/main/ipc/register-ithome.js`
- Modify: `preload.js`

- [ ] **Step 1: Add IPC handler in register-ithome.js**

在 `register-ithome.js` 现有 `safeHandle` 调用附近加：

```js
  safeHandle("ithome:mark-read", async (_evt, id) => {
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    return ithomeNewsStore.markArticleRead(id);
  });
```

- [ ] **Step 2: Expose in preload.js**

修改 `preload.js` 找到现有 `ithomeSummarizeArticle` 附近，加：

```js
  ithomeMarkRead: (id) => ipcRenderer.invoke("ithome:mark-read", id),
```

- [ ] **Step 3: Manual smoke**

```bash
npx vitest run
```

Expected: 现有 1364 个测试全过 (本次改动没动已测代码)

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/register-ithome.js preload.js
git commit -m "feat(ithome): expose ithome:mark-read IPC for renderer"
```

---

## Task 5: Renderer utils — `readCountForDate` (TDD)

**Files:**
- Modify: `src/renderer/ithome/news-utils.js`
- Modify: `tests/renderer/ithome-news-utils.test.js`

- [ ] **Step 1: Add failing test**

在 `tests/renderer/ithome-news-utils.test.js` 末尾追加：

```js
import { readCountForDate } from "../../src/renderer/ithome/news-utils.js";

describe("ithome news-utils readCountForDate", () => {
  const articles = {
    a: { id: "a", dateKey: "2026-06-12" },
    b: { id: "b", dateKey: "2026-06-12" },
    c: { id: "c", dateKey: "2026-06-12" },
    d: { id: "d", dateKey: "2026-06-13" },
  };

  it("counts articles of dateKey present in readIds", () => {
    expect(readCountForDate(articles, { a: 1, b: 1 }, "2026-06-12")).toBe(2);
  });

  it("returns 0 when no articles match", () => {
    expect(readCountForDate(articles, {}, "2026-06-12")).toBe(0);
  });

  it("returns count when all read", () => {
    expect(readCountForDate(articles, { a: 1, b: 1, c: 1 }, "2026-06-12")).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/ithome-news-utils.test.js`
Expected: FAIL — `readCountForDate is not exported`

- [ ] **Step 3: Implement readCountForDate**

在 `src/renderer/ithome/news-utils.js` 末尾追加：

```js
export function readCountForDate(articles, readIds, dateKey) {
  if (!articles || !readIds) return 0;
  let n = 0;
  for (const a of Object.values(articles)) {
    if (a && a.dateKey === dateKey && readIds[a.id]) n += 1;
  }
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/ithome-news-utils.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ithome/news-utils.js tests/renderer/ithome-news-utils.test.js
git commit -m "feat(news-utils): readCountForDate helper for sidebar"
```

---

## Task 6: Renderer store — signals + markRead + 切 tab/日期 清空 (TDD)

**Files:**
- Modify: `src/renderer/ithome/store.js`
- Test: `tests/renderer/ithome-news-store.test.js` (new)

- [ ] **Step 1: Create test file skeleton**

创建 `tests/renderer/ithome-news-store.test.js`：

```js
/**
 * tests/renderer/ithome-news-store.test.js
 *
 * 覆盖 ithome store 的 read/new 行为：
 * - markIthomeRead: signal 更新 + IPC 调用 + 从 newIds 移除
 * - loadIthomeNews: diff 产生 newIds
 * - 切 viewMode / 切日期 清空 newIds
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockMarkRead, mockLoadNews, setLoadNewsPayload, resetLoadNewsMock } = vi.hoisted(() => {
  const mockMarkRead = vi.fn().mockResolvedValue({ ok: true });
  const queue = [];
  const mockLoadNews = vi.fn(() => {
    if (queue.length === 0) {
      return Promise.resolve({ ok: true, articles: {}, dayStats: {}, summaries: {}, favorites: {} });
    }
    return Promise.resolve(queue.shift());
  });
  const setLoadNewsPayload = (payload) => queue.push(payload);
  const resetLoadNewsMock = () => {
    mockMarkRead.mockClear();
    mockLoadNews.mockClear();
    queue.length = 0;
  };
  return { mockMarkRead, mockLoadNews, setLoadNewsPayload, resetLoadNewsMock };
});

vi.mock("../../src/renderer/store-utils.js", () => ({
  requireApiMethod: (name) => {
    if (name === "ithomeMarkRead") return mockMarkRead;
    if (name === "ithomeLoadNews") return mockLoadNews;
    return undefined;
  },
}));

const {
  ithomeReadIds,
  ithomeNewIds,
  markIthomeRead,
  loadIthomeNews,
  setIthomeViewMode,
  setIthomeSelectedDate,
  setIthomeFavoriteSelectedDate,
} = require("../../src/renderer/ithome/store.js");

const ARTICLES_BEFORE = {
  a: { id: "a", title: "old A", dateKey: "2026-06-12" },
  b: { id: "b", title: "old B", dateKey: "2026-06-12" },
};

const ARTICLES_AFTER = {
  a: { id: "a", title: "old A", dateKey: "2026-06-12" },
  b: { id: "b", title: "old B", dateKey: "2026-06-12" },
  c: { id: "c", title: "new C", dateKey: "2026-06-12" },
  d: { id: "d", title: "new D", dateKey: "2026-06-12" },
};

describe("ithome store read/new flags", () => {
  beforeEach(() => {
    resetLoadNewsMock();
    ithomeReadIds.value = {};
    ithomeNewIds.value = {};
  });

  it("markIthomeRead updates readIds signal and calls IPC", async () => {
    await markIthomeRead("x");
    expect(ithomeReadIds.value.x).toBeGreaterThan(0);
    expect(mockMarkRead).toHaveBeenCalledWith("x");
  });

  it("markIthomeRead removes id from newIds", async () => {
    ithomeNewIds.value = { x: 1, y: 1 };
    await markIthomeRead("x");
    expect(ithomeNewIds.value.x).toBeUndefined();
    expect(ithomeNewIds.value.y).toBe(1);
  });

  it("loadIthomeNews diff → newIds gets ids seen for the first time this session", async () => {
    // 第一次 load: prevIds={} → 全部 a, b 标 NEW
    setLoadNewsPayload({ ok: true, articles: ARTICLES_BEFORE, dayStats: {}, summaries: {}, favorites: {} });
    await loadIthomeNews();
    expect(ithomeNewIds.value.a).toBe(1);
    expect(ithomeNewIds.value.b).toBe(1);
    // 第二次 load: prevIds={a,b} → c, d 是新出现的
    setLoadNewsPayload({ ok: true, articles: ARTICLES_AFTER, dayStats: {}, summaries: {}, favorites: {} });
    await loadIthomeNews();
    expect(ithomeNewIds.value.c).toBe(1);
    expect(ithomeNewIds.value.d).toBe(1);
    // 旧的 a, b 仍然在 newIds (没被清, 等用户点/切 tab 才清)
    expect(ithomeNewIds.value.a).toBe(1);
    expect(ithomeNewIds.value.b).toBe(1);
  });

  it("setIthomeViewMode clears newIds", () => {
    ithomeNewIds.value = { a: 1, b: 1 };
    setIthomeViewMode("favorites");
    expect(ithomeNewIds.value).toEqual({});
  });

  it("setIthomeSelectedDate clears newIds", () => {
    ithomeNewIds.value = { a: 1 };
    setIthomeSelectedDate("2026-06-11");
    expect(ithomeNewIds.value).toEqual({});
  });

  it("setIthomeFavoriteSelectedDate clears newIds", () => {
    ithomeNewIds.value = { a: 1 };
    setIthomeFavoriteSelectedDate("2026-06-11");
    expect(ithomeNewIds.value).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/ithome-news-store.test.js`
Expected: FAIL — `ithomeReadIds` / `ithomeNewIds` / `markIthomeRead` not exported

- [ ] **Step 3: Add signals to store.js**

修改 `src/renderer/ithome/store.js`：

a. 在 `ithomeViewMode` signal 后加：

```js
export const ithomeReadIds = signal({});
export const ithomeNewIds = signal({});
```

b. 修改 `_applyPayload`：派生 readIds 从 articles 的 readAt 字段：

```js
function _applyPayload(data) {
  if (!data) return;
  ithomeArticles.value = data.articles || {};
  ithomeDayStats.value = data.dayStats || {};
  ithomeSummaries.value = data.summaries || {};
  ithomeFavorites.value = data.favorites || {};
  ithomeNewsTs.value = data.ts || 0;
  ithomeNewsLoaded.value = true;
  // 派生 readIds (从 articles 的 readAt)
  const readIds = {};
  for (const a of Object.values(ithomeArticles.value)) {
    if (a && a.id && a.readAt) readIds[a.id] = a.readAt;
  }
  ithomeReadIds.value = readIds;
  // diff 找出新文章 — 仅追踪本 session 内首次出现的 id
  // (信号生命周期 = app 一次运行; 启动时 prevIds === {} 所以这次 load 不会
  // 把所有现存文章都标 NEW, 这符合 spec 4.2 "app 重启后 NEW 全部清空" 的语义)
  const prevIds = new Set(Object.keys(ithomeNewIds.value));
  const newMap = { ...ithomeNewIds.value };
  let mutated = false;
  for (const id of Object.keys(ithomeArticles.value)) {
    if (!prevIds.has(id) && !readIds[id]) {
      newMap[id] = 1;
      mutated = true;
    }
  }
  if (mutated) ithomeNewIds.value = newMap;
  _syncFavoriteSelectedDate();
}
```

c. 加 `markIthomeRead` 函数（在 `summarizeIthomeArticle` 后）：

```js
export async function markIthomeRead(id) {
  if (!id) return { ok: false, reason: "invalid_args" };
  // 1. 乐观更新 readIds signal
  ithomeReadIds.value = { ...ithomeReadIds.value, [id]: Date.now() };
  // 2. 从 newIds 移除
  if (ithomeNewIds.value[id]) {
    const next = { ...ithomeNewIds.value };
    delete next[id];
    ithomeNewIds.value = next;
  }
  // 3. 同步更新 article.readAt in-memory (renderer cache)
  if (ithomeArticles.value[id]) {
    ithomeArticles.value = {
      ...ithomeArticles.value,
      [id]: { ...ithomeArticles.value[id], readAt: Date.now() },
    };
  }
  // 4. 异步落盘 (fire-and-forget)
  const markRead = requireApiMethod("ithomeMarkRead");
  if (markRead) {
    try {
      await markRead(id);
    } catch {
      /* ignore — signal 已是 source of truth */
    }
  }
  return { ok: true };
}
```

d. 修改 `setIthomeViewMode`：

```js
export function setIthomeViewMode(mode) {
  const next = mode === "favorites" ? "favorites" : "news";
  ithomeViewMode.value = next;
  if (next === "favorites") {
    _syncFavoriteSelectedDate();
  }
  // 切 tab 清空 newIds
  ithomeNewIds.value = {};
}
```

e. 修改 `setIthomeSelectedDate`：

```js
export async function setIthomeSelectedDate(dateKey) {
  const prev = ithomeSelectedDate.value;
  ithomeSelectedDate.value = dateKey;
  ithomeNewsError.value = null;
  // 切日期清空 newIds
  ithomeNewIds.value = {};
  if (dateKey && dateKey !== prev) {
    trackIthomeView(dateKey);
  }
  const cached = articlesForDate(ithomeArticles.value, dateKey);
  if (cached.length === 0) {
    await fetchDayNews(dateKey);
  }
}
```

f. 修改 `setIthomeFavoriteSelectedDate`：

```js
export function setIthomeFavoriteSelectedDate(dateKey) {
  ithomeFavoriteSelectedDate.value = dateKey;
  ithomeNewIds.value = {};
}
```

- [ ] **Step 4: Run test to verify all pass**

Run: `npx vitest run tests/renderer/ithome-news-store.test.js`
Expected: 5 PASS

> 如果 `setIthomeViewMode` 实际行为有副作用（比如 trigger fetch），看是否影响测试。视情况拆 mock。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ithome/store.js tests/renderer/ithome-news-store.test.js
git commit -m "feat(ithome-store): readIds/newIds signals + markRead + tab/date clear"
```

---

## Task 7: Sidebar — `(已读 N)` 后缀

**Files:**
- Modify: `src/renderer/ithome/NewsSidebar.jsx`

- [ ] **Step 1: Modify NewsSidebar.jsx**

在 `NewsSidebar.jsx` 顶部 import 加入：

```js
import {
  ithomeReadIds,
} from "./store.js";
import { readCountForDate } from "./news-utils.js";
```

把 `dayCount` 改成返回 `{ total, read }`：

```js
function dayCountTuple(dateKey, isFavorites, articles, dayStats, favorites, readIds) {
  if (isFavorites) {
    return { total: favoritesForDate(favorites, dateKey).length, read: 0 };
  }
  const total = sidebarDayCount(dayStats, articles, dateKey);
  const read = readCountForDate(articles, readIds, dateKey);
  return { total, read };
}
```

在 `NewsSidebar` 函数里加：

```js
const readIds = ithomeReadIds.value;
```

替换调用 `dayCount(...)` 那段：

```jsx
const counts = dayCountTuple(
  dateKey,
  isFavorites,
  articles,
  dayStats,
  favorites,
  readIds,
);
const count = counts.total;
const readCount = counts.read;
```

并替换 badge：

```jsx
{count > 0 && (
  <span class="ithome-sidebar-item-badge">
    {count}
    {readCount > 0 && (
      <span class="ithome-sidebar-item-badge-read"> (已读 {readCount})</span>
    )}
  </span>
)}
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: 1364 + 14 (Task 1-3) + 3 (Task 5) + 5 (Task 6) = 1386 PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/ithome/NewsSidebar.jsx
git commit -m "feat(ithome-sidebar): show '已读 N' suffix on date count"
```

---

## Task 8: NewsArticleRow — 视觉 + openLink 调 markRead (TDD)

**Files:**
- Modify: `src/renderer/ithome/NewsArticleRow.jsx`
- Modify: `tests/renderer/ithome-news-article-row.test.jsx`

- [ ] **Step 1: Add failing tests**

在 `tests/renderer/ithome-news-article-row.test.jsx` 末尾追加：

```js
const { ithomeReadIds, ithomeNewIds } = require("../../src/renderer/ithome/store.js");

describe("NewsArticleRow 已读/新 视觉", () => {
  beforeEach(() => {
    ithomeReadIds.value = {};
    ithomeNewIds.value = {};
  });
  afterEach(() => cleanup());

  it("已读: 加 is-read class + meta 行有 已读 tag", () => {
    const id = "https://www.ithome.com/0/1/1.htm";
    ithomeReadIds.value = { [id]: Date.now() };
    const article = makeArticle({ excerpt: "x".repeat(500) });
    const { container, getByText } = render(<NewsArticleRow article={{ ...article, id }} />);
    expect(container.querySelector(".ithome-row").classList.contains("is-read")).toBe(true);
    expect(getByText("已读")).toBeTruthy();
  });

  it("新文章: 加 is-new class + meta 行有 新 tag", () => {
    const id = "https://www.ithome.com/0/1/1.htm";
    ithomeNewIds.value = { [id]: 1 };
    const article = makeArticle({ excerpt: "x".repeat(500) });
    const { container, getByText } = render(<NewsArticleRow article={{ ...article, id }} />);
    expect(container.querySelector(".ithome-row").classList.contains("is-new")).toBe(true);
    expect(getByText("新")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/ithome-news-article-row.test.jsx`
Expected: FAIL — 找不到 is-read class / 已读 text

- [ ] **Step 3: Modify NewsArticleRow.jsx**

a. 在 `import` 区添加：

```js
import {
  ithomeSummaries,
  ithomeFavorites,
  ithomeReadIds,
  ithomeNewIds,
  summarizeIthomeArticle,
  toggleIthomeFavorite,
  markIthomeRead,
} from "./store.js";
```

b. 在 `NewsArticleRow` 函数顶部加（`const summary = ...` 附近）：

```js
const isRead = !!ithomeReadIds.value[article.id];
const isNew = !!ithomeNewIds.value[article.id];
```

c. 修改 `openLink` —— 在 `await window.api.openUrl(...)` 之前调 `markIthomeRead`：

```js
async function openLink(e) {
  e.preventDefault();
  markIthomeRead(article.id);
  if (typeof window !== "undefined" && window.api?.openUrl) {
    await window.api.openUrl(article.link);
  } else if (article.link) {
    window.open(article.link, "_blank", "noopener");
  }
}
```

d. 在 meta 行 (`<div class="ithome-row-meta">`) 里追加 tag (在 `article.category` 之后)：

```jsx
{isNew && <span class="ithome-row-tag ithome-row-tag--new">新</span>}
{isRead && <span class="ithome-row-tag ithome-row-tag--read">已读</span>}
```

e. 修改 article 主 className 加上 `is-read` / `is-new`：

```jsx
<article
  class={`ithome-row${favorited ? " is-favorited" : ""}${expanded ? " is-expanded" : ""}${isRead ? " is-read" : ""}${isNew ? " is-new" : ""}`}
>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/ithome-news-article-row.test.jsx`
Expected: 5 PASS (3 old + 2 new)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ithome/NewsArticleRow.jsx tests/renderer/ithome-news-article-row.test.jsx
git commit -m "feat(ithome-row): read/new tags + openLink marks read"
```

---

## Task 9: Styles — `.is-read` / `.is-new` / tag 颜色

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Find insertion point in styles.css**

Search: `grep -n "ithome-row-tag\|ithome-row\.is-favorited\|ithome-row\.is-expanded" styles.css`
Choose a stable anchor (e.g., end of existing `.ithome-row-tag` rule)

- [ ] **Step 2: Append CSS rules**

在 styles.css 末尾 (或紧邻 `.ithome-row-tag` 之后) 追加：

```css
.ithome-row.is-read .ithome-row-title {
  color: rgba(0, 0, 0, 0.45);
  font-weight: 400;
}

.ithome-row.is-new {
  border-left: 3px solid #af52de;
  padding-left: 10px;
  margin-left: -13px;
}

.ithome-row-tag--new {
  background: #af52de;
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 4px;
}

.ithome-row-tag--read {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.55);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 4px;
}

.ithome-sidebar-item-badge-read {
  color: rgba(0, 0, 0, 0.45);
  font-size: 11px;
  margin-left: 2px;
}
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: 1386 + 2 (Task 8) = 1388 PASS

- [ ] **Step 4: Manual visual check**

```bash
npm run dev
```

抽一张卡片：
- 没看过 → 不应有 `已读` tag, 标题正常颜色
- 看过的卡片 (after click) → 标题变灰 + meta 行有 `已读` tag
- 新文章 → meta 行有 `新` tag + 左侧紫色边杠
- 侧边日期 → `20` 或 `20 (已读 5)`

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "style(ithome): read/new visual states"
```

---

## Task 10: 集成验证 + Release notes

**Files:**
- Modify: `RELEASE-NOTES.md`

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: ALL PASS, 0 FAIL. Capture: `Test Files 80+ passed, 1388+ tests`

- [ ] **Step 2: Run lints**

```bash
# If eslint configured; otherwise skip
git diff main --stat
```

Expected: No untracked files in src/ or tests/ (besides the .docx)

- [ ] **Step 3: Update RELEASE-NOTES.md**

在 `## v2.11.3` section 之后或新增 `## v2.11.4` section。简短说明：
- 新增：已读 / 新文章 标记
- 视觉：meta tag + 标题变灰 / 左侧边杠
- 侧边：日期数字加 (已读 N) 后缀
- 已读持久化 (`state.json.ithome_news.articles[id].readAt`)；新文章 ephemeral

```markdown
---

## v2.11.4 (IT 新闻 · 已读 / 新文章 标记) — 2026-06-14

### 新增
- **已读标记**: 点标题/阅读原文后, 卡片 meta 行显示"已读"tag, 标题变灰; 状态持久化到 `state.json.ithome_news.articles[id].readAt`
- **新文章标记**: 每次 refresh 期间新加入列表的文章, 显示"新"tag + 左侧紫色边杠; 切 tab / 切日期自动取消
- **侧边数字**: 日期旁默认 `20`, 有已读时显示 `20 (已读 5)`

### 边界
- 重复点已读文章 → readAt 幂等, 不更新时间戳
- app 重启 → 已读持久化保留, 新文章标记清空 (切走 tab 等同扫过)
- 收藏 / 摘要 / 抓取正文等行为不变

### 工程
- 14 个新测试 (markRead 2 + readAt 保留 1 + readCountForDate 3 + store 5 + row 2 + sidebar 0)
- 不动 schema, readAt 复用现有 articles[id] 字段
```

- [ ] **Step 4: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "docs(release-notes): v2.11.4 ithome read/new flags"
```

---

## Self-Review Checklist

- [x] **Spec coverage**:
  - 4.1 已读 (openLink + readAt + 幂等 + 持久化) → Tasks 1, 2, 3, 4, 8
  - 4.2 新文章 (diff + 切 tab/日期 + 点过) → Task 6
  - 4.3 侧边数字 (read-of-total) → Task 7
  - 5.x 数据流 → Task 6 覆盖
  - 6 文件改动 → 全部对齐
  - 7 测试策略 → 全部对齐
- [x] **Placeholder scan**: 无 TBD/TODO
- [x] **Type consistency**:
  - `markIthomeRead(id)` 全程一致
  - `ithomeReadIds` / `ithomeNewIds` 全程是 `signal({})`
  - `readAt: number` 全程是 ms
  - `markArticleRead` 返回 `{ ok, reason? }`

## Total Estimated Time

- Task 1: 15min
- Task 2: 5min
- Task 3: 10min
- Task 4: 5min
- Task 5: 10min
- Task 6: 30min
- Task 7: 15min
- Task 8: 20min
- Task 9: 10min
- Task 10: 15min

**Total: ~2.5h**
