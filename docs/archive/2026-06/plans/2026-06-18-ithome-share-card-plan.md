# IT 新闻「分享卡片」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 IT 新闻卡片 AI 总结完成后,新增「📤 分享」按钮,将整张卡片(标题+摘要+关键词)渲染为 1080×1080 PNG 并写入系统剪贴板,用户 ⌘V 粘贴。

**Architecture:** 主进程创建隐藏 BrowserWindow → 加载独立的 `share-card.html` (引用 `news-share-card.bundle.js`) → Preact 渲染 `<NewsShareCard>` 视觉卡片 → `webContents.capturePage()` → `nativeImage.toPNG()` → `clipboard.writeImage` → 返回 `{ ok, bytes }`。零新增 npm 依赖。

**Tech Stack:** Electron 35 · Preact 10 · @preact/signals · esbuild · happy-dom · vitest

**Spec:** `docs/superpowers/specs/2026-06-18-ithome-share-card-design.md`

---

## File Structure

| 路径 | 操作 | 职责 |
|------|------|------|
| `src/renderer/ithome/NewsShareCard.jsx` | new | 纯展示 Preact 组件(1080×1080 视觉) |
| `src/renderer/ithome/NewsShareCardPage.jsx` | new | 离屏页面入口,监听 IPC,管理 `__renderReady` |
| `src/renderer/ithome/NewsShareToast.jsx` | new | 轻量 toast 组件(success/error 3s 自动消失) |
| `share-card.html` | new | 离屏渲染 HTML 入口(引 bundle + styles.css) |
| `src/main/ithome/share-card-renderer.js` | new | `createShareCardPng({ article, summary }) → Buffer` |
| `src/main/ithome/clipboard-image.js` | new | `writePngToClipboard(buffer) → void` |
| `src/main/ipc/register-ithome-share.js` | new | IPC handler `ithome:share-card` |
| `src/main/ipc/index.js` | edit | 注册 share handler |
| `src/renderer/ithome/store.js` | edit | 新增 `sharingIds` signal + `shareIthomeArticle(id)` |
| `src/renderer/ithome/NewsArticleRow.jsx` | edit | 渲染分享按钮 + toast |
| `preload.js` | edit | 暴露 `ithomeShareCard` |
| `styles.css` | edit | `.share-card-*` + `.news-share-toast-*` |
| `package.json` | edit | `build:renderer` 多 entry;`build.files` 包含新文件 |
| `tests/renderer/ithome-news-share-card.test.jsx` | new | 5 case |
| `tests/renderer/ithome-news-article-row.test.jsx` | edit | +5 case |
| `tests/renderer/ithome-news-store.test.js` | edit | +2 case |
| `tests/main/ithome-share-card-renderer.test.js` | new | 3 case |

**TDD 原则:** 每个 Task 先写测试 → 跑 fail → 实现 → 跑 pass → 提交。

**Frequent commits:** 每个 Task 完成后 `git commit`。

---

## Task 1: NewsShareCard 组件 + 样式 (TDD)

**Files:**
- Create: `src/renderer/ithome/NewsShareCard.jsx`
- Create: `tests/renderer/ithome-news-share-card.test.jsx`
- Modify: `styles.css` (在文件末尾追加 `.share-card-*` 段)

- [ ] **Step 1: 写失败测试**

写 `tests/renderer/ithome-news-share-card.test.jsx`:

