/**
 * src/renderer/components/PromptSettings.jsx
 *
 * A7: AI prompt 模板编辑面板. 3 个 prompt × (system + rules) textarea.
 * debounce 500ms 保存. isDefault=true 显示 "默认" 标记.
 */
import { useEffect, useState, useRef } from "preact/hooks";
import {
  aiPrompts,
  loadAiPrompts,
  saveAiPrompts,
  promptLabel,
} from "../store/prompt-store.js";
import { showToast } from "../store.js";

export function PromptSettings() {
  const prompts = aiPrompts.value;
  // 本地草稿 (避免每次按键都保存)
  const [draft, setDraft] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    loadAiPrompts();
  }, []);

  // prompts 加载完 → 初始化草稿
  useEffect(() => {
    if (prompts && !draft) {
      const d = {};
      for (const key of Object.keys(prompts)) {
        d[key] = { system: prompts[key].system, rules: prompts[key].rules };
      }
      setDraft(d);
    }
  }, [prompts, draft]);

  function updateField(key, field, value) {
    if (!draft) return;
    const next = { ...draft, [key]: { ...draft[key], [field]: value } };
    setDraft(next);
    // debounce 保存
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
        自定义 AI 摘要/预测的 prompt。留空 system 恢复默认。改错可手动清空重存。
      </p>
      {Object.keys(prompts).map((key) => (
        <div class="prompt-settings-item" key={key}>
          <div class="prompt-settings-item-head">
            <span class="prompt-settings-item-label">{promptLabel(key)}</span>
            {prompts[key].isDefault && (
              <span class="prompt-settings-default-tag">默认</span>
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
        </div>
      ))}
    </section>
  );
}

export default PromptSettings;
