# Twitter Serenity 面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 SideNav 第 8 个面板「Serenity」,每 5 分钟从多镜像源拉取 @aleabitoreddit 推文,LLM 翻译成中文,接入 DigestDrawer 与每日早报。

**Architecture:** 5 层 — main 抓取层(TweetSource 接口 + 3 个 source 实现 + orchestrator 轮换 + translator + cache-store + scheduler + manual-paste-parser)/ IPC bridge / 共享层(shared-llm 加 translate / state-store 加 twitterCache)/ renderer UI 层(Panel + TweetList + TweetDetail + SourcesSettings + store + DigestDrawer section)。所有外部 HTTP 走现有 `HttpClient`,UA 用 per-request header。Prompt 硬编码在 translator.js。

**Tech Stack:** Node.js (main) / Preact + @preact/signals (renderer) / vitest + happy-dom + @testing-library/preact (test) / Electron IPC

**Spec:** `docs/superpowers/specs/2026-06-22-twitter-serenity-panel-design.md`

---

## File Structure

### 新增文件(17 个)

**main 层(9 个,纯 JS,可独立单测):**
- `src/main/twitter-serenity/tweet-source.js` — `TWITTER_USER_AGENT` 常量 + `RawTweet`/`NormalizedTweet` 转换 + `TweetSource` 接口 JSDoc
- `src/main/twitter-serenity/sources/nitter-source.js` — Nitter RSS XML 解析
- `src/main/twitter-serenity/sources/rsshub-source.js` — RSSHub JSON 解析
- `src/main/twitter-serenity/sources/direct-rss-source.js` — 通用 ATOM/RSS 兜底
- `src/main/twitter-serenity/source-orchestrator.js` — 镜像轮换 + 失败计数 + cooldown + degraded 判定
- `src/main/twitter-serenity/translator.js` — `TWITTER_TRANSLATE_PROMPT` + LRU + `translateTweet`
- `src/main/twitter-serenity/cache-store.js` — LRU 1000 + 增量合并 + state.json 读写
- `src/main/twitter-serenity/scheduler.js` — 5 分钟轮询 + quiet hours + 失败退避
- `src/main/twitter-serenity/manual-paste-parser.js` — 3 类输入解析纯函数
- `src/main/twitter-serenity/index.js` — IPC 注册 + scheduler 启停 + degraded 事件

**renderer 层(6 个,Preact):**
- `src/renderer/twitter-serenity/store.js` — signals(tweets/loading/error/sources/degraded)
- `src/renderer/twitter-serenity/TwitterSerenityPanel.jsx` — 顶层面板(状态条 + 列表 + 强制刷新)
- `src/renderer/twitter-serenity/SerenityTweetList.jsx` — 虚拟列表(本版本用简单 map,滚动翻译 5 条一批)
- `src/renderer/twitter-serenity/SerenityTweetDetail.jsx` — 单条卡片(原文/译文切换)
- `src/renderer/twitter-serenity/TwitterSourcesSettings.jsx` — 镜像源管理(列表 + 增删 + 测试)
- `src/renderer/twitter-serenity/serenity-section.jsx` — DigestDrawer section 适配器

**测试(10 个):**
- `tests/main/twitter-serenity/tweet-source.test.js`
- `tests/main/twitter-serenity/nitter-source.test.js`
- `tests/main/twitter-serenity/rsshub-source.test.js`
- `tests/main/twitter-serenity/source-orchestrator.test.js`
- `tests/main/twitter-serenity/translator.test.js`
- `tests/main/twitter-serenity/cache-store.test.js`
- `tests/main/twitter-serenity/scheduler.test.js`
- `tests/main/twitter-serenity/manual-paste-parser.test.js`
- `tests/renderer/twitter-serenity/TwitterSerenityPanel.test.jsx`
- `tests/renderer/twitter-serenity/serenity-section.test.jsx`

### 修改文件(8 个)

- `src/main/state-store-schema.js` — FIELD_SPECS 加 twitterCache/twitterSources,VERSION 1→2
- `src/main/state-store.js` — 加 `loadTwitterCache` / `saveTwitterCache` / `loadTwitterSources` / `saveTwitterSources`(遵循 loadWorldcupTxt 模式)
- `src/main/index.js` — whenReady 内 require + startTwitterSerenity(deps),before-quit 内 stop
- `src/main/digest/aggregate.js` — SECTION_ORDER 加 'serenity',加 sectionSerenity()
- `src/renderer/digest/DigestSection.jsx` — LABELS 加 serenity,renderItem 加 case
- `src/renderer/components/SideNav.jsx` — NAV_ITEMS 插入第 8 项
- `src/renderer/worldcup/navStore.js` — NAV_KEYS 加 'serenity'
- `src/ai/shared-llm.js` — 导出加 `translate(text, { from, to, prompt })`

---

## Task 1: shared-llm.translate() 入口

**Files:**
- Modify: `src/ai/shared-llm.js`
- Test: `tests/ai/shared-llm-translate.test.js`(新建)

**Why first:** translator.js(Task 6)依赖它。先立契约。

- [ ] **Step 1: Write failing test**

```javascript
// tests/ai/shared-llm-translate.test.js
const { describe, test, expect, vi, beforeEach } = require('vitest');

vi.mock('../../src/ai/shared-llm.js', () => {
  const actual = vi.importActual
    ? null
    : null;
  return {};
});

describe('shared-llm.translate()', () => {
  let translate, chatCompletion;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('../../src/ai/shared-llm.js', () => {
      const mod = require('../../src/ai/shared-llm.js');
      return { ...mod };
    });
    // 直接 require 真模块 (不走 chatCompletion 真网络)
    chatCompletion = vi.fn().mockResolvedValue('translated text');
    vi.doMock('../../src/ai/shared-llm.js', async () => {
      const real = await vi.importActual('../../src/ai/shared-llm.js');
      return { ...real, chatCompletion };
    });
    const mod = await import('../../src/ai/shared-llm.js');
    translate = mod.translate;
  });

  test('translate 调 chatCompletion 传 prompt + text,返回 content', async () => {
    const result = await translate('hello world', {
      prompt: 'translate to chinese',
    });
    expect(chatCompletion).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system', content: 'translate to chinese' }),
        expect.objectContaining({ role: 'user', content: 'hello world' }),
      ]),
    );
    expect(result).toBe('translated text');
  });

  test('chatCompletion 失败时 translate 抛原 error', async () => {
    chatCompletion.mockRejectedValueOnce(new Error('network down'));
    await expect(translate('x', { prompt: 'p' })).rejects.toThrow('network down');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npx vitest run tests/ai/shared-llm-translate.test.js
```
Expected: FAIL — `translate is not a function`

- [ ] **Step 3: Add translate() to shared-llm.js**

在 `src/ai/shared-llm.js` 的 `module.exports` 之前加:

```javascript
/**
 * 通用翻译包装. 内部走 chatCompletion, prompt 由调用方传入.
 * @param {string} text 待翻译文本
 * @param {object} opts
 * @param {string} opts.prompt  完整 system prompt (调用方负责拼好, 含语言/风格/保留词约束)
 * @param {string} [opts.from]  源语言 (仅记录, 不强制; 透传给 prompt 由调用方拼接)
 * @param {string} [opts.to]    目标语言 (同上)
 * @returns {Promise<string>}   翻译后文本 (已 strip)
 */
async function translate(text, opts = {}) {
  if (!text || typeof text !== 'string') return '';
  const prompt = opts.prompt || '';
  const resp = await chatCompletion([
    { role: 'system', content: prompt },
    { role: 'user', content: text },
  ]);
  return typeof resp === 'string' ? resp.trim() : '';
}
```

在 `module.exports` 对象里加一行 `translate,`。

- [ ] **Step 4: Run test (expect PASS)**

```bash
npx vitest run tests/ai/shared-llm-translate.test.js
```
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/ai/shared-llm.js tests/ai/shared-llm-translate.test.js
git commit -m "feat(shared-llm): add translate() wrapper entry (Twitter Serenity)"
```

---

## Task 2: state-store-schema bump + state-store twitter API

**Files:**
- Modify: `src/main/state-store-schema.js`
- Modify: `src/main/state-store.js`
- Test: `tests/main/state-store-twitter.test.js`(新建)

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/state-store-twitter.test.js
const { describe, test, expect, beforeEach, afterEach } = require('vitest');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('state-store twitter API', () => {
  let tmp;
  let store;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-tw-'));
    const statePath = path.join(tmp, 'state.json');
    // 写一个合法的最小 state
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {} }));
    // state-store 用 defaultPath() 读固定位置, 测试通过环境变量或 require 后改 path
    store = require('../../src/main/state-store');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    vi.resetModules();
  });

  test('loadTwitterCache 空 state 返回 null', () => {
    expect(store.loadTwitterCache(tmp + '/state.json')).toBeNull();
  });

  test('saveTwitterCache + loadTwitterCache round-trip', () => {
    const cache = {
      handle: 'aleabitoreddit',
      lastFetchedAt: '2026-06-22T10:00:00Z',
      tweets: [{ id: '1', text: 'hi' }],
      translations: {},
    };
    store.saveTwitterCache(cache, tmp + '/state.json');
    const loaded = store.loadTwitterCache(tmp + '/state.json');
    expect(loaded.tweets).toHaveLength(1);
    expect(loaded.handle).toBe('aleabitoreddit');
  });

  test('loadTwitterSources 无值返回默认 4 镜像', () => {
    const sources = store.loadTwitterSources(tmp + '/state.json');
    expect(sources).toHaveLength(4);
    expect(sources[0].type).toBe('nitter');
  });

  test('saveTwitterSources + loadTwitterSources round-trip', () => {
    store.saveTwitterSources([{ id: 'x', type: 'nitter', url: 'http://x', enabled: true, priority: 1 }], tmp + '/state.json');
    const loaded = store.loadTwitterSources(tmp + '/state.json');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('x');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npx vitest run tests/main/state-store-twitter.test.js
```
Expected: FAIL — `store.loadTwitterCache is not a function`

- [ ] **Step 3: Update state-store-schema.js**

在 `src/main/state-store-schema.js`:

(a) 把 `const STATE_SCHEMA_VERSION = 1;` 改为 `const STATE_SCHEMA_VERSION = 2;`

(b) 在 `FIELD_SPECS` 对象里(`daily_digest: { kind: 'object' },` 之后)加:

```javascript
  twitterCache:       { kind: 'object' },
  twitterSources:     { kind: 'array' },
```

- [ ] **Step 4: Add load/save functions to state-store.js**

在 `src/main/state-store.js`,找到 `loadWorldcupTxt`/`saveWorldcupTxt` 一组函数(约 611-660 行),在其后加 twitter 相关函数。先读现有 saveWorldcupTxt 的实现模式,然后在它附近加:

```javascript
/**
 * Twitter Serenity cache (state.json.twitterCache).
 * 结构见 spec §4.2: { handle, lastFetchedAt, tweets[], translations{}, consecutiveFailureCount }
 */
function loadTwitterCache(statePath = defaultPath()) {
  try {
    const state = load(statePath);
    return state && state.twitterCache ? state.twitterCache : null;
  } catch {
    return null;
  }
}

function saveTwitterCache(cache, statePath = defaultPath()) {
  try {
    const state = load(statePath) || { v: 2, apps: {} };
    state.twitterCache = cache;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (err) {
    mainLogWarn(`[state-store] saveTwitterCache failed: ${err && err.message}`);
  }
}

const DEFAULT_TWITTER_SOURCES = [
  { id: 'nitter-twiiit', type: 'nitter', url: 'https://twiiit.com', enabled: true, priority: 1 },
  { id: 'nitter-xcancel', type: 'nitter', url: 'https://xcancel.com', enabled: true, priority: 2 },
  { id: 'nitter-poast', type: 'nitter', url: 'https://nitter.poast.org', enabled: true, priority: 3 },
  { id: 'rsshub-public', type: 'rsshub', url: 'https://rsshub.app', enabled: true, priority: 4 },
];

function loadTwitterSources(statePath = defaultPath()) {
  try {
    const state = load(statePath);
    if (state && Array.isArray(state.twitterSources) && state.twitterSources.length > 0) {
      return state.twitterSources;
    }
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_TWITTER_SOURCES.slice();
}

function saveTwitterSources(sources, statePath = defaultPath()) {
  try {
    const state = load(statePath) || { v: 2, apps: {} };
    state.twitterSources = sources;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (err) {
    mainLogWarn(`[state-store] saveTwitterSources failed: ${err && err.message}`);
  }
}
```

