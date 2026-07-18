# IT 新闻热门评论展示实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 IT 新闻卡片正文/AI 摘要下按需展示并缓存 IT之家最多 20 条热门主评论。

**Architecture:** 主进程按需抓取文章页中的评论 `sn`，请求 IT之家评论 JSON 接口，由独立 parser 将 `content.hotComments` 转成安全的纯文本评论结构，并通过现有 IPC/preload 桥接到 renderer。评论成功结果写入文章和收藏快照；renderer 用 signal 保存已加载评论，用卡片本地状态控制展开、加载、失败和重试。

**Tech Stack:** Electron IPC、Preact Signals、Node.js `HttpClient`、Vitest、现有 `state.json.ithome_news` 存储。

## Global Constraints

- 不新增 npm 依赖。
- 评论请求必须按用户点击触发，不得在新闻列表刷新或卡片挂载时自动拉取。
- 只读取最多 20 条热门主评论；不请求或展示楼中楼，不实现发表评论、回复、点赞和登录。
- 评论接口失败不得影响新闻列表、正文、AI 摘要、收藏、已读和原文跳转。
- 只缓存成功解析的评论结果；解析失败不得覆盖旧的成功缓存。
- 不触碰当前未提交的 `src/renderer/games/*` 改动。
- 不执行 `git commit`；每个任务用聚焦测试、`git diff --check` 和工作区 diff 作为检查点。

---

## 文件边界

**创建：**

- `src/main/ithome/comment-parser.js`：解析文章页评论容器参数和评论 JSON，输出稳定的纯文本评论结构。
- `src/main/ithome/comment-fetcher.js`：读取文章、请求文章页和评论 API、缓存成功结果。
- `tests/main/ithome-comment-parser.test.js`：parser 的固定 fixture 单测。
- `tests/main/ithome-comment-fetcher.test.js`：fetcher 的请求、缓存和错误路径单测。
- `tests/main/ithome-ipc-contract.test.js`：IPC channel 与 preload bridge 的静态契约测试。

**修改：**

- `src/main/ithome/news-store.js`：增加评论写入能力，并在新闻刷新合并时保留评论缓存。
- `src/main/ipc/register-ithome.js`：注册 `ithome:fetch-comments` handler。
- `preload.js`：暴露 `ithomeFetchComments`。
- `src/renderer/ithome/store.js`：增加评论 signal 和 IPC 调用函数。
- `src/renderer/ithome/NewsArticleRow.jsx`：增加查看评论、加载、错误、重试和评论展示。
- `styles.css`：增加评论区域的最小样式。
- `tests/renderer/ithome-news-store.test.js`：覆盖评论 signal 和 IPC 成功/失败。
- `tests/renderer/ithome-news-article-row.test.jsx`：覆盖卡片评论交互。

---

### Task 1: 评论参数与 JSON 解析器

**Files:**

- Create: `src/main/ithome/comment-parser.js`
- Create: `tests/main/ithome-comment-parser.test.js`

**Interfaces:**

- Produces `extractCommentParams(html)`：返回 `{ ok: true, sn, newsId }`，或 `{ ok: false, reason: "comment_params_missing" }`。
- Produces `parseCommentResponse(raw)`：返回 `{ ok: true, comments }`，或 `{ ok: false, reason: "parse_failed" }`。
- 每条评论输出 `{ id, author, content, createdAt, likes }`。
- `comments` 最多 20 条，只读取 `content.hotComments`，过滤 `parentCommentId` 非 0 的条目和无作者/无文本条目。

- [ ] **Step 1: 写 parser 失败测试**

在 `tests/main/ithome-comment-parser.test.js` 中加入固定文章片段和 JSON fixture，锁定实际脚本已验证的字段：

```js
import { describe, expect, it } from "vitest";

const { extractCommentParams, parseCommentResponse } = require(
  "../../src/main/ithome/comment-parser.js",
);

const ARTICLE_HTML = `
  <div id="post_comm" data-id="sn-abc123" data-nid="866661"></div>
