import { useEffect, useState } from "preact/hooks";
import { GithubProjectCard } from "./GithubProjectCard.tsx";
import { IconPackage } from "../components/icons.tsx";

const PAGE_SIZE = 8;

export function GithubProjectGrid({ projects, totalProjects = projects?.length || 0, onView, onParse, onRemove, onTogglePin }: any) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil((projects?.length || 0) / PAGE_SIZE));

  useEffect(() => setPage(1), [projects]);

  if (!projects || projects.length === 0) {
    return (
      <div class="github-empty">
        <div class="github-empty__icon"><IconPackage size={32} /></div>
        <p class="github-empty__title">{totalProjects === 0 ? "还没有收录任何项目" : "没有匹配的项目"}</p>
        <p class="github-empty__hint">{totalProjects === 0 ? "点击上方“添加项目”，开始建立你的开源库。" : "试试调整搜索关键词或清除筛选条件。"}</p>
      </div>
    );
  }
  const safePage = Math.min(page, pageCount);
  const visible = projects.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return (
    <>
      <div class="github-cards github-project-grid">
      {visible.map((project: any) => (
        <GithubProjectCard
          key={project.id}
          project={project}
          onView={onView}
          onParse={onParse}
          onRemove={onRemove}
          onTogglePin={onTogglePin}
        />
      ))}
      </div>
      {pageCount > 1 && (
        <div class="github-pager">
          <button type="button" class="github-control github-pager__btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>上一页</button>
          <span class="github-pager__info">{safePage} / {pageCount}（共 {projects.length} 个）</span>
          <button type="button" class="github-control github-pager__btn" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>下一页</button>
        </div>
      )}
    </>
  );
}

export default GithubProjectGrid;
