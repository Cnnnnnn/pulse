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
import { PromptSectionIcon } from "./icons.jsx";

export function PromptSettings() {
  const prompts = aiPrompts.value;
  const [draft, setDraft] = useState(null);
  const debounceRef = useRef(null);
  // A8: 反馈样本数
  const [feedbackCount, setFeedbackCount] = useState(null);
  // P71: token 预算
  const [budget, setBudget] = useState({ dailyLimit: 0, mode: "warn" });
  const [todaySpend, setTodaySpend] = useState(0);
  const [budgetLoaded, setBudgetLoaded] = useState(false);

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
    // P71: 拉取预算配置 + 当日用量
    if (api.tokenBudgetGet) {
      api.tokenBudgetGet()
        .then((r) => {
          if (r && r.ok && r.config) {
            setBudget(r.config);
            setTodaySpend(r.todaySpend || 0);
          }
        })
        .catch(() => {})
        .finally(() => setBudgetLoaded(true));
    } else {
      setBudgetLoaded(true);
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

  async function saveBudget(patch) {
    const next = { ...budget, ...patch };
    setBudget(next);
    if (!api.tokenBudgetSet) return;
    try {
      const r = await api.tokenBudgetSet(next);
      if (r && r.ok) {
        showToast("预算已更新", "success", 1500);
      } else {
        showToast("预算更新失败", "error", 2000);
      }
    } catch {
      showToast("预算更新失败", "error", 2000);
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
    return (
      <div class="settings-empty">加载 Prompt 配置…</div>
    );
  }

  // P16: 改用 settings-card / settings-row 体系, 与设置页 4 段卡片视觉统一.
  return (
    <>
      {/* ── Prompt 模板说明 + 反馈导出 ── */}
      <section class="settings-card">
        <h3 class="settings-card__title">AI Prompt 模板</h3>
        <p class="settings-row__hint" style="margin: 0 0 var(--space-3);">
          自定义 AI 摘要/预测/升级建议的 prompt。few-shot 为可选参考示例。
        </p>
        <div class="settings-row">
          <div class="settings-row__label-block">
            <span class="settings-row__label">反馈样本导出</span>
            <span class="settings-row__hint">导出 IconThumbsUp/IconThumbsDown 反馈样本为 JSON，可作为 few-shot 调优的数据源。</span>
          </div>
          <div class="settings-row__buttons">
            <button
              type="button"
              class="settings-btn settings-btn--ghost"
              onClick={exportFeedback}
              title="导出 AI 反馈样本 JSON"
            >
              导出 AI 反馈样本{feedbackCount != null ? ` (${feedbackCount})` : ""}
            </button>
          </div>
        </div>
      </section>

      {/* ── Token 预算 (成本治理 / 防漏钱) ── */}
      <section class="settings-card">
        <h3 class="settings-card__title">每日 Token 预算</h3>
        <p class="settings-row__hint" style="margin: 0 0 var(--space-3);">
          控制 AI 调用的成本上限。0 = 不限制。
        </p>
        <div class="settings-row">
          <div class="settings-row__label-block">
            <label class="settings-row__label">每日上限</label>
            <span class="settings-row__hint">今日已用 {todaySpend} token</span>
          </div>
          <div class="settings-row__buttons">
            <input
              class="settings-input"
              type="number"
              min="0"
              step="1000"
              value={budget.dailyLimit}
              disabled={!budgetLoaded}
              onInput={(e) => {
                setBudget({ ...budget, dailyLimit: Number(e.target.value) });
              }}
              onBlur={(e) => saveBudget({ dailyLimit: Number(e.target.value) || 0 })}
              title="0 = 不限制"
            />
            <select
              class="settings-input"
              value={budget.mode}
              disabled={!budgetLoaded}
              onChange={(e) => saveBudget({ mode: e.target.value })}
              title="超限处理策略"
            >
              <option value="warn">超限仅警告</option>
              <option value="block">超限拦截</option>
            </select>
          </div>
        </div>
      </section>

      {/* ── 每个 prompt 段独立卡片 ── */}
      {Object.keys(prompts).map((key) => (
        <section class="settings-card" key={key}>
          <h3 class="settings-card__title">
            <PromptSectionIcon promptKey={key} size={14} />
            <span style="margin-left: 6px;">{promptLabel(key)}</span>
            {prompts[key].isDefault ? (
              <span class="settings-ai-badge settings-ai-badge--ready">默认</span>
            ) : (
              <button
                type="button"
                class="settings-btn settings-btn--ghost"
                style="margin-left: auto;"
                onClick={() => handleReset(key)}
              >
                恢复默认
              </button>
            )}
          </h3>
          <div class="ai-settings-field-grid">
            <div class="settings-row settings-row--stack">
              <label class="settings-row__label">角色设定 (system)</label>
              <textarea
                class="settings-input"
                rows="2"
                value={draft[key]?.system || ""}
                onInput={(e) => updateField(key, "system", e.target.value)}
                placeholder={prompts[key].system}
              />
            </div>
            <div class="settings-row settings-row--stack">
              <label class="settings-row__label">输出规则 (rules)</label>
              <textarea
                class="settings-input"
                rows="6"
                value={draft[key]?.rules || ""}
                onInput={(e) => updateField(key, "rules", e.target.value)}
                placeholder={prompts[key].rules}
              />
            </div>
            <div class="settings-row settings-row--stack">
              <label class="settings-row__label">Few-shot 示例 (可选)</label>
              <textarea
                class="settings-input"
                rows="3"
                value={draft[key]?.fewShot || ""}
                onInput={(e) => updateField(key, "fewShot", e.target.value)}
                placeholder="留空则不用示例"
              />
            </div>
          </div>
        </section>
      ))}
    </>
  );
}

export default PromptSettings;
