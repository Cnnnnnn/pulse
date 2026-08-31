/**
 * src/renderer/vault/VaultLayout.tsx
 *
 * 密钥库主视图 (v2.83)。
 *   header: 标题 + 条数 + 加密状态
 *   工具栏: 搜索 + 添加
 *   列表:   掩码显示；复制 / 显示(15s 自动隐藏) / 编辑 / 删除
 */

import { useEffect } from "preact/hooks";
import "./vault.css";
import { openConfirm } from "../store/confirmStore.ts";
import {
  bootstrapVault,
  refreshVault,
  vaultEntries,
  vaultLoaded,
  vaultLoading,
  vaultEncryptionAvailable,
  vaultSearchQuery,
  vaultRevealedId,
  vaultRevealedValue,
  filterVaultEntries,
  formatExpiryBadge,
  openVaultModal,
  removeVaultSecret,
  copyVaultSecret,
  toggleReveal,
  runVaultExport,
  runVaultImportLoad,
} from "./store.ts";
import { VaultSecretModal } from "./VaultSecretModal.tsx";
import { VaultImportModal } from "./VaultImportModal.tsx";
import type { VaultEntryMeta } from "../../shared/ipc-contracts.ts";

export function VaultLayout() {
  useEffect(() => {
    bootstrapVault();
  }, []);

  const entries = vaultEntries.value;
  const visible = filterVaultEntries(entries, vaultSearchQuery.value);

  return (
    <div class="vault-layout">
      <div class="vault-header">
        <div class="vault-header__left">
          <div class="vault-header__title">密钥库</div>
          <div class="vault-header__meta">
            <span>{entries.length} 条</span>
            <span class={vaultEncryptionAvailable.value ? "" : "vault-header__warn"}>
              {vaultEncryptionAvailable.value
                ? "Keychain 加密"
                : "系统加密不可用，无法保存新密钥"}
            </span>
          </div>
        </div>
        <div class="vault-header__actions">
          <button
            class="vault-btn"
            disabled={vaultLoading.value}
            onClick={() => refreshVault()}
            title="刷新列表"
          >
            {vaultLoading.value ? "刷新中…" : "刷新"}
          </button>
          <button
            class="vault-btn"
            onClick={onExport}
            disabled={entries.length === 0}
            title="导出为 JSON 备份（明文文件，导出前会确认）"
          >
            导出
          </button>
          <button
            class="vault-btn"
            onClick={() => runVaultImportLoad()}
            title="从导出的 JSON 备份导入"
          >
            导入
          </button>
          <button
            class="vault-btn vault-btn--primary"
            onClick={() => openVaultModal(null)}
          >
            添加密钥
          </button>
        </div>
      </div>

      <div class="vault-toolbar">
        <input
          class="vault-search"
          type="text"
          placeholder="搜索名称 / 分类 / 备注…"
          value={vaultSearchQuery.value}
          onInput={(e: any) => (vaultSearchQuery.value = e.target.value)}
        />
      </div>

      {!vaultLoaded.value ? <div class="vault-empty">加载中…</div> : null}

      {vaultLoaded.value && entries.length === 0 ? (
        <div class="vault-empty">
          <p>还没有保存任何密钥。</p>
          <p class="vault-empty__hint">
            把申请到的 token / API key 粘贴进来统一管理：命名保存、一键复制，
            不用再回申请页翻找。
          </p>
        </div>
      ) : null}

      {vaultLoaded.value && entries.length > 0 && visible.length === 0 ? (
        <div class="vault-empty">
          <p>没有匹配「{vaultSearchQuery.value}」的密钥。</p>
        </div>
      ) : null}

      <div class="vault-list">
        {visible.map((entry) => (
          <VaultRow key={entry.id} entry={entry} />
        ))}
      </div>

      <VaultSecretModal />
      <VaultImportModal />
    </div>
  );
}

/** 导出前二次确认：导出文件是明文 JSON。 */
async function onExport() {
  const ok = await openConfirm({
    title: "导出密钥库",
    message:
      "导出文件包含全部密钥的明文（本机可解密，跨机迁移只能明文）。" +
      "文件不会上传，但请自行妥善保管，避免放进网盘等同步目录。确定继续？",
    confirmText: "导出",
    cancelText: "取消",
  });
  if (ok) await runVaultExport();
}

function VaultRow({ entry }: { entry: VaultEntryMeta }) {
  const revealed = vaultRevealedId.value === entry.id;
  const expiryBadge = formatExpiryBadge(entry.expiresAt);

  const onDelete = async () => {
    const ok = await openConfirm({
      title: "删除密钥",
      message: `确定删除「${entry.name}」？删除后无法恢复，使用它的功能会退回未认证状态。`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (ok) await removeVaultSecret(entry);
  };

  return (
    <div class={`vault-row${revealed ? " vault-row--revealed" : ""}`}>
      <div class="vault-row__main">
        <div class="vault-row__title-line">
          <span class="vault-row__name">{entry.name}</span>
          {entry.category ? (
            <span class="vault-row__category">{entry.category}</span>
          ) : null}
          {expiryBadge ? (
            <span class={`vault-row__expiry vault-row__expiry--${expiryBadge.tone}`}>
              {expiryBadge.text}
            </span>
          ) : null}
        </div>
        <div class="vault-row__secret">
          <code>{revealed ? vaultRevealedValue.value : entry.hint || "••••"}</code>
          {revealed ? (
            <span class="vault-row__reveal-hint">15s 后自动隐藏</span>
          ) : null}
        </div>
        {entry.note ? <div class="vault-row__note">{entry.note}</div> : null}
      </div>
      <div class="vault-row__actions">
        <button
          type="button"
          class="vault-btn vault-btn--primary"
          onClick={() => copyVaultSecret(entry)}
          title="复制到剪贴板（30s 后自动清空）"
        >
          复制
        </button>
        <button
          type="button"
          class="vault-btn"
          onClick={() => toggleReveal(entry)}
          title={revealed ? "隐藏明文" : "临时显示明文（15s）"}
        >
          {revealed ? "隐藏" : "显示"}
        </button>
        <button
          type="button"
          class="vault-btn"
          onClick={() => openVaultModal(entry)}
          title="编辑"
        >
          编辑
        </button>
        <button
          type="button"
          class="vault-btn vault-btn--danger"
          onClick={onDelete}
          title="删除"
        >
          删除
        </button>
      </div>
    </div>
  );
}
