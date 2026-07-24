/**
 * src/main/search/search-index.ts
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

const { tokenize }: { tokenize: (text: unknown) => string[] } = require("./tokenizer.ts");
const { buildDocsFromState }: { buildDocsFromState: (state: any) => any[] } = require("./build-docs.ts");
const { makeSnippet }: { makeSnippet: (text: unknown, tokens: string[], opts?: { radius?: number }) => string } = require("./highlight.ts");

const DEFAULT_LIMIT = 50;
const TITLE_BONUS = 2;
const BODY_SCORE = 1;

export type SearchDoc = {
  id: string;
  source: string;
  nativeId: string;
  title: string;
  snippet?: string;
  searchText?: string;
  payload?: Record<string, unknown>;
};

export type SearchResult = SearchDoc & {
  matchedSnippet: string;
};

export type QueryResult = {
  results: SearchResult[];
  counts: Record<string, number>;
};

export type SearchIndex = {
  buildFromState: (state: any) => void;
  upsert: (doc: SearchDoc) => void;
  remove: (docId: string) => void;
  query: (q: string, opts?: { source?: string; limit?: number }) => QueryResult;
  size: () => number;
};

export function createSearchIndex(): SearchIndex {
  const index = new Map<string, Set<string>>();       // token → Set<docId>  全文倒排
  const titleTokens = new Map<string, Set<string>>(); // token → Set<docId>  标题倒排
  const docs = new Map<string, SearchDoc>();          // docId → Doc

  function _addToInverted(map: Map<string, Set<string>>, token: string, docId: string) {
    let set = map.get(token);
    if (!set) { set = new Set(); map.set(token, set); }
    set.add(docId);
  }
  function _removeFromInverted(map: Map<string, Set<string>>, token: string, docId: string) {
    const set = map.get(token);
    if (set) { set.delete(docId); if (set.size === 0) map.delete(token); }
  }

  function _clearDocFromIndexes(docId: string, doc: SearchDoc) {
    if (!doc) return;
    const bodyToks = tokenize(String(doc.searchText || ""));
    for (const t of new Set(bodyToks)) _removeFromInverted(index, t, docId);
    const titleToks = tokenize(String(doc.title || ""));
    for (const t of new Set(titleToks)) _removeFromInverted(titleTokens, t, docId);
  }

  function upsert(doc: SearchDoc) {
    if (!doc || !doc.id) return;
    const existing = docs.get(doc.id);
    if (existing) _clearDocFromIndexes(doc.id, existing);
    docs.set(doc.id, doc);
    const bodyToks = tokenize(String(doc.searchText || ""));
    for (const t of new Set(bodyToks)) _addToInverted(index, t, doc.id);
    const titleToks = tokenize(String(doc.title || ""));
    for (const t of new Set(titleToks)) _addToInverted(titleTokens, t, doc.id);
  }

  function remove(docId: string) {
    const doc = docs.get(docId);
    if (!doc) return;
    _clearDocFromIndexes(docId, doc);
    docs.delete(docId);
  }

  function buildFromState(state: any) {
    index.clear(); titleTokens.clear(); docs.clear();
    const docList = buildDocsFromState(state);
    for (const d of docList) upsert(d);
  }

  function query(q: string, opts: { source?: string; limit?: number } = {}): QueryResult {
    const sourceFilter = opts.source || null;
    const limit = typeof opts.limit === "number" ? opts.limit : DEFAULT_LIMIT;
    const queryTokens = tokenize(q || "");
    if (queryTokens.length === 0) {
      return { results: [], counts: _emptyCounts() };
    }

    // 计分: 每个 docId 累加 score
    const scoreMap = new Map<string, number>();
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

    // AND 语义: 每个 queryToken 都至少命中一次 (body 或 title)
    const matched: { doc: SearchDoc; score: number }[] = [];
    for (const [docId, score] of scoreMap) {
      const doc = docs.get(docId);
      if (!doc) continue;
      let allMatch = true;
      for (const tok of queryTokens) {
        const inBody = index.get(tok) && index.get(tok)!.has(docId);
        const inTitle = titleTokens.get(tok) && titleTokens.get(tok)!.has(docId);
        if (!inBody && !inTitle) { allMatch = false; break; }
      }
      if (!allMatch) continue;
      matched.push({ doc, score });
    }

    // 排序: score 降序, 同分按 dateMs 降序
    matched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = (a.doc.payload && (a.doc.payload as any).dateMs) || 0;
      const db = (b.doc.payload && (b.doc.payload as any).dateMs) || 0;
      return db - da;
    });

    // counts (在 source filter 之前算, 反映全源命中分布)
    const counts = _emptyCounts();
    for (const { doc } of matched) {
      if (counts[doc.source] !== undefined) counts[doc.source]++;
    }

    // source filter
    const filtered = sourceFilter
      ? matched.filter((m) => m.doc.source === sourceFilter)
      : matched;

    return {
      results: filtered.slice(0, limit).map((m) => ({
        ...m.doc,
        matchedSnippet: makeSnippet(m.doc.searchText || m.doc.title || "", queryTokens, { radius: 30 }),
      })),
      counts,
    };
  }

  function _emptyCounts(): Record<string, number> {
    return { news: 0, "ai-task": 0, reminder: 0, fund: 0, app: 0 };
  }

  function size(): number {
    return docs.size;
  }

  return { buildFromState, upsert, remove, query, size };
}

module.exports = { createSearchIndex };