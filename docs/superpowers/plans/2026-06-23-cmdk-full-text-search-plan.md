# 全文搜索 Cmd+K (A3) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cmd+K/Ctrl+K 唤起全局搜索 modal，跨本地持久化文本（IT新闻/AI任务/提醒/基金/apps）做 bigram 倒排索引检索，命中高亮 + 切面板滚动定位。

**Architecture:** 主进程启动时从 state.json 构建内存 inverted index（Map + 两套倒排：全文/标题），bigram 中文分词零依赖；renderer 端搜索 modal（左来源栏 + 右结果列表），IPC 拉模式查询；跳转复用 tray-focus 滚动高亮机制。

**Tech Stack:** Node.js (Electron main, CommonJS), Preact + @preact/signals (renderer), vitest, esbuild

**Spec:** `docs/superpowers/specs/2026-06-23-cmdk-full-text-search-design.md`

---

## 文件结构

### 主进程（新建）

| 文件 | 责任 |
| --- | --- |
| `src/main/search/tokenizer.js` | 分词纯函数: bigram(中文) + 空格(英文) + 停用词 |
| `src/main/search/highlight.js` | 高亮片段纯函数: makeSnippet(searchText, queryTokens) |
| `src/main/search/search-index.js` | inverted index: buildFromState / upsert / query / counts |
| `src/main/search/build-docs.js` | 从 state.json 各源抽取成 Doc 列表（纯函数，便于单测）|
| `src/main/ipc/register-search.js` | IPC 薄包装: search:query / search:upsert / search:rebuild |

### Renderer（新建）

| 文件 | 责任 |
| --- | --- |
| `src/renderer/search/searchStore.js` | signals: isOpen/query/activeSource/results/counts/selectedIndex + actions |
| `src/renderer/search/SearchModal.jsx` | 顶层: 输入框 + 左来源栏 + 右结果 + 键盘导航 |
| `src/renderer/search/SearchSourceBar.jsx` | 左侧来源栏 (命中数 + 1-5 切源) |
| `src/renderer/search/SearchResultList.jsx` | 右侧结果列表 |
| `src/renderer/search/SearchResultRow.jsx` | 单条卡片 (标题 + matchedSnippet 高亮) |
| `src/renderer/search/search-nav.js` | 跳转: 切面板 + 滚动高亮 (复用 tray-focus) |

### 修改

| 文件 | 改动 |
| --- | --- |
| `src/main/index.js` | bootstrap 调 buildFromState + 注册 registerSearchIpc |
| `preload.js` + `src/renderer/api.js` | 暴露 searchQuery/searchUpsert |
| `src/renderer/AppShell.jsx` | Cmd+K/Ctrl+K 监听 + 挂 `<SearchModal />` |
| `src/renderer/ithome/NewsArticleRow.jsx` | 补 `data-article-id` |
| `src/renderer/components/AppRow.jsx` | 复用现有 `data-name`（无需改）|
| 其他 reminder/fund/ai-task 行组件 | 补 data 属性（见 Task 8）|
| `src/main/ithome/news-store.js` | 写盘点调 searchUpsert |
| `styles.css` | 搜索 modal 样式 |

---

## Task 1: 分词器 `tokenizer.js`（TDD）

**Files:**
- Create: `src/main/search/tokenizer.js`
- Test: `tests/main/search/tokenizer.test.js`

- [ ] **Step 1: 写失败测试**

创建 `tests/main/search/tokenizer.test.js`：

```js
/**
 * tests/main/search/tokenizer.test.js
 * A3: 分词器 — bigram(中文) + 空格(英文) + 停用词
 */
import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/main/search/tokenizer.js';

describe('tokenizer', () => {
  it('splits English by whitespace + lowercases', () => {
    expect(tokenize('Cursor Performance Update')).toEqual(
      expect.arrayContaining(['cursor', 'performance', 'update']),
    );
    expect(tokenize('Cursor Performance Update')).toHaveLength(3);
  });

  it('bigrams continuous Chinese', () => {
    // 人工智能 → 人工, 工智, 智能
    const tokens = tokenize('人工智能');
    expect(tokens).toEqual(expect.arrayContaining(['人工', '工智', '智能']));
    expect(tokens).toHaveLength(3);
  });

  it('filters stopwords (Chinese)', () => {
    // "的" 是停用词, 不应单独出现 (但 "目的" 的 bigram "目的" 应保留)
    const tokens = tokenize('性能的优化');
    expect(tokens).toEqual(expect.arrayContaining(['性能', '能的', '的优', '优化']));
    expect(tokens).not.toContain('的');
  });

  it('filters stopwords (English)', () => {
    const tokens = tokenize('the update of cursor');
    expect(tokens).toEqual(['update', 'cursor']);
  });

  it('handles mixed Chinese + English', () => {
    const tokens = tokenize('Cursor 性能优化');
    expect(tokens).toEqual(expect.arrayContaining(['cursor', '性能', '能优', '优化']));
  });

  it('returns empty array for empty/whitespace input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });

  it('returns empty array for pure stopwords', () => {
    expect(tokenize('的 了 是 the a')).toEqual([]);
  });

  it('deduplicates tokens', () => {
    // "性能性能" → 性能, 能性, 性能 → 去重后 性能, 能性
    const tokens = tokenize('性能性能');
    expect(tokens).toEqual(['性能', '能性']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/search/tokenizer.test.js`
Expected: FAIL — `Cannot find module '../../src/main/search/tokenizer.js'`

- [ ] **Step 3: 实现 `tokenizer.js`**

创建 `src/main/search/tokenizer.js`：

```js
/**
 * src/main/search/tokenizer.js
 *
 * A3: 分词器. 中文走 bigram (二元组滑动窗口), 英文按空格/标点切.
 * 停用词过滤 + 去重. 零依赖.
 */

const STOPWORDS = new Set([
  // 中文高频虚词
  '的', '了', '是', '和', '在', '有', '与', '或', '也', '都', '就', '而', '及',
  // 英文停用词
  'the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'on', 'and', 'or', 'for',
]);

const CJK_RANGE = /[\u4e00-\u9fff]/;

function isCjk(ch) {
  return CJK_RANGE.test(ch);
}

/**
 * 中文连续段做 bigram. "人工智能" → ["人工", "工智", "智能"].
 * 单字不切 (太短无区分度).
 */
function bigramCjk(segment) {
  const tokens = [];
  for (let i = 0; i < segment.length - 1; i++) {
    tokens.push(segment.slice(i, i + 2));
  }
  return tokens;
}

/**
 * @param {string} text
 * @returns {string[]} 去重后的 token 数组
 */
function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lower = text.toLowerCase();
  const tokens = new Set();
  let buf = '';

  const flushBuf = () => {
    if (buf.length === 0) return;
    // buf 是连续的同类型段 (全中文 或 全非中文)
    if (isCjk(buf[0])) {
      for (const t of bigramCjk(buf)) tokens.add(t);
    } else {
      // 英文/数字段按标点再切 (buf 内可能含标点, 但已被外层 split 过, 这里主要是单词)
      if (!STOPWORDS.has(buf) && buf.length > 1) {
        tokens.add(buf);
      } else if (buf.length === 1 && !STOPWORDS.has(buf) && /[a-z0-9]/.test(buf)) {
        // 单字符英文/数字 (如 "v3") 里的数字段保留; 纯单字母如 "a" 被停用词过滤
        // 这里 buf 是单词, 单字母单词无意义, 跳过
      }
    }
    buf = '';
  };

  for (const ch of lower) {
    if (isCjk(ch)) {
      // 中文段: 同类型累积, 遇到非中文就 flush
      if (buf && !isCjk(buf[0])) flushBuf();
      buf += ch;
    } else if (/[a-z0-9]/.test(ch)) {
      // 英文/数字: 同类型累积
      if (buf && isCjk(buf[0])) flushBuf();
      buf += ch;
    } else {
      // 标点/空格/其他: flush 当前 buf
      flushBuf();
    }
  }
  flushBuf();

  // 过滤停用词 (bigram 可能产生停用词如 "的优" 不算停用词, 只有单词停用词被滤)
  // bigram 不会等于停用词 (停用词都是 1 字或英文单词), 所以这步主要滤英文
  const result = [];
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    result.push(t);
  }
  return result;
}

module.exports = { tokenize, STOPWORDS, bigramCjk };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/search/tokenizer.test.js`
Expected: PASS — 8 case 全过

