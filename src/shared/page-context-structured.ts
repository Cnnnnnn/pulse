/**
 * 结构化页面实体 — 供 prompt / 模型直接引用 id.
 */
export type PageEntitySelection = {
  movie?: { id: string; title?: string };
  financeArticle?: { id: string; title?: string };
  ithomeArticle?: { id: string; title?: string };
  stock?: { code: string; name?: string };
};

export type PageVisibleMovie = {
  id: string;
  title: string;
  index: number;
};

export type PageContextEntities = {
  activeNav: string;
  route: string;
  investTab?: string;
  newsSubTab?: string;
  selection: PageEntitySelection;
  visibleMovies?: PageVisibleMovie[];
};

export function buildPageContextEntities(input: {
  activeNav: string;
  route: string;
  investTab?: string;
  newsSubTab?: string;
  selection?: PageEntitySelection;
  visibleMovies?: PageVisibleMovie[];
}): PageContextEntities {
  return {
    activeNav: input.activeNav,
    route: input.route,
    investTab: input.investTab,
    newsSubTab: input.newsSubTab,
    selection: input.selection || {},
    visibleMovies: input.visibleMovies,
  };
}

export function formatPageEntitiesForPrompt(entities: PageContextEntities): string {
  const json = JSON.stringify(entities);
  return [
    "pageEntities=" + json,
    "说明: 打开详情优先用 selection 内 id（movie.id / financeArticle.id / ithomeArticle.id / stock.code）；",
    "电影列表用 visibleMovies 的 index（第 N 个）或 title；有 id 时 open_* / pulse_open 务必带 id。",
  ].join("\n");
}