```jsx
/**
 * tests/renderer/ithome-news-share-card.test.jsx
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/preact";
import { NewsShareCard } from "../../src/renderer/ithome/NewsShareCard.jsx";
import { normalizeArticleSummary } from "../../src/renderer/ithome/NewsArticleSummary.jsx";

describe("NewsShareCard", () => {
  it("renders all sections with valid article and summary", () => {
    const article = {
      id: "a1",
      title: "Claude 4.5 发布,编程能力大幅提升",
      link: "https://ithome.com/0/123/123.htm",
      category: "科技",
      pubDate: "2026-06-17T14:30:00+08:00",
    };
    const summary = {
      text: "Anthropic 正式发布 Claude 4.5,大幅提升 SWE-bench 表现。",
      keywords: ["AI", "Claude", "编程"],
    };
    const { container } = render(
      <NewsShareCard article={article} summary={summary} />,
    );
    expect(container.querySelector(".share-card")).toBeTruthy();
    expect(container.querySelector(".share-card-source").textContent).toContain("IT之家");
    expect(container.querySelector(".share-card-time").textContent).toContain("06-17");
    expect(container.querySelector(".share-card-title").textContent).toBe(article.title);
    expect(container.querySelector(".share-card-summary-text").textContent).toContain("Anthropic");
    const chips = container.querySelectorAll(".share-card-keyword");
    expect(chips).toHaveLength(3);
    expect(container.querySelector(".share-card-watermark").textContent).toContain("Pulse");
  });

  it("truncates summary text longer than 300 chars", () => {
    const longText = "啊".repeat(400);
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ text: longText, keywords: [] }}
      />,
    );
    const text = container.querySelector(".share-card-summary-text").textContent;
    expect(text.length).toBeLessThanOrEqual(301); // 300 + "..."
    expect(text.endsWith("...")).toBe(true);
  });

  it("caps keywords at 5", () => {
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ text: "ok", keywords: ["a","b","c","d","e","f","g"] }}
      />,
    );
    expect(container.querySelectorAll(".share-card-keyword")).toHaveLength(5);
  });

  it("renders all keywords when 3 or fewer", () => {
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ text: "ok", keywords: ["a","b","c"] }}
      />,
    );
    expect(container.querySelectorAll(".share-card-keyword")).toHaveLength(3);
  });

  it("skips summary section when summary.text is empty", () => {
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ text: "", keywords: [] }}
      />,
    );
    expect(container.querySelector(".share-card-summary")).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/ithome-news-share-card.test.jsx`
Expected: FAIL with "Cannot find module '../../src/renderer/ithome/NewsShareCard.jsx'"

- [ ] **Step 3: 实现 NewsShareCard 组件**

写 `src/renderer/ithome/NewsShareCard.jsx`:

```jsx
/**
 * src/renderer/ithome/NewsShareCard.jsx
 *
 * 分享卡片 Preact 组件 — 1080×1080 视觉卡片,纯展示,无副作用。
 * Props: { article, summary }
 */
import { normalizeArticleSummary } from "./NewsArticleSummary.jsx";
import { formatArticleTime } from "./news-utils.js";

const MAX_SUMMARY_CHARS = 300;
const MAX_KEYWORDS = 5;

function truncate(text, max) {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

export function NewsShareCard({ article, summary }) {
  if (!article) return null;
  const fields = normalizeArticleSummary(summary);
  const text = (summary && summary.text) || fields.abstract || "";
  const truncated = truncate(text, MAX_SUMMARY_CHARS);
  const keywords = (fields.keywords || []).slice(0, MAX_KEYWORDS);
  const timeLabel = formatArticleTime(article.pubDate);

  return (
    <div class="share-card" data-testid="share-card">
      <div class="share-card-meta">
        <span class="share-card-source">IT之家</span>
        {article.category && (
          <span class="share-card-tag">{article.category}</span>
        )}
        {timeLabel && <span class="share-card-time">{timeLabel}</span>}
      </div>

      <h1 class="share-card-title">{article.title}</h1>

      {truncated && (
        <div class="share-card-summary">
          <p class="share-card-summary-text">{truncated}</p>
        </div>
      )}

      {keywords.length > 0 && (
        <div class="share-card-keywords">
          {keywords.map((kw) => (
            <span key={kw} class="share-card-keyword">#{kw}</span>
          ))}
        </div>
      )}

      <div class="share-card-watermark">◆ Pulse · IT之家新闻速读</div>
    </div>
  );
}

export default NewsShareCard;
```

- [ ] **Step 4: 加 CSS 样式**

在 `styles.css` 末尾追加:

```css
/* ==========================================================================
   Share Card (1080x1080 PNG)
   ========================================================================== */
.share-card {
  width: 1080px;
  height: 1080px;
  box-sizing: border-box;
  padding: 40px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #1e1b4b 0%, #7c3aed 100%);
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

.share-card-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 22px;
  margin-bottom: 32px;
}

.share-card-source,
.share-card-tag {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  padding: 4px 12px;
}

.share-card-time {
  margin-left: auto;
  opacity: 0.85;
}

.share-card-title {
  font-size: 56px;
  font-weight: 700;
  line-height: 1.2;
  margin: 0 0 32px 0;
  word-break: break-word;
}

.share-card-summary {
  background: rgba(255, 255, 255, 0.92);
  color: #1f2937;
  border-radius: 16px;
  padding: 40px;
  margin-bottom: 28px;
  flex: 1 1 auto;
  overflow: hidden;
}

.share-card-summary-text {
  font-size: 24px;
  line-height: 1.6;
  margin: 0;
  word-break: break-word;
}

.share-card-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
}

.share-card-keyword {
  background: #7c3aed;
  color: #ffffff;
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 22px;
}

.share-card-watermark {
  margin-top: auto;
  font-size: 20px;
  opacity: 0.6;
  text-align: right;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/renderer/ithome-news-share-card.test.jsx`
