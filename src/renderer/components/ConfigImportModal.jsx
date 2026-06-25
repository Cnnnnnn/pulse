/**
 * src/renderer/components/ConfigImportModal.jsx
 *
 * P61 — 配置导入 diff 预览 + 字段级勾选覆盖确认.
 * 流程: 挂载时调 configImportLoad (弹文件选择对话框 + 算 diff) →
 *      用户勾选要导入的字段 → 点导入调 configImportApply.
 */
import { useEffect, useState } from "preact/hooks";
import { api } from "../api.js";
import { showToast } from "../store.js";

const FIELD_LABELS = {
  watchlist: "关注列表",
  reminders: "提醒",
  funds: "基金持仓",
  ai_prompts: "AI Prompt",
};

export function ConfigImportModal({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [diff, setDiff] = useState(null);
  const [fields, setFields] = useState(null);
  const [selected, setSelected] = useState({});
  const [applying, setApplying] = useState(false);
  const [filePath, setFilePath] = useState(null);

  useEffect(() => {
    if (!api.configImportLoad) {
      setLoading(false);
      return;
    }
    api.configImportLoad()
      .then((r) => {
        if (!r || !r.ok) {
          if (r && r.reason && r.reason !== "cancelled") {
            showToast("读取配置失败", "error", 2000);
          }
          onClose();
          return;
        }
        setDiff(r.diff || []);
        setFields(r.fields || {});
        setFilePath(r.filePath);
        const sel = {};
        for (const d of r.diff || []) {
          sel[d.field] = d.status !== "same" && d.status !== "removed";
        }
        setSelected(sel);
      })
      .catch(() => onClose())
      .finally(() => setLoading(false));
  }, []);

  function toggle(field) {
    setSelected((s) => ({ ...s, [field]: !s[field] }));
  }

  async function doApply() {
    const chosenFields = {};
    for (const f of Object.keys(selected)) {
      if (selected[f] && fields[f] != null) chosenFields[f] = fields[f];
    }
    if (Object.keys(chosenFields).length === 0) {
      showToast("未选择任何字段", "error", 1500);
      return;
    }
    setApplying(true);
    try {
      const r = await api.configImportApply({ fields: chosenFields });
      if (r && r.ok) {
        showToast(
          `已导入 ${r.applied.length} 项: ${r.applied.join(", ")}`,
          "success",
          2500,
        );
        onClose();
      } else {
        showToast("导入失败: " + ((r && r.reason) || "未知"), "error", 2500);
      }
    } catch {
      showToast("导入失败", "error", 2000);
    }
    setApplying(false);
  }

  return (
    <div class="config-import-modal">
      <div class="config-import-modal-content">
        <h3>导入配置</h3>
        {filePath && (
          <p class="config-import-source">来源: {filePath}</p>
        )}
        {loading && <p>加载中…</p>}
        {!loading && diff && (
          <table class="config-import-diff">
            <thead>
              <tr>
                <th>导入</th>
                <th>字段</th>
                <th>状态</th>
                <th>当前</th>
                <th>传入</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {diff.map((d) => (
                <tr key={d.field} class={`config-import-row is-${d.status}`}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={d.field}
                      checked={!!selected[d.field]}
                      disabled={d.status === "removed"}
                      onChange={() => toggle(d.field)}
                    />
                  </td>
                  <td>{FIELD_LABELS[d.field] || d.field}</td>
                  <td>
                    <span class={`config-import-status is-${d.status}`}>
                      {d.status}
                    </span>
                  </td>
                  <td>{d.currentCount}</td>
                  <td>{d.incomingCount}</td>
                  <td>{d.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div class="config-import-actions">
          <button
            type="button"
            class="btn btn-ghost"
            onClick={onClose}
            disabled={applying}
          >
            取消
          </button>
          <button
            type="button"
            class="btn btn-primary"
            onClick={doApply}
            disabled={applying || loading}
          >
            {applying ? "导入中…" : "导入"}
          </button>
        </div>
      </div>
    </div>
  );
}