`;

function makeComment(id, extra = {}) {
  return {
    id,
    parentCommentId: 0,
    userInfo: { userNick: `用户${id}` },
    postTime: "2026-07-18T10:00:00+08:00",
    support: id,
    elements: [{ type: 0, content: `评论内容 ${id}` }],
    ...extra,
  };
}

describe("ithome comment-parser", () => {
  it("extracts sn and newsId from post_comm", () => {
    expect(extractCommentParams(ARTICLE_HTML)).toEqual({
      ok: true,
      sn: "sn-abc123",
      newsId: "866661",
    });
  });

  it("maps hotComments to safe top-level comments and caps at 20", () => {
    const hotComments = Array.from({ length: 22 }, (_, i) =>
      makeComment(i + 1),
    );
    hotComments[2] = makeComment(3, {
      parentCommentId: 99,
      elements: [{ type: 0, content: "楼中楼，不能展示" }],
    });
    hotComments[4] = makeComment(5, {
      elements: [{ type: 1, content: "图片" }],
    });

    const result = parseCommentResponse(
      JSON.stringify({ success: true, content: { hotComments } }),
    );

    expect(result.ok).toBe(true);
    expect(result.comments).toHaveLength(20);
    expect(result.comments[0]).toEqual({
      id: "1",
      author: "用户1",
      content: "评论内容 1",
      createdAt: "2026-07-18T10:00:00+08:00",
      likes: 1,
    });
    expect(result.comments.some((item) => item.content.includes("楼中楼"))).toBe(
      false,
    );
    expect(result.comments.some((item) => item.content === "图片")).toBe(false);
  });

  it("treats a successful empty hotComments array as no comments", () => {
    expect(
      parseCommentResponse(
        JSON.stringify({ success: true, content: { hotComments: [] } }),
      ),
    ).toEqual({ ok: true, comments: [] });
  });

  it("rejects malformed or changed responses", () => {
    expect(parseCommentResponse("not json")).toEqual({
      ok: false,
      reason: "parse_failed",
    });
    expect(parseCommentResponse(JSON.stringify({ success: false }))).toEqual({
      ok: false,
      reason: "parse_failed",
    });
    expect(extractCommentParams("<div id=\"post_comm\"></div>")).toEqual({
      ok: false,
      reason: "comment_params_missing",
    });
  });
});
```

- [ ] **Step 2: 运行 parser 测试确认先失败**

运行：

```bash
npx vitest run tests/main/ithome-comment-parser.test.js
```

预期：FAIL，原因是 `src/main/ithome/comment-parser.js` 尚不存在或导出函数不存在。

- [ ] **Step 3: 实现最小 parser**

在 `src/main/ithome/comment-parser.js` 中实现以下契约。属性解析要允许 `data-id` 和 `data-nid` 顺序变化；评论文本只收集 `elements` 中 `type === 0` 的 `content`，不把接口 HTML 直接交给 renderer：

```js
const MAX_COMMENTS = 20;
const TEXT_ELEMENT_TYPE = 0;

function _attr(tag, name) {
  const match = String(tag || "").match(
    new RegExp(`${name}=["']([^"']+)["']`, "i"),
  );
  return match ? match[1].trim() : "";
}

function extractCommentParams(html) {
  const match = String(html || "").match(
    /<div\b[^>]*\bid=["']post_comm["'][^>]*>/i,
  );
  if (!match) return { ok: false, reason: "comment_params_missing" };
  const sn = _attr(match[0], "data-id");
  const newsId = _attr(match[0], "data-nid");
  if (!sn) return { ok: false, reason: "comment_params_missing" };
  return { ok: true, sn, newsId };
}

function _plainCommentText(elements) {
  if (!Array.isArray(elements)) return "";
  return elements
    .filter((element) => element && element.type === TEXT_ELEMENT_TYPE)
    .map((element) => String(element.content || ""))
    .join("\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCommentResponse(raw) {
  let payload;
  try {
    payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, reason: "parse_failed" };
  }
  const hotComments = payload?.success && payload.content?.hotComments;
  if (!Array.isArray(hotComments)) return { ok: false, reason: "parse_failed" };
  const comments = [];
  for (const item of hotComments) {
    if (!item || Number(item.parentCommentId || 0) !== 0) continue;
    const author = String(item.userInfo?.userNick || "").trim();
    const content = _plainCommentText(item.elements);
    if (!author || !content || item.id == null) continue;
    comments.push({
      id: String(item.id),
      author,
      content,
      createdAt: item.postTime || "",
      likes: Number.isFinite(Number(item.support)) ? Number(item.support) : 0,
    });
    if (comments.length >= MAX_COMMENTS) break;
  }
  return { ok: true, comments };
}

module.exports = {
  MAX_COMMENTS,
  extractCommentParams,
  parseCommentResponse,
};
```

- [ ] **Step 4: 运行 parser 测试确认通过**

运行：

```bash
npx vitest run tests/main/ithome-comment-parser.test.js
```

预期：全部 PASS。

- [ ] **Step 5: 做格式检查**

运行：

```bash
git diff --check -- src/main/ithome/comment-parser.js tests/main/ithome-comment-parser.test.js
```

预期：无输出、退出码为 0。

---

### Task 2: 主进程评论抓取与新闻缓存

**Files:**