- [ ] **Step 5: Commit**

```bash
git add tests/main/search/tokenizer.test.js src/main/search/tokenizer.js
git commit -m "feat(search): add tokenizer with bigram CJK + stopwords (Phase A3)"
```

---

## Task 2: 高亮片段 `highlight.js`（TDD）

**Files:**
- Create: `src/main/search/highlight.js`
- Test: `tests/main/search/highlight.test.js`

- [ ] **Step 1: 写失败测试**

创建 `tests/main/search/highlight.test.js`：

```js
/**
 * tests/main/search/highlight.test.js
 * A3: 高亮片段生成 — 从 searchText 定位命中, 前后各取 radius 字符, 包 <mark>
 */
import { describe, it, expect } from 'vitest';
import { makeSnippet } from '../../src/main/search/highlight.js';

describe('makeSnippet', () => {
  const TEXT = '本次更新主要针对 macOS 上的性能优化，修复了大型文件打开时的卡顿问题。';

  it('wraps matched token with <mark> and adds radius context', () => {
    const out = makeSnippet(TEXT, ['性能'], { radius: 10 });
    expect(out).toContain('<mark>性能</mark>');
    expect(out).toContain('macOS');
    expect(out).toContain('优化');
  });

  it('returns title-truncated when no query token matches', () => {
    const out = makeSnippet(TEXT, ['不存在的词'], { radius: 10 });
    // 无命中 → 返前 radius*2 字符, 无 <mark>
    expect(out).not.toContain('<mark>');
    expect(out.length).toBeLessThanOrEqual(20);
  });

  it('does not add leading "..." when match near start', () => {
    const out = makeSnippet(TEXT, ['本次'], { radius: 10 });
    expect(out.startsWith('...')).toBe(false);
  });

  it('adds leading "..." when match is past the radius', () => {
    const out = makeSnippet(TEXT, ['卡顿'], { radius: 5 });
    expect(out.startsWith('...')).toBe(true);
  });

  it('adds trailing "..." when match + radius does not reach end', () => {
    const out = makeSnippet(TEXT, ['本次'], { radius: 5 });
    expect(out.endsWith('...')).toBe(true);
  });

  it('handles multiple query tokens', () => {
    const out = makeSnippet(TEXT, ['性能', '卡顿'], { radius: 6 });
    expect(out).toContain('<mark>');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/search/highlight.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 `highlight.js`**

创建 `src/main/search/highlight.js`：

```js
/**
 * src/main/search/highlight.js
 *
 * A3: 从 searchText 里定位首个命中 queryToken, 前后各取 radius 字符,
 * 命中 token 包 <mark>, 被截断处加 "...".
 */

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {string} searchText
 * @param {string[]} queryTokens  已 tokenize 过的 tokens
 * @param {{radius?: number}} opts
 * @returns {string}  含 <mark> 的 HTML 片段
 */
function makeSnippet(searchText, queryTokens, opts = {}) {
  const radius = typeof opts.radius === 'number' ? opts.radius : 30;
  if (typeof searchText !== 'string' || searchText.length === 0) return '';
  if (!Array.isArray(queryTokens) || queryTokens.length === 0) {
    // 无 query token: 返开头截断
    return escapeHtml(searchText.slice(0, radius * 2));
  }

  // 找最早出现的 queryToken 位置
  let hitPos = -1;
  for (const tok of queryTokens) {
    const idx = searchText.indexOf(tok);
    if (idx !== -1 && (hitPos === -1 || idx < hitPos)) {
      hitPos = idx;
    }
  }

  if (hitPos === -1) {
    return escapeHtml(searchText.slice(0, radius * 2));
  }

  const start = Math.max(0, hitPos - radius);
  const end = Math.min(searchText.length, hitPos + radius);
  let raw = searchText.slice(start, end);

  // 在 raw 内把所有 queryToken 包 <mark> (escape 后再插入标签)
  // 先 escape 整段, 再对 escape 后的文本做 token 替换 (token 是纯文本无特殊字符)
  let html = escapeHtml(raw);
  for (const tok of queryTokens) {
    if (!tok) continue;
    const escapedTok = escapeHtml(tok);
    // 用 split/join 避免正则特殊字符
    html = html.split(escapedTok).join(`<mark>${escapedTok}</mark>`);
  }

  const prefix = start > 0 ? '...' : '';
  const suffix = end < searchText.length ? '...' : '';
  return prefix + html + suffix;
}

module.exports = { makeSnippet };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/search/highlight.test.js`
Expected: PASS — 6 case 全过

- [ ] **Step 5: Commit**

```bash
git add tests/main/search/highlight.test.js src/main/search/highlight.js
git commit -m "feat(search): add makeSnippet highlight generator (Phase A3)"
```

---

## Task 3: Doc 构建 `build-docs.js`（TDD）

把 state.json 各源抽取成统一的 Doc 列表。纯函数，便于单测。

**Files:**
- Create: `src/main/search/build-docs.js`
- Test: `tests/main/search/build-docs.test.js`

- [ ] **Step 1: 写失败测试**

创建 `tests/main/search/build-docs.test.js`：

```js
/**
 * tests/main/search/build-docs.test.js
 * A3: 从 state.json 抽取 Doc 列表 (news/ai-task/reminder/fund/app)
 */
import { describe, it, expect } from 'vitest';
import { buildDocsFromState } from '../../src/main/search/build-docs.js';