Expected: 5 passed

- [ ] **Step 6: 提交**

```bash
git add src/renderer/ithome/NewsShareCard.jsx tests/renderer/ithome-news-share-card.test.jsx styles.css
git commit -m "feat(ithome): add NewsShareCard 1080x1080 visual component"
```

---

## Task 2: NewsShareCardPage (离屏页面入口)

**Files:**
- Create: `src/renderer/ithome/NewsShareCardPage.jsx`
- Create: `share-card.html`
- Modify: `package.json` (build:renderer 多 entry + build.files)

- [ ] **Step 1: 写 share-card.html**

写 `share-card.html` (在项目根):

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Pulse Share Card</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self';" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="renderer-dist/news-share-card.bundle.js"></script>
  </body>
</html>
```

- [ ] **Step 2: 实现 NewsShareCardPage**

写 `src/renderer/ithome/NewsShareCardPage.jsx`:

```jsx
/**
 * src/renderer/ithome/NewsShareCardPage.jsx
 *
 * 离屏渲染入口 — 监听主进程 IPC 发送的 share-data,挂载 <NewsShareCard>。
 * 渲染完成后设置 window.__renderReady = true 供主进程轮询。
 */
import { render } from "preact";
import { NewsShareCard } from "./NewsShareCard.jsx";

function mount(article, summary) {
  const root = document.getElementById("root");
  if (!root) return;
  render(<NewsShareCard article={article} summary={summary} />, root);
  // 两帧后标记 ready,确保 layout/paint 完成
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__renderReady = true;
    });
  });
}

// 监听主进程注入
if (typeof window !== "undefined" && window.electronIpc) {
  window.electronIpc.on("share-data", (_evt, payload) => {
    if (payload && payload.article) {
      mount(payload.article, payload.summary || {});
    }
  });
}

// 兜底:若 30s 内未收到数据,标记失败
setTimeout(() => {
  if (!window.__renderReady) {
    window.__renderReady = false;
  }
}, 30000);
```

- [ ] **Step 3: 更新 package.json build script**

修改 `package.json` 的 `build:renderer` script,在现有 esbuild 命令后追加新 entry:

```json
"build:renderer": "esbuild src/renderer/index.jsx --bundle --format=iife --outfile=renderer-dist/renderer.bundle.js --loader:.jsx=jsx --jsx=automatic --jsx-import-source=preact --target=es2020 --define:process.env.NODE_ENV=\"production\" && esbuild src/renderer/ithome/NewsShareCardPage.jsx --bundle --format=iife --outfile=renderer-dist/news-share-card.bundle.js --loader:.jsx=jsx --jsx=automatic --jsx-import-source=preact --target=es2020 --define:process.env.NODE_ENV=\"production\""
```

并在 `build.files` 中追加:
```json
"share-card.html",
"renderer-dist/news-share-card.bundle.js"
```

- [ ] **Step 4: 跑 build 验证**

Run: `npm run build:renderer`
Expected: 生成 `renderer-dist/news-share-card.bundle.js`,无报错。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/ithome/NewsShareCardPage.jsx share-card.html package.json
git commit -m "feat(ithome): add share-card.html entry + esbuild config"
```

---

## Task 3: 主进程 share-card-renderer (核心)

**Files:**
- Create: `src/main/ithome/share-card-renderer.js`
- Create: `tests/main/ithome-share-card-renderer.test.js`

- [ ] **Step 1: 写失败测试**

写 `tests/main/ithome-share-card-renderer.test.js`:

