/**
 * src/renderer/vault/VaultSecretModal.tsx
 *
 * 密钥库 新建/编辑弹窗 (v2.83；v2.84 支持附加字段)。
 * 编辑时 value / 附加字段值默认留空 = 保持原值（不回显明文，减少不必要的明文往返）。
 */

import { useEffect, useState } from "preact/hooks";
import { BareModalShell } from "../components/ModalShell.tsx";
import {
  vaultModalOpen,
  vaultEditing,
  vaultBusy,
  closeVaultModal,
  saveVaultSecret,
  VAULT_CATEGORY_PRESETS,
} from "./store.ts";

/** ms epoch → "YYYY-MM-DD"（date input 需要的格式，当地时区） */
function msToDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

type FieldRow = { label: string; value: string };

export function VaultSecretModal() {
  const editing = vaultEditing.value;
  const open = vaultModalOpen.value;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [fields, setFields] = useState<FieldRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(editing ? editing.name : "");
    setCategory(editing ? editing.category : "");
    setValue("");
    setNote(editing ? editing.note : "");
    setExpiresAt(
      editing && editing.expiresAt ? msToDateInput(editing.expiresAt) : "",
    );
    // 已有字段：label 预填、value 留空 = 保持原值（不回显明文）
    setFields(
      editing && Array.isArray(editing.fields)
        ? editing.fields.map((f) => ({ label: f.label, value: "" }))
        : [],
    );
  }, [open, editing]);

  const existingLabels = new Set(
    (editing && Array.isArray(editing.fields)
      ? editing.fields.map((f) => f.label.toLowerCase())
      : []) as string[],
  );
  // 校验：label 必填；新 label 需要值（已有 label 留空 = 保持原值）；label 不可重复
  const labelsSeen = new Set<string>();
  const fieldsValid = fields.every((f) => {
    const label = f.label.trim();
    if (!label) return f.value.trim() === ""; // 全空行允许（提交时丢弃）
    const key = label.toLowerCase();
    if (labelsSeen.has(key)) return false;
    labelsSeen.add(key);
    if (f.value.trim()) return true;
    return existingLabels.has(key); // 留空仅对已有字段合法
  });
  const fieldsTrimmed = fields
    .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
    .filter((f) => f.label || f.value);

  const canSubmit =
    name.trim().length > 0 &&
    (editing || value.trim().length > 0) &&
    fieldsValid;

  const submit = async () => {
    if (!canSubmit || vaultBusy.value) return;
    await saveVaultSecret({
      id: editing ? editing.id : undefined,
      name: name.trim(),
      category: category.trim(),
      value: value.trim(),
      note: note.trim(),
      fields: fieldsTrimmed,
      // "" = 清除过期时间；未改动时也显式传值（简单起见总是传）
      expiresAt: expiresAt || null,
    });
  };

  const updateField = (idx: number, patch: Partial<FieldRow>) => {
    setFields((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeField = (idx: number) => {
    setFields((rows) => rows.filter((_, i) => i !== idx));
  };
  const addField = () => {
    setFields((rows) => [...rows, { label: "", value: "" }]);
  };

  return (
    <BareModalShell
      open={open}
      onClose={() => closeVaultModal()}
      overlayClass="modal-backdrop"
      cardClass="vault-modal"
      ariaLabel={editing ? "编辑密钥" : "添加密钥"}
    >
      <header class="vault-modal__head">
        <h3>{editing ? `编辑「${editing.name}」` : "添加密钥"}</h3>
        <button
          type="button"
          class="vault-modal__close"
          onClick={() => closeVaultModal()}
          aria-label="关闭"
        >
          ✕
        </button>
      </header>

      <div class="vault-modal__body">
        <label class="vault-field">
          <span class="vault-field__label">名称 *</span>
          <input
            class="vault-field__input"
            type="text"
            placeholder="如：OpenAI 生产 Key"
            value={name}
            maxLength={100}
            onInput={(e: any) => setName(e.target.value)}
          />
        </label>

        <label class="vault-field">
          <span class="vault-field__label">分类</span>
          <input
            class="vault-field__input"
            type="text"
            placeholder="内置功能 / AI / 开发 / 云服务…"
            value={category}
            maxLength={50}
            list="vault-category-presets"
            onInput={(e: any) => setCategory(e.target.value)}
          />
          <datalist id="vault-category-presets">
            {VAULT_CATEGORY_PRESETS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label class="vault-field">
          <span class="vault-field__label">
            {editing ? "密钥内容（留空 = 保持原值）" : "密钥内容 *"}
          </span>
          <textarea
            class="vault-field__input vault-field__input--area"
            placeholder="粘贴 token / API key…"
            value={value}
            rows={3}
            spellcheck={false}
            autocomplete="off"
            onInput={(e: any) => setValue(e.target.value)}
          />
        </label>

        <label class="vault-field">
          <span class="vault-field__label">备注</span>
          <input
            class="vault-field__input"
            type="text"
            placeholder="如：申请于 2026-08，配额 60 次/小时"
            value={note}
            maxLength={500}
            onInput={(e: any) => setNote(e.target.value)}
          />
        </label>

        <div class="vault-field">
          <span class="vault-field__label">
            附加字段（如 baseUrl / model，最多 10 个；留空值 = 保持原值）
          </span>
          {fields.map((f, idx) => (
            <div class="vault-field-row" key={idx}>
              <input
                class="vault-field__input vault-field-row__label"
                type="text"
                placeholder="名称，如 baseUrl"
                value={f.label}
                maxLength={50}
                spellcheck={false}
                onInput={(e: any) => updateField(idx, { label: e.target.value })}
              />
              <input
                class="vault-field__input vault-field-row__value"
                type="text"
                placeholder={
                  f.label.trim() && existingLabels.has(f.label.trim().toLowerCase())
                    ? "留空 = 保持原值"
                    : "粘贴字段值…"
                }
                value={f.value}
                maxLength={2000}
                spellcheck={false}
                autocomplete="off"
                onInput={(e: any) => updateField(idx, { value: e.target.value })}
              />
              <button
                type="button"
                class="vault-field-row__remove"
                onClick={() => removeField(idx)}
                title="移除该字段"
              >
                ✕
              </button>
            </div>
          ))}
          {fields.length < 10 ? (
            <button type="button" class="vault-btn" onClick={addField}>
              ＋ 添加字段
            </button>
          ) : null}
        </div>

        <label class="vault-field">
          <span class="vault-field__label">过期时间（可选，到期前 7 天开始提醒）</span>
          <input
            class="vault-field__input"
            type="date"
            value={expiresAt}
            onChange={(e: any) => setExpiresAt(e.target.value)}
          />
        </label>

        <p class="vault-modal__hint">
          密钥经系统 Keychain 加密后落盘，列表中只显示掩码；复制 30 秒后自动清空剪贴板。
        </p>
      </div>

      <footer class="vault-modal__foot">
        <button
          type="button"
          class="vault-btn"
          onClick={() => closeVaultModal()}
        >
          取消
        </button>
        <button
          type="button"
          class="vault-btn vault-btn--primary"
          disabled={!canSubmit || vaultBusy.value}
          onClick={submit}
        >
          {vaultBusy.value ? "保存中…" : "保存"}
        </button>
      </footer>
    </BareModalShell>
  );
}