- Create: `src/main/ithome/comment-fetcher.js`
- Create: `tests/main/ithome-comment-fetcher.test.js`
- Create: `tests/main/ithome-ipc-contract.test.js`
- Modify: `src/main/ithome/news-store.js`

**Interfaces:**

- Produces `fetchAndAttachComments({ id, statePath, http })`：返回 `{ ok: true, reason: "fetched" | "already_loaded", comments }`，或 `{ ok: false, reason }`。
- Produces `newsStore.attachArticleComments(id, comments, statePath)`：同时更新 `articles[id]` 和 `favorites[id].article`（存在时）。
- 缓存命中条件是 `commentsFetchedAt` 为有限数字；空数组也算成功缓存。
- 评论 API 地址固定为 `https://cmt.ithome.com/api/webcomment/getnewscomment`，参数为 `sn`、`cid=0`、`isInit=true`、`appver=900`。

- [ ] **Step 1: 写 fetcher 和缓存失败测试**

在 `tests/main/ithome-comment-fetcher.test.js` 中覆盖文章页请求、评论 API 请求、缓存命中、收藏同步和错误 reason：

```js
import { beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const fetcher = require("../../src/main/ithome/comment-fetcher.js");
const newsStore = require("../../src/main/ithome/news-store.js");

function statePath() {
  const dir = join(
    tmpdir(),
    `pulse-ithome-comments-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

const id = "https://www.ithome.com/0/866/661.htm";
const article = { id, link: id, title: "测试", dateKey: "2026-07-18" };
const page = '<div id="post_comm" data-nid="866661" data-id="sn-abc"></div>';
const response = {
  success: true,
  content: {
    hotComments: [
      {
        id: 1,
        parentCommentId: 0,
        userInfo: { userNick: "用户 A" },
        postTime: "2026-07-18T10:00:00+08:00",
        support: 8,
        elements: [{ type: 0, content: "评论内容" }],
      },
    ],
  },
};

function seed(path, extra = {}) {
  writeFileSync(
    path,
    JSON.stringify({
      v: 1,
      apps: {},
      mutes: {},
      ithome_news: {
        ts: 1,
        articles: { [id]: { ...article, ...extra } },
        summaries: {},
        favorites: {},
      },
    }),
  );
}

function httpStub({ pageBody = page, commentBody = JSON.stringify(response) } = {}) {
  const calls = [];
  return {
    calls,
    async get(url) {
      calls.push(url);
      if (url === id) return { status: 200, body: pageBody };
      if (url.startsWith("https://cmt.ithome.com/api/webcomment/getnewscomment?")) {
        return { status: 200, body: commentBody };
      }
      return { status: 404, body: "" };
    },
  };
}

