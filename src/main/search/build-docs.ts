/**
 * src/main/search/build-docs.ts
 *
 * A3: 从 state.json 各源抽取成统一 Doc 列表. 纯函数, 便于单测.
 *
 * Doc 形状见 spec §3.2.
 * 去重规则: news 源 favorites > articles (同 URL), summaries 字段并入.
 */

export type Doc = {
  id: string;
  source: string;
  nativeId: string;
  title: string;
  snippet: string;
  searchText: string;
  payload: Record<string, unknown>;
};

export function buildNewsDocs(ithomeNews: any): Doc[] {
  const docs: Doc[] = [];
  if (!ithomeNews || typeof ithomeNews !== "object") return docs;
  const articles = ithomeNews.articles || {};
  const summaries = ithomeNews.summaries || {};
  const favorites = ithomeNews.favorites || {};

  const seen = new Set<string>();

  // favorites 优先 (含完整 article + summary 快照)
  for (const [id, fav] of Object.entries(favorites) as [string, any][]) {
    if (!fav || !fav.article) continue;
    const art = fav.article;
    const sum = fav.summary || summaries[id] || {};
    const searchText = [art.title, art.excerpt, art.body, sum.abstract,
      Array.isArray(sum.keywords) ? sum.keywords.join(" ") : "",
      sum.domain, sum.impact].filter(Boolean).join(" ");
    docs.push({
      id: `news:${id}`,
      source: "news",
      nativeId: id,
      title: art.title || id,
      snippet: art.excerpt || (sum.abstract ? sum.abstract.slice(0, 60) : ""),
      searchText,
      payload: {
        navTarget: "ithome",
        dateMs: art.fetchedAt || (fav.favoritedAt || 0),
        dateKey: art.dateKey,
      },
    });
    seen.add(id);
  }
  // articles 里未被 favorite 覆盖的
  for (const [id, art] of Object.entries(articles) as [string, any][]) {
    if (seen.has(id) || !art) continue;
    const sum = summaries[id] || {};
    const searchText = [art.title, art.excerpt, art.body, sum.abstract,
      Array.isArray(sum.keywords) ? sum.keywords.join(" ") : "",
      sum.domain, sum.impact].filter(Boolean).join(" ");
    docs.push({
      id: `news:${id}`,
      source: "news",
      nativeId: id,
      title: art.title || id,
      snippet: art.excerpt || (sum.abstract ? sum.abstract.slice(0, 60) : ""),
      searchText,
      payload: {
        navTarget: "ithome",
        dateMs: art.fetchedAt || 0,
        dateKey: art.dateKey,
      },
    });
  }
  return docs;
}

export function buildAiTaskDocs(taskSummaries: any): Doc[] {
  const docs: Doc[] = [];
  if (!taskSummaries || typeof taskSummaries !== "object") return docs;
  for (const [taskKey, t] of Object.entries(taskSummaries) as [string, any][]) {
    if (!t) continue;
    const searchText = [t.title, t.userGoal, t.outcome].filter(Boolean).join(" ");
    docs.push({
      id: `ai-task:${taskKey}`,
      source: "ai-task",
      nativeId: taskKey,
      title: t.title || taskKey,
      snippet: t.userGoal || "",
      searchText,
      payload: { navTarget: "ai-tasks", appName: t.appName, dateKey: t.dateKey },
    });
  }
  return docs;
}

export function buildReminderDocs(reminders: any): Doc[] {
  const docs: Doc[] = [];
  if (!Array.isArray(reminders)) return docs;
  for (const r of reminders) {
    if (!r || !r.id) continue;
    docs.push({
      id: `reminder:${r.id}`,
      source: "reminder",
      nativeId: r.id,
      title: r.title || r.id,
      snippet: "",
      searchText: r.title || "",
      payload: { navTarget: "reminders", dateMs: r.triggerAt || r.createdAt || 0 },
    });
  }
  return docs;
}

export function buildFundDocs(funds: any): Doc[] {
  const docs: Doc[] = [];
  const holdings = funds && Array.isArray(funds.holdings) ? funds.holdings : [];
  for (const h of holdings) {
    if (!h || !h.id) continue;
    const searchText = [h.name, h.note].filter(Boolean).join(" ");
    docs.push({
      id: `fund:${h.id}`,
      source: "fund",
      nativeId: h.id,
      title: h.name || h.code || h.id,
      snippet: h.note || "",
      searchText,
      payload: { navTarget: "funds", code: h.code },
    });
  }
  return docs;
}

export function buildAppDocs(apps: any): Doc[] {
  const docs: Doc[] = [];
  if (!apps || typeof apps !== "object") return docs;
  for (const name of Object.keys(apps)) {
    docs.push({
      id: `app:${name}`,
      source: "app",
      nativeId: name,
      title: name,
      snippet: "",
      searchText: name,
      payload: { navTarget: "versions" },
    });
  }
  return docs;
}

/**
 * @param state  state.json 解析后的对象
 * @returns Doc 列表
 */
export function buildDocsFromState(state: any): Doc[] {
  if (!state || typeof state !== "object") return [];
  return [
    ...buildNewsDocs(state.ithome_news),
    ...buildAiTaskDocs(state.task_summaries),
    ...buildReminderDocs(state.reminders),
    ...buildFundDocs(state.funds),
    ...buildAppDocs(state.apps),
  ];
}

module.exports = {
  buildDocsFromState,
  buildNewsDocs,
  buildAiTaskDocs,
  buildReminderDocs,
  buildFundDocs,
  buildAppDocs,
};