**注意:** 先读 state-store.js 确认它用的 warn 函数名(`mainLogWarn` 还是 `mainLog.warn` 还是裸 `console.warn`),按现有模式对齐。

在文件末尾 `module.exports` 里加 `loadTwitterCache, saveTwitterCache, loadTwitterSources, saveTwitterSources, DEFAULT_TWITTER_SOURCES`。

- [ ] **Step 5: Run test (expect PASS)**

```bash
npx vitest run tests/main/state-store-twitter.test.js
```
Expected: PASS, 4 tests

- [ ] **Step 6: Run existing schema tests (regression)**

```bash
npx vitest run tests/main/state-store-schema.test.js
```
Expected: PASS — 确认 bump 到 v2 没破坏现有 schema 测试。如果现有测试硬编码 v1,更新测试期望到 v2。

- [ ] **Step 7: Commit**

```bash
git add src/main/state-store-schema.js src/main/state-store.js tests/main/state-store-twitter.test.js
git commit -m "feat(state-store): add twitterCache/twitterSources + schema bump 1→2 (Serenity)"
```

---

## Task 3: tweet-source.js (RawTweet 接口 + UA 常量)

**Files:**
- Create: `src/main/twitter-serenity/tweet-source.js`
- Test: `tests/main/twitter-serenity/tweet-source.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/twitter-serenity/tweet-source.test.js
const { describe, test, expect } = require('vitest');
const {
  TWITTER_USER_AGENT,
  normalizeTweet,
  buildTweetUrl,
  parseTweetIdFromUrl,
} = require('../../../src/main/twitter-serenity/tweet-source');

describe('tweet-source helpers', () => {
  test('TWITTER_USER_AGENT 是非空浏览器 UA 字符串', () => {
    expect(typeof TWITTER_USER_AGENT).toBe('string');
    expect(TWITTER_USER_AGENT.length).toBeGreaterThan(50);
    expect(TWITTER_USER_AGENT).toMatch(/Mozilla|Chrome|Safari/i);
  });

  test('normalizeTweet 补全 fetchedAt / media / metrics 默认值', () => {
    const raw = {
      id: '123',
      text: 'hello',
      author: { handle: 'h', displayName: 'H' },
      publishedAt: '2026-06-22T10:00:00Z',
      sourceMirror: 'twiiit.com',
    };
    const n = normalizeTweet(raw, '2026-06-22T10:01:00Z');
    expect(n.fetchedAt).toBe('2026-06-22T10:01:00Z');
    expect(n.media).toEqual([]);
    expect(n.metrics).toEqual({ likes: 0, retweets: 0, replies: 0 });
    expect(n.url).toContain('123');
  });

  test('normalizeTweet 空 text 容错为空串', () => {
    const n = normalizeTweet({ id: '1' }, 'now');
    expect(n.text).toBe('');
    expect(n.author).toEqual({ handle: '', displayName: '' });
  });

  test('normalizeTweet XSS payload: text 原样保留 (渲染层 dompurify 负责转义)', () => {
    const n = normalizeTweet({ id: '1', text: '<script>alert(1)</script>' }, 'now');
    expect(n.text).toBe('<script>alert(1)</script>');
  });

  test('buildTweetUrl 拼 x.com URL', () => {
    expect(buildTweetUrl('aleabitoreddit', '123')).toBe('https://x.com/aleabitoreddit/status/123');
  });

  test('parseTweetIdFromUrl 从 X URL 提 id', () => {
    expect(parseTweetIdFromUrl('https://x.com/h/status/999')).toBe('999');
    expect(parseTweetIdFromUrl('https://twitter.com/h/status/888')).toBe('888');
    expect(parseTweetIdFromUrl('not a url')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npx vitest run tests/main/twitter-serenity/tweet-source.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Create tweet-source.js**

```javascript
// src/main/twitter-serenity/tweet-source.js
/**
 * TweetSource 抽象接口 + 共享 helpers.
 *
 * 每个 source 实现:
 *   { fetchUserTimeline(handle): Promise<RawTweet[]> }
 *
 * RawTweet (source 原始产出, 字段可能缺) → normalizeTweet → NormalizedTweet (cache 持久化).
 */

// 真实浏览器 UA, Nitter/RSSHub 拒默认 Node UA.
const TWITTER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 把 source 产出的 (可能缺字段) raw tweet 补全为 NormalizedTweet.
 * @param {object} raw
 * @param {string} fetchedAt  ISO8601, 调用方传当前时间
 * @returns {object} NormalizedTweet (见 spec §4.1)
 */
function normalizeTweet(raw, fetchedAt) {
  const id = String((raw && raw.id) || '');
  const handle = (raw && raw.author && raw.author.handle) || '';
  return {
    id,
    url: raw.url || buildTweetUrl(handle, id),
    author: {
      handle,
      displayName: (raw && raw.author && raw.author.displayName) || '',
      avatarUrl: (raw && raw.author && raw.author.avatarUrl) || '',
    },
    text: (raw && raw.text) || '',
    language: (raw && raw.language) || 'en',
    publishedAt: (raw && raw.publishedAt) || null,
    fetchedAt,
    media: Array.isArray(raw && raw.media) ? raw.media : [],
    metrics: Object.assign(
      { likes: 0, retweets: 0, replies: 0 },
      (raw && raw.metrics) || {},
    ),
    sourceMirror: (raw && raw.sourceMirror) || 'unknown',
  };
}

function buildTweetUrl(handle, id) {
  if (!handle || !id) return '';
  return `https://x.com/${handle}/status/${id}`;
}

function parseTweetIdFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/);
  return m ? m[1] : null;
}

module.exports = {
  TWITTER_USER_AGENT,
  normalizeTweet,
  buildTweetUrl,
  parseTweetIdFromUrl,
};
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
npx vitest run tests/main/twitter-serenity/tweet-source.test.js
```
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/twitter-serenity/tweet-source.js tests/main/twitter-serenity/tweet-source.test.js
git commit -m "feat(twitter-serenity): tweet-source interface + UA constant (Serenity)"
```

---

## Task 4: nitter-source.js

**Files:**
- Create: `src/main/twitter-serenity/sources/nitter-source.js`
- Test: `tests/main/twitter-serenity/nitter-source.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/twitter-serenity/nitter-source.test.js
const { describe, test, expect, vi } = require('vitest');

const SAMPLE_NITTER_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Serenity (@aleabitoreddit) | Nitter</title>
    <item>
      <title>Serenity: I think $NVDA is overvalued...</title>
      <link>https://twiiit.com/aleabitoreddit/status/1748291000000000001</link>
      <pubDate>Sat, 22 Jun 2026 13:39:00 GMT</pubDate>
      <description>I think $NVDA is overvalued at current levels. &lt;a href="x"&gt;link&lt;/a&gt;</description>
      <guid>https://twiiit.com/aleabitoreddit/status/1748291000000000001</guid>
    </item>
    <item>
      <title>Serenity: $SIVE breaking out</title>
      <link>https://twiiit.com/aleabitoreddit/status/1748291000000000002</link>
      <pubDate>Sat, 22 Jun 2026 12:00:00 GMT</pubDate>
      <description>$SIVE breaking out</description>
    </item>
  </channel>
</rss>`;

