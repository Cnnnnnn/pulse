/**
 * src/renderer/components/ConfigImportModal.jsx
 *
 * P61 — 配置导入 diff 预览 + 字段级勾选覆盖确认.
 */
import { useEffect, useState } from "preact/hooks";
import { api } from "../api.ts";
import { showToast } from "../store.ts";
import { ModalShell } from "./ModalShell.tsx";
import type {
  ConfigDiffEntry,
  ConfigField,
  ConfigImportFields,
} from "../../shared/ipc-contracts";

const FIELD_LABELS: Record<ConfigField, string> = {
  watchlist: "关注列表",
  reminders: "提醒",
  funds: "基金持仓",
  ai_prompts: "AI Prompt",
};

export function ConfigImportModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [diff, setDiff] = useState<ConfigDiffEntry[] | null>(null);
  const [fields, setFields] = useState<ConfigImportFields | null>(null);
  const [selected, setSelected] = useState<
    Partial<Record<ConfigField, boolean>>
  >({});
  const [applying, setApplying] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);

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
        const sel: Partial<Record<ConfigField, boolean>> = {};
        for (const d of r.diff || []) {
          sel[d.field] = d.status !== "same" && d.status !== "removed";
        }
        setSelected(sel);
      })
      .catch(() => onClose())
      .finally(() => setLoading(false));
  }, [onClose]);

  function toggle(field: ConfigField) {
    setSelected((s) => ({ ...s, [field]: !s[field] }));
  }

  async function doApply() {
    const chosenFields: ConfigImportFields = {};
    for (const f of Object.keys(selected) as ConfigField[]) {
      const v = fields ? fields[f] : undefined;
      if (selected[f] && v != null) chosenFields[f] = v;
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

  const footer = (
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
  );

  return (
    <ModalShell
      open
      onClose={onClose}
      title="导入配置"
      backdropClass="config-import-modal"
      cardClass="config-import-modal-content"
      useModalCardClass={false}
      footer={footer}
      ariaLabel="导入配置"
    >
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
    </ModalShell>
  );
}
