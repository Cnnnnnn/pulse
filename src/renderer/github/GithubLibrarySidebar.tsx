import type { GithubLibraryFilters } from "./github-library-selectors.ts";

export function GithubLibrarySidebar({ stats, filters, onFiltersChange }: {
  stats: any;
  filters: GithubLibraryFilters;
  onFiltersChange: (filters: GithubLibraryFilters) => void;
}) {
  const current = filters || { status: "all", language: "", topic: "" };
  const setFilter = (next: Partial<GithubLibraryFilters>) =>
    onFiltersChange({ ...current, ...next });

  return (
    <aside class="github-library__sidebar" aria-label="项目筛选">
      <div class="github-library__sidebar-group">
        <p class="github-library__sidebar-label">浏览</p>
        <button
          type="button"
          class={`github-library__filter ${current.status === "all" ? "is-active" : ""}`}
          aria-pressed={current.status === "all"}
          onClick={() => setFilter({ status: "all" })}
        >
          <span>全部项目</span><b>{stats?.total || 0}</b>
        </button>
        <button
          type="button"
          class={`github-library__filter ${current.status === "unread" ? "is-active" : ""}`}
          aria-pressed={current.status === "unread"}
          onClick={() => setFilter({ status: "unread" })}
        >
          <span>待处理更新</span><b>{stats?.unread || 0}</b>
        </button>
        <button
          type="button"
          class={`github-library__filter ${current.status === "recent" ? "is-active" : ""}`}
          aria-pressed={current.status === "recent"}
          onClick={() => setFilter({ status: "recent" })}
        >
          <span>最近查看</span><b>{stats?.recent || 0}</b>
        </button>
        <button
          type="button"
          class={`github-library__filter ${current.status === "unparsed" ? "is-active" : ""}`}
          aria-pressed={current.status === "unparsed"}
          onClick={() => setFilter({ status: "unparsed" })}
        >
          <span>待解析</span><b>{Math.max(0, (stats?.total || 0) - (stats?.parsed || 0))}</b>
        </button>
      </div>

      {stats?.languages?.length > 0 && (
        <div class="github-library__sidebar-group">
          <p class="github-library__sidebar-label">语言</p>
          {stats.languages.map((language: string) => (
            <button
              type="button"
              class={`github-library__filter ${current.language === language ? "is-active" : ""}`}
              aria-pressed={current.language === language}
              onClick={() => setFilter({ language: current.language === language ? "" : language })}
              key={language}
            >
              <span>{language}</span>
            </button>
          ))}
        </div>
      )}

      {stats?.tags?.length > 0 && (
        <div class="github-library__sidebar-group">
          <p class="github-library__sidebar-label">标签</p>
          {stats.tags.slice(0, 12).map((topic: string) => (
            <button
              type="button"
              class={`github-library__filter ${current.topic === topic ? "is-active" : ""}`}
              aria-pressed={current.topic === topic}
              onClick={() => setFilter({ topic: current.topic === topic ? "" : topic })}
              key={topic}
            >
              <span>{topic}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

export default GithubLibrarySidebar;
