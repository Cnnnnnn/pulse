/**
 * src/renderer/vault/VaultImportModal.tsx
 *
 * 导入预览弹窗 (v2.83) — 只显示掩码 hint（明文留存在主进程），
 * 同名条目标记「覆盖」，确认后主进程按 upsert 合并。
 */

import { BareModalShell } from "../components/ModalShell.tsx";
import {
  vaultImportPreview,
  confirmVaultImport,
  cancelVaultImport,
} from "./store.ts";

export function VaultImportModal() {
  const preview = vaultImportPreview.value;
  if (!preview) return null;

  const conflicts = preview.entries.filter((e) => e.conflict).length;

  return (
    <BareModalShell
      open
      onClose={cancelVaultImport}
      overlayClass="modal-backdrop"
      cardClass="vault-modal vault-modal--import"
      ariaLabel="确认导入"
    >
      <header class="vault-modal__head">
        <h3>确认导入「{preview.fileName}」</h3>
        <button
          type="button"
          class="vault-modal__close"
          onClick={cancelVaultImport}
          aria-label="关闭"
        >
          ✕
        </button>
      </header>

      <div class="vault-modal__body">
        <p class="vault-modal__hint" style="margin:0">
          共 {preview.total} 条
          {conflicts > 0 ? `，其中 ${conflicts} 条与本地同名（导入后覆盖本地值）` : ""}
          {preview.invalidCount > 0 ? `，${preview.invalidCount} 条无效已跳过` : ""}。
        </p>
        <div class="vault-import-list">
          {preview.entries.map((e) => (
            <div class="vault-import-list__row" key={e.name}>
              <span class="vault-import-list__name">{e.name}</span>
              {e.category ? (
                <span class="vault-row__category">{e.category}</span>
              ) : null}
              {e.conflict ? (
                <span class="vault-import-list__conflict">覆盖</span>
              ) : (
                <span class="vault-import-list__new">新建</span>
              )}
              <code class="vault-import-list__hint">{e.hint}</code>
            </div>
          ))}
        </div>
      </div>

      <footer class="vault-modal__foot">
        <button type="button" class="vault-btn" onClick={cancelVaultImport}>
          取消
        </button>
        <button
          type="button"
          class="vault-btn vault-btn--primary"
          onClick={confirmVaultImport}
        >
          导入 {preview.total} 条
        </button>
      </footer>
    </BareModalShell>
  );
}
