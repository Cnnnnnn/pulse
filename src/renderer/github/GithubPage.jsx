/**
 * src/renderer/github/GithubPage.jsx
 *
 * GitHub 优秀项目收录 — 主页面：添加表单 + 项目列表 + 详情抽屉。
 * 列表分页、README 与 AI 解析结果在抽屉内以清晰布局呈现。
 */

import { useState } from "preact/hooks";
import { FeatureHeader } from "../components/FeatureHeader.jsx";
import { githubProjects, githubError } from "../store/github-projects-store.js";
import { GithubAddForm } from "./GithubAddForm.jsx";
import { GithubProjectList } from "./GithubProjectList.jsx";
import { GithubProjectDrawer } from "./GithubProjectDrawer.jsx";

function GithubMark({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function GithubPage() {
  const [drawerId, setDrawerId] = useState(null);
  const [drawerTab, setDrawerTab] = useState("readme");

  function handleView(id) {
    setDrawerTab("readme");
    setDrawerId(id);
  }

  function handleParse(id) {
    setDrawerTab("ai");
    setDrawerId(id);
  }

  const count = githubProjects.value.length;

  return (
    <div class="github-page">
      <FeatureHeader
        className="github-header"
        brand={
          <>
            <span class="github-brand-icon">
              <GithubMark size={18} />
            </span>
            GitHub 优秀项目收录
          </>
        }
      >
        <span class="github-header__count">
          {count > 0 ? `已收录 ${count} 个项目` : "建立你的开源项目库"}
        </span>
      </FeatureHeader>

      <div class="github-body">
        <GithubAddForm />
        {githubError.value && (
          <p class="github-page__err">
            操作失败：{githubError.value}
          </p>
        )}
        <GithubProjectList onView={handleView} onParse={handleParse} />
      </div>

      {drawerId && (
        <GithubProjectDrawer
          projectId={drawerId}
          initialTab={drawerTab}
          onClose={() => setDrawerId(null)}
        />
      )}
    </div>
  );
}

export default GithubPage;