```js
/**
 * tests/main/ithome-share-card-renderer.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDestroy = vi.fn();
const mockLoadFile = vi.fn();
const mockSend = vi.fn();
const mockCapturePage = vi.fn();
const mockExecuteJavaScript = vi.fn();

const mockWebContents = {
  send: mockSend,
  executeJavaScript: mockExecuteJavaScript,
  capturePage: mockCapturePage,
};

const mockWindow = {
  webContents: mockWebContents,
  destroy: mockDestroy,
  isDestroyed: () => false,
};

vi.mock("electron", () => ({
  BrowserWindow: vi.fn(() => mockWindow),
  app: { getAppPath: () => "/tmp/pulse" },
}));

const { createShareCardPng } = await import(
  "../../src/main/ithome/share-card-renderer.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadFile.mockResolvedValue(undefined);
  mockWindow.destroy = mockDestroy;
});

describe("createShareCardPng", () => {
  it("returns PNG buffer on success", async () => {
    const fakeImage = { toPNG: () => Buffer.from("png-bytes") };
    mockExecuteJavaScript.mockResolvedValue(true);
    mockCapturePage.mockResolvedValue(fakeImage);

    const buf = await createShareCardPng({
      article: { id: "a1", title: "t" },
      summary: { text: "s" },
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString()).toBe("png-bytes");
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("throws render_timeout when __renderReady never becomes true", async () => {
    mockExecuteJavaScript.mockResolvedValue(false);

    await expect(
      createShareCardPng(
        { article: { id: "a1" }, summary: { text: "s" } },
        { timeoutMs: 200 },
      ),
    ).rejects.toThrow("render_timeout");
    expect(mockDestroy).toHaveBeenCalled();
  });

  it("throws when capturePage returns empty", async () => {
    mockExecuteJavaScript.mockResolvedValue(true);
    mockCapturePage.mockResolvedValue(null);

    await expect(
      createShareCardPng(
        { article: { id: "a1" }, summary: { text: "s" } },
        { timeoutMs: 200 },
      ),
    ).rejects.toThrow("capture_empty");
    expect(mockDestroy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/ithome-share-card-renderer.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: 实现 share-card-renderer**

写 `src/main/ithome/share-card-renderer.js`:

```js
/**
 * src/main/ithome/share-card-renderer.js
 *
 * 离屏渲染分享卡片为 PNG。
 * createShareCardPng({ article, summary, timeoutMs? }) → Promise<Buffer>
 */
const { BrowserWindow, app } = require("electron");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 10000;
const WINDOW_WIDTH = 1080;
const WINDOW_HEIGHT = 1080;

function _timeoutPromise(ms, message) {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

async function createShareCardPng(payload, opts = {}) {
  const { article, summary } = payload || {};
  if (!article) throw new Error("article_required");
  if (!summary || !summary.text) throw new Error("summary_required");

  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const win = new BrowserWindow({
    show: false,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      zoomFactor: 1,
    },
  });

  try {
    const htmlPath = path.join(app.getAppPath(), "share-card.html");
    await win.loadFile(htmlPath);
    win.webContents.send("share-data", { article, summary });

    // 等 __renderReady
    const ready = await Promise.race([
      win.webContents.executeJavaScript("window.__renderReady === true"),
      _timeoutPromise(timeoutMs, "render_timeout"),
    ]);
    if (!ready) throw new Error("render_timeout");

    // 留一帧 paint
    await new Promise((r) => setTimeout(r, 100));

    const image = await win.webContents.capturePage();
    if (!image) throw new Error("capture_empty");
    const buf = image.toPNG();
    if (!buf || buf.length === 0) throw new Error("capture_empty");
    return buf;
  } finally {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch {
      /* ignore */
    }
  }
}

module.exports = { createShareCardPng };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/ithome-share-card-renderer.test.js`
Expected: 3 passed

- [ ] **Step 5: 提交**

```bash
git add src/main/ithome/share-card-renderer.js tests/main/ithome-share-card-renderer.test.js
git commit -m "feat(ithome): add off-screen BrowserWindow PNG renderer"
```

---

## Task 4: clipboard-image 封装

**Files:**
- Create: `src/main/ithome/clipboard-image.js`

- [ ] **Step 1: 实现**

写 `src/main/ithome/clipboard-image.js`:

```js
/**
 * src/main/ithome/clipboard-image.js
 *
 * 封装 Electron clipboard.writeImage,nativeImage.createFromBuffer 的薄层。
 */