describe('buildDocsFromState', () => {
  it('builds news docs from articles', () => {
    const state = {
      ithome_news: {
        articles: {
          'https://ithome.com/0/1.htm': {
            id: 'https://ithome.com/0/1.htm',
            title: 'Cursor 更新',
            excerpt: '性能优化',
            body: '完整正文',
            pubDate: '2026-06-01',
            dateKey: '2026-06-01',
          },
        },
        summaries: {},
        favorites: {},
      },
    };
    const docs = buildDocsFromState(state);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: 'news:https://ithome.com/0/1.htm',
      source: 'news',
      nativeId: 'https://ithome.com/0/1.htm',
      title: 'Cursor 更新',
    });
    expect(docs[0].searchText).toContain('Cursor');
    expect(docs[0].searchText).toContain('性能优化');
    expect(docs[0].searchText).toContain('完整正文');
  });

  it('dedupes favorites over articles (favorite wins, includes summary)', () => {
    const state = {
      ithome_news: {
        articles: {
          'u1': { id: 'u1', title: '标题A', excerpt: '摘A', body: '', dateKey: '2026-06-01' },
        },
        summaries: {
          'u1': { abstract: '总结A', keywords: ['k1'], domain: '领域', impact: '影响' },
        },
        favorites: {
          'u1': {
            article: { id: 'u1', title: '标题A(收藏)', excerpt: '摘A', body: '', dateKey: '2026-06-01' },
            summary: { abstract: '总结A(收藏)', keywords: ['k2'] },
            favoritedAt: 1700000000000,
          },
        },
      },
    };
    const docs = buildDocsFromState(state);
    expect(docs.filter(d => d.source === 'news')).toHaveLength(1);
    // favorite 优先: title 用收藏版, searchText 含收藏 summary
    expect(docs[0].title).toBe('标题A(收藏)');
    expect(docs[0].searchText).toContain('总结A(收藏)');
  });

  it('builds ai-task docs', () => {
    const state = {
      task_summaries: {
        'cursor:abc': {
          taskKey: 'cursor:abc',
          title: '重做总结',
          userGoal: '解决卡顿',
          outcome: '完成了',
          dateKey: '2026-06-01',
        },
      },
    };
    const docs = buildDocsFromState(state);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: 'ai-task:cursor:abc',
      source: 'ai-task',
      nativeId: 'cursor:abc',
      title: '重做总结',
    });
    expect(docs[0].searchText).toContain('解决卡顿');
    expect(docs[0].searchText).toContain('完成了');
  });

  it('builds reminder docs', () => {
    const state = {
      reminders: [
        { id: 'r1', title: '喝水', triggerAt: 1700000000000 },
      ],
    };
    const docs = buildDocsFromState(state);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: 'reminder:r1',
      source: 'reminder',
      nativeId: 'r1',
      title: '喝水',
    });
  });

  it('builds fund docs (name only)', () => {
    const state = {
      funds: {
        holdings: [
          { id: 'f1', code: '001234', name: '财通成长', note: '定投' },
        ],
      },
    };
    const docs = buildDocsFromState(state);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: 'fund:f1',
      source: 'fund',
      nativeId: 'f1',
      title: '财通成长',
    });
    expect(docs[0].payload.code).toBe('001234');
    expect(docs[0].searchText).toContain('定投');
  });

  it('builds app docs (name)', () => {
    const state = {
      apps: {
        Cursor: { name: 'Cursor', latest_version: '3.6.31' },
      },
    };
    const docs = buildDocsFromState(state);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: 'app:Cursor',
      source: 'app',
      nativeId: 'Cursor',
      title: 'Cursor',
    });
  });

  it('handles empty/missing sources gracefully', () => {
    expect(buildDocsFromState({})).toEqual([]);
    expect(buildDocsFromState(null)).toEqual([]);
    expect(buildDocsFromState({ ithome_news: {} })).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/search/build-docs.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 `build-docs.js`**

创建 `src/main/search/build-docs.js`：

```js
/**
 * src/main/search/build-docs.js
 *
 * A3: 从 state.json 各源抽取成统一 Doc 列表. 纯函数, 便于单测.
 *
 * Doc 形状见 spec §3.2.
 * 去重规则: news 源 favorites > articles (同 URL), summaries 字段并入.
 */

const SOURCES = ['news', 'ai-task', 'reminder', 'fund', 'app'];

function buildNewsDocs(ithomeNews) {
  const docs = [];
  if (!ithomeNews || typeof ithomeNews !== 'object') return docs;
  const articles = ithomeNews.articles || {};
  const summaries = ithomeNews.summaries || {};
  const favorites = ithomeNews.favorites || {};

  // favorites 优先 (含完整 article + summary 快照)
  const seen = new Set();
  for (const [id, fav] of Object.entries(favorites)) {
    if (!fav || !fav.article) continue;
    const art = fav.article;
    const sum = fav.summary || summaries[id] || {};
    const searchText = [art.title, art.excerpt, art.body, sum.abstract,
      Array.isArray(sum.keywords) ? sum.keywords.join(' ') : '',
      sum.domain, sum.impact].filter(Boolean).join(' ');
    docs.push({
      id: `news:${id}`,
      source: 'news',
      nativeId: id,
      title: art.title || id,
      snippet: art.excerpt || (sum.abstract ? sum.abstract.slice(0, 60) : ''),
      searchText,
      payload: {
        navTarget: 'ithome',
        dateMs: art.fetchedAt || (fav.favoritedAt || 0),
        dateKey: art.dateKey,
      },
    });
    seen.add(id);
  }
  // articles 里未被 favorite 覆盖的
  for (const [id, art] of Object.entries(articles)) {
    if (seen.has(id) || !art) continue;
    const sum = summaries[id] || {};
    const searchText = [art.title, art.excerpt, art.body, sum.abstract,
      Array.isArray(sum.keywords) ? sum.keywords.join(' ') : '',
      sum.domain, sum.impact].filter(Boolean).join(' ');
    docs.push({
      id: `news:${id}`,
      source: 'news',
      nativeId: id,
      title: art.title || id,
      snippet: art.excerpt || (sum.abstract ? sum.abstract.slice(0, 60) : ''),
      searchText,
      payload: {
        navTarget: 'ithome',
        dateMs: art.fetchedAt || 0,
        dateKey: art.dateKey,
      },
    });
  }
  return docs;
}

function buildAiTaskDocs(taskSummaries) {
  const docs = [];
  if (!taskSummaries || typeof taskSummaries !== 'object') return docs;
  for (const [taskKey, t] of Object.entries(taskSummaries)) {
    if (!t) continue;
    const searchText = [t.title, t.userGoal, t.outcome].filter(Boolean).join(' ');
    docs.push({
      id: `ai-task:${taskKey}`,
      source: 'ai-task',
      nativeId: taskKey,
      title: t.title || taskKey,
      snippet: t.userGoal || '',
      searchText,
      payload: { navTarget: 'ai-tasks', appName: t.appName, dateKey: t.dateKey },
    });
  }
  return docs;
}

function buildReminderDocs(reminders) {
  const docs = [];
  if (!Array.isArray(reminders)) return docs;
  for (const r of reminders) {
    if (!r || !r.id) continue;
    docs.push({
      id: `reminder:${r.id}`,
      source: 'reminder',
      nativeId: r.id,
      title: r.title || r.id,
      snippet: '',
      searchText: r.title || '',
      payload: { navTarget: 'reminders', dateMs: r.triggerAt || r.createdAt || 0 },
    });
  }
  return docs;
}

function buildFundDocs(funds) {
  const docs = [];
  const holdings = funds && Array.isArray(funds.holdings) ? funds.holdings : [];
  for (const h of holdings) {
    if (!h || !h.id) continue;
    const searchText = [h.name, h.note].filter(Boolean).join(' ');
    docs.push({
      id: `fund:${h.id}`,
      source: 'fund',
      nativeId: h.id,
      title: h.name || h.code || h.id,
      snippet: h.note || '',
      searchText,
      payload: { navTarget: 'funds', code: h.code },
    });
  }
  return docs;
}

function buildAppDocs(apps) {
  const docs = [];
  if (!apps || typeof apps !== 'object') return docs;
  for (const name of Object.keys(apps)) {
    docs.push({
      id: `app:${name}`,
      source: 'app',
      nativeId: name,
      title: name,
      snippet: '',
      searchText: name,
      payload: { navTarget: 'versions' },
    });
  }
  return docs;
}

/**
 * @param {object|null} state  state.json 解析后的对象
 * @returns {Array<object>} Doc 列表
 */
function buildDocsFromState(state) {
  if (!state || typeof state !== 'object') return [];
  return [
    ...buildNewsDocs(state.ithome_news),
    ...buildAiTaskDocs(state.task_summaries),
    ...buildReminderDocs(state.reminders),
    ...buildFundDocs(state.funds),
    ...buildAppDocs(state.apps),
  ];
}

module.exports = { buildDocsFromState, buildNewsDocs, buildAiTaskDocs, buildReminderDocs, buildFundDocs, buildAppDocs };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/search/build-docs.test.js`
Expected: PASS — 7 case 全过

- [ ] **Step 5: Commit**

```bash
git add tests/main/search/build-docs.test.js src/main/search/build-docs.js
git commit -m "feat(search): add buildDocsFromState extractor (Phase A3)"
```

---

## Task 4: 倒排索引 `search-index.js`（TDD）

**Files:**
- Create: `src/main/search/search-index.js`
- Test: `tests/main/search/search-index.test.js`

- [ ] **Step 1: 写失败测试**

创建 `tests/main/search/search-index.test.js`：

```js
/**
 * tests/main/search/search-index.test.js
 * A3: inverted index — buildFromState / upsert / query / counts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSearchIndex } from '../../src/main/search/search-index.js';

describe('search-index', () => {
  let idx;

  beforeEach(() => {
    idx = createSearchIndex();
  });

  it('upsert adds doc and query finds it', () => {
    idx.upsert({
      id: 'news:1', source: 'news', nativeId: '1',
      title: 'Cursor 性能优化', snippet: '', searchText: 'Cursor性能优化',
      payload: { dateMs: 1000 },
    });
    const res = idx.query('性能');
    expect(res.results).toHaveLength(1);
    expect(res.results[0].id).toBe('news:1');
  });

  it('upsert same id overwrites', () => {
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: '旧', snippet: '', searchText: '旧标题', payload: {} });
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: '新标题', snippet: '', searchText: '新标题', payload: {} });
    const res = idx.query('新标题');
    expect(res.results).toHaveLength(1);
    expect(res.results[0].title).toBe('新标题');
  });

  it('title hit scores higher than body hit', () => {
    idx.upsert({ id: 'a:1', source: 'news', nativeId: '1', title: '性能', snippet: '', searchText: '性能', payload: { dateMs: 1000 } });
    idx.upsert({ id: 'a:2', source: 'news', nativeId: '2', title: '其他', snippet: '', searchText: '正文里提到性能', payload: { dateMs: 1000 } });
    const res = idx.query('性能');
    expect(res.results[0].id).toBe('a:1'); // 标题命中排前
  });

  it('AND semantics: all query tokens must match', () => {
    idx.upsert({ id: 'a:1', source: 'news', nativeId: '1', title: 'Cursor 更新', snippet: '', searchText: 'Cursor 更新', payload: {} });
    idx.upsert({ id: 'a:2', source: 'news', nativeId: '2', title: 'Cursor 老版本', snippet: '', searchText: 'Cursor 老版本', payload: {} });
    const res = idx.query('Cursor 更新');
    expect(res.results.map(r => r.id)).toEqual(['a:1']);
  });

  it('filters by source', () => {
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: 'Cursor', snippet: '', searchText: 'Cursor', payload: {} });
    idx.upsert({ id: 'reminder:1', source: 'reminder', nativeId: '1', title: 'Cursor 提醒', snippet: '', searchText: 'Cursor 提醒', payload: {} });
    const res = idx.query('Cursor', { source: 'reminder' });
    expect(res.results).toHaveLength(1);
    expect(res.results[0].source).toBe('reminder');
  });

  it('counts per source', () => {
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: 'Cursor', snippet: '', searchText: 'Cursor', payload: {} });
    idx.upsert({ id: 'news:2', source: 'news', nativeId: '2', title: 'Cursor v2', snippet: '', searchText: 'Cursor v2', payload: {} });
    idx.upsert({ id: 'reminder:1', source: 'reminder', nativeId: '1', title: 'Cursor 提醒', snippet: '', searchText: 'Cursor 提醒', payload: {} });
    const res = idx.query('Cursor');
    expect(res.counts.news).toBe(2);
    expect(res.counts.reminder).toBe(1);
    expect(res.counts['ai-task']).toBe(0);
  });

  it('empty query returns empty results', () => {
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: 'x', snippet: '', searchText: 'x', payload: {} });
    const res = idx.query('');
    expect(res.results).toEqual([]);
  });

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      idx.upsert({ id: `news:${i}`, source: 'news', nativeId: String(i), title: `Cursor ${i}`, snippet: '', searchText: 'Cursor', payload: {} });
    }
    const res = idx.query('Cursor', { limit: 5 });
    expect(res.results).toHaveLength(5);
    // counts 不受 limit 影响
    expect(res.counts.news).toBe(10);
  });

  it('buildFromState populates from state object', () => {
    const state = {
      ithome_news: { articles: { 'u1': { id: 'u1', title: 'Cursor', excerpt: '', body: '', dateKey: '2026-06-01' } }, summaries: {}, favorites: {} },
      reminders: [{ id: 'r1', title: '喝水', triggerAt: 0 }],
    };
    idx.buildFromState(state);
    expect(idx.query('Cursor').results).toHaveLength(1);
    expect(idx.query('喝水').results).toHaveLength(1);
  });

  it('removes doc on delete', () => {
    idx.upsert({ id: 'news:1', source: 'news', nativeId: '1', title: 'Cursor', snippet: '', searchText: 'Cursor', payload: {} });
    idx.remove('news:1');
    expect(idx.query('Cursor').results).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/search/search-index.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 `search-index.js`**

创建 `src/main/search/search-index.js`：

```js
/**
 * src/main/search/search-index.js
 *
 * A3: inverted index. 两套倒排 (全文 + 标题) 用于权重排序.
 * 内存态, 不落盘. 启动时 buildFromState 构建.
 *
 * Public API (工厂函数 createSearchIndex):
 *   buildFromState(state)
 *   upsert(doc)
 *   remove(docId)
 *   query(q, { source?, limit? }) → { results, counts }
 *   size()
 */

const { tokenize } = require('./tokenizer');
const { buildDocsFromState } = require('./build-docs');
const { makeSnippet } = require('./highlight');

const DEFAULT_LIMIT = 50;
const TITLE_BONUS = 2;
const BODY_SCORE = 1;

function createSearchIndex() {
  const index = new Map();       // token → Set<docId>  全文倒排
  const titleTokens = new Map(); // token → Set<docId>  标题倒排
  const docs = new Map();        // docId → Doc

  function _addToInverted(map, token, docId) {
    let set = map.get(token);
    if (!set) { set = new Set(); map.set(token, set); }
    set.add(docId);
  }
  function _removeFromInverted(map, token, docId) {
    const set = map.get(token);
    if (set) { set.delete(docId); if (set.size === 0) map.delete(token); }
  }

  function _clearDocFromIndexes(docId, doc) {
    if (!doc) return;
    const bodyToks = tokenize(doc.searchText || '');
    for (const t of bodyToks) _removeFromInverted(index, t, docId);
    const titleToks = tokenize(doc.title || '');
    for (const t of titleToks) _removeFromInverted(titleTokens, t, docId);
  }

  function upsert(doc) {
    if (!doc || !doc.id) return;
    const existing = docs.get(doc.id);
    if (existing) _clearDocFromIndexes(doc.id, existing);
    docs.set(doc.id, doc);
    const bodyToks = tokenize(doc.searchText || '');
    for (const t of bodyToks) _addToInverted(index, t, doc.id);
    const titleToks = tokenize(doc.title || '');
    for (const t of titleToks) _addToInverted(titleTokens, t, doc.id);
  }

  function remove(docId) {
    const doc = docs.get(docId);
    if (!doc) return;
    _clearDocFromIndexes(docId, doc);
    docs.delete(docId);
  }

  function buildFromState(state) {
    index.clear(); titleTokens.clear(); docs.clear();
    const docList = buildDocsFromState(state);
    for (const d of docList) upsert(d);
  }

  function query(q, opts = {}) {
    const sourceFilter = opts.source || null;
    const limit = typeof opts.limit === 'number' ? opts.limit : DEFAULT_LIMIT;
    const queryTokens = tokenize(q || '');
    if (queryTokens.length === 0) {
      return { results: [], counts: _emptyCounts() };
    }

    // 计分: 每个 docId 累加 score
    const scoreMap = new Map();
    for (const tok of queryTokens) {
      const bodyHits = index.get(tok);
      if (bodyHits) {
        for (const docId of bodyHits) {
          scoreMap.set(docId, (scoreMap.get(docId) || 0) + BODY_SCORE);
        }
      }
      const titleHits = titleTokens.get(tok);
      if (titleHits) {
        for (const docId of titleHits) {
          scoreMap.set(docId, (scoreMap.get(docId) || 0) + TITLE_BONUS);
        }
      }
    }

    // AND 语义: 保留所有 queryToken 都命中的 doc (score >= queryTokens.length * BODY_SCORE?
    // 不对 — 一个 token 可能只在 title 命中. 正确判定: 该 doc 在每个 token 上都至少命中一次)
    // 重新算: 对每个 docId, 检查每个 queryToken 是否在 body∪title 命中过
    const matched = [];
    for (const [docId, score] of scoreMap) {
      const doc = docs.get(docId);
      if (!doc) continue;
      // 检查 AND: 每个 queryToken 至少命中一次 (body 或 title)
      let allMatch = true;
      for (const tok of queryTokens) {
        const inBody = index.get(tok) && index.get(tok).has(docId);
        const inTitle = titleTokens.get(tok) && titleTokens.get(tok).has(docId);
        if (!inBody && !inTitle) { allMatch = false; break; }
      }
      if (!allMatch) continue;
      matched.push({ doc, score });
    }

    // 排序: score 降序, 同分按 dateMs 降序
    matched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = (a.doc.payload && a.doc.payload.dateMs) || 0;
      const db = (b.doc.payload && b.doc.payload.dateMs) || 0;
      return db - da;
    });

    // counts (在 source filter 之前算, 反映全源命中分布)
    const counts = _emptyCounts();
    for (const { doc } of matched) {
      if (counts[doc.source] !== undefined) counts[doc.source]++;
    }

    // source filter
    const filtered = sourceFilter
      ? matched.filter(m => m.doc.source === sourceFilter)
      : matched;

    return {
      results: filtered.slice(0, limit).map(m => ({
        ...m.doc,
        matchedSnippet: makeSnippet(m.doc.searchText || m.doc.title || '', queryTokens, { radius: 30 }),
      })),
      counts,
    };
  }

  function _emptyCounts() {
    return { news: 0, 'ai-task': 0, reminder: 0, fund: 0, app: 0 };
  }

  function size() {
    return docs.size;
  }

  return { buildFromState, upsert, remove, query, size };
}

