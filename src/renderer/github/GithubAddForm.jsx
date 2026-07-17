/**
 * src/renderer/github/GithubAddForm.jsx
 *
 * GitHub 优秀项目收录 — 添加表单：输入地址 → 校验 → 入库。
 * 支持单条（input）和批量（textarea 多行，每行一个地址，支持 # 注释）。
 */

import { useState } from "preact/hooks";
import {
  addGithubProject,
  addGithubProjectsBatch,
  parseGithubUrl,
  githubBusy,
  githubReasonText,
} from "../store/github-projects-store.js";
import { showToast } from "../store/toast-store.js";

/** 把批量 textarea 的原始文本解析成地址数组：按换行分割，过滤空行和 # 注释行。 */
export function parseBatchInputs(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export function GithubAddForm() {
  const [value, setValue] = useState("");
  const [localErr, setLocalErr] = useState(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchResults, setBatchResults] = useState(null);

  async function handleAdd() {
    if (batchMode) return handleBatchAdd();
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
      if (r.persistFailed) {
        // addGithubProject 内部已 toast 配额警告，这里不重复
      } else {
        showToast(`已收录 ${v.split("/").slice(-1)[0]}`, "success", 2000);
      }
    } else {
      setLocalErr(githubReasonText(r.reason));
    }
  }

  async function handleBatchAdd() {
    const inputs = parseBatchInputs(value);
    if (inputs.length === 0) {
      setLocalErr("请输入至少一个 GitHub 项目地址（每行一个）");
      return;
    }
    setLocalErr(null);
    setBatchResults(null);
    const r = await addGithubProjectsBatch(inputs);
    const parts = [`已添加 ${r.added} 个`];
    if (r.duplicates > 0) parts.push(`${r.duplicates} 个已存在`);
    if (r.failed.length > 0) parts.push(`${r.failed.length} 个失败`);
    showToast(parts.join("，"), r.failed.length > 0 ? "warn" : "success", 4000);
    if (r.added > 0 || r.duplicates === inputs.length) {
      setValue(""); // 全处理完才清空
    }
    if (r.failed.length > 0) {
      setBatchResults(r.failed);
    }
  }

  function onKeyDown(e) {
    // 批量模式下 textarea 的 Enter 是换行，不触发提交（用按钮或 Cmd/Ctrl+Enter）
    if (e.key === "Enter" && !batchMode) {
      e.preventDefault();
      handleAdd();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && batchMode) {
      e.preventDefault();
      handleAdd();
    }
  }

  function toggleBatch() {
    setBatchMode(!batchMode);
    setLocalErr(null);
    setBatchResults(null);
    setValue("");
  }

  return (
    <div class="github-add">
      <div class="github-add__row">
        {batchMode ? (
          <textarea
            class="github-add__textarea"
            placeholder={"每行一个 GitHub 项目地址，例如：\nhttps://github.com/facebook/react\nhttps://github.com/vuejs/vue\n# 以 # 开头的行会被忽略"}
            value={value}
            onInput={(e) => setValue(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            aria-label="批量输入 GitHub 项目地址"
            rows={5}
          />
        ) : (
          <input
            class="github-add__input"
            type="text"
            placeholder="粘贴 GitHub 项目地址，如 https://github.com/owner/repo"
            value={value}
            onInput={(e) => setValue(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            aria-label="GitHub 项目地址"
          />
        )}
        <button
          type="button"
          class="github-btn github-btn--primary github-add__btn"
          onClick={handleAdd}
          disabled={githubBusy.value}
        >
          {githubBusy.value ? "添加中…" : batchMode ? "批量添加" : "添加项目"}
        </button>
        <button
          type="button"
          class="github-btn github-btn--ghost github-add__toggle"
          onClick={toggleBatch}
          title={batchMode ? "切换到单条添加" : "切换到批量添加"}
        >
          {batchMode ? "单条" : "批量"}
        </button>
      </div>
      {localErr && <p class="github-add__err">{localErr}</p>}
      {batchResults && batchResults.length > 0 && (
        <div class="github-add__batcherr">
          <p class="github-add__batcherr-title">以下地址添加失败：</p>
          <ul>
            {batchResults.map((f, i) => (
              <li key={i}>
                <code>{f.input}</code>
                <span> — {githubReasonText(f.reason)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default GithubAddForm;