const { clipboard, nativeImage } = require("electron");

function writePngToClipboard(pngBuffer) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
    throw new Error("invalid_png_buffer");
  }
  const img = nativeImage.createFromBuffer(pngBuffer);
  if (img.isEmpty()) throw new Error("native_image_empty");
  clipboard.writeImage(img);
}

module.exports = { writePngToClipboard };
```

- [ ] **Step 2: 提交**

```bash
git add src/main/ithome/clipboard-image.js
git commit -m "feat(ithome): add clipboard image writer"
```

---

## Task 5: IPC handler + preload

**Files:**
- Create: `src/main/ipc/register-ithome-share.js`
- Modify: `src/main/ipc/index.js`
- Modify: `preload.js`

- [ ] **Step 1: 实现 register-ithome-share.js**

写 `src/main/ipc/register-ithome-share.js`:

```js
/**
 * src/main/ipc/register-ithome-share.js
 *
 * IPC handler: ithome:share-card
 * 入参: { id }
 * 出参: { ok: true, bytes } | { ok: false, reason }
 */
const newsStore = require("../ithome/news-store");
const { createShareCardPng } = require("../ithome/share-card-renderer");
const { writePngToClipboard } = require("../ithome/clipboard-image");
const { mainLog } = require("../log");

function registerIthomeShareHandlers(ctx) {
  const { safeHandle } = ctx;

  safeHandle("ithome:share-card", async (_evt, payload) => {
    const id = payload && payload.id;
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }

    const article = newsStore.getArticle(id);
    if (!article) return { ok: false, reason: "article_not_found" };

    // summary 存在 newsStore.ithome_news.summaries
    const all = newsStore.loadAll();
    const summary = all.summaries && all.summaries[id];
    if (!summary || !summary.text) {
      return { ok: false, reason: "no_summary" };
    }

    try {
      const pngBuffer = await createShareCardPng({ article, summary });
      writePngToClipboard(pngBuffer);
      return { ok: true, bytes: pngBuffer.length };
    } catch (err) {
      mainLog.warn("[ithome:share-card] failed", {
        id,
        msg: err && err.message,
      });
      return { ok: false, reason: "render_failed", error: err && err.message };
    }
  });
}

module.exports = { registerIthomeShareHandlers };
```

- [ ] **Step 2: 注册到 index.js**

修改 `src/main/ipc/index.js`,在文件顶部添加 require,在 `registerIpcHandlers` 内调用:

```js
const { registerIthomeShareHandlers } = require("./register-ithome-share");
// ...
function registerIpcHandlers(deps) {
  const ctx = createIpcContext(deps);
  // ...
  registerIthomeShareHandlers(ctx);
  // ...
}
```

- [ ] **Step 3: 暴露 preload API**

修改 `preload.js`,在 `ithome` 命名空间下加(若不存在 `ithome` 命名空间,先找到合适位置添加):

```js
ithome: {
  // ...existing methods...
  shareCard: (id) => ipcRenderer.invoke("ithome:share-card", { id }),
},
```

具体看 `preload.js` 现有结构,保持风格一致。

- [ ] **Step 4: 提交**

```bash
git add src/main/ipc/register-ithome-share.js src/main/ipc/index.js preload.js
git commit -m "feat(ithome): register share-card IPC + preload exposure"
```

---

## Task 6: renderer store — sharingIds + shareIthomeArticle (TDD)

**Files:**
- Modify: `src/renderer/ithome/store.js`
- Modify: `tests/renderer/ithome-news-store.test.js`

- [ ] **Step 1: 找现有 store 测试,看 setup 风格**

Run: `head -30 tests/renderer/ithome-news-store.test.js`

- [ ] **Step 2: 写失败测试**

在 `tests/renderer/ithome-news-store.test.js` 末尾追加:

```js
describe("shareIthomeArticle", () => {
  it("sets sharingIds[id]=true synchronously, clears on success", async () => {
    const before = ithomeSharingIds.value;
    expect(before["a1"]).toBeFalsy();

    const p = shareIthomeArticle("a1");
    expect(ithomeSharingIds.value["a1"]).toBe(true);

    // mock API returns ok
    const r = await p;
    expect(r.ok).toBe(true);
    expect(ithomeSharingIds.value["a1"]).toBeFalsy();
  });

  it("clears sharingIds on failure", async () => {
    window.api.ithomeShareCard = vi.fn().mockResolvedValue({ ok: false, reason: "no_summary" });
    const p = shareIthomeArticle("a2");
    expect(ithomeSharingIds.value["a2"]).toBe(true);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(ithomeSharingIds.value["a2"]).toBeFalsy();
  });
});
```

(测试顶部需要 import 新的 signal/函数)

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/renderer/ithome-news-store.test.js`
Expected: FAIL (ithomeSharingIds is not defined)

