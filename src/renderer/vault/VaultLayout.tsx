/**
 * src/renderer/vault/VaultLayout.tsx
 *
 * 密钥库主视图 (v2.84 布局重构：苹果原生风，与 movies/concerts 同族)。
 *   header: 标题 + 加密状态/条数 + 刷新/导出/导入/添加密钥
 *   stats:  密钥条目 / 7天内到期 / 已过期 / 长期有效（由过期徽标派生）
 *   toolbar: 搜索
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
  vaultRevealedFields,
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

  // 概览统计：按过期徽标 tone 派生
  let expiringSoon = 0;
  let expired = 0;
  let longLived = 0;
  for (const entry of entries) {
    const badge = formatExpiryBadge(entry.expiresAt);
    if (badge?.tone === "warn") expiringSoon += 1;
    else if (badge?.tone === "danger") expired += 1;
    else longLived += 1;
  }

  return (
    <div class="vault-layout">
      <div class="vault-header">
        <div class="vault-header__left">
          <div class="vault-header__title">
            密钥库
            <span class="vault-header__meta">
              <span class="vault-header__lock" aria-hidden="true">
                🔒
              </span>
              {vaultEncryptionAvailable.value ? "Keychain 加密" : "系统加密不可用，无法保存新密钥"}
              {entries.length > 0 ? <span>· {entries.length} 条</span> : null}
            </span>
          </div>
        </div>
        <div class="vault-header__actions">
          <button class="vault-btn" disabled={vaultLoading.value} onClick={() => refreshVault()} title="刷新列表">
            {vaultLoading.value ? "刷新中…" : "↻ 刷新"}
          </button>
          <button
            class="vault-btn"
            onClick={onExport}
            disabled={entries.length === 0}
            title="导出为 JSON 备份（明文文件，导出前会确认）"
          >
            导出
          </button>
          <button class="vault-btn" onClick={() => runVaultImportLoad()} title="从导出的 JSON 备份导入">
            导入
          </button>
          <button class="vault-btn vault-btn--primary" onClick={() => openVaultModal(null)}>
            ＋ 添加密钥
          </button>
        </div>
      </div>

      {entries.length > 0 && (
        <div class="vault-stats">
          <div class="vault-stat">
            <span class="vault-stat__num">{entries.length}</span>
            <span class="vault-stat__label">密钥条目</span>
          </div>
          <div class="vault-stat">
            <span class={`vault-stat__num${expiringSoon > 0 ? " vault-stat__num--warn" : ""}`}>
              {expiringSoon}
            </span>
            <span class="vault-stat__label">7 天内到期</span>
          </div>
          <div class="vault-stat">
            <span class={`vault-stat__num${expired > 0 ? " vault-stat__num--danger" : ""}`}>
              {expired}
            </span>
            <span class="vault-stat__label">已过期</span>
          </div>
          <div class="vault-stat">
            <span class="vault-stat__num">{longLived}</span>
            <span class="vault-stat__label">长期有效</span>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div class="vault-toolbar">
          <input
            class="vault-search"
            type="text"
            placeholder="🔍 搜索名称 / 分类 / 备注…"
            value={vaultSearchQuery.value}
            onInput={(e: any) => (vaultSearchQuery.value = e.target.value)}
          />
        </div>
      )}

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
  const revealedFields = vaultRevealedFields.value;
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
          {entry.category ? <span class="vault-row__category">{entry.category}</span> : null}
          {expiryBadge ? (
            <span class={`vault-row__expiry vault-row__expiry--${expiryBadge.tone}`}>
              {expiryBadge.text}
            </span>
          ) : null}
        </div>
        <div class="vault-row__secret">
          <code>{revealed ? vaultRevealedValue.value : entry.hint || "••••"}</code>
          {revealed ? <span class="vault-row__reveal-hint">15s 后自动隐藏</span> : null}
        </div>
        {(entry.fields || []).length > 0 ? (
          <div class="vault-row__fields">
            {(entry.fields || []).map((f) => {
              const plain = revealed
                ? revealedFields.find((rf) => rf.label === f.label)?.value
                : undefined;
              return (
                <div class="vault-row__field" key={f.label}>
                  <span class="vault-row__field-label">{f.label}</span>
                  <code>{revealed ? plain ?? "—" : f.hint}</code>
                  <button
                    type="button"
                    class="vault-row__field-copy"
                    onClick={() => copyVaultSecret(entry, f.label)}
                    title={`复制 ${f.label}（30s 后自动清空剪贴板）`}
                  >
                    复制
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        {entry.note ? <div class="vault-row__note">{entry.note}</div> : null}
      </div>
      <div class="vault-row__actions">
        <button
          type="button"
          class="vault-btn vault-btn--primary"
          onClick={() => copyVaultSecret(entry)}
          title="复制主密钥到剪贴板（30s 后自动清空）"
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
        <button type="button" class="vault-btn" onClick={() => openVaultModal(entry)} title="编辑">
          编辑
        </button>
        <button type="button" class="vault-btn vault-btn--danger" onClick={onDelete} title="删除">
          删除
        </button>
      </div>
    </div>
  );
}