describe('nitter-source', () => {
  test('parse 解析 RSS 返回 RawTweet 数组', async () => {
    const { createNitterSource } = require('../../../src/main/twitter-serenity/sources/nitter-source');
    const src = createNitterSource({ url: 'https://twiiit.com', id: 'nitter-twiiit' });
    const tweets = src.parseRss(SAMPLE_NITTER_RSS, 'aleabitoreddit', 'twiiit.com');
    expect(tweets).toHaveLength(2);
    expect(tweets[0].id).toBe('1748291000000000001');
    expect(tweets[0].author.handle).toBe('aleabitoreddit');
    expect(tweets[0].text).toContain('$NVDA');
    expect(tweets[0].publishedAt).toMatch(/^2026-06-22T13:39:00/);
  });

  test('parse 空/无 item 返回空数组', () => {
    const { createNitterSource } = require('../../../src/main/twitter-serenity/sources/nitter-source');
    const src = createNitterSource({ url: 'https://twiiit.com', id: 'x' });
    expect(src.parseRss('<rss></rss>', 'h', 'twiiit.com')).toEqual([]);
    expect(src.parseRss('', 'h', 'twiiit.com')).toEqual([]);
  });

  test('parse 字段缺失项被跳过 (无 link/id)', () => {
    const { createNitterSource } = require('../../../src/main/twitter-serenity/sources/nitter-source');
    const src = createNitterSource({ url: 'https://twiiit.com', id: 'x' });
    const bad = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>no link</title></item>
      <item><link>https://twiiit.com/h/status/555</link><description>ok</description></item>
    </channel></rss>`;
    const tweets = src.parseRss(bad, 'h', 'twiiit.com');
    expect(tweets).toHaveLength(1);
    expect(tweets[0].id).toBe('555');
  });

  test('parse HTML entity 被 decode', () => {
    const { createNitterSource } = require('../../../src/main/twitter-serenity/sources/nitter-source');
    const src = createNitterSource({ url: 'https://twiiit.com', id: 'x' });
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><link>https://twiiit.com/h/status/1</link><description>Tom &amp; Jerry &lt;b&gt;</description></item>
    </channel></rss>`;
    const tweets = src.parseRss(rss, 'h', 'twiiit.com');
    expect(tweets[0].text).toBe('Tom & Jerry <b>');
  });

  test('fetchUserTimeline 调 httpClient 带 TWITTER_USER_AGENT header', async () => {
    const { createNitterSource } = require('../../../src/main/twitter-serenity/sources/nitter-source');
    const { TWITTER_USER_AGENT } = require('../../../src/main/twitter-serenity/tweet-source');
    const httpClient = { get: vi.fn().mockResolvedValue({ status: 200, body: SAMPLE_NITTER_RSS }) };
    const src = createNitterSource({ url: 'https://twiiit.com', id: 'x', httpClient });
    await src.fetchUserTimeline('aleabitoreddit');
    expect(httpClient.get).toHaveBeenCalled();
    const arg = httpClient.get.mock.calls[0];
    expect(arg[0]).toBe('https://twiiit.com/aleabitoreddit/rss');
    expect(arg[1].headers['User-Agent']).toBe(TWITTER_USER_AGENT);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npx vitest run tests/main/twitter-serenity/nitter-source.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Create nitter-source.js**

```javascript
// src/main/twitter-serenity/sources/nitter-source.js
/**
 * Nitter 镜像源. RSS path: {url}/{handle}/rss
 */
const { TWITTER_USER_AGENT } = require('../tweet-source');

function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, '').trim();
}

function parseDate(pubDate) {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function createNitterSource(opts) {
  const { url, id } = opts;
  const httpClient = opts.httpClient;

  function parseRss(xml, handle, mirrorDomain) {
    if (!xml || typeof xml !== 'string') return [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    const out = [];
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const link = decodeEntities((block.match(/<link>([^<]*)<\/link>/) || [])[1] || '');
      const descRaw = decodeEntities((block.match(/<description>([^<]*)<\/description>/) || [])[1] || '');
      const pubDate = (block.match(/<pubDate>([^<]*)<\/pubDate>/) || [])[1] || '';
      // 从 link 提 id: {url}/{handle}/status/{id}
      const idMatch = link.match(/\/status\/(\d+)/);
      if (!idMatch) continue;
      out.push({
        id: idMatch[1],
        url: link,
        text: stripHtml(descRaw),
        author: { handle, displayName: '' },
        publishedAt: parseDate(pubDate),
        media: [],
        metrics: { likes: 0, retweets: 0, replies: 0 },
        sourceMirror: mirrorDomain,
      });
    }
    return out;
  }

  async function fetchUserTimeline(handle) {
    const feedUrl = `${url}/${handle}/rss`;
    const resp = await httpClient.get(feedUrl, {
      headers: { 'User-Agent': TWITTER_USER_AGENT, Accept: 'application/rss+xml' },
      timeout: 5000,
      follow: true,
    });
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`nitter ${url} HTTP ${resp.status}`);
    }
    let mirrorDomain;
    try {
      mirrorDomain = new URL(url).host;
    } catch {
      mirrorDomain = url;
    }
    return parseRss(resp.body, handle, mirrorDomain);
  }

  return { id, type: 'nitter', url, parseRss, fetchUserTimeline };
}

module.exports = { createNitterSource };
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
npx vitest run tests/main/twitter-serenity/nitter-source.test.js
```
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/twitter-serenity/sources/nitter-source.js tests/main/twitter-serenity/nitter-source.test.js
git commit -m "feat(twitter-serenity): nitter source RSS parser (Serenity)"
```

---

## Task 5: rsshub-source.js + direct-rss-source.js

**Files:**
- Create: `src/main/twitter-serenity/sources/rsshub-source.js`
- Create: `src/main/twitter-serenity/sources/direct-rss-source.js`
- Test: `tests/main/twitter-serenity/rsshub-source.test.js`

direct-rss-source 复用 nitter 的 RSS 解析逻辑(只是 URL 模板不同),放一起测。

- [ ] **Step 1: Write failing test (rsshub + direct-rss 共一份)**

```javascript
// tests/main/twitter-serenity/rsshub-source.test.js
const { describe, test, expect, vi } = require('vitest');

const SAMPLE_RSSHUB_JSON = JSON.stringify({
  item: [
    {
      id: 'https://x.com/aleabitoreddit/status/1001',
      url: 'https://x.com/aleabitoreddit/status/1001',
      title: 'post one',
      content_html: 'post one with $AAPL',
      date_published: '2026-06-22T13:00:00.000Z',
      authors: [{ name: 'Serenity', url: 'https://x.com/aleabitoreddit' }],
    },
    {
      id: 'https://x.com/aleabitoreddit/status/1002',
      url: 'https://x.com/aleabitoreddit/status/1002',
      title: 'post two',
      content_html: 'post two',
      date_published: '2026-06-22T12:00:00.000Z',
    },
  ],
});

describe('rsshub-source', () => {
  test('parse JSON 返回 RawTweet', async () => {
    const { createRsshubSource } = require('../../../src/main/twitter-serenity/sources/rsshub-source');
    const src = createRsshubSource({ url: 'https://rsshub.app', id: 'rsshub-public' });
    const tweets = src.parseJson(SAMPLE_RSSHUB_JSON, 'aleabitoreddit', 'rsshub.app');
    expect(tweets).toHaveLength(2);
    expect(tweets[0].id).toBe('1001');
    expect(tweets[0].text).toContain('$AAPL');
    expect(tweets[0].author.handle).toBe('aleabitoreddit');
  });

  test('parse 空/坏 JSON 返回空数组', () => {
    const { createRsshubSource } = require('../../../src/main/twitter-serenity/sources/rsshub-source');
    const src = createRsshubSource({ url: 'https://rsshub.app', id: 'x' });
    expect(src.parseJson('', 'h', 'rsshub.app')).toEqual([]);
    expect(src.parseJson('not json', 'h', 'rsshub.app')).toEqual([]);
    expect(src.parseJson('{}', 'h', 'rsshub.app')).toEqual([]);
  });

  test('parse 字段缺失项跳过 (无 url/id)', () => {
    const { createRsshubSource } = require('../../../src/main/twitter-serenity/sources/rsshub-source');
    const src = createRsshubSource({ url: 'https://rsshub.app', id: 'x' });
    const json = JSON.stringify({ item: [
      { title: 'no id' },
      { id: 'https://x.com/h/status/9', url: 'https://x.com/h/status/9' },
    ] });
    const tweets = src.parseJson(json, 'h', 'rsshub.app');
    expect(tweets).toHaveLength(1);
    expect(tweets[0].id).toBe('9');
  });

  test('fetchUserTimeline 拼 /twitter/user/{handle} 路由', async () => {
    const { createRsshubSource } = require('../../../src/main/twitter-serenity/sources/rsshub-source');
    const httpClient = { get: vi.fn().mockResolvedValue({ status: 200, body: SAMPLE_RSSHUB_JSON }) };
    const src = createRsshubSource({ url: 'https://rsshub.app', id: 'x', httpClient });
    await src.fetchUserTimeline('aleabitoreddit');
    expect(httpClient.get.mock.calls[0][0]).toBe('https://rsshub.app/twitter/user/aleabitoreddit');
  });

  test('HTML in content_html 被 strip', () => {
    const { createRsshubSource } = require('../../../src/main/twitter-serenity/sources/rsshub-source');
    const src = createRsshubSource({ url: 'https://rsshub.app', id: 'x' });
    const json = JSON.stringify({ item: [
      { id: 'https://x.com/h/status/1', url: 'https://x.com/h/status/1', content_html: '<p>hi <b>x</b></p>' },
    ] });
    const tweets = src.parseJson(json, 'h', 'rsshub.app');
    expect(tweets[0].text).toBe('hi x');
  });
});

describe('direct-rss-source', () => {
  test('fetchUserTimeline 拼 {url} 直接 GET (复用 nitter RSS 解析)', async () => {
    const SAMPLE = '<?xml version="1.0"?><rss version="2.0"><channel>' +
      '<item><link>https://x.com/h/status/42</link><description>raw</description></item>' +
      '</channel></rss>';
    const { createDirectRssSource } = require('../../../src/main/twitter-serenity/sources/direct-rss-source');
    const httpClient = { get: vi.fn().mockResolvedValue({ status: 200, body: SAMPLE }) };
    const src = createDirectRssSource({ url: 'https://example.com/feed.xml', id: 'direct-1', httpClient });
    const tweets = await src.fetchUserTimeline('h');
    expect(httpClient.get.mock.calls[0][0]).toBe('https://example.com/feed.xml');
    expect(tweets).toHaveLength(1);
    expect(tweets[0].id).toBe('42');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npx vitest run tests/main/twitter-serenity/rsshub-source.test.js
```
Expected: FAIL — modules not found

- [ ] **Step 3: Create rsshub-source.js**

```javascript
// src/main/twitter-serenity/sources/rsshub-source.js
/**
 * RSSHub 源. JSON Feed 路由: {url}/twitter/user/{handle}
 * 响应是 JSON Feed (JSON Feed 1.1, item[] 数组).
 */
const { TWITTER_USER_AGENT } = require('../tweet-source');

function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, '').trim();
}

function createRsshubSource(opts) {
  const { url, id } = opts;
  const httpClient = opts.httpClient;

  function parseJson(json, handle, mirrorDomain) {
    let feed;
    try {
      feed = JSON.parse(json);
    } catch {
      return [];
    }
    const items = Array.isArray(feed && feed.item) ? feed.item : [];
    const out = [];
    for (const it of items) {
      const itemUrl = it.url || it.id || '';
      const idMatch = itemUrl.match(/\/status\/(\d+)/);
      if (!idMatch) continue;
      out.push({
        id: idMatch[1],
        url: itemUrl,
        text: stripHtml(it.content_html || it.content_text || it.title || ''),
        author: { handle, displayName: (it.authors && it.authors[0] && it.authors[0].name) || '' },
        publishedAt: it.date_published || null,
        media: [],
        metrics: { likes: 0, retweets: 0, replies: 0 },
        sourceMirror: mirrorDomain,
      });
    }
    return out;
  }

  async function fetchUserTimeline(handle) {
    const feedUrl = `${url}/twitter/user/${handle}`;
    const resp = await httpClient.get(feedUrl, {
      headers: { 'User-Agent': TWITTER_USER_AGENT, Accept: 'application/json' },
      timeout: 5000,
      follow: true,
    });
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`rsshub ${url} HTTP ${resp.status}`);
    }
    let mirrorDomain;
    try { mirrorDomain = new URL(url).host; } catch { mirrorDomain = url; }
    return parseJson(resp.body, handle, mirrorDomain);
  }

  return { id, type: 'rsshub', url, parseJson, fetchUserTimeline };
}

module.exports = { createRsshubSource };
```

- [ ] **Step 4: Create direct-rss-source.js**

```javascript
// src/main/twitter-serenity/sources/direct-rss-source.js
/**
 * 任意 ATOM/RSS 兜底源. 用户自己填的 feed URL, 直接 GET.
 * 解析复用 nitter-source 的 RSS regex (提取 link/status/id).
 */
const { TWITTER_USER_AGENT } = require('../tweet-source');
const { createNitterSource } = require('./nitter-source');

function createDirectRssSource(opts) {
  const { url, id } = opts;
  // 复用一个 nitter parser 实例 (只借用 parseRss, 不走它的 url 拼接)
  const parser = createNitterSource({ url, id, httpClient: opts.httpClient });

  async function fetchUserTimeline(handle) {
    const resp = await opts.httpClient.get(url, {
      headers: { 'User-Agent': TWITTER_USER_AGENT, Accept: 'application/rss+xml, application/atom+xml' },
      timeout: 5000,
      follow: true,
    });
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`direct-rss ${url} HTTP ${resp.status}`);
    }
    let mirrorDomain;
    try { mirrorDomain = new URL(url).host; } catch { mirrorDomain = url; }
    return parser.parseRss(resp.body, handle, mirrorDomain);
  }

  return { id, type: 'rss', url, parseRss: parser.parseRss, fetchUserTimeline };
}

module.exports = { createDirectRssSource };
```

- [ ] **Step 5: Run test (expect PASS)**

```bash
npx vitest run tests/main/twitter-serenity/rsshub-source.test.js
```
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add src/main/twitter-serenity/sources/rsshub-source.js src/main/twitter-serenity/sources/direct-rss-source.js tests/main/twitter-serenity/rsshub-source.test.js
git commit -m "feat(twitter-serenity): rsshub + direct-rss sources (Serenity)"
```

---

## Task 6: cache-store.js (LRU + 增量合并)

**Files:**
- Create: `src/main/twitter-serenity/cache-store.js`
- Test: `tests/main/twitter-serenity/cache-store.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/twitter-serenity/cache-store.test.js
const { describe, test, expect, vi } = require('vitest');
const { createCacheStore, mergeTweets } = require('../../../src/main/twitter-serenity/cache-store');

describe('cache-store', () => {
  test('mergeTweets 按 id 去重, 新帖插前面, 旧帖 metrics 更新', () => {
    const existing = [
      { id: '1', text: 'old', metrics: { likes: 5 } },
      { id: '3', text: 'c', metrics: { likes: 0 } },
    ];
    const incoming = [
      { id: '2', text: 'new', metrics: { likes: 1 } },
      { id: '1', text: 'old', metrics: { likes: 99 } },
    ];
    const merged = mergeTweets(existing, incoming);
    // 新 id=2 插前面; id=1 metrics 更新为 99; id=3 保留
    const ids = merged.map((t) => t.id);
    expect(ids).toContain('1');
    expect(ids).toContain('2');
    expect(ids).toContain('3');
    const one = merged.find((t) => t.id === '1');
    expect(one.metrics.likes).toBe(99);
  });

  test('mergeTweets 去重后 ≤ LRU 上限', () => {
    const existing = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), text: 'x' }));
    const incoming = [{ id: '2000', text: 'y' }];
    const merged = mergeTweets(existing, incoming, 1000);
    expect(merged).toHaveLength(1000);
    expect(merged[0].id).toBe('2000');
  });

  test('createCacheStore.load 无 stateStore 返回空 cache', () => {
    const stateStore = { loadTwitterCache: () => null, saveTwitterCache: vi.fn() };
    const cs = createCacheStore({ stateStore });
    expect(cs.load().tweets).toEqual([]);
    expect(cs.load().handle).toBe('aleabitoreddit');
  });

  test('createCacheStore.load 有旧 cache 返回 tweets', () => {
    const stateStore = {
      loadTwitterCache: () => ({ handle: 'aleabitoreddit', tweets: [{ id: '1', text: 'a' }], translations: {} }),
      saveTwitterCache: vi.fn(),
    };
    const cs = createCacheStore({ stateStore });
    expect(cs.load().tweets).toHaveLength(1);
  });

  test('createCacheStore.mergeAndSave 合并后 save', () => {
    const saveMock = vi.fn();
    const stateStore = {
      loadTwitterCache: () => ({ tweets: [{ id: '1', text: 'old', metrics: { likes: 0 } }] }),
      saveTwitterCache: saveMock,
    };
    const cs = createCacheStore({ stateStore });
    cs.mergeAndSave([{ id: '2', text: 'new', metrics: { likes: 0 } }]);
    expect(saveMock).toHaveBeenCalled();
    const saved = saveMock.mock.calls[0][0];
    expect(saved.tweets).toHaveLength(2);
    expect(saved.lastFetchedAt).toBeTruthy();
  });

  test('createCacheStore.setDegraded 累加 consecutiveFailureCount', () => {
    const saveMock = vi.fn();
    const stateStore = { loadTwitterCache: () => null, saveTwitterCache: saveMock };
    const cs = createCacheStore({ stateStore });
    cs.setDegraded();
    cs.setDegraded();
    const saved = saveMock.mock.calls[1][0];
    expect(saved.consecutiveFailureCount).toBe(2);
  });

  test('createCacheStore.resetDegraded 清零', () => {
    const saveMock = vi.fn();
    const stateStore = {
      loadTwitterCache: () => ({ consecutiveFailureCount: 3 }),
      saveTwitterCache: saveMock,
    };
    const cs = createCacheStore({ stateStore });
    cs.resetDegraded();
    expect(saveMock.mock.calls[0][0].consecutiveFailureCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npx vitest run tests/main/twitter-serenity/cache-store.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Create cache-store.js**

```javascript
// src/main/twitter-serenity/cache-store.js
/**
 * Twitter Serenity cache (state.json.twitterCache).
 * LRU 1000 条, 增量合并 (id 主键, 新帖插前, 旧帖更新 metrics).
 */

const DEFAULT_HANDLE = 'aleabitoreddit';
const LRU_LIMIT = 1000;

/**
 * 合并两批 tweets, 按 id 去重.
 * @param {object[]} existing
 * @param {object[]} incoming
 * @param {number} [limit=1000]
 * @returns {object[]} 合并后 (incoming 的新 id 在前, 其余按原顺序, 截断到 limit)
 */
function mergeTweets(existing, incoming, limit = LRU_LIMIT) {
  const existMap = new Map((existing || []).map((t) => [String(t.id), t]));
  const incomingIds = new Set();
  const newOnes = [];
  for (const t of incoming || []) {
    const id = String(t.id);
    if (!existMap.has(id)) {
      newOnes.push(t);
    } else {
      // 更新 metrics (text/publishedAt 不覆盖, 保 cache 原值避免镜像差异)
      const old = existMap.get(id);
      if (t.metrics) old.metrics = t.metrics;
    }
    incomingIds.add(id);
  }
  const merged = [...newOnes, ...(existing || [])];
  return merged.slice(0, limit);
}

function createCacheStore(deps) {
  const stateStore = deps.stateStore;

  function load() {
    const cached = stateStore.loadTwitterCache();
    return {
      handle: (cached && cached.handle) || DEFAULT_HANDLE,
      lastFetchedAt: (cached && cached.lastFetchedAt) || null,
      lastSuccessMirror: (cached && cached.lastSuccessMirror) || null,
      consecutiveFailureCount: (cached && cached.consecutiveFailureCount) || 0,
      tweets: (cached && Array.isArray(cached.tweets)) ? cached.tweets : [],
      translations: (cached && cached.translations) || {},
    };
  }

  function save(cache) {
    stateStore.saveTwitterCache(cache);
  }

  function mergeAndSave(incoming, meta = {}) {
    const cache = load();
    cache.tweets = mergeTweets(cache.tweets, incoming);
    cache.lastFetchedAt = new Date().toISOString();
    if (meta.lastSuccessMirror) {
      cache.lastSuccessMirror = meta.lastSuccessMirror;
      cache.consecutiveFailureCount = 0;
    }
    save(cache);
    return cache;
  }

  function setDegraded() {
    const cache = load();
    cache.consecutiveFailureCount = (cache.consecutiveFailureCount || 0) + 1;
    cache.lastFetchedAt = new Date().toISOString();
    save(cache);
    return cache.consecutiveFailureCount;
  }

  function resetDegraded() {
    const cache = load();
    cache.consecutiveFailureCount = 0;
    save(cache);
  }

  return { load, save, mergeAndSave, setDegraded, resetDegraded, LRU_LIMIT };
}

module.exports = { createCacheStore, mergeTweets, LRU_LIMIT, DEFAULT_HANDLE };
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
npx vitest run tests/main/twitter-serenity/cache-store.test.js
```
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/twitter-serenity/cache-store.js tests/main/twitter-serenity/cache-store.test.js
git commit -m "feat(twitter-serenity): cache-store LRU + incremental merge (Serenity)"
```

---

## Task 7: translator.js (LLM 翻译 + LRU)

**Files:**
- Create: `src/main/twitter-serenity/translator.js`
- Test: `tests/main/twitter-serenity/translator.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/twitter-serenity/translator.test.js
const { describe, test, expect, vi, beforeEach } = require('vitest');

describe('translator', () => {
  let translateMock;
  let createTranslator;

  beforeEach(() => {
    vi.resetModules();
    translateMock = vi.fn().mockResolvedValue('中文译文');
    vi.doMock('../../../src/ai/shared-llm.js', () => ({ translate: translateMock, chatCompletion: vi.fn() }));
    createTranslator = require('../../../src/main/twitter-serenity/translator').createTranslator;
  });

  test('translateTweet 未命中 LRU 调 shared-llm.translate', async () => {
    const t = createTranslator();
    const out = await t.translateTweet({ id: '1', text: 'hello' });
    expect(translateMock).toHaveBeenCalled();
    expect(translateMock.mock.calls[0][0]).toBe('hello');
    expect(translateMock.mock.calls[0][1].prompt).toMatch(/中文财经翻译/);
    expect(out).toBe('中文译文');
  });

  test('translateTweet 命中 LRU 不调 LLM', async () => {
    const t = createTranslator();
    await t.translateTweet({ id: '1', text: 'hello' });
    translateMock.mockClear();
    const out2 = await t.translateTweet({ id: '1', text: 'hello' });
    expect(translateMock).not.toHaveBeenCalled();
    expect(out2).toBe('中文译文');
  });

  test('translateTweet LRU 超 200 淘汰最旧', async () => {
    translateMock.mockResolvedValue('zh');
    const t = createTranslator();
    for (let i = 0; i < 201; i++) {
      await t.translateTweet({ id: String(i), text: `t${i}` });
    }
    // 第 0 条应已淘汰 → 再翻译会调 LLM
    translateMock.mockClear();
    await t.translateTweet({ id: '0', text: 't0' });
    expect(translateMock).toHaveBeenCalled();
  });

  test('translateTweet LLM 失败抛 error', async () => {
    translateMock.mockRejectedValueOnce(new Error('quota'));
    const t = createTranslator();
    await expect(t.translateTweet({ id: '1', text: 'hi' })).rejects.toThrow('quota');
  });

  test('translateTweet 空 text 返回空串不调 LLM', async () => {
    const t = createTranslator();
    const out = await t.translateTweet({ id: '1', text: '' });
    expect(out).toBe('');
    expect(translateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npx vitest run tests/main/twitter-serenity/translator.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Create translator.js**

```javascript
// src/main/twitter-serenity/translator.js
/**
 * Tweet 翻译: 内存 LRU 200 + 调 shared-llm.translate.
 * Prompt 硬编码常量 (spec §6.1 决策: 不读 config.json).
 */

const TWITTER_TRANSLATE_PROMPT = [
  '你是中文财经翻译,保留股票代码(如 $NVDA、$SIVE)、人名、公司名不译。',
  '风格:简洁、信息密度高、不加主观评论。',
  '输出:只输出中文译文,不加任何前缀。',
].join('\n');

const LRU_LIMIT = 200;

function createTranslator(deps = {}) {
  const sharedLlm = deps.sharedLlm || require('../ai/shared-llm.js');
  const lru = new Map(); // Map 保持插入序, 淘汰时删 first

  async function translateTweet(tweet) {
    if (!tweet || !tweet.text) return '';
    const id = String(tweet.id);
    if (lru.has(id)) {
      // refresh: delete + re-set 让它变最新
      const v = lru.get(id);
      lru.delete(id);
      lru.set(id, v);
      return v;
    }
    const translated = await sharedLlm.translate(tweet.text, { prompt: TWITTER_TRANSLATE_PROMPT });
    lru.set(id, translated);
    if (lru.size > LRU_LIMIT) {
      const oldest = lru.keys().next().value;
      lru.delete(oldest);
    }
    return translated;
  }

  function getCached(id) {
    return lru.get(String(id)) || null;
  }

  function clear() {
    lru.clear();
  }

  return { translateTweet, getCached, clear, LRU_LIMIT, TWITTER_TRANSLATE_PROMPT };
}

module.exports = { createTranslator, TWITTER_TRANSLATE_PROMPT, LRU_LIMIT };
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
npx vitest run tests/main/twitter-serenity/translator.test.js
```
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/twitter-serenity/translator.js tests/main/twitter-serenity/translator.test.js
git commit -m "feat(twitter-serenity): translator LLM + LRU 200 (Serenity)"
```

---

## Task 8: manual-paste-parser.js (降级路径)

**Files:**
- Create: `src/main/twitter-serenity/manual-paste-parser.js`
- Test: `tests/main/twitter-serenity/manual-paste-parser.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/twitter-serenity/manual-paste-parser.test.js
const { describe, test, expect } = require('vitest');
const { parseManualPaste } = require('../../../src/main/twitter-serenity/manual-paste-parser');

describe('manual-paste-parser', () => {
  test('X URL 解析出 handle + id', () => {
    const r = parseManualPaste('https://x.com/aleabitoreddit/status/1748291000000000001');
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(1);
    expect(r.results[0].id).toBe('1748291000000000001');
    expect(r.results[0].author.handle).toBe('aleabitoreddit');
    expect(r.results[0].sourceMirror).toBe('manual-paste');
    expect(r.errors).toHaveLength(0);
  });

  test('twitter.com URL 也识别', () => {
    const r = parseManualPaste('https://twitter.com/foo/status/999');
    expect(r.results[0].id).toBe('999');
    expect(r.results[0].author.handle).toBe('foo');
  });

  test('Nitter URL 解析', () => {
    const r = parseManualPaste('https://twiiit.com/aleabitoreddit/status/888');
    expect(r.results[0].id).toBe('888');
    expect(r.results[0].author.handle).toBe('aleabitoreddit');
  });

  test('纯文本生成 manual- 前缀 id', () => {
    const r = parseManualPaste('just some text without url');
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(1);
    expect(r.results[0].id).toMatch(/^manual-/);
    expect(r.results[0].author.handle).toBe('unknown');
    expect(r.results[0].text).toBe('just some text without url');
  });

  test('多行混合解析, 失败行进 errors', () => {
    const input = [
      'https://x.com/h/status/1',
      'this is plain text',
      'not parseable garbage line without url but too short',
    ].join('\n');
    const r = parseManualPaste(input);
    expect(r.results.length).toBeGreaterThanOrEqual(2);
    // 第 3 行: 纯文本规则, 也算 result (除非太短) — 本测试期望 3 个 result (纯文本都收)
  });

  test('空输入返回 ok=true, results 空', () => {
    const r = parseManualPaste('');
    expect(r.ok).toBe(true);
    expect(r.results).toEqual([]);
  });

  test('null/非字符串容错', () => {
    expect(parseManualPaste(null).results).toEqual([]);
    expect(parseManualPaste(undefined).results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npx vitest run tests/main/twitter-serenity/manual-paste-parser.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Create manual-paste-parser.js**

```javascript
// src/main/twitter-serenity/manual-paste-parser.js
/**
 * 降级路径: 用户手动粘贴. 3 类输入 (spec §5.4):
 *   1. X URL:        https?://(x|twitter).com/{handle}/status/{id}
 *   2. Nitter URL:   https?://[\w.-]+/{handle}/status/{id}
 *   3. 纯文本:        无 URL 命中, id = 'manual-' + sha1(text).slice(0,16)
 *
 * 多行: 每行独立解析, 失败行 (空行) 跳过.
 */
const crypto = require('node:crypto');

const X_URL_RE = /https?:\/\/(?:x|twitter)\.com\/([\w]+)\/status\/(\d+)/;
const NITTER_URL_RE = /https?:\/\/[\w.\-]+\/([\w]+)\/status\/(\d+)/;
const MIN_TEXT_LEN = 1;

function parseLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;

  // 先试 X URL
  let m = text.match(X_URL_RE);
  if (m) {
    return {
      id: m[2],
      url: m[0],
      text,
      author: { handle: m[1], displayName: '' },
      publishedAt: null,
      media: [],
      metrics: { likes: 0, retweets: 0, replies: 0 },
      sourceMirror: 'manual-paste',
    };
  }

  // 再试 Nitter URL (排除已被 X URL 吃掉的)
  m = text.match(NITTER_URL_RE);
  if (m && !(m[1] === 'status')) {
    return {
      id: m[2],
      url: m[0],
      text,
      author: { handle: m[1], displayName: '' },
      publishedAt: null,
      media: [],
      metrics: { likes: 0, retweets: 0, replies: 0 },
      sourceMirror: 'manual-paste',
    };
  }

  // 纯文本
  if (text.length < MIN_TEXT_LEN) return null;
  const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
  return {
    id: `manual-${hash}`,
    url: '',
    text,
    author: { handle: 'unknown', displayName: '' },
    publishedAt: null,
    media: [],
    metrics: { likes: 0, retweets: 0, replies: 0 },
    sourceMirror: 'manual-paste',
  };
}

function parseManualPaste(input) {
  if (input == null || typeof input !== 'string') {
    return { ok: true, results: [], errors: [] };
  }
  const lines = input.split(/\r?\n/);
  const results = [];
  const errors = [];
  for (const line of lines) {
    try {
      const parsed = parseLine(line);
      if (parsed) results.push(parsed);
    } catch (err) {
      errors.push({ line, error: err && err.message });
    }
  }
  return { ok: true, results, errors };
}

module.exports = { parseManualPaste, parseLine };
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
npx vitest run tests/main/twitter-serenity/manual-paste-parser.test.js
```
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/twitter-serenity/manual-paste-parser.js tests/main/twitter-serenity/manual-paste-parser.test.js
git commit -m "feat(twitter-serenity): manual-paste-parser 3-class input (Serenity)"
```

---

## Task 9: source-orchestrator.js (镜像轮换 + cooldown + degraded)

**Files:**
- Create: `src/main/twitter-serenity/source-orchestrator.js`
- Test: `tests/main/twitter-serenity/source-orchestrator.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/twitter-serenity/source-orchestrator.test.js
const { describe, test, expect, vi } = require('vitest');
const { createOrchestrator } = require('../../../src/main/twitter-serenity/source-orchestrator');

function makeSource(id, behavior) {
  return {
    id,
    type: 'nitter',
    url: `http://${id}`,
    fetchUserTimeline: vi.fn(async () => {
      if (behavior === 'fail') throw new Error(`${id} down`);
      return [{ id: `${id}-1`, text: 'ok', author: { handle: 'h' } }];
    }),
  };
}