- [ ] **Step 4: 在 store.js 顶部加 signal + 加函数**

修改 `src/renderer/ithome/store.js`:

1. 在已有 signal 声明区追加:
```js
export const ithomeSharingIds = signal({});
```

2. 在文件末尾(`bootstrapIthomeTab` 之后)加:
```js
export async function shareIthomeArticle(id) {
  if (!id) return { ok: false, reason: "invalid_args" };
  // 乐观锁
  ithomeSharingIds.value = { ...ithomeSharingIds.value, [id]: true };
  const shareCard = requireApiMethod("ithomeShareCard");
  if (!shareCard) {
    ithomeSharingIds.value = { ...ithomeSharingIds.value, [id]: false };
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await shareCard(id);
    return r || { ok: false, reason: "unknown" };
  } catch (err) {
    return { ok: false, reason: "threw", error: err && err.message };
  } finally {
    const next = { ...ithomeSharingIds.value };
    delete next[id];
    ithomeSharingIds.value = next;
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/renderer/ithome-news-store.test.js`
Expected: 全部 passed(原有 + 新增 2)

- [ ] **Step 6: 提交**

```bash
git add src/renderer/ithome/store.js tests/renderer/ithome-news-store.test.js
git commit -m "feat(ithome): add sharingIds signal + shareIthomeArticle action"
```

---

## Task 7: NewsShareToast 组件

**Files:**
- Create: `src/renderer/ithome/NewsShareToast.jsx`
- Modify: `styles.css` (在文件末尾追加 `.news-share-toast-*` 段)

- [ ] **Step 1: 实现**

写 `src/renderer/ithome/NewsShareToast.jsx`:

```jsx
/**
 * src/renderer/ithome/NewsShareToast.jsx
 *
 * 轻量 toast — 显示 3s 自动消失。Mount 在 NewsArticleRow 内。
 */
import { useEffect, useState } from "preact/hooks";

export function NewsShareToast({ message, kind = "success", onDone }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      if (onDone) onDone();
    }, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!visible) return null;
  return (
    <div
      class={`news-share-toast news-share-toast--${kind}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export default NewsShareToast;
```

- [ ] **Step 2: 加 CSS**

在 `styles.css` 末尾追加:

```css
/* ==========================================================================
   News Share Toast
   ========================================================================== */
.news-share-toast {
  margin-top: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.4;
  animation: news-share-toast-in 0.18s ease-out;
}