module.exports = { createSearchIndex };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/search/search-index.test.js`
Expected: PASS — 10 case 全过

- [ ] **Step 5: Commit**

```bash
git add tests/main/search/search-index.test.js src/main/search/search-index.js
git commit -m "feat(search): add inverted index with title weighting + AND semantics (Phase A3)"
```

---

## Task 5: IPC 注册 `register-search.js` + 接线 bootstrap

**Files:**
- Create: `src/main/ipc/register-search.js`
- Test: `tests/main/search/register-search.test.js`
- Modify: `src/main/index.js`（bootstrap 调用 + 注册）
- Modify: `preload.js` + `src/renderer/api.js`

- [ ] **Step 1: 写失败测试**

创建 `tests/main/search/register-search.test.js`：

```js
/**
 * tests/main/search/register-search.test.js
 * A3: IPC 薄包装测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerSearchIpc, _internals } from '../../src/main/ipc/register-search.js';

describe('register-search IPC', () => {
  let ipcMain;
  let handles;
  let searchIndex;

  beforeEach(() => {
    handles = {};
    ipcMain = {
      handle: vi.fn((channel, handler) => { handles[channel] = handler; }),
    };
    searchIndex = {
      query: vi.fn(() => ({ results: [], counts: { news: 0, 'ai-task': 0, reminder: 0, fund: 0, app: 0 } })),
      upsert: vi.fn(),
      buildFromState: vi.fn(),
    };
  });

  it('registers search:query / search:upsert / search:rebuild channels', () => {
    registerSearchIpc({ ipcMain, searchIndex });
    expect(ipcMain.handle).toHaveBeenCalledWith('search:query', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('search:upsert', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('search:rebuild', expect.any(Function));
  });

  it('search:query calls searchIndex.query with parsed args', async () => {
    registerSearchIpc({ ipcMain, searchIndex });
    await handles['search:query']({}, { q: 'Cursor', source: 'news' });
    expect(searchIndex.query).toHaveBeenCalledWith('Cursor', { source: 'news' });
  });

  it('search:query handles missing q gracefully', async () => {
    registerSearchIpc({ ipcMain, searchIndex });
    const out = await handles['search:query']({}, {});
    expect(searchIndex.query).toHaveBeenCalledWith('', {});
    expect(out.results).toEqual([]);
  });

  it('search:upsert calls searchIndex.upsert', async () => {
    registerSearchIpc({ ipcMain, searchIndex });
    const doc = { id: 'news:1', source: 'news', nativeId: '1', title: 'x', snippet: '', searchText: 'x', payload: {} };
    await handles['search:upsert']({}, doc);
    expect(searchIndex.upsert).toHaveBeenCalledWith(doc);
  });

  it('search:rebuild calls buildFromState with state', async () => {
    const stateStore = { load: vi.fn(() => ({ apps: { X: {} } })) };
    registerSearchIpc({ ipcMain, searchIndex, stateStore });
    await handles['search:rebuild']({});
    expect(searchIndex.buildFromState).toHaveBeenCalledWith({ apps: { X: {} } });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/search/register-search.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 `register-search.js`**

创建 `src/main/ipc/register-search.js`：

```js
/**
 * src/main/ipc/register-search.js
 *
 * A3: 搜索 IPC 薄包装. 业务在 searchIndex, 这里只做参数解析 + 错误兜底.
 *
 * Channels:
 *   search:query   { q, source? } → { results, counts }
 *   search:upsert  Doc → void
 *   search:rebuild → void  (诊断用, 从 stateStore 重读重建)
 */