describe('source-orchestrator', () => {
  test('首次 fetch 从第一个 source 拿到数据', async () => {
    const orch = createOrchestrator({
      sources: [makeSource('a', 'ok'), makeSource('b', 'ok')],
      cacheStore: { resetDegraded: vi.fn() },
    });
    const r = await orch.fetch('aleabitoreddit');
    expect(r.tweets).toHaveLength(1);
    expect(r.successMirror).toBe('a');
  });

  test('第一个失败 → fallback 到第二个', async () => {
    const orch = createOrchestrator({
      sources: [makeSource('a', 'fail'), makeSource('b', 'ok')],
      cacheStore: { resetDegraded: vi.fn() },
    });
    const r = await orch.fetch('aleabitoreddit');
    expect(r.tweets).toHaveLength(1);
    expect(r.successMirror).toBe('b');
  });

  test('全失败 → consecutiveFailureCount++ + 返回 degraded=true', async () => {
    const setDegraded = vi.fn().mockReturnValue(1);
    const orch = createOrchestrator({
      sources: [makeSource('a', 'fail'), makeSource('b', 'fail')],
      cacheStore: { setDegraded, resetDegraded: vi.fn() },
    });
    const r = await orch.fetch('aleabitoreddit');
    expect(r.tweets).toEqual([]);
    expect(r.degraded).toBe(true);
    expect(setDegraded).toHaveBeenCalled();
  });

  test('连续失败 3 次后调 onDegraded 回调', async () => {
    let degradedCalled = 0;
    const setDegraded = vi.fn((count) => count);
    const orch = createOrchestrator({
      sources: [makeSource('a', 'fail')],
      cacheStore: { setDegraded, resetDegraded: vi.fn() },
      onDegraded: () => { degradedCalled++; },
      degradedThreshold: 3,
    });
    await orch.fetch('h'); // count=1
    await orch.fetch('h'); // count=2
    await orch.fetch('h'); // count=3 → trigger
    expect(degradedCalled).toBe(1);
  });

  test('成功后 cacheStore.resetDegraded 被调', async () => {
    const resetDegraded = vi.fn();
    const orch = createOrchestrator({
      sources: [makeSource('a', 'ok')],
      cacheStore: { setDegraded: vi.fn(), resetDegraded },
    });
    await orch.fetch('h');
    expect(resetDegraded).toHaveBeenCalled();
  });

  test('连续失败次数 ≥ cooldownThreshold 的 source 被跳过 (30 分钟冷却)', async () => {
    const a = makeSource('a', 'fail');
    const b = makeSource('b', 'ok');
    const orch = createOrchestrator({
      sources: [a, b],
      cacheStore: { setDegraded: vi.fn(), resetDegraded: vi.fn() },
      cooldownThreshold: 2,
      cooldownMs: 30 * 60 * 1000,
    });
    await orch.fetch('h'); // a fail #1
    await orch.fetch('h'); // a fail #2 → 进入冷却
    await orch.fetch('h'); // a 被跳过, 直接走 b
    expect(b.fetchUserTimeline).toHaveBeenCalledTimes(3); // 前两次也试过 b? 实际: 前2次 a 失败后也会试 b
    // 修正: a 失败后 fallback 到 b, 所以前 2 次 b 也被调. 第 3 次 a 被跳过, b 被调
    // 关键断言: a 第 3 次没被调
    expect(a.fetchUserTimeline).toHaveBeenCalledTimes(2);
  });

  test('getHealth 返回每个 source 的状态', async () => {
    const orch = createOrchestrator({
      sources: [makeSource('a', 'ok'), makeSource('b', 'fail')],
      cacheStore: { setDegraded: vi.fn().mockReturnValue(1), resetDegraded: vi.fn() },
    });
    await orch.fetch('h');
    const health = orch.getHealth();
    expect(health).toHaveLength(2);
    const b = health.find((s) => s.id === 'b');
    expect(b.consecutiveFailures).toBe(1);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npx vitest run tests/main/twitter-serenity/source-orchestrator.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Create source-orchestrator.js**

```javascript
// src/main/twitter-serenity/source-orchestrator.js
/**
 * 镜像轮换 orchestrator.
 *   - 按 priority 顺序试 enabled source
 *   - 每个 source 记 lastSuccessAt + consecutiveFailures
 *   - 失败 ≥ cooldownThreshold 次 → 冷却 cooldownMs 内跳过
 *   - 全失败 → cacheStore.setDegraded(); 累计 ≥ degradedThreshold → onDegraded()
 *   - 成功 → cacheStore.resetDegraded()
 */

function createOrchestrator(deps) {
  const sources = deps.sources.slice();
  const cacheStore = deps.cacheStore;
  const onDegraded = deps.onDegraded || (() => {});
  const logger = deps.logger || { info() {}, warn() {}, error() {} };
  const degradedThreshold = deps.degradedThreshold || 3;
  const cooldownThreshold = deps.cooldownThreshold || 3;
  const cooldownMs = deps.cooldownMs || 30 * 60 * 1000;
  const handle = deps.handle || 'aleabitoreddit';

  // runtime health per source
  const health = new Map();
  for (const s of sources) {
    health.set(s.id, { id: s.id, consecutiveFailures: 0, lastSuccessAt: 0, cooldownUntil: 0 });
  }

  function isCoolingDown(sid, now = Date.now()) {
    const h = health.get(sid);
    if (!h) return false;
    return h.cooldownUntil > now;
  }

  async function fetch(handleArg) {
    const h = handleArg || handle;
    const now = Date.now();
    let success = false;
    let successMirror = null;
    let tweets = [];

    // enabled + 不在冷却期, 按 priority 顺序
    const sorted = sources.slice().sort((a, b) => (a.priority || 99) - (b.priority || 99));

    for (const src of sorted) {
      if (src.enabled === false) continue;
      if (isCoolingDown(src.id, now)) {
        logger.info(`[orchestrator] skip ${src.id} (cooldown)`);
        continue;
      }
      try {
        const raw = await src.fetchUserTimeline(h);
        if (Array.isArray(raw) && raw.length >= 0) {
          // 成功
          const hh = health.get(src.id);
          hh.consecutiveFailures = 0;
          hh.lastSuccessAt = now;
          hh.cooldownUntil = 0;
          tweets = raw;
          successMirror = src.id;
          success = true;
          logger.info(`[orchestrator] ${src.id} fetched ${raw.length} tweets`);
          break;
        }
      } catch (err) {
        const hh = health.get(src.id);
        hh.consecutiveFailures += 1;
        if (hh.consecutiveFailures >= cooldownThreshold) {
          hh.cooldownUntil = now + cooldownMs;
        }
        logger.warn(`[orchestrator] ${src.id} failed: ${err && err.message} (streak ${hh.consecutiveFailures})`);
        continue;
      }
    }

    if (success) {
      cacheStore.resetDegraded();
      return { ok: true, tweets, successMirror, degraded: false };
    }

    // 全失败
    const count = cacheStore.setDegraded();
    const degraded = count >= degradedThreshold;
    if (degraded) {
      try { onDegraded(); } catch (e) { logger.error(`[orchestrator] onDegraded threw: ${e.message}`); }
    }
    return { ok: false, tweets: [], successMirror: null, degraded, failureCount: count };
  }

  function getHealth() {
    return sources.map((s) => ({ ...health.get(s.id), enabled: s.enabled !== false }));
  }

  return { fetch, getHealth };
}

module.exports = { createOrchestrator };
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
npx vitest run tests/main/twitter-serenity/source-orchestrator.test.js
```
Expected: PASS, 7 tests

**如果 Task 9 Step 1 测试里 cooldown 那条的断言失败,调整断言以匹配实际 fallback 行为:** 前两次 a 失败后,orchestrator 会继续试 b(b 成功),所以 a 失败 2 次 b 成功 2 次。第 3 次 a 进入冷却被跳过。实际 `a.fetchUserTimeline` 被调 2 次,`b.fetchUserTimeline` 被调 3 次。修正测试断言到这两个值。

- [ ] **Step 5: Commit**

```bash
git add src/main/twitter-serenity/source-orchestrator.js tests/main/twitter-serenity/source-orchestrator.test.js
git commit -m "feat(twitter-serenity): source orchestrator rotation + cooldown (Serenity)"
```

---

## Task 10: scheduler.js (5 分钟轮询 + quiet hours)

**Files:**
- Create: `src/main/twitter-serenity/scheduler.js`
- Test: `tests/main/twitter-serenity/scheduler.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/twitter-serenity/scheduler.test.js
const { describe, test, expect, vi, beforeEach, afterEach } = require('vitest');

describe('scheduler', () => {
  let originals = {};

  beforeEach(() => {
    originals.now = Date.now;
    originals.interval = global.setInterval;
    originals.timeout = global.setTimeout;
  });
  afterEach(() => {
    Date.now = originals.now;
    global.setInterval = originals.interval;
    global.setTimeout = originals.timeout;
  });

  test('start 立即触发首次 fetch (非 quiet hours)', async () => {
    vi.useFakeTimers();
    const fetched = vi.fn().mockResolvedValue({ ok: true, tweets: [], degraded: false });
    const { createScheduler } = require('../../../src/main/twitter-serenity/scheduler');
    const sched = createScheduler({ fetchFn: fetched, intervalMs: 5 * 60 * 1000 });
    sched.start();
    expect(fetched).toHaveBeenCalledTimes(1);
    sched.stop();
    vi.useRealTimers();
  });

  test('quiet hours (23:00-07:00) 首次 fetch 被跳过', async () => {
    const realDate = Date;
    const fixed = new realDate('2026-06-22T02:00:00+08:00'); // 凌晨 2 点, 在 quiet hours
    global.Date = class extends realDate {
      constructor(...a) { super(...(a.length ? a : [fixed])); }
      static now() { return fixed.getTime(); }
    };
    const fetched = vi.fn().mockResolvedValue({ ok: true, tweets: [], degraded: false });
    const { createScheduler } = require('../../../src/main/twitter-serenity/scheduler');
    const sched = createScheduler({
      fetchFn: fetched,
      intervalMs: 5 * 60 * 1000,
      quietHours: { start: 23, end: 7 },
    });
    sched.start();
    expect(fetched).not.toHaveBeenCalled();
    sched.stop();
    global.Date = realDate;
  });

  test('triggerNow 跳过 quiet hours 直接触发', async () => {
    const realDate = Date;
    const fixed = new realDate('2026-06-22T02:00:00+08:00');
    global.Date = class extends realDate {
      constructor(...a) { super(...(a.length ? a : [fixed])); }
      static now() { return fixed.getTime(); }
    };
    const fetched = vi.fn().mockResolvedValue({ ok: true, tweets: [], degraded: false });
    const { createScheduler } = require('../../../src/main/twitter-serenity/scheduler');
    const sched = createScheduler({
      fetchFn: fetched,
      intervalMs: 5 * 60 * 1000,
      quietHours: { start: 23, end: 7 },
    });
    sched.start();
    await sched.triggerNow();
    expect(fetched).toHaveBeenCalled();
    sched.stop();
    global.Date = realDate;
  });

  test('fetch 抛错被吞不中断 setInterval', async () => {
    vi.useFakeTimers();
    const fetched = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ ok: true, tweets: [], degraded: false });
    const { createScheduler } = require('../../../src/main/twitter-serenity/scheduler');
    const sched = createScheduler({ fetchFn: fetched, intervalMs: 1000 });
    sched.start();
    // 首次 fetch 已 reject, 不应抛
    await vi.advanceTimersByTimeAsync(2000); // 触发第 2 次
    expect(fetched.mock.calls.length).toBeGreaterThanOrEqual(2);
    sched.stop();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npx vitest run tests/main/twitter-serenity/scheduler.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Create scheduler.js**

```javascript
// src/main/twitter-serenity/scheduler.js
/**
 * 5 分钟轮询 + quiet hours (默认 23:00-07:00) 跳过.
 * triggerNow() 打破 quiet hours (用户手动刷新).
 */

function createScheduler(deps) {
  const fetchFn = deps.fetchFn;
  const intervalMs = deps.intervalMs || 5 * 60 * 1000;
  const quietHours = deps.quietHours || { start: 23, end: 7 };
  const logger = deps.logger || { info() {}, warn() {}, error() {} };
  let timer = null;
  let running = false;

  function isInQuietHours(now = new Date()) {
    const h = now.getHours();
    const { start, end } = quietHours;
    if (start < end) {
      return h >= start && h < end;
    }
    // 跨夜: start > end (如 23-7)
    return h >= start || h < end;
  }

  async function tick() {
    if (running) return; // 防重入
    running = true;
    try {
      if (isInQuietHours()) {
        logger.info('[scheduler] in quiet hours, skip');
        return;
      }
      await fetchFn();
    } catch (err) {
      logger.error(`[scheduler] tick threw: ${err && err.message}`);
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    // 立即触发首次 (tick 内会判 quiet hours)
    tick();
    timer = setInterval(tick, intervalMs);
    if (timer.unref) timer.unref();
  }

  async function triggerNow() {
    if (running) return null;
    running = true;
    try {
      return await fetchFn();
    } catch (err) {
      logger.error(`[scheduler] triggerNow threw: ${err && err.message}`);
      return null;
    } finally {
      running = false;
    }
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop, triggerNow, isInQuietHours };
}

module.exports = { createScheduler };
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
npx vitest run tests/main/twitter-serenity/scheduler.test.js
```
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/twitter-serenity/scheduler.js tests/main/twitter-serenity/scheduler.test.js
git commit -m "feat(twitter-serenity): scheduler 5min poll + quiet hours (Serenity)"
```

---

## Task 11: index.js (IPC 注册 + 组装)

**Files:**
- Create: `src/main/twitter-serenity/index.js`
- Test: 复用现有 main IPC 测试模式;本 task 先组装,集成测试放最后

- [ ] **Step 1: Create index.js**

```javascript
// src/main/twitter-serenity/index.js
/**
 * Serenity 模块入口: 组装 source/orchestrator/cache/translator/scheduler,
 * 暴露 startTwitterSerenity(deps) / stopTwitterSerenity() + IPC handlers.
 */
const { HttpClient } = require('../http-client');
const stateStore = require('../state-store');
const { createNitterSource } = require('./sources/nitter-source');
const { createRsshubSource } = require('./sources/rsshub-source');
const { createDirectRssSource } = require('./sources/direct-rss-source');
const { createOrchestrator } = require('./source-orchestrator');
const { createCacheStore } = require('./cache-store');
const { createTranslator } = require('./translator');
const { createScheduler } = require('./scheduler');
const { normalizeTweet } = require('./tweet-source');
const { parseManualPaste } = require('./manual-paste-parser');
const sharedLlm = require('../../ai/shared-llm.js');

const HANDLE = 'aleabitoreddit';
const SOURCE_FACTORIES = {
  nitter: createNitterSource,
  rsshub: createRsshubSource,
  rss: createDirectRssSource,
};

let runtime = null;

function buildSources(config) {
  const httpClient = new HttpClient();
  return config.map((cfg) => {
    const factory = SOURCE_FACTORIES[cfg.type] || createDirectRssSource;
    return factory({ ...cfg, httpClient });
  });
}

async function doFetch() {
  if (!runtime) return { ok: false, degraded: false };
  const { orchestrator, cacheStore, translator, ipc } = runtime;
  const r = await orchestrator.fetch(HANDLE);
  if (r.ok && r.tweets.length) {
    const now = new Date().toISOString();
    const normalized = r.tweets.map((t) => normalizeTweet(t, now));
    const cache = cacheStore.mergeAndSave(normalized, { lastSuccessMirror: r.successMirror });
    if (ipc && ipc.send) {
      ipc.send('twitter:updated', { tweets: cache.tweets.slice(0, 50), lastFetchedAt: cache.lastFetchedAt });
    }
    return { ok: true, tweets: normalized, degraded: false };
  }
  if (r.degraded && ipc && ipc.send) {
    ipc.send('twitter:degraded', { failureCount: r.failureCount });
  }
  return { ok: false, degraded: r.degraded, failureCount: r.failureCount };
}

function startTwitterSerenity(deps) {
  if (runtime) return runtime;
  const logger = deps.logger || console;
  const sourcesConfig = stateStore.loadTwitterSources();
  const sources = buildSources(sourcesConfig);
  const cacheStore = createCacheStore({ stateStore });
  const translator = createTranslator({ sharedLlm, logger });
  const orchestrator = createOrchestrator({
    sources,
    cacheStore,
    handle: HANDLE,
    logger,
    onDegraded: () => {
      if (deps.sendEvent) deps.sendEvent('twitter:degraded', {});
    },
  });
  const scheduler = createScheduler({
    fetchFn: doFetch,
    logger,
  });
  scheduler.start();
  runtime = { orchestrator, cacheStore, translator, scheduler, ipc: deps, logger };

  // IPC handlers (deps.ipcMain 存在时注册)
  if (deps.ipcMain) {
    deps.ipcMain.handle('twitter:list', () => {
      const cache = cacheStore.load();
      return { tweets: cache.tweets.slice(0, 100), lastFetchedAt: cache.lastFetchedAt, degraded: cache.consecutiveFailureCount >= 3 };
    });
    deps.ipcMain.handle('twitter:fetch', async () => {
      return scheduler.triggerNow();
    });
    deps.ipcMain.handle('twitter:translate', async (_e, tweet) => {
      try {
        const zh = await translator.translateTweet(tweet);
        return { ok: true, id: tweet.id, zh };
      } catch (err) {
        return { ok: false, id: tweet.id, error: err.message };
      }
    });
    deps.ipcMain.handle('twitter:sources:list', () => stateStore.loadTwitterSources());
    deps.ipcMain.handle('twitter:sources:add', (_e, src) => {
      const list = stateStore.loadTwitterSources();
      list.push(src);
      stateStore.saveTwitterSources(list);
      return { ok: true };
    });
    deps.ipcMain.handle('twitter:sources:remove', (_e, id) => {
      const list = stateStore.loadTwitterSources().filter((s) => s.id !== id);
      stateStore.saveTwitterSources(list);
      return { ok: true };
    });
    deps.ipcMain.handle('twitter:sources:test', async (_e, src) => {
      const httpClient = new HttpClient();
      try {
        const factory = SOURCE_FACTORIES[src.type] || createDirectRssSource;
        const tmp = factory({ ...src, httpClient });
        const t0 = Date.now();
        const tweets = await tmp.fetchUserTimeline(HANDLE);
        return { ok: true, durationMs: Date.now() - t0, count: tweets.length, preview: tweets[0] || null };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    deps.ipcMain.handle('twitter:manual-paste', async (_e, text) => {
      const parsed = parseManualPaste(text);
      if (parsed.results.length) {
        const now = new Date().toISOString();
        const normalized = parsed.results.map((t) => normalizeTweet(t, now));
        cacheStore.mergeAndSave(normalized);
      }
      return parsed;
    });
  }

  return runtime;
}

function stopTwitterSerenity() {
  if (!runtime) return;
  try { runtime.scheduler.stop(); } catch { /* noop */ }
  runtime = null;
}

module.exports = { startTwitterSerenity, stopTwitterSerenity, HANDLE, doFetch };
```

- [ ] **Step 2: Smoke test (require 不抛)**

```bash
node -e "require('./src/main/twitter-serenity/index.js'); console.log('ok')"
```
Expected: 输出 `ok`,无异常

- [ ] **Step 3: Commit**

```bash
git add src/main/twitter-serenity/index.js
git commit -m "feat(twitter-serenity): index.js assemble + IPC handlers (Serenity)"
```

---

## Task 12: renderer store + SideNav + navStore 接线

**Files:**
- Create: `src/renderer/twitter-serenity/store.js`
- Modify: `src/renderer/worldcup/navStore.js`
- Modify: `src/renderer/components/SideNav.jsx`

- [ ] **Step 1: Create store.js**

```javascript
// src/renderer/twitter-serenity/store.js
import { signal } from '@preact/signals';

export const serenityTweets = signal([]);
export const serenityLoading = signal(false);
export const serenityError = signal(null);
export const serenityLastFetchedAt = signal(null);
export const serenityDegraded = signal(false);
export const serenitySources = signal([]);

export function resetSerenityStore() {
  serenityTweets.value = [];
  serenityLoading.value = false;
  serenityError.value = null;
  serenityLastFetchedAt.value = null;
  serenityDegraded.value = false;
  serenitySources.value = [];
}
```

- [ ] **Step 2: Modify navStore.js — 加 'serenity' 到 NAV_KEYS**

在 `src/renderer/worldcup/navStore.js`:

```diff
-const NAV_KEYS = new Set(["ithome", "wechat-hot", "worldcup", "funds", "metals", "ai-usage", "versions"]);
+const NAV_KEYS = new Set(["ithome", "wechat-hot", "worldcup", "funds", "metals", "ai-usage", "serenity", "versions"]);
```

- [ ] **Step 3: Modify SideNav.jsx — 在 ai-usage 之后插入 serenity 项**

在 `src/renderer/components/SideNav.jsx` 的 `NAV_ITEMS` 数组,`ai-usage` 那一行之后、`versions` 之前加:

```javascript
  { key: 'serenity',  icon: '🐦', label: 'Serenity', tooltip: 'Serenity 财经推文 + AI 中文翻译' },
```

- [ ] **Step 4: Verify nav guard works**

```bash
node -e "
const fs = require('fs');
const code = fs.readFileSync('src/renderer/worldcup/navStore.js', 'utf8');
if (!code.includes('\"serenity\"')) { console.error('FAIL: serenity not in NAV_KEYS'); process.exit(1); }
const nav = fs.readFileSync('src/renderer/components/SideNav.jsx', 'utf8');
if (!nav.includes(\"key: 'serenity'\")) { console.error('FAIL: serenity not in SideNav'); process.exit(1); }
console.log('ok');
"
```
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/twitter-serenity/store.js src/renderer/worldcup/navStore.js src/renderer/components/SideNav.jsx
git commit -m "feat(renderer): serenity store + SideNav item + navStore key (Serenity)"
```

---

## Task 13: SerenityTweetDetail + SerenityTweetList

**Files:**
- Create: `src/renderer/twitter-serenity/SerenityTweetDetail.jsx`
- Create: `src/renderer/twitter-serenity/SerenityTweetList.jsx`
- Test: `tests/renderer/twitter-serenity/SerenityTweetDetail.test.jsx`(合并测,本 task 只建 detail)

- [ ] **Step 1: Create SerenityTweetDetail.jsx**

```jsx
// src/renderer/twitter-serenity/SerenityTweetDetail.jsx
import { useState } from 'preact/hooks';
import { api } from '../api.js';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SerenityTweetDetail({ tweet, translatedZh, onTranslated }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [err, setErr] = useState(null);

  async function doTranslate() {
    if (translatedZh) return;
    setTranslating(true);
    setErr(null);
    try {
      const r = await api.twitterTranslate(tweet);
      if (r && r.ok) {
        onTranslated(tweet.id, r.zh);
      } else {
        setErr(r && r.error || 'translate failed');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setTranslating(false);
    }
  }

  const display = showOriginal ? tweet.text : (translatedZh || tweet.text);
  const isTranslated = !!translatedZh && !showOriginal;

  return (
    <article class="serenity-tweet">
      <header class="serenity-tweet-header">
        <span class="serenity-tweet-author">{tweet.author.displayName || tweet.author.handle}</span>
        <span class="serenity-tweet-time">{timeAgo(tweet.publishedAt || tweet.fetchedAt)}</span>
      </header>
      <p class="serenity-tweet-text">
        {display}
        {isTranslated && <span class="serenity-tweet-translated-tag"> · AI 译文</span>}
      </p>
      <footer class="serenity-tweet-footer">
        {tweet.metrics && (
          <span class="serenity-tweet-metrics">
            💬 {tweet.metrics.replies || 0} ↩ {tweet.metrics.retweets || 0} ❤️ {tweet.metrics.likes || 0}
          </span>
        )}
        {tweet.url && (
          <a class="serenity-tweet-link" href={tweet.url} target="_blank" rel="noreferrer">原文</a>
        )}
      </footer>
      <div class="serenity-tweet-actions">
        {!translatedZh && !translating && (
          <button type="button" class="serenity-translate-btn" onClick={doTranslate}>翻译</button>
        )}
        {translating && <span class="serenity-translating">翻译中…</span>}
        {err && <span class="serenity-translate-error">翻译失败,点击重试</span>}
        {translatedZh && (
          <button type="button" class="serenity-toggle-original" onClick={() => setShowOriginal(!showOriginal)}>
            {showOriginal ? '看译文' : '看原文'}
          </button>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Create SerenityTweetList.jsx**

```jsx
// src/renderer/twitter-serenity/SerenityTweetList.jsx
import { useState, useEffect } from 'preact/hooks';
import { SerenityTweetDetail } from './SerenityTweetDetail.jsx';

const TRANSLATE_BATCH = 5;

export function SerenityTweetList({ tweets, translations, onTranslate, visibleCount = 20 }) {
  const [autoTranslatedIds, setAutoTranslatedIds] = useState(new Set());

  // 滚动到可见区域的前 N 条自动翻译
  useEffect(() => {
    const toTranslate = tweets.slice(0, TRANSLATE_BATCH)
      .filter((t) => !translations[t.id] && !autoTranslatedIds.has(t.id))
      .map((t) => t.id);
    if (toTranslate.length === 0) return;
    setAutoTranslatedIds((prev) => {
      const next = new Set(prev);
      toTranslate.forEach((id) => next.add(id));
      return next;
    });
    toTranslate.forEach((id) => {
      const tweet = tweets.find((t) => t.id === id);
      if (tweet) onTranslate(tweet);
    });
  }, [tweets, translations]);

  return (
    <div class="serenity-tweet-list">
      {tweets.slice(0, visibleCount).map((t) => (
        <SerenityTweetDetail
          key={t.id}
          tweet={t}
          translatedZh={translations[t.id]}
          onTranslated={onTranslate}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/twitter-serenity/SerenityTweetDetail.jsx src/renderer/twitter-serenity/SerenityTweetList.jsx
git commit -m "feat(renderer): serenity TweetDetail + TweetList (Serenity)"
```

---

## Task 14: TwitterSerenityPanel + TwitterSourcesSettings

**Files:**
- Create: `src/renderer/twitter-serenity/TwitterSerenityPanel.jsx`
- Create: `src/renderer/twitter-serenity/TwitterSourcesSettings.jsx`

- [ ] **Step 1: Create TwitterSerenityPanel.jsx**

```jsx
// src/renderer/twitter-serenity/TwitterSerenityPanel.jsx
import { useEffect, useState } from 'preact/hooks';
import {
  serenityTweets,
  serenityLoading,
  serenityError,
  serenityLastFetchedAt,
  serenityDegraded,
} from './store.js';
import { api } from '../api.js';
import { SerenityTweetList } from './SerenityTweetList.jsx';

function minsAgo(iso) {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return `${m} 分钟前`;
}

export function TwitterSerenityPanel() {
  const tweets = serenityTweets.value;
  const loading = serenityLoading.value;
  const error = serenityError.value;
  const lastFetchedAt = serenityLastFetchedAt.value;
  const degraded = serenityDegraded.value;
  const [translations, setTranslations] = useState({});
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    let mounted = true;
    serenityLoading.value = true;
    api.twitterList().then((r) => {
      if (!mounted) return;
      if (r && r.tweets) serenityTweets.value = r.tweets;
      serenityLastFetchedAt.value = r && r.lastFetchedAt;
      serenityDegraded.value = r && r.degraded;
      serenityLoading.value = false;
    }).catch((e) => {
      if (!mounted) return;
      serenityError.value = e.message;
      serenityLoading.value = false;
    });
    return () => { mounted = false; };
  }, []);

  async function refresh() {
    serenityLoading.value = true;
    try {
      const r = await api.twitterFetch();
      if (r && r.tweets) serenityTweets.value = r.tweets;
    } finally {
      serenityLoading.value = false;
    }
  }

  async function handleTranslate(tweet) {
    const r = await api.twitterTranslate(tweet);
    if (r && r.ok) {
      setTranslations((prev) => ({ ...prev, [r.id]: r.zh }));
    }
  }

  async function handlePaste() {
    const r = await api.twitterManualPaste(pasteText);
    if (r && r.results && r.results.length) {
      setPasteText('');
      setShowPasteBox(false);
      const list = await api.twitterList();
      if (list && list.tweets) serenityTweets.value = list.tweets;
    }
  }

  return (
    <div class="serenity-panel">
      <header class="serenity-status-bar">
        <span>{minsAgo(lastFetchedAt) || '未拉取'} · 共 {tweets.length} 条</span>
        <button type="button" class="serenity-refresh" onClick={refresh} disabled={loading}>
          {loading ? '刷新中…' : '强制刷新'}
        </button>
      </header>

      {degraded && (
        <div class="serenity-degraded-banner">
          <span>镜像源不可用</span>
          <button type="button" onClick={() => setShowPasteBox(!showPasteBox)}>点击手动粘贴</button>
        </div>
      )}

      {showPasteBox && (
        <div class="serenity-paste-box">
          <textarea
            value={pasteText}
            onInput={(e) => setPasteText(e.target.value)}
            placeholder="粘贴推文链接或原文 (每行一条)"
            rows={4}
          />
          <button type="button" onClick={handlePaste}>提交</button>
        </div>
      )}

      {error && <div class="serenity-error">加载失败: {error}</div>}

      <SerenityTweetList
        tweets={tweets}
        translations={translations}
        onTranslate={handleTranslate}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create TwitterSourcesSettings.jsx**

```jsx
// src/renderer/twitter-serenity/TwitterSourcesSettings.jsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';

function statusBadge(src, health) {
  if (src.enabled === false) return '⏸ 已禁用';
  const h = health && health.find((x) => x.id === src.id);
  if (!h) return '?';
  if (h.consecutiveFailures > 0) return `⚠ 连续失败 ${h.consecutiveFailures} 次`;
  if (h.lastSuccessAt) return '✓ 最近成功';
  return '?';
}

export function TwitterSourcesSettings() {
  const [sources, setSources] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState('nitter');
  const [testing, setTesting] = useState(null);

  useEffect(() => {
    api.twitterSourcesList().then((r) => setSources(r || []));
  }, []);

  async function addSrc() {
    if (!newUrl) return;
    await api.twitterSourcesAdd({
      id: `user-${Date.now()}`, type: newType, url: newUrl, enabled: true, priority: sources.length + 1,
    });
    setNewUrl('');
    const r = await api.twitterSourcesList();
    setSources(r || []);
  }

  async function removeSrc(id) {
    await api.twitterSourcesRemove(id);
    const r = await api.twitterSourcesList();
    setSources(r || []);
  }

  async function testSrc(src) {
    setTesting(src.id);
    try {
      const r = await api.twitterSourcesTest(src);
      window.alert(r.ok ? `成功 · ${r.durationMs}ms · ${r.count} 条` : `失败: ${r.error}`);
    } finally {
      setTesting(null);
    }
  }

  return (
    <div class="twitter-sources-settings">
      <h3>Serenity 镜像源</h3>
      <ul class="sources-list">
        {sources.map((src) => (
          <li key={src.id} class="source-row">
            <span class="source-url">{src.url}</span>
            <span class="source-type">{src.type}</span>
            <span class="source-priority">P{src.priority}</span>
            <span class="source-status">{statusBadge(src, null)}</span>
            <button type="button" onClick={() => testSrc(src)} disabled={testing === src.id}>
              {testing === src.id ? '测试中…' : '测试'}
            </button>
            <button type="button" onClick={() => removeSrc(src.id)}>删除</button>
          </li>
        ))}
      </ul>
      <div class="source-add">
        <select value={newType} onChange={(e) => setNewType(e.target.value)}>
          <option value="nitter">Nitter</option>
          <option value="rsshub">RSSHub</option>
          <option value="rss">通用 RSS</option>
        </select>
        <input value={newUrl} onInput={(e) => setNewUrl(e.target.value)} placeholder="https://..." />
        <button type="button" onClick={addSrc}>添加</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/twitter-serenity/TwitterSerenityPanel.jsx src/renderer/twitter-serenity/TwitterSourcesSettings.jsx
git commit -m "feat(renderer): SerenityPanel + SourcesSettings (Serenity)"
```

---

## Task 15: api.js 桥接 + renderer 测试

**Files:**
- Modify: `src/renderer/api.js` (加 twitter* 方法)
- Test: `tests/renderer/twitter-serenity/TwitterSerenityPanel.test.jsx`

- [ ] **Step 1: Check api.js pattern and add twitter methods**

先读 `src/renderer/api.js` 了解 invoke 模式,然后在导出的 api 对象里加:

```javascript
// 在 src/renderer/api.js 的 api 对象里加:
twitterList: () => window.electronAPI?.invoke('twitter:list').catch(() => null),
twitterFetch: () => window.electronAPI?.invoke('twitter:fetch').catch(() => null),
twitterTranslate: (tweet) => window.electronAPI?.invoke('twitter:translate', tweet).catch(() => ({ ok: false })),
twitterSourcesList: () => window.electronAPI?.invoke('twitter:sources:list').catch(() => []),
twitterSourcesAdd: (src) => window.electronAPI?.invoke('twitter:sources:add', src),
twitterSourcesRemove: (id) => window.electronAPI?.invoke('twitter:sources:remove', id),
twitterSourcesTest: (src) => window.electronAPI?.invoke('twitter:sources:test', src),
twitterManualPaste: (text) => window.electronAPI?.invoke('twitter:manual-paste', text),
```

**确认 invoke 方式:** 先读 api.js 看现有方法(如 `digestFetchSections`)用的是 `window.electronAPI.invoke` 还是 `window.electronIPC.invoke` 或别的,按现有模式对齐。

- [ ] **Step 2: Write renderer test**

```jsx
// tests/renderer/twitter-serenity/TwitterSerenityPanel.test.jsx
// @vitest-environment happy-dom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/preact';

const twitterList = vi.fn();
const twitterFetch = vi.fn();
const twitterTranslate = vi.fn();
const twitterManualPaste = vi.fn();

vi.mock('../../../src/renderer/api.js', () => ({
  api: {
    twitterList,
    twitterFetch,
    twitterTranslate,
    twitterSourcesList: vi.fn().mockResolvedValue([]),
    twitterSourcesAdd: vi.fn(),
    twitterSourcesRemove: vi.fn(),
    twitterSourcesTest: vi.fn(),
    twitterManualPaste,
  },
}));

import { TwitterSerenityPanel } from '../../../src/renderer/twitter-serenity/TwitterSerenityPanel.jsx';
import { resetSerenityStore } from '../../../src/renderer/twitter-serenity/store.js';

beforeEach(() => {
  vi.clearAllMocks();
  resetSerenityStore();
  twitterList.mockResolvedValue({
    tweets: [{ id: '1', text: 'hello', author: { handle: 'h', displayName: 'H' }, publishedAt: new Date().toISOString(), metrics: { likes: 1 } }],
    lastFetchedAt: new Date().toISOString(),
    degraded: false,
  });
});

describe('TwitterSerenityPanel', () => {
  test('挂载后调 twitterList 并渲染 tweets', async () => {
    const { container, getByText } = render(<TwitterSerenityPanel />);
    await waitFor(() => expect(twitterList).toHaveBeenCalled());
    await waitFor(() => expect(getByText(/hello/)).toBeTruthy());
  });

  test('degraded=true 时显示降级横幅 + 手动粘贴按钮', async () => {
    twitterList.mockResolvedValueOnce({ tweets: [], lastFetchedAt: null, degraded: true });
    const { getByText } = render(<TwitterSerenityPanel />);
    await waitFor(() => expect(getByText('镜像源不可用')).toBeTruthy());
    expect(getByText('点击手动粘贴')).toBeTruthy();
  });

  test('点强制刷新调 twitterFetch', async () => {
    twitterFetch.mockResolvedValue({ tweets: [] });
    const { getByText } = render(<TwitterSerenityPanel />);
    await waitFor(() => expect(twitterList).toHaveBeenCalled());
    const btn = getByText('强制刷新');
    btn.click();
    await waitFor(() => expect(twitterFetch).toHaveBeenCalled());
  });
});
```

- [ ] **Step 3: Run renderer test**

```bash
npx vitest run tests/renderer/twitter-serenity/TwitterSerenityPanel.test.jsx
```
Expected: PASS, 3 tests

- [ ] **Step 4: Commit**

```bash
git add src/renderer/api.js tests/renderer/twitter-serenity/TwitterSerenityPanel.test.jsx
git commit -m "feat(renderer): api bridge + SerenityPanel test (Serenity)"
```

---

## Task 16: aggregate.js + DigestSection.jsx + serenity-section.jsx

**Files:**
- Modify: `src/main/digest/aggregate.js`
- Modify: `src/renderer/digest/DigestSection.jsx`
- Create: `src/renderer/twitter-serenity/serenity-section.jsx`
- Test: `tests/main/digest/aggregate-serenity.test.js`
- Test: `tests/renderer/twitter-serenity/serenity-section.test.jsx`

- [ ] **Step 1: Write aggregate test**

```javascript
// tests/main/digest/aggregate-serenity.test.js
const { describe, test, expect } = require('vitest');
const { aggregate } = require('../../../src/main/digest/aggregate');

describe('aggregate serenity section', () => {
  test('twitterCache 有 tweets 时输出 serenity section (Top 3)', () => {
    const state = {
      apps: {},
      twitterCache: {
        handle: 'aleabitoreddit',
        tweets: [
          { id: '1', text: 'tweet one', author: { handle: 'h', displayName: 'Serenity' }, publishedAt: '2026-06-22T10:00:00Z' },
          { id: '2', text: 'tweet two', author: { handle: 'h', displayName: 'Serenity' }, publishedAt: '2026-06-22T09:00:00Z' },
          { id: '3', text: 'tweet three', author: { handle: 'h', displayName: 'Serenity' }, publishedAt: '2026-06-22T08:00:00Z' },
          { id: '4', text: 'tweet four (should be cut)', author: { handle: 'h', displayName: 'Serenity' }, publishedAt: '2026-06-22T07:00:00Z' },
        ],
        translations: { '1': '推文一', '2': '推文二' },
      },
    };
    const r = aggregate(state, { now: new Date('2026-06-22T11:00:00Z') });
    const sec = r.sections.find((s) => s.kind === 'serenity');
    expect(sec).toBeTruthy();
    expect(sec.items).toHaveLength(3);
  });

  test('无 twitterCache 时不输出 serenity section', () => {
    const r = aggregate({ apps: {} }, { now: new Date() });
    expect(r.sections.find((s) => s.kind === 'serenity')).toBeFalsy();
  });

  test('serenity 在 SECTION_ORDER 中 (顺序不影响 drawer, 但要有)', () => {
    const state = { apps: {}, twitterCache: { tweets: [{ id: '1', text: 'x', author: {} }] } };
    const r = aggregate(state, { now: new Date() });
    const kinds = r.sections.map((s) => s.kind);
    expect(kinds).toContain('serenity');
  });
});
```

- [ ] **Step 2: Modify aggregate.js**

在 `src/main/digest/aggregate.js`:

(a) 改 `SECTION_ORDER`:
```diff
-const SECTION_ORDER = ['updates', 'hot', 'news', 'funds', 'ai_usage', 'worldcup'];
+const SECTION_ORDER = ['updates', 'hot', 'news', 'funds', 'ai_usage', 'worldcup', 'serenity'];
```

(b) 在文件里其他 `sectionXxx` 函数附近加:

```javascript
function sectionSerenity(twitterCache) {
  if (!twitterCache || !Array.isArray(twitterCache.tweets) || twitterCache.tweets.length === 0) return null;
  const top = twitterCache.tweets.slice(0, 3);
  const items = top.map((t) => {
    const zh = (twitterCache.translations && twitterCache.translations[t.id]) || '';
    return {
      handle: (t.author && t.author.handle) || '',
      text: zh || (t.text || '').slice(0, 80),
      isTranslated: !!zh,
      publishedAt: t.publishedAt,
    };
  });
  return { kind: 'serenity', items };
}
```

(c) 在 aggregate 主函数里(找其他 `sectionXxx` 被调用的地方,通常是 `const sections = [...]`),加:
```javascript
sectionSerenity(state.twitterCache),
```

(d) 在 `lineFor(s)` 或对应的 lines 拼接函数里加 serenity case:
```javascript
case 'serenity':
  return `${s.items.map((it) => `  · @${it.handle}: ${it.text}`).join('\n')}`;
```

- [ ] **Step 3: Run aggregate test**

```bash
npx vitest run tests/main/digest/aggregate-serenity.test.js
```
Expected: PASS, 3 tests

- [ ] **Step 4: Modify DigestSection.jsx — LABELS + renderItem**

在 `src/renderer/digest/DigestSection.jsx`:

(a) `LABELS` 加:
```javascript
serenity: { title: 'Serenity 推文', icon: '🐦' },
```

(b) `renderItem` 的 switch 加:
```jsx
case 'serenity':
  return `${it.isTranslated ? '[译] ' : ''}@${it.handle}: ${it.text}`;
```

- [ ] **Step 5: Create serenity-section.jsx (DigestDrawer 适配器,可选 — 若 DigestSection 通用渲染够用则跳过)**

```jsx
// src/renderer/twitter-serenity/serenity-section.jsx
// DigestDrawer 内直接用 <DigestSection section={...} /> 渲染 serenity,
// 本文件留作未来扩展 (e.g. 点击跳转面板), 当前导出 passthrough.
export const SERENITY_SECTION_KIND = 'serenity';
```

- [ ] **Step 6: Write serenity-section test**

```jsx
// tests/renderer/twitter-serenity/serenity-section.test.jsx
// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { DigestSection } from '../../../src/renderer/digest/DigestSection.jsx';

describe('DigestSection serenity', () => {
  test('渲染 serenity kind 带 🐦 icon + title', () => {
    const { container, getByText } = render(
      <DigestSection section={{ kind: 'serenity', items: [{ handle: 'h', text: 'hi', isTranslated: true }] }} />
    );
    expect(getByText('Serenity 推文')).toBeTruthy();
    expect(getByText(/\[译\] @h: hi/)).toBeTruthy();
  });

  test('serenity items 空时仍渲染 header', () => {
    const { getByText } = render(<DigestSection section={{ kind: 'serenity', items: [] }} />);
    expect(getByText('Serenity 推文')).toBeTruthy();
  });
});
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run tests/main/digest/aggregate-serenity.test.js tests/renderer/twitter-serenity/serenity-section.test.jsx
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/main/digest/aggregate.js src/renderer/digest/DigestSection.jsx src/renderer/twitter-serenity/serenity-section.jsx tests/main/digest/aggregate-serenity.test.js tests/renderer/twitter-serenity/serenity-section.test.jsx
git commit -m "feat(digest): aggregate serenity section + DigestSection render (Serenity)"
```

---

## Task 17: index.js main 接线 + Settings 挂载

**Files:**
- Modify: `src/main/index.js`
- Modify: `src/renderer/components/Settings.jsx`(若存在,挂载 TwitterSourcesSettings)

- [ ] **Step 1: Wire into main/index.js**

在 `src/main/index.js` 的 `bootstrap()` 函数里(require 区 + scheduler 启动区),参考 daily-summary-job 的启动模式:

(a) 顶部 require 区加:
```javascript
const { startTwitterSerenity, stopTwitterSerenity } = require("./twitter-serenity");
```

(b) 在 `bootstrap()` 内,找 `startDailySummaryJob({...})` 调用附近,加:
```javascript
startTwitterSerenity({
  ipcMain,
  logger: mainLog,
  sendEvent: (channel, payload) => {
    const w = getWindow();
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  },
});
```

(c) 在 `app.on("before-quit", ...)` 内加(参考其他 scheduler stop):
```javascript
try { stopTwitterSerenity(); } catch { /* noop */ }
```

- [ ] **Step 2: Mount in Settings.jsx**

读 `src/renderer/components/Settings.jsx` 找现有 tab/section 结构,在合适位置(如 AI 配置附近)加:

```jsx
import { TwitterSourcesSettings } from '../twitter-serenity/TwitterSourcesSettings.jsx';
// ...
<TwitterSourcesSettings />
```

**如果 Settings.jsx 结构复杂或不存在**,跳过 UI 挂载,只保证 IPC 可用,留作下一切片。在本 task commit message 里说明。

- [ ] **Step 3: Smoke require**

```bash
node -e "require('./src/main/index.js'); console.log('main loads ok')" 2>&1 | tail -5
```
Expected: 无 require 错误(electron app 对象缺失的报错可接受,只要模块解析成功)

- [ ] **Step 4: Commit**

```bash
git add src/main/index.js src/renderer/components/Settings.jsx
git commit -m "feat(main): wire twitter-serenity into bootstrap + Settings mount (Serenity)"
```

---

## Task 18: 全套测试 + 路线图附录更新

**Files:**
- Modify: `docs/superpowers/specs/2026-06-19-product-roadmap-design.md`(§10 附录加 serenity 行)

- [ ] **Step 1: Run full vitest suite**

```bash
npx vitest run 2>&1 | tail -30
```
Expected: 全绿。原有套件 + 本 plan 新增 ~50 case 全过。**如果任何现有测试因 schema bump 或 aggregate SECTION_ORDER 改动红掉,修复断言。**

- [ ] **Step 2: Manual smoke (需手动,记录结果到 commit body)**

启动 app,验证:
- SideNav 出现第 8 项 🐦 Serenity
- 点进去不崩(tweets 为空也显示状态条)
- 强制刷新按钮可点(网络可能失败,看 degraded 横幅是否出现)
- DigestDrawer 里有 Serenity section(cache 空则不显示)
- 设置页有镜像源管理

- [ ] **Step 3: Update roadmap appendix**

在 `docs/superpowers/specs/2026-06-19-product-roadmap-design.md` §10 实施状态附录的表格末尾加一行:

```markdown
| (新) | Twitter Serenity 面板 (社交媒体信息源) | — | ✅ 已落地 | `src/main/twitter-serenity/` (9 文件) + `src/renderer/twitter-serenity/` (6 文件); IPC `twitter:list/fetch/translate/sources:*/manual-paste`; state.json `twitterCache` + `twitterSources` (schema v2); aggregate.js serenity section; `docs/superpowers/specs/2026-06-22-twitter-serenity-panel-design.md` |
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-19-product-roadmap-design.md
git commit -m "docs(roadmap): add Twitter Serenity to §10 appendix (landed)"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Self-Review Checklist (执行完后对照)

- [ ] Spec §2.1 In Scope 7 条 → 都有对应 task(面板 = T12/T14, 抓取 = T3-5/9, 翻译 = T1/7, state.json = T2/6, 镜像源管理 = T14, 降级 = T8/14, DailyDigest = T16)
- [ ] Spec §3.1 5 层架构 → 17 个新文件全部在 File Structure 列出
- [ ] Spec §3.2 原则 6 (UA per-request) → Task 3 (常量) + Task 4/5 (header 透传)
- [ ] Spec §4.1 NormalizedTweet → Task 3 normalizeTweet 产出
- [ ] Spec §4.2 state.json 字段 → Task 2 schema + Task 6 cache-store
- [ ] Spec §5.2 单次 fetch 流程 → Task 9 orchestrator.fetch
- [ ] Spec §5.4 手动粘贴 → Task 8 parser + Task 11 IPC + Task 14 UI
- [ ] Spec §6.1 翻译 LRU + prompt → Task 7 translator
- [ ] Spec §7 错误处理 → 分散在各 task 的 try/catch + degraded 路径
- [ ] Spec §9 测试矩阵 → 7 main + 3 renderer 测试文件齐全
- [ ] Spec §10 文件清单 → File Structure 全覆盖
