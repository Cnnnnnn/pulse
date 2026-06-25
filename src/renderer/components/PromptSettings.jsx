/**
 * src/renderer/components/PromptSettings.jsx
 *
 * A7 / A7 v2: AI prompt 编辑 — system + rules + few-shot + 恢复默认.
 */
import { useEffect, useState, useRef } from "preact/hooks";
import {
  aiPrompts,
  loadAiPrompts,
  saveAiPrompts,
  resetAiPrompt,
  promptLabel,
} from "../store/prompt-store.js";
import { showToast } from "../store.js";
import { api } from "../api.js";

export function PromptSettings() {
  const prompts = aiPrompts.value;
  const [draft, setDraft] = useState(null);
  const debounceRef = useRef(null);
  const [feedbackCount, setFeedbackCount] = useState(null);

  useEffect(() => {
    loadAiPrompts();
    // A8: 拉取反馈样本数, 显示在导出按钮
    if (api.feedbackExport) {
      api.feedbackExport()
        .then((r) => {
          if (r && r.ok && Array.isArray(r.samples)) {
            setFeedbackCount(r.samples.length);
          }
        })
        .catch(() => {});
    }
  }, []);

  async function exportFeedback() {
    if (!api.feedbackExport) return;
    try {
      const r = await api.feedbackExport();
      if (!r || !r.ok) {
        showToast("导出失败", "error", 2500);
        return;
      }
      const samples = Array.isArray(r.samples) ? r.samples : [];
      const blob = new Blob([JSON.stringify(samples, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pulse-ai-feedback.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast(`已导出 ${samples.length} 条反馈`, "success", 2000);
    } catch {
      showToast("导出失败", "error", 2500);
    }
  }

  useEffect(() => {
    if (prompts && !draft) {
      const d = {};
      for (const key of Object.keys(prompts)) {
        d[key] = {
          system: prompts[key].system,
          rules: prompts[key].rules,
          fewShot: prompts[key].fewShot || "",
        };
      }
      setDraft(d);
    }
  }, [prompts, draft]);

  function scheduleSave(next) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const r = await saveAiPrompts(next);
      if (r && r.ok) {
        showToast("Prompt 已保存", "success", 1500);
      } else {
        showToast("保存失败", "error", 2500);
      }
    }, 500);
  }

  function updateField(key, field, value) {
    if (!draft) return;
    const next = { ...draft, [key]: { ...draft[key], [field]: value } };
    setDraft(next);
    scheduleSave(next);
  }

  async function handleReset(key) {
    const r = await resetAiPrompt(key);
    if (r && r.ok) {
      setDraft(null);
      showToast("已恢复默认", "success", 1500);
    } else {
      showToast("恢复失败", "error", 2500);
    }
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  if (!prompts || !draft) {
    return <div class="prompt-settings-loading">加载 Prompt 配置…</div>;
  }

  return (
    <section class="prompt-settings">
      <h3 class="prompt-settings-title">AI Prompt 模板</h3>
      <p class="prompt-settings-hint">
        自定义 AI 摘要/预测/升级建议的 prompt。few-shot 为可选参考示例。
      </p>
      <div class="prompt-settings-feedback-row">
        <button
          type="button"
          class="btn btn-ghost btn-sm prompt-settings-export-feedback"
          onClick={exportFeedback}
          title="导出 👍/👎 反馈样本为 JSON, 可作为 few-shot 调优的数据源"
        >
          导出 AI 反馈样本{feedbackCount != null ? ` (${feedbackCount})` : ""}
        </button>
      </div>
      {Object.keys(prompts).map((key) => (
        <div class="prompt-settings-item" key={key}>
          <div class="prompt-settings-item-head">
            <span class="prompt-settings-item-label">{promptLabel(key)}</span>
            {prompts[key].isDefault && (
              <span class="prompt-settings-default-tag">默认</span>
            )}
            {!prompts[key].isDefault && (
              <button
                type="button"
                class="btn btn-ghost btn-sm prompt-settings-reset"
                onClick={() => handleReset(key)}
              >
                恢复默认
              </button>
            )}
          </div>
          <label class="prompt-settings-field">
            <span class="prompt-settings-field-label">角色设定 (system)</span>
            <textarea
              class="prompt-settings-textarea"
              rows="2"
              value={draft[key]?.system || ""}
              onInput={(e) => updateField(key, "system", e.target.value)}
              placeholder={prompts[key].system}
            />
          </label>
          <label class="prompt-settings-field">
            <span class="prompt-settings-field-label">输出规则 (rules)</span>
            <textarea
              class="prompt-settings-textarea prompt-settings-textarea--rules"
              rows="6"
              value={draft[key]?.rules || ""}
              onInput={(e) => updateField(key, "rules", e.target.value)}
              placeholder={prompts[key].rules}
            />
          </label>
          <label class="prompt-settings-field">
            <span class="prompt-settings-field-label">Few-shot 示例 (可选)</span>
            <textarea
              class="prompt-settings-textarea prompt-settings-textarea--rules"
              rows="3"
              value={draft[key]?.fewShot || ""}
              onInput={(e) => updateField(key, "fewShot", e.target.value)}
              placeholder="留空则不用示例"
            />
          </label>
        </div>
      ))}
    </section>
  );
}

export default PromptSettings;