describe("ithome comment-fetcher", () => {
  let p;
  beforeEach(() => {
    p = statePath();
    seed(p);
  });

  it("fetches page params, requests hot comments, and persists them", async () => {
    const http = httpStub();
    const result = await fetcher.fetchAndAttachComments({ id, statePath: p, http });

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("fetched");
    expect(result.comments[0].author).toBe("用户 A");
    expect(http.calls).toHaveLength(2);
    expect(http.calls[1]).toContain("sn=sn-abc");
    expect(http.calls[1]).toContain("cid=0");

    const stored = newsStore.getArticle(id, p);
    expect(stored.comments).toHaveLength(1);
    expect(stored.commentsFetchedAt).toBeGreaterThan(0);
  });

  it("keeps comments in favorite snapshot", async () => {
    seed(p);
    const raw = JSON.parse(readFileSync(p, "utf8"));
    raw.ithome_news.favorites[id] = {
      article: { ...article },
      favoritedAt: 1,
      summary: null,
    };
    writeFileSync(p, JSON.stringify(raw));

    await fetcher.fetchAndAttachComments({ id, statePath: p, http: httpStub() });
    const loaded = newsStore.loadAll(p);
    expect(loaded.favorites[id].article.comments[0].content).toBe("评论内容");
  });

  it("uses cached empty comments without a network request", async () => {
    seed(p, { comments: [], commentsFetchedAt: 123 });
    const http = httpStub();
    const result = await fetcher.fetchAndAttachComments({ id, statePath: p, http });
    expect(result).toEqual({ ok: true, reason: "already_loaded", comments: [] });
    expect(http.calls).toEqual([]);
  });

  it("returns stable reasons and does not write failed results", async () => {
    const badPage = httpStub({ pageBody: "<html></html>" });
    expect(
      (await fetcher.fetchAndAttachComments({ id, statePath: p, http: badPage })).reason,
    ).toBe("comment_params_missing");

    const failedApi = httpStub({ commentBody: "not json" });
    expect(
      (await fetcher.fetchAndAttachComments({ id, statePath: p, http: failedApi })).reason,
    ).toBe("parse_failed");
    expect(newsStore.getArticle(id, p).commentsFetchedAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行 fetcher 测试确认先失败**

运行：

```bash
npx vitest run tests/main/ithome-comment-fetcher.test.js
```

预期：FAIL，因为 fetcher 和 `attachArticleComments` 尚未实现。

- [ ] **Step 3: 扩展 news-store 的评论写入和合并保留**

在 `src/main/ithome/news-store.js` 增加单条缓存写入函数，保持现有 article/favorite 双写模式：

```js
function attachArticleComments(id, comments, statePath) {
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const cur = _normalizeNews(_readStateRaw(statePath).ithome_news);
  if (!cur.articles[id] && !(cur.favorites && cur.favorites[id])) {
    return { ok: false, reason: "article_not_found" };
  }
  const nextComments = Array.isArray(comments) ? comments : [];
  const fetchedAt = Date.now();
  const articles = { ...cur.articles };
  if (articles[id]) {
    articles[id] = {
      ...articles[id],
      comments: nextComments,
      commentsFetchedAt: fetchedAt,
      updatedAt: fetchedAt,
    };
  }
  const favorites = { ...(cur.favorites || {}) };
  if (favorites[id]) {
    favorites[id] = {
      ...favorites[id],
      article: {
        ...(favorites[id].article || {}),
        comments: nextComments,
        commentsFetchedAt: fetchedAt,
      },
    };
  }
  _writeNews({ ...cur, articles, favorites, ts: fetchedAt }, statePath);
  _upsertNewsDoc(id, { ...cur, articles, favorites });
  return { ok: true, comments: nextComments, commentsFetchedAt: fetchedAt };
}
```

在 `_mergeArticles` 和 `refresh` 的 RSS 合并分支中，保留旧文章的 `body`、`bodyFetchedAt`、`comments` 和 `commentsFetchedAt`；不能只保留 `excerpt` 和 `readAt`，否则后续刷新会把成功缓存丢掉：

```js
articles[item.id] = {
  ...item,
  category: prev?.category || "",
  body: prev?.body || "",
  bodyFetchedAt: prev?.bodyFetchedAt || 0,
  comments: prev?.comments || [],
  commentsFetchedAt: prev?.commentsFetchedAt || 0,
  fetchedAt: prev?.fetchedAt || now,
  updatedAt: now,
  excerpt: item.excerpt || prev?.excerpt || "",
  readAt: prev?.readAt || item.readAt || 0,
};
```

将 `attachArticleComments` 加入 `module.exports`。不得修改 `_emptyNews` 的既有兼容字段行为。

- [ ] **Step 4: 实现 comment-fetcher**

在 `src/main/ithome/comment-fetcher.js` 使用顶部 import/require，复用项目 `HttpClient`，流程固定为：先检查文章和缓存，再 GET 文章页提取 `sn`，最后 GET 评论 API。不要内联 require：

```js
const { HttpClient } = require("../http-client");
const { mainLog } = require("../log");
const newsStore = require("./news-store");
const { extractCommentParams, parseCommentResponse } = require("./comment-parser");

const FETCH_TIMEOUT_MS = 20000;
const COMMENTS_URL = "https://cmt.ithome.com/api/webcomment/getnewscomment";

function _defaultHttp() {
  return new HttpClient({
    timeout: FETCH_TIMEOUT_MS,
    maxBodyBytes: 2 * 1024 * 1024,
  });
}

function _isLoaded(article) {
  return article && Number.isFinite(article.commentsFetchedAt);
}

async function fetchAndAttachComments(opts) {
  const id = opts && opts.id;
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const statePath = opts.statePath;
  const article = newsStore.getArticle(id, statePath);
  if (!article) return { ok: false, reason: "article_not_found" };
  if (_isLoaded(article)) {
    return {
      ok: true,
      reason: "already_loaded",
      comments: Array.isArray(article.comments) ? article.comments : [],
    };
  }

  const http = opts.http || _defaultHttp();
  let page;
  try {
    page = await http.get(article.link || id, {
      timeout: FETCH_TIMEOUT_MS,
      headers: { Accept: "text/html", "Accept-Language": "zh-CN,zh;q=0.9" },
    });
  } catch (err) {
    mainLog.warn("[ithome/comment-fetcher] article page failed", {
      id,
      msg: err && err.message,
    });
    return { ok: false, reason: "fetch_failed" };
  }
  if (!page || page.status !== 200 || !page.body) {
    return { ok: false, reason: "fetch_failed" };
  }

  const params = extractCommentParams(page.body);
  if (!params.ok) return params;
  const url = `${COMMENTS_URL}?sn=${encodeURIComponent(params.sn)}&cid=0&isInit=true&appver=900`;
  let response;
  try {
    response = await http.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        Accept: "application/json",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
  } catch (err) {
    mainLog.warn("[ithome/comment-fetcher] comments request failed", {
      id,
      msg: err && err.message,
    });
    return { ok: false, reason: "fetch_failed" };
  }
  if (!response || response.status !== 200 || !response.body) {
    return { ok: false, reason: "fetch_failed" };
  }

  const parsed = parseCommentResponse(response.body);
  if (!parsed.ok) return parsed;
  const saved = newsStore.attachArticleComments(id, parsed.comments, statePath);
  if (!saved.ok) return saved;
  return { ok: true, reason: "fetched", comments: parsed.comments };
}

module.exports = {
  COMMENTS_URL,
  fetchAndAttachComments,
};
```

- [ ] **Step 5: 运行主进程测试确认通过**

运行：

```bash
npx vitest run tests/main/ithome-comment-parser.test.js tests/main/ithome-comment-fetcher.test.js tests/main/ithome-news-store.test.js
```

预期：新增 parser/fetcher 测试和既有 news-store 测试全部 PASS。

- [ ] **Step 6: 做格式检查**

运行：

```bash
git diff --check -- src/main/ithome/comment-fetcher.js src/main/ithome/comment-parser.js src/main/ithome/news-store.js tests/main/ithome-comment-fetcher.test.js tests/main/ithome-comment-parser.test.js
```

预期：无输出、退出码为 0。

---

### Task 3: IPC 与 preload 桥接

**Files:**

- Create: `tests/main/ithome-ipc-contract.test.js`
- Modify: `src/main/ipc/register-ithome.js`
- Modify: `preload.js`

**Interfaces:**

- IPC channel：`ithome:fetch-comments`。
- Renderer 调用：`window.api.ithomeFetchComments({ id, force? })`。
- 返回值透传 `fetchAndAttachComments` 的 `{ ok, reason, comments }`，无需暴露 `statePath` 或 HTTP 实例。

- [ ] **Step 1: 写 IPC 契约测试**

在 `tests/main/ithome-ipc-contract.test.js` 中加入静态契约检查，不引入 Electron mock：

```js
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

const handlerSource = readFileSync(
  "src/main/ipc/register-ithome.js",
  "utf8",
);
const preloadSource = readFileSync("preload.js", "utf8");

describe("ithome comments IPC contract", () => {
  it("registers a comments handler and preload bridge", () => {
    expect(handlerSource).toContain('safeHandle("ithome:fetch-comments"');
    expect(preloadSource).toContain("ithomeFetchComments:");
    expect(preloadSource).toContain('ipcRenderer.invoke("ithome:fetch-comments"');
  });
});
```

若项目不希望新增静态契约测试，则直接以 renderer store 测试的 mock API 作为契约，保留以下实现和 Task 3 的命令验证。

- [ ] **Step 2: 接入 handler**

在 `register-ithome.js` 顶部引入 fetcher，并在 `ithome:fetch-day` 后注册：

```js
const { fetchAndAttachComments } = require("../ithome/comment-fetcher");

safeHandle("ithome:fetch-comments", async (_evt, payload) =>
  fetchAndAttachComments({ id: payload && payload.id }),
);
```

`force` 不在第一版传入；重试通过重新调用，fetcher 会在失败时不写缓存，因此自然重新请求。成功缓存不会被重复请求。

- [ ] **Step 3: 接入 preload**

在 IT之家新闻 bridge 中加入：

```js
ithomeFetchComments: (payload) =>
  ipcRenderer.invoke("ithome:fetch-comments", payload),
```

不要把 `ipcRenderer` 或主进程对象直接暴露给 renderer。

- [ ] **Step 4: 运行 IPC 契约检查和既有新闻测试**

运行：

```bash
npx vitest run tests/main/ithome-ipc-contract.test.js tests/main/ithome-news-store.test.js
```

预期：契约测试和 news-store 测试 PASS。

---

### Task 4: Renderer signal 与新闻卡片评论交互

**Files:**

- Modify: `src/renderer/ithome/store.js`
- Modify: `src/renderer/ithome/NewsArticleRow.jsx`
- Modify: `styles.css`
- Modify: `tests/renderer/ithome-news-store.test.js`
- Modify: `tests/renderer/ithome-news-article-row.test.jsx`

**Interfaces:**

- `ithomeComments`：signal，值为 `{ [articleId]: Comment[] }`，只包含已成功加载过的文章；空数组也必须保留 key。
- `fetchIthomeComments(id)`：返回 `{ ok, reason, comments }`；优先使用已缓存 signal，未命中时调用 `requireApiMethod("ithomeFetchComments")`。
- `NewsArticleRow` 本地状态：`commentsExpanded`、`commentsLoading`、`commentError`。

- [ ] **Step 1: 扩展 renderer store 测试 mock 和失败测试**

在 `tests/renderer/ithome-news-store.test.js` 的 hoisted mock 中加入 `mockFetchComments`，并增加以下测试：

```js
const mockFetchComments = vi.fn();

// requireApiMethod 分支中增加：
if (name === "ithomeFetchComments") return mockFetchComments;

// import 增加 ithomeComments、fetchIthomeComments。

describe("ithome comments", () => {
  beforeEach(() => {
    mockFetchComments.mockReset();
    ithomeComments.value = {};
  });

  it("calls IPC once and caches returned comments", async () => {
    const comments = [
      { id: "1", author: "用户", content: "内容", createdAt: "时间", likes: 3 },
    ];
    mockFetchComments.mockResolvedValue({ ok: true, comments });

    const result = await fetchIthomeComments("article-1");

    expect(result.comments).toEqual(comments);
    expect(mockFetchComments).toHaveBeenCalledWith({ id: "article-1" });
    expect(ithomeComments.value["article-1"]).toEqual(comments);
  });

  it("does not call IPC again after a successful empty result", async () => {
    mockFetchComments.mockResolvedValue({ ok: true, comments: [] });
    await fetchIthomeComments("article-empty");
    await fetchIthomeComments("article-empty");
    expect(mockFetchComments).toHaveBeenCalledTimes(1);
    expect(ithomeComments.value["article-empty"]).toEqual([]);
  });

  it("returns failure without changing cached comments", async () => {
    ithomeComments.value = { article-1: [{ id: "old" }] };
    mockFetchComments.mockResolvedValue({ ok: false, reason: "fetch_failed" });

    const result = await fetchIthomeComments("article-1");

    expect(result.ok).toBe(false);
    expect(ithomeComments.value["article-1"]).toEqual([{ id: "old" }]);
  });
});
```

将 object key 写法修正为合法 JavaScript（`{"article-1": ...}`），再运行测试，避免测试自身语法错误。

- [ ] **Step 2: 运行 store 测试确认先失败**

运行：

```bash
npx vitest run tests/renderer/ithome-news-store.test.js
```

预期：FAIL，原因是 `ithomeComments` 和 `fetchIthomeComments` 尚未导出。

- [ ] **Step 3: 实现 store signal 和缓存调用**

在 `store.js` 增加 signal，并在 `_applyPayload` 中从 article/favorite snapshot 恢复已成功缓存的评论：

```js
export const ithomeComments = signal({});

function _applyPayload(data) {
  if (!data) return;
  // 保留原有 articles/dayStats/summaries/favorites/readIds/newIds 逻辑。
  const nextComments = {};
  for (const [id, article] of Object.entries(data.articles || {})) {
    if (article && Number.isFinite(article.commentsFetchedAt)) {
      nextComments[id] = Array.isArray(article.comments) ? article.comments : [];
    }
  }
  for (const [id, favorite] of Object.entries(data.favorites || {})) {
    const article = favorite && favorite.article;
    if (!Object.prototype.hasOwnProperty.call(nextComments, id) &&
        article && Number.isFinite(article.commentsFetchedAt)) {
      nextComments[id] = Array.isArray(article.comments) ? article.comments : [];
    }
  }
  ithomeComments.value = nextComments;
  // 其余原有逻辑继续执行。
}

export async function fetchIthomeComments(id) {
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  if (Object.prototype.hasOwnProperty.call(ithomeComments.value, id)) {
    return { ok: true, reason: "already_loaded", comments: ithomeComments.value[id] };
  }
  const fetchComments = requireApiMethod("ithomeFetchComments");
  if (!fetchComments) return { ok: false, reason: "ipc_unavailable" };
  const result = await fetchComments({ id });
  if (result && result.ok) {
    ithomeComments.value = {
      ...ithomeComments.value,
      [id]: Array.isArray(result.comments) ? result.comments : [],
    };
  }
  return result || { ok: false, reason: "fetch_failed" };
}
```

在已有 `_applyPayload` 的原有赋值逻辑中保留 `ithomeComments` 更新，不要让 `loadIthomeNews` 把评论 signal 清空为未缓存状态。

- [ ] **Step 4: 运行 store 测试确认通过**

运行：

```bash
npx vitest run tests/renderer/ithome-news-store.test.js
```

预期：全部 PASS。

- [ ] **Step 5: 写 NewsArticleRow 交互测试**

在现有 renderer mock 中加入 `mockComments`、`mockFetchComments`，并覆盖成功、空评论、失败重试和展开收起：

```jsx
it("点击查看评论后加载并展示热门评论", async () => {
  mockComments.value = {};
  mockFetchComments.mockResolvedValue({
    ok: true,
    comments: [
      {
        id: "1",
        author: "用户 A",
        content: "这是一条热门评论",
        createdAt: "2026-07-18T10:00:00+08:00",
        likes: 8,
      },
    ],
  });
  const { getByRole, getByText } = render(<NewsArticleRow article={makeArticle()} />);

  await act(async () => {
    fireEvent.click(getByRole("button", { name: /查看评论/ }));
  });

  expect(mockFetchComments).toHaveBeenCalledWith(makeArticle().id);
  expect(getByText("用户 A")).toBeTruthy();
  expect(getByText("这是一条热门评论")).toBeTruthy();
  expect(getByText(/支持 8/)).toBeTruthy();
});

it("评论失败后显示重试，重试成功后渲染评论", async () => {
  mockComments.value = {};
  mockFetchComments
    .mockResolvedValueOnce({ ok: false, reason: "fetch_failed" })
    .mockResolvedValueOnce({
      ok: true,
      comments: [{ id: "2", author: "用户 B", content: "重试成功", createdAt: "", likes: 0 }],
    });
  const { getByRole, getByText } = render(<NewsArticleRow article={makeArticle()} />);

  await act(async () => {
    fireEvent.click(getByRole("button", { name: /查看评论/ }));
  });
  expect(getByText("评论暂时无法加载")).toBeTruthy();

  await act(async () => {
    fireEvent.click(getByRole("button", { name: /重试/ }));
  });
  expect(getByText("重试成功")).toBeTruthy();
});

it("没有评论时显示明确的空状态", async () => {
  mockComments.value = {};
  mockFetchComments.mockResolvedValue({ ok: true, comments: [] });
  const { getByRole, getByText } = render(<NewsArticleRow article={makeArticle()} />);
  await act(async () => {
    fireEvent.click(getByRole("button", { name: /查看评论/ }));
  });
  expect(getByText("暂无热门评论")).toBeTruthy();
});
```

测试中对 `makeArticle()` 生成的 id 要先保存为变量，确保 mock 断言和渲染使用同一个对象 id。

- [ ] **Step 6: 修改 NewsArticleRow**

增加从 store 导入 `ithomeComments` 和 `fetchIthomeComments`，使用独立的评论展开状态，不复用 AI 的 `expanded`，避免评论和摘要相互收起。核心交互保持以下结构：

```jsx
const [commentsExpanded, setCommentsExpanded] = useState(false);
const [commentsLoading, setCommentsLoading] = useState(false);
const [commentError, setCommentError] = useState(null);

const cachedComments = ithomeComments.value[article.id];
const hasCachedComments = Object.prototype.hasOwnProperty.call(
  ithomeComments.value,
  article.id,
);

async function handleComments() {
  if (commentsLoading) return;
  if (commentsExpanded && hasCachedComments) {
    setCommentsExpanded(false);
    return;
  }
  setCommentsExpanded(true);
  if (hasCachedComments) return;
  setCommentError(null);
  setCommentsLoading(true);
  try {
    const result = await fetchIthomeComments(article.id);
    if (!result || !result.ok) {
      setCommentError("评论暂时无法加载");
    }
  } finally {
    setCommentsLoading(false);
  }
}
```

在现有 `.ithome-row-foot` 中新增按钮：

```jsx
<button
  type="button"
  class="ithome-row-link ithome-row-link--muted ithome-row-comments-trigger"
  onClick={handleComments}
  disabled={commentsLoading}
  aria-expanded={commentsExpanded}
>
  {commentsLoading ? "评论加载中…" : commentsExpanded ? "收起评论" : "查看评论"}
</button>
```

在 AI 摘要区域后渲染评论：

```jsx
{commentsExpanded && (
  <div class="ithome-row-comments" aria-live="polite">
    {commentsLoading && <p class="ithome-row-comments-status">正在加载评论…</p>}
    {!commentsLoading && commentError && (
      <div class="ithome-row-comments-status is-error">
        <span>评论暂时无法加载</span>
        <button type="button" onClick={handleComments}>重试</button>
      </div>
    )}
    {!commentsLoading && !commentError && hasCachedComments &&
      (cachedComments.length === 0 ? (
        <p class="ithome-row-comments-status">暂无热门评论</p>
      ) : (
        <ol class="ithome-comment-list">
          {cachedComments.map((comment) => (
            <li key={comment.id} class="ithome-comment-item">
              <div class="ithome-comment-meta">
                <strong>{comment.author}</strong>
                {comment.createdAt && <time>{comment.createdAt}</time>}
                {comment.likes > 0 && <span>支持 {comment.likes}</span>}
              </div>
              <p>{comment.content}</p>
            </li>
          ))}
        </ol>
      ))}
  </div>
)}
```

评论内容使用 JSX 文本节点渲染，不能使用 `dangerouslySetInnerHTML`。

- [ ] **Step 7: 增加最小 CSS**

在现有 `.ithome-row-summary` 相关样式附近加入，不引入新颜色体系：

```css
.ithome-row-comments {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.ithome-row-comments-status {
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.ithome-row-comments-status.is-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--accent-red);
}

.ithome-row-comments-status button {
  border: 0;
  background: none;
  color: var(--accent-primary);
  cursor: pointer;
  font-size: inherit;
  padding: 0;
}

.ithome-comment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
}

.ithome-comment-item {
  padding: 8px 10px;
  border-radius: 7px;
  background: color-mix(in oklch, var(--accent-primary) 4%, transparent);
}

.ithome-comment-meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
}

.ithome-comment-meta strong {
  color: var(--text-secondary);
}

.ithome-comment-item p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 8: 运行 renderer 聚焦测试**

运行：

```bash
npx vitest run tests/renderer/ithome-news-store.test.js tests/renderer/ithome-news-article-row.test.jsx tests/renderer/ithome-news-utils.test.js
```

预期：评论新增用例和既有 AI、已读、新文章、分享用例全部 PASS。

- [ ] **Step 9: 检查修改文件 lint**

运行：

```bash
npx eslint src/renderer/ithome/store.js src/renderer/ithome/NewsArticleRow.jsx
```

如果项目没有 eslint 配置或命令不可用，则使用：

```bash
npx vitest run tests/renderer/ithome-news-store.test.js tests/renderer/ithome-news-article-row.test.jsx
```

并通过 `ReadLints` 检查两个已编辑 JSX/JS 文件；只修复本次引入的错误。

---

### Task 5: 集成验证与边界检查

**Files:**

- Verify: `src/main/ithome/comment-parser.js`
- Verify: `src/main/ithome/comment-fetcher.js`
- Verify: `src/main/ithome/news-store.js`
- Verify: `src/main/ipc/register-ithome.js`
- Verify: `preload.js`
- Verify: `src/renderer/ithome/store.js`
- Verify: `src/renderer/ithome/NewsArticleRow.jsx`
- Verify: `styles.css`

- [ ] **Step 1: 运行全部 IT 新闻相关测试**

运行：

```bash
npx vitest run tests/main/ithome-*.test.js tests/renderer/ithome-*.test.js
```

预期：所有 IT 新闻主进程和 renderer 测试 PASS。

- [ ] **Step 2: 运行完整测试集**

运行：

```bash
npm test -- --run
```

预期：完整 Vitest 测试集 PASS；若仓库中存在与本次改动无关的既有失败，只记录失败文件和原因，不扩大修改范围。

- [ ] **Step 3: 构建 renderer**

运行：

```bash
npm run build:renderer
```

预期：esbuild 成功生成 renderer bundle，退出码为 0。

- [ ] **Step 4: 检查最终 diff 边界**

运行：

```bash
git diff --check
git status --short
```

预期：只有本计划列出的评论相关文件新增/修改，以及规格/计划文档；当前未提交的 `src/renderer/games/*` 文件保持原状，不被格式化或重写。

- [ ] **Step 5: 进行一次手动交互验证**

启动：

```bash
npm start
```

验证：

1. 打开 IT 新闻页，确认初始不请求评论接口。
2. 点击一篇文章的“查看评论”，确认显示加载态后出现评论或明确空状态。
3. 再次点击确认收起，再点击确认展开时不重复请求。
4. 使用失败 fixture 或断网场景确认显示“评论暂时无法加载”和“重试”，正文/AI 摘要/原文按钮仍可用。
5. 收藏已加载评论的文章，重新加载新闻后确认评论仍在收藏快照中。

手动验证完成后不要提交 git commit，向用户报告测试结果和 live 评论接口是否可用。

## Self-Review Checklist

- 规格中的按需加载、最多 20 条、仅主评论、只读、缓存、失败降级和收藏快照分别由 Task 2、Task 3、Task 4、Task 5 覆盖。
- `extractCommentParams`、`parseCommentResponse`、`fetchAndAttachComments`、`attachArticleComments`、`fetchIthomeComments` 的名称和返回字段在任务之间一致。
- 解析失败不会调用 `attachArticleComments`，因此不会覆盖已有成功评论；成功空数组会写入 `commentsFetchedAt`，因此不会重复请求。
- 不新增依赖，不使用 inline import，不执行未获用户请求的 git commit。
- 未引入 TypeScript union/switch，因此没有 exhaustive switch 约束需要处理。
