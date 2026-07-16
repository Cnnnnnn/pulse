/**
 * src/renderer/github/GithubAddForm.jsx
 *
 * GitHub 优秀项目收录 — 添加表单：输入地址 → 校验 → 入库。
 */

import { useState } from "preact/hooks";
import {
  addGithubProject,
  parseGithubUrl,
  githubBusy,
  githubReasonText,
} from "../store/github-projects-store.js";

export function GithubAddForm() {
  const [value, setValue] = useState("");
  const [localErr, setLocalErr] = useState(null);

  async function handleAdd() {
    const v = value.trim();
    if (!v) {
      setLocalErr("请输入 GitHub 项目地址");
      return;
    }
    if (!parseGithubUrl(v)) {
      setLocalErr("地址格式不正确，例如 https://github.com/owner/repo");
      return;
    }
    setLocalErr(null);
    const r = await addGithubProject(v);
    if (r.ok) {
      setValue("");
    } else {
      setLocalErr(githubReasonText(r.reason));
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div class="github-add">
      <div class="github-add__row">
        <input
          class="github-add__input"
          type="text"
          placeholder="粘贴 GitHub 项目地址，如 https://github.com/owner/repo"
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          aria-label="GitHub 项目地址"
        />
        <button
          type="button"
          class="github-btn github-btn--primary github-add__btn"
          onClick={handleAdd}
          disabled={githubBusy.value}
        >
          {githubBusy.value ? "添加中…" : "添加项目"}
        </button>
      </div>
      {localErr && <p class="github-add__err">{localErr}</p>}
    </div>
  );
}

export default GithubAddForm;
