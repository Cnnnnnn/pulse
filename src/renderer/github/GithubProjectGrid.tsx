import { GithubProjectCard } from "./GithubProjectCard.tsx";
import { IconPackage } from "../components/icons.tsx";

export function GithubProjectGrid({ projects, onView, onParse, onRemove, onTogglePin }: any) {
  if (!projects || projects.length === 0) {
    return (
      <div class="github-empty">
        <div class="github-empty__icon"><IconPackage size={32} /></div>
        <p class="github-empty__title">没有匹配的项目</p>
        <p class="github-empty__hint">试试调整搜索关键词或清除筛选条件。</p>
      </div>
    );
  }
  return (
    <div class="github-cards github-project-grid">
      {projects.map((project: any) => (
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
  );
}

export default GithubProjectGrid;