function registerSearchIpc(deps) {
  const { ipcMain, searchIndex, stateStore } = deps;

  ipcMain.handle('search:query', async (event, args) => {
    try {
      const a = args || {};
      return searchIndex.query(a.q || '', { source: a.source || null });
    } catch (err) {
      return { results: [], counts: { news: 0, 'ai-task': 0, reminder: 0, fund: 0, app: 0 } };
    }
  });

  ipcMain.handle('search:upsert', async (event, doc) => {
    try {
      if (doc && doc.id) searchIndex.upsert(doc);
    } catch {
      /* noop */
    }
  });

  ipcMain.handle('search:rebuild', async () => {
    try {
      const state = (stateStore && typeof stateStore.load === 'function') ? stateStore.load() : null;
      searchIndex.buildFromState(state);
    } catch {
      /* noop */
    }
  });
}

module.exports = { registerSearchIpc };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/search/register-search.test.js`
Expected: PASS — 5 case 全过

- [ ] **Step 5: bootstrap 接线 — 改 `src/main/index.js`**

在 `src/main/index.js` 找到 require 区块（约 line 30-60，其他 register-*.js 的 require 附近），加：

```js
const { createSearchIndex } = require("./search/search-index");
const { registerSearchIpc } = require("./ipc/register-search");
```

在 bootstrap 里 `registerIpcHandlers({...})` 之后（约 line 490 `mainLog.info(\`ipc registered\`);` 之后），加：

```js
  // A3: 全文搜索 — 启动构建索引 + 注册 IPC
  try {
    const searchIndex = createSearchIndex();
    const tSearch = Date.now();
    searchIndex.buildFromState(stateStore.load());
    mainLog.info(`search index built: ${searchIndex.size()} docs in ${Date.now() - tSearch}ms`);
    registerSearchIpc({ ipcMain, searchIndex, stateStore });
  } catch (err) {
    mainLog.warn(`search index init failed: ${err && err.message}`);
  }
```

> 注意：需确认 `ipcMain` 在该作用域可见。本文件顶部 `const { app, ipcMain, BrowserWindow, ... } = require("electron");`。若 ipcMain 已解构则直接用。

- [ ] **Step 6: 暴露 preload + api**

在 `preload.js` 找到其他搜索/api 暴露的 contextBridge 块，加：

```js
    searchQuery: (q, source) => ipcRenderer.invoke("search:query", { q, source }),
    searchUpsert: (doc) => ipcRenderer.invoke("search:upsert", doc),
```

在 `src/renderer/api.js` 找到 api 对象（其他 wrapper 附近），加：

```js
  searchQuery: (q, source) => window.electronAPI.searchQuery(q, source),
  searchUpsert: (doc) => window.electronAPI.searchUpsert(doc),
```

> 注意：preload 暴露的对象名按现有惯例（可能是 `electronAPI` 或别的）。实施时先读 preload.js 看现有 contextBridge.exposeInMainWorld 的 key 名。

- [ ] **Step 7: Commit**

```bash
git add tests/main/search/register-search.test.js src/main/ipc/register-search.js src/main/index.js preload.js src/renderer/api.js
git commit -m "feat(search): wire IPC + bootstrap index build (Phase A3)"
```

---

## Task 6: renderer searchStore + SearchModal 骨架

**Files:**
- Create: `src/renderer/search/searchStore.js`
- Create: `src/renderer/search/SearchModal.jsx`
- Create: `src/renderer/search/SearchSourceBar.jsx`
- Create: `src/renderer/search/SearchResultList.jsx`
- Create: `src/renderer/search/SearchResultRow.jsx`
- Test: `tests/renderer/search/searchStore.test.js`

- [ ] **Step 1: 写 searchStore 失败测试**

创建 `tests/renderer/search/searchStore.test.js`：

```js
/**
 * tests/renderer/search/searchStore.test.js
 * A3: 搜索 store signals + actions
 */
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isSearchOpen,
  searchQuery,
  searchActiveSource,
  searchResults,
  searchCounts,
  searchSelectedIndex,
  openSearch,
  closeSearch,
  setSearchQuery,
  setSearchActiveSource,
  moveSearchSelection,
} from '../../../src/renderer/search/searchStore.js';

describe('searchStore', () => {
  beforeEach(() => {
    closeSearch();
    setSearchQuery('');
    setSearchActiveSource(null);
  });

  it('openSearch sets isOpen=true', () => {
    openSearch();
    expect(isSearchOpen.value).toBe(true);
  });

  it('closeSearch sets isOpen=false and clears query', () => {
    openSearch();
    setSearchQuery('test');
    closeSearch();
    expect(isSearchOpen.value).toBe(false);
    expect(searchQuery.value).toBe('');
  });

  it('setSearchActiveSource updates signal', () => {
    setSearchActiveSource('news');
    expect(searchActiveSource.value).toBe('news');
  });

  it('moveSearchSelection clamps within results bounds', () => {
    // 模拟有 3 条结果
    searchResults.value = [{ id: '1' }, { id: '2' }, { id: '3' }];
    searchSelectedIndex.value = 0;
    moveSearchSelection(1);
    expect(searchSelectedIndex.value).toBe(1);
    moveSearchSelection(1);
    expect(searchSelectedIndex.value).toBe(2);
    moveSearchSelection(1); // 越界, clamp
    expect(searchSelectedIndex.value).toBe(2);
    moveSearchSelection(-5); // 负向 clamp
    expect(searchSelectedIndex.value).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/search/searchStore.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 `searchStore.js`**

创建 `src/renderer/search/searchStore.js`：

```js
/**
 * src/renderer/search/searchStore.js
 *
 * A3: 搜索 modal 状态. signals + actions.
 */
import { signal, effect } from '@preact/signals';
import { api } from '../api.js';

export const isSearchOpen = signal(false);
export const searchQuery = signal('');
export const searchActiveSource = signal(null); // null = 全部
export const searchResults = signal([]);
export const searchCounts = signal({ news: 0, 'ai-task': 0, reminder: 0, fund: 0, app: 0 });
export const searchSelectedIndex = signal(0);
export const isSearching = signal(false);

let debounceTimer = null;

export function openSearch() {
  isSearchOpen.value = true;
  searchQuery.value = '';
  searchResults.value = [];
  searchSelectedIndex.value = 0;
}

export function closeSearch() {
  isSearchOpen.value = false;
  searchQuery.value = '';
  searchResults.value = [];
  searchSelectedIndex.value = 0;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
}

export function setSearchQuery(q) {
  searchQuery.value = q;
  searchSelectedIndex.value = 0;
  if (debounceTimer) clearTimeout(debounceTimer);
  const queryStr = q;
  debounceTimer = setTimeout(async () => {
    if (!queryStr.trim()) {
      searchResults.value = [];
      searchCounts.value = { news: 0, 'ai-task': 0, reminder: 0, fund: 0, app: 0 };
      return;
    }
    isSearching.value = true;
    try {
      const out = await api.searchQuery(queryStr, searchActiveSource.value);
      searchResults.value = out.results || [];
      searchCounts.value = out.counts || searchCounts.value;
    } catch {
      searchResults.value = [];
    } finally {
      isSearching.value = false;
    }
  }, 150);
}

export function setSearchActiveSource(s) {
  searchActiveSource.value = s;
  searchSelectedIndex.value = 0;
  // 切源后重新 query (单源重新匹配)
  const q = searchQuery.value;
  if (q && q.trim()) setSearchQuery(q);
}

export function moveSearchSelection(delta) {
  const len = searchResults.value.length;
  if (len === 0) { searchSelectedIndex.value = 0; return; }
  let next = searchSelectedIndex.value + delta;
  if (next < 0) next = 0;
  if (next >= len) next = len - 1;
  searchSelectedIndex.value = next;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/search/searchStore.test.js`
Expected: PASS — 4 case 全过

- [ ] **Step 5: 实现组件骨架**

创建 `src/renderer/search/SearchSourceBar.jsx`：

```jsx
/**
 * 左侧来源栏 — 各源命中数 + 键盘 1-5 切源
 */
import { searchCounts, searchActiveSource, setSearchActiveSource } from './searchStore.js';

const SOURCES = [
  { key: null, label: '全部', keynum: '1' },
  { key: 'news', label: '📰 新闻', keynum: '2' },
  { key: 'ai-task', label: '🤖 AI 任务', keynum: '3' },
  { key: 'reminder', label: '⏰ 提醒', keynum: '4' },
  { key: 'fund', label: '📊 基金', keynum: '5' },
];

export function SearchSourceBar() {
  return (
    <div class="search-source-bar" tabIndex="0">
      {SOURCES.map(s => {
        const count = s.key === null
          ? Object.values(searchCounts.value).reduce((a, b) => a + b, 0)
          : (searchCounts.value[s.key] || 0);
        const active = searchActiveSource.value === s.key;
        return (
          <button
            key={String(s.key)}
            class={`search-source-item${active ? ' is-active' : ''}`}
            onClick={() => setSearchActiveSource(s.key)}
          >
            <span class="search-source-label">{s.label}</span>
            <span class="search-source-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
```

创建 `src/renderer/search/SearchResultRow.jsx`：

```jsx
/**
 * 单条结果卡片 — 标题(高亮) + matchedSnippet + 来源标签 + 时间
 */
import DOMPurify from 'dompurify';

const SOURCE_ICON = { news: '📰', 'ai-task': '🤖', reminder: '⏰', fund: '📊', app: '🔄' };

function formatTimeAgo(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  return `${Math.floor(diff / 86400_000)}天前`;
}

export function SearchResultRow({ result, queryTokens, isSelected, onClick }) {
  const snippetHtml = result.matchedSnippet
    ? DOMPurify.sanitize(result.matchedSnippet)
    : '';
  const dateMs = result.payload && result.payload.dateMs;
  return (
    <div
      class={`search-result-row${isSelected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      <div class="search-result-title">
        <span class="search-result-icon">{SOURCE_ICON[result.source] || '•'}</span>
        <span>{result.title}</span>
        {dateMs && <span class="search-result-time">{formatTimeAgo(dateMs)}</span>}
      </div>
      {snippetHtml && (
        <div class="search-result-snippet" dangerouslySetInnerHTML={{ __html: snippetHtml }} />
      )}
    </div>
  );
}
```

创建 `src/renderer/search/SearchResultList.jsx`：

```jsx
import { searchResults, searchSelectedIndex } from './searchStore.js';
import { SearchResultRow } from './SearchResultRow.jsx';
import { tokenize } from './client-tokenize.js'; // 见下方说明

export function SearchResultList({ onSelect }) {
  // queryTokens 用于高亮 (renderer 端简易分词, 不引主进程模块)
  const qTokens = tokenize(searchQuery.value);
  return (
    <div class="search-result-list">
      {searchResults.value.length === 0 ? (
        <div class="search-empty">{searchQuery.value ? '无匹配结果' : '输入关键词搜索'}</div>
      ) : (
        searchResults.value.map((r, i) => (
          <SearchResultRow
            key={r.id}
            result={r}
            queryTokens={qTokens}
            isSelected={i === searchSelectedIndex.value}
            onClick={() => onSelect(r)}
          />
        ))
      )}
    </div>
  );
}
```

> `client-tokenize.js`: renderer 端需要简易分词给高亮用。但 matchedSnippet 已在主进程生成（含 `<mark>`），renderer 不需要再分词。**修正**：SearchResultRow 直接渲染 `result.matchedSnippet`（已含 mark），不需要 queryTokens。删掉 tokenize import 和传递。SearchResultList 不传 queryTokens。

创建 `src/renderer/search/SearchModal.jsx`：

```jsx
import { useEffect, useRef } from 'preact/hooks';
import {
  isSearchOpen, closeSearch, searchQuery, setSearchQuery,
  moveSearchSelection, searchResults, searchSelectedIndex,
} from './searchStore.js';
import { SearchSourceBar } from './SearchSourceBar.jsx';
import { SearchResultList } from './SearchResultList.jsx';
import { navigateToResult } from './search-nav.js';

export function SearchModal() {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isSearchOpen.value && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen.value]);

  if (!isSearchOpen.value) return null;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSearchSelection(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSearchSelection(-1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const r = searchResults.value[searchSelectedIndex.value];
      if (r) navigateToResult(r);
      return;
    }
  };

  return (
    <div class="search-modal-overlay" onClick={closeSearch}>
      <div class="search-modal" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div class="search-modal-input-wrap">
          <span class="search-modal-icon">🔍</span>
          <input
            ref={inputRef}
            class="search-modal-input"
            placeholder="搜索新闻、AI 任务、提醒..."
            value={searchQuery.value}
            onInput={(e) => setSearchQuery(e.target.value)}
          />
          <span class="search-modal-esc">Esc</span>
        </div>
        <div class="search-modal-body">
          <SearchSourceBar />
          <SearchResultList onSelect={navigateToResult} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/search/ tests/renderer/search/searchStore.test.js
git commit -m "feat(search): add renderer searchStore + SearchModal components (Phase A3)"
```

---

## Task 7: search-nav 跳转 + data 属性补全

**Files:**
- Create: `src/renderer/search/search-nav.js`
- Modify: `src/renderer/ithome/NewsArticleRow.jsx`（加 `data-article-id`）
- Modify: reminder / fund / ai-task 行组件（加 data 属性）
- Modify: `src/renderer/components/AppShell.jsx`（Cmd+K 监听 + 挂 SearchModal）
- Test: `tests/renderer/search/search-nav.test.js`

- [ ] **Step 1: 写 search-nav 失败测试**

创建 `tests/renderer/search/search-nav.test.js`：

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { navigateToResult } from '../../../src/renderer/search/search-nav.js';

// mock setNav (navStore)
vi.mock('../../../src/renderer/worldcup/navStore.js', () => ({
  setNav: vi.fn(),
}));

describe('navigateToResult', () => {
  beforeEach(() => {
    // 清理 DOM
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('news result: sets nav to ithome and attempts scroll (no element = warn only)', () => {
    const { setNav } = require('../../../src/renderer/worldcup/navStore.js');
    navigateToResult({ source: 'news', nativeId: 'u1', payload: {} });
    expect(setNav).toHaveBeenCalledWith('ithome');
  });

  it('reminder result: sets nav to reminders', () => {
    const { setNav } = require('../../../src/renderer/worldcup/navStore.js');
    navigateToResult({ source: 'reminder', nativeId: 'r1', payload: {} });
    expect(setNav).toHaveBeenCalledWith('reminders');
  });

  it('app result: sets nav to versions', () => {
    const { setNav } = require('../../../src/renderer/worldcup/navStore.js');
    navigateToResult({ source: 'app', nativeId: 'Cursor', payload: {} });
    expect(setNav).toHaveBeenCalledWith('versions');
  });

  it('fund result: sets nav to funds', () => {
    const { setNav } = require('../../../src/renderer/worldcup/navStore.js');
    navigateToResult({ source: 'fund', nativeId: 'f1', payload: { code: '001234' } });
    expect(setNav).toHaveBeenCalledWith('funds');
  });

  it('highlights matching element when present', () => {
    const { setNav } = require('../../../src/renderer/worldcup/navStore.js');
    const el = document.createElement('article');
    el.setAttribute('data-article-id', 'u1');
    document.body.appendChild(el);
    navigateToResult({ source: 'news', nativeId: 'u1', payload: {} });
    expect(el.classList.contains('search-highlight')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/search/search-nav.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 `search-nav.js`**

创建 `src/renderer/search/search-nav.js`：

```js
/**
 * src/renderer/search/search-nav.js
 *
 * A3: 搜索结果跳转. 切面板 + 滚动 + 高亮 (复用 .search-highlight class).
 * 找不到目标元素时只切面板, console.warn.
 */
import { setNav } from '../worldcup/navStore.js';
import { closeSearch } from './searchStore.js';

const HIGHLIGHT_CLASS = 'search-highlight';
const HIGHLIGHT_DURATION_MS = 3000;

let highlightTimer = null;

function scrollAndHighlight(selector) {
  const el = document.querySelector(selector);
  if (!el) {
    console.warn(`[search-nav] target not found: ${selector}`);
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add(HIGHLIGHT_CLASS);
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    el.classList.remove(HIGHLIGHT_CLASS);
    highlightTimer = null;
  }, HIGHLIGHT_DURATION_MS);
}

function cssEscape(s) {
  if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(s);
  }
  // 简易 fallback
  return String(s).replace(/["\\]/g, '\\$&');
}

export function navigateToResult(result) {
  if (!result) return;
  const { source, nativeId, payload } = result;
  switch (source) {
    case 'news':
      setNav('ithome');
      scrollAndHighlight(`[data-article-id="${cssEscape(nativeId)}"]`);
      break;
    case 'ai-task':
      setNav('ai-tasks');
      scrollAndHighlight(`[data-task-key="${cssEscape(nativeId)}"]`);
      break;
    case 'reminder':
      setNav('reminders');
      scrollAndHighlight(`[data-reminder-id="${cssEscape(nativeId)}"]`);
      break;
    case 'fund':
      setNav('funds');
      scrollAndHighlight(`[data-fund-code="${cssEscape(payload && payload.code || '')}"]`);
      break;
    case 'app':
      setNav('versions');
      scrollAndHighlight(`[data-name="${cssEscape(nativeId)}"]`); // AppRow 已有 data-name
      break;
    default:
      console.warn(`[search-nav] unknown source: ${source}`);
  }
  closeSearch();
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/search/search-nav.test.js`
Expected: PASS — 5 case 全过

- [ ] **Step 5: 补 data 属性 — NewsArticleRow**

在 `src/renderer/ithome/NewsArticleRow.jsx` 的 `<article>` 标签（line 145）加 `data-article-id`：

找到：
```jsx
    <article
      class={`ithome-row${favorited ? " is-favorited" : ""}${expanded ? " is-expanded" : ""}${isRead ? " is-read" : ""}${isNew ? " is-new" : ""}`}
    >
```

改为：
```jsx
    <article
      class={`ithome-row${favorited ? " is-favorited" : ""}${expanded ? " is-expanded" : ""}${isRead ? " is-read" : ""}${isNew ? " is-new" : ""}`}
      data-article-id={article.id}
    >
```

- [ ] **Step 6: 补其他 data 属性（reminder/fund/ai-task）**

实施时逐一检查这些组件：
- `src/renderer/reminders/RemindersModal.jsx` — reminder 行加 `data-reminder-id={r.id}`
- `src/renderer/funds/` 持仓行组件 — 加 `data-fund-code={holding.code}`
- `src/renderer/components/AITasksDrawer.jsx` — task 行加 `data-task-key={taskKey}`

> 每个组件先读现有代码找到根 DOM 元素，再加属性。AppRow 已有 `data-name`，无需改。

- [ ] **Step 7: AppShell 挂 SearchModal + Cmd+K 监听**

在 `src/renderer/components/AppShell.jsx` 找到现有键盘监听（Cmd+F 等）附近，加 Cmd+K：

```jsx
import { SearchModal } from '../search/SearchModal.jsx';
import { isSearchOpen, openSearch, closeSearch } from '../search/searchStore.js';
```

在 AppShell 的 useEffect 键盘监听里加：

```jsx
  useEffect(() => {
    const onKey = (e) => {
      // ... 现有 Cmd+F 等 ...
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isSearchOpen.value) closeSearch();
        else openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
```

在 AppShell 的 return JSX 里（其他 modal 挂载点附近）加：

```jsx
    <SearchModal />
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/search/search-nav.js src/renderer/ithome/NewsArticleRow.jsx src/renderer/components/AppShell.jsx tests/renderer/search/search-nav.test.js
git commit -m "feat(search): add search-nav jump + wire Cmd+K + data-article-id (Phase A3)"
```

---

## Task 8: 实时 upsert 接入 + styles.css + 全量回归

**Files:**
- Modify: `src/main/ithome/news-store.js`（写盘点调 upsert — 但 upsert 在 main 进程, 直接调 searchIndex）
- Modify: `styles.css`（搜索 modal 样式）
- Modify: `docs/superpowers/specs/2026-06-19-product-roadmap-design.md`（路线图对账）
- Modify: `RELEASE-NOTES.md`

> **关键澄清**：实时 upsert 在**主进程**做最简单——news-store / ai-engine / reminders 本身就在主进程, 直接持有 searchIndex 引用调 `searchIndex.upsert(doc)`, 不必走 IPC。renderer 触发的事件（如新建提醒）→ main 进程 handler 写盘后顺带 upsert。Task 5 的 `search:upsert` IPC 是给"renderer 发起的写盘点"留的兜底通道, 但主进程内部的写盘点直接调函数即可。

- [ ] **Step 1: news-store 接 upsert**

在 `src/main/ithome/news-store.js` 找到 articles merge / summary attach / favorite 的写盘函数，注入 searchIndex 引用（构造时传入或在模块级 set）。

> 实施细节：news-store 当前是纯函数模块。最小侵入做法：在 index.js bootstrap 装配时，把 searchIndex 传给一个 `wireNewsStoreSearch(searchIndex)` 函数，让 news-store 在写盘点调用。**或者**更简单：news-store 写盘点 emit 事件，bootstrap 监听后 upsert。选事件解耦。

实际操作：读 news-store.js 找到写盘点（`attachArticleBody` / summary attach / favorite toggle），在每个成功写盘后，如果有 searchIndex 引用就 upsert 对应 doc。由于 news-store 不应直接依赖 search 模块，用**事件或回调注入**。

> 实施者：读 news-store.js 后，判断最干净的接入方式（回调注入 vs 事件）。优先回调注入（与现有 deps 注入风格一致）。

- [ ] **Step 2: ai-task / reminders 接 upsert**

类似地，在 task_summaries 生成成功、reminders create/update 后 upsert。同样用回调注入 searchIndex。

- [ ] **Step 3: styles.css 加搜索 modal 样式**

在 `styles.css` 末尾追加搜索 modal 样式（复用现有 modal/overlay/卡片变量）：

```css
/* ─── A3: 全文搜索 Cmd+K ─── */
.search-modal-overlay {
  position: fixed; inset: 0; z-index: 6000;
  background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  backdrop-filter: blur(2px);
}
.search-modal {
  width: 90%; max-width: 560px;
  max-height: 70vh;
  background: var(--bg-modal);
  border-radius: 10px;
  border: 1px solid var(--border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.search-modal-input-wrap {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-light);
}
.search-modal-icon { font-size: 15px; opacity: 0.6; }
.search-modal-input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--text-primary); font-size: 15px;
}
.search-modal-esc {
  font-size: 11px; color: var(--text-tertiary);
  padding: 2px 6px; border: 1px solid var(--border);
  border-radius: 4px;
}
.search-modal-body {
  display: flex; flex: 1; min-height: 0; overflow: hidden;
}
.search-source-bar {
  width: 140px; border-right: 1px solid var(--border-light);
  padding: 6px; display: flex; flex-direction: column; gap: 2px;
  overflow-y: auto;
}
.search-source-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 8px; border: none; background: transparent;
  color: var(--text-secondary); font-size: 13px; cursor: pointer;
  border-radius: 5px; text-align: left;
}
.search-source-item.is-active {
  background: var(--bg-hover); color: var(--text-primary);
}
.search-source-count {
  font-size: 11px; color: var(--text-tertiary);
  background: var(--bg-elevated); padding: 1px 6px; border-radius: 8px;
}
.search-result-list {
  flex: 1; overflow-y: auto; padding: 4px;
}
.search-result-row {
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  margin-bottom: 2px;
}
.search-result-row.is-selected {
  background: var(--bg-hover);
}
.search-result-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--text-primary); font-weight: 500;
}
.search-result-icon { font-size: 12px; }
.search-result-time {
  margin-left: auto; font-size: 11px; color: var(--text-tertiary); font-weight: 400;
}
.search-result-snippet {
  font-size: 12px; color: var(--text-secondary);
  margin-top: 3px; margin-left: 18px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.search-result-snippet mark {
  background: rgba(255, 214, 10, 0.3); color: inherit;
  border-radius: 2px; padding: 0 1px;
}
.search-empty {
  padding: 40px 20px; text-align: center; color: var(--text-tertiary); font-size: 13px;
}
.search-highlight {
  animation: search-pulse 1s ease-in-out 2;
}
@keyframes search-pulse {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgba(255, 214, 10, 0.2); }
}
```

- [ ] **Step 4: 全量回归**

Run: `npx vitest run`
Expected: 全套通过，无新增失败。

- [ ] **Step 5: renderer bundle 构建**

Run: `npm run build:renderer`
Expected: 成功。

- [ ] **Step 6: 路线图对账 + release notes**

在 `docs/superpowers/specs/2026-06-19-product-roadmap-design.md`：
- §6.1 A3 行"动工"列：`⚫ 未立项` → `🟢 已合入`
- §10.2 A3 行：状态 `❌ 未开始` → `✅ 已落地` + 落地证据
- §10.1 总览：Pillar 4 AI 驱动 已落地 0→1

在 `RELEASE-NOTES.md` 顶部插入 A3 版本段。

- [ ] **Step 7: Commit 收尾**

```bash
git add styles.css RELEASE-NOTES.md docs/superpowers/specs/2026-06-19-product-roadmap-design.md src/main/ithome/news-store.js src/main/reminders.js
git commit -m "feat(search): realtime upsert + styles + roadmap flip (Phase A3)"
```

---

## 自检结果

**Spec coverage:**
- §2.1 搜索源 5 个源 → Task 3 build-docs 全覆盖
- §2.2 Cmd+K 唤起 → Task 7 AppShell
- §3 索引架构（tokenizer/index/build）→ Task 1/3/4
- §3.4 buildFromState → Task 4 + Task 5 bootstrap
- §4 查询/排序/AND/source 过滤 → Task 4 query
- §4.3 分词 → Task 1
- §4.4 高亮 → Task 2 + Task 4 query 返回时调 makeSnippet 填 matchedSnippet
- §5 前端组件 → Task 6
- §5.5 键盘导航 → Task 6 SearchModal
- §5.6-5.7 跳转 + data 属性 → Task 7
- §6 集成点 → Task 5/7/8
- §7 IPC → Task 5
- §8 测试 → 各 Task 内
- §11 路线图对账 → Task 8

**Placeholder scan:**
- Task 8 Step 1/2 的 upsert 接入用"回调注入 vs 事件"指引，依赖 news-store 现有结构，实施者读代码后决定 —— 已在 Task 8 给出明确指引。
- formatTimeAgo 已内联进 SearchResultRow，无外部依赖。

**Type consistency:**
- `createSearchIndex()` 工厂返回 `{ buildFromState, upsert, remove, query, size }` — Task 4/5/8 一致
- Doc 字段 `id/source/nativeId/title/snippet/searchText/payload/matchedSnippet` — Task 3/4/6 一致
- `query(q, {source, limit})` 签名 — Task 4/5 一致
- `navigateToResult(result)` — Task 6/7 一致