.news-share-toast--success {
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.news-share-toast--error {
  background: rgba(239, 68, 68, 0.12);
  color: #991b1b;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

@keyframes news-share-toast-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/renderer/ithome/NewsShareToast.jsx styles.css
git commit -m "feat(ithome): add NewsShareToast component"
```

---

## Task 8: NewsArticleRow 接入分享按钮 (TDD)

**Files:**
- Modify: `src/renderer/ithome/NewsArticleRow.jsx`
- Modify: `tests/renderer/ithome-news-article-row.test.jsx`

- [ ] **Step 1: 看现有 row 测试 setup**

Run: `head -50 tests/renderer/ithome-news-article-row.test.jsx`

- [ ] **Step 2: 写失败测试 (5 case)**

在 `tests/renderer/ithome-news-article-row.test.jsx` 末尾追加:

```jsx
describe("Share button", () => {
  const baseArticle = {
    id: "s1",
    title: "Test",
    pubDate: "2026-06-17T10:00:00+08:00",
    link: "https://x",
  };

  it("renders share button only when summary.text is present", () => {
    // (use the existing render helper — adjust to match the test file)
    const { rerender } = render(<NewsArticleRow article={baseArticle} />);
    expect(screen.queryByText(/分享/)).toBeNull();

    ithomeSummaries.value = { s1: { text: "sum", keywords: [] } };
    rerender(<NewsArticleRow article={baseArticle} />);
    expect(screen.queryByText(/分享/)).toBeTruthy();
  });

  it("disables button + shows progress label during sharing", async () => {
    ithomeSummaries.value = { s1: { text: "sum", keywords: [] } };
    ithomeSharingIds.value = { s1: true };
    render(<NewsArticleRow article={baseArticle} />);
    const btn = screen.getByText(/生成图片中/);
    expect(btn).toBeDisabled();
  });

  it("click calls shareIthomeArticle and shows success toast", async () => {
    ithomeSummaries.value = { s1: { text: "sum", keywords: [] } };
    window.api.ithomeShareCard = vi.fn().mockResolvedValue({ ok: true, bytes: 1234 });
    render(<NewsArticleRow article={baseArticle} />);
    fireEvent.click(screen.getByText(/分享/));
    await waitFor(() =>
      expect(screen.getByText(/已复制到剪贴板/)).toBeTruthy(),
    );
  });

  it("click + IPC failure shows error toast", async () => {
    ithomeSummaries.value = { s1: { text: "sum", keywords: [] } };
    window.api.ithomeShareCard = vi.fn().mockResolvedValue({ ok: false, reason: "render_failed" });
    render(<NewsArticleRow article={baseArticle} />);
    fireEvent.click(screen.getByText(/分享/));
    await waitFor(() =>
      expect(screen.getByText(/图片生成失败/)).toBeTruthy(),
    );
  });

  it("uses ithomeSharingIds signal for disable state", () => {
    ithomeSummaries.value = { s1: { text: "sum", keywords: [] } };
    ithomeSharingIds.value = {};
    const { rerender } = render(<NewsArticleRow article={baseArticle} />);
    expect(screen.getByText(/分享/)).not.toBeDisabled();

    ithomeSharingIds.value = { s1: true };
    rerender(<NewsArticleRow article={baseArticle} />);
    expect(screen.getByText(/生成图片中/)).toBeDisabled();
  });
});
```

(根据实际测试文件的 import / setup 调整,确保 `ithomeSharingIds` 已 import)

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/renderer/ithome-news-article-row.test.jsx`
Expected: FAIL (share button / ithomeSharingIds 不存在)

- [ ] **Step 4: 修改 NewsArticleRow.jsx**

修改 `src/renderer/ithome/NewsArticleRow.jsx`:

1. 在 import 区追加:
```jsx
import { ithomeSharingIds, shareIthomeArticle } from "./store.js";
import { NewsShareToast } from "./NewsShareToast.jsx";
```

2. 在组件内(其他 useState 旁)加:
```jsx
const [toast, setToast] = useState(null);
const sharing = !!ithomeSharingIds.value[article.id];
```

3. 加 handler:
```jsx
async function handleShare(e) {
  e.preventDefault();
  e.stopPropagation();
  if (sharing) return;
  const r = await shareIthomeArticle(article.id);
  if (r && r.ok) {
    setToast({ kind: "success", message: "✅ 已复制到剪贴板,可 ⌘V 粘贴" });
  } else {
    setToast({ kind: "error", message: "❌ 图片生成失败,请重试" });
  }
}
```

4. 在 foot 区(「阅读原文」之后,「重新生成」之前)插入分享按钮:
```jsx
{hasSummary && (
  <button
    type="button"
    class="ithome-row-link ithome-row-link--muted ithome-row-link--share"
    disabled={sharing}
    onClick={handleShare}
    aria-label="生成分享图片"
    title="生成分享图片"
  >
    {sharing ? "生成图片中…" : "📤 分享"}
  </button>
)}
```

5. 在 `<div class="ithome-row-summary">` 之前或合适位置渲染 toast:
```jsx
{toast && (
  <NewsShareToast
    key={`${toast.kind}-${toast.message}`}
    message={toast.message}
    kind={toast.kind}
    onDone={() => setToast(null)}
  />
)}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/renderer/ithome-news-article-row.test.jsx`
Expected: 全部 passed(原 + 5 新)

- [ ] **Step 6: 提交**

```bash
git add src/renderer/ithome/NewsArticleRow.jsx tests/renderer/ithome-news-article-row.test.jsx
git commit -m "feat(ithome): wire share button into NewsArticleRow"
```

---

## Task 9: 全部测试 + 手动 smoke

- [ ] **Step 1: 跑全量测试**

Run: `npm test`
Expected: 全部 passed(无 fail,无 skip)

- [ ] **Step 2: lint 跑**

Run: `npx eslint src/renderer/ithome/NewsShareCard.jsx src/renderer/ithome/NewsShareCardPage.jsx src/renderer/ithome/NewsShareToast.jsx src/renderer/ithome/NewsArticleRow.jsx src/renderer/ithome/store.js src/main/ithome/share-card-renderer.js src/main/ithome/clipboard-image.js src/main/ipc/register-ithome-share.js`

若有 error,修复。

- [ ] **Step 3: build 验证**

Run: `npm run build:renderer`
Expected: 生成 `renderer-dist/news-share-card.bundle.js`,无报错。

- [ ] **Step 4: 手动 smoke**

按 spec 第 9.3 验证清单走一遍:
1. 启动 app,打开 IT 新闻 tab
2. 展开任意一篇 → 点 AI 总结
3. 总结完成后,卡片 foot 出现「📤 分享」按钮
4. 点击 → toast 弹 "生成图片中…"
5. 1~3s 后 toast 变 "✅ 已复制到剪贴板"
6. 切到 macOS 备忘录 / 微信 / Slack → ⌘V → 看到 1080×1080 PNG
7. 验证 PNG 内容:渐变背景 + 来源 + 标题 + 摘要 + 关键词 chips + Pulse 水印
8. 无 summary 卡片 → 无分享按钮
9. 模拟失败(临时改 main 端返回 `{ ok: false }`)→ toast 错误,UI 正常恢复

- [ ] **Step 5: 提交 (若有 fix)**

```bash
git add -A
git commit -m "chore(ithome): polish share card implementation"
```

---

## Self-Review Checklist

- [x] **Spec 1.1** (触发条件 hasSummary): Task 8 step 4 ✓
- [x] **Spec 1.2** (按钮位置 foot 区): Task 8 step 4 ✓
- [x] **Spec 1.3** (点击生命周期): Task 6 + Task 8 ✓
- [x] **Spec 1.4** (错误边界): Task 3 (renderer 异常) + Task 5 (handler 错误) ✓
- [x] **Spec 2.1** (NewsShareCard): Task 1 ✓
- [x] **Spec 2.2** (share-card.html + Page): Task 2 ✓
- [x] **Spec 2.3** (share-card-renderer): Task 3 ✓
- [x] **Spec 2.4** (clipboard-image): Task 4 ✓
- [x] **Spec 2.5** (IPC handler): Task 5 ✓
- [x] **Spec 3** (IPC 契约): Task 5 step 1(入参/出参)✓
- [x] **Spec 4** (布局视觉 1080×1080 渐变): Task 1 step 4 (CSS)✓
- [x] **Spec 5** (色板): Task 1 step 4 ✓
- [x] **Spec 6.3** (摘要截断 300 字 + 关键词 cap 5): Task 1 step 1 (测试) + step 3 (实现)✓
- [x] **Spec 6.4** (字体栈): Task 1 step 4 ✓
- [x] **Spec 7** (Toast): Task 7 + Task 8 ✓
- [x] **Spec 8** (测试矩阵 5+5+2+3=15 case): Task 1/3/6/8 ✓
- [x] **Spec 9** (风险缓解): Task 3 step 3 (10s 超时) + Task 2 (build.files) + Task 8 (sharingIds 防抖)✓
- [x] **占位符扫描**: 无 TBD / TODO / "implement later" / "similar to..." ✓
- [x] **类型一致**: `ithomeSharingIds` (renderer) ↔ Task 6/8 使用;`createShareCardPng` 签名 (Task 3 内部) ↔ Task 5 调用;IPC 名称 `ithome:share-card` ↔ preload `ithomeShareCard` ↔ store `requireApiMethod("ithomeShareCard")` ✓
- [x] **frequent commits**: 每个 Task 后都有 `git commit` ✓
- [x] **bite-sized**: 每个 Step 是单一动作(写测试 / 跑 fail / 实现 / 跑 pass / 提交)✓

---

## Out of Scope (Spec §11)

- 多尺寸模板
- 主题切换
- PNG 历史记录
- favorites tab 同步
- 分享后埋点
- 摘要区高度自适应

这些都不在本计划内。

---

## Estimated Total

9 Tasks × ~1h = ~9h(可并行/分批执行)
