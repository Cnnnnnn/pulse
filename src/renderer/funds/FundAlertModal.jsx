/**
 * src/renderer/funds/FundAlertModal.jsx
 *
 * I8 v1: 盈亏阈值提醒设置 — 全局开关 + 盈利/亏损阈值.
 */

import { useState } from 'preact/hooks';
import { alertPrefs, closeAlertModal, saveAlertPrefs } from './fundStore.js';
import { api } from '../api.js';

export function FundAlertModal() {
  const cur = alertPrefs.value;
  const [enabled, setEnabled] = useState(!!cur.enabled);
  const [profitPct, setProfitPct] = useState(String(cur.profitPct ?? 10));
  const [lossPct, setLossPct] = useState(String(cur.lossPct ?? -5));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const profit = Number(profitPct);
    const loss = Number(lossPct);
    if (!Number.isFinite(profit)) {
      setError('盈利阈值需为数字');
      return;
    }
    if (!Number.isFinite(loss) || loss > 0) {
      setError('亏损阈值需为 ≤ 0 的数字');
      return;
    }
    setSaving(true);
    setError('');
    const r = await saveAlertPrefs(api, {
      enabled,
      profitPct: profit,
      lossPct: loss,
    });
    setSaving(false);
    if (r && r.ok) {
      closeAlertModal();
    } else {
      setError('保存失败，请重试');
    }
  }

  return (
    <div class="fund-modal-overlay" onClick={() => closeAlertModal()}>
      <div class="fund-modal fund-alert-modal" onClick={(e) => e.stopPropagation()}>
        <form class="fund-modal-form" onSubmit={handleSubmit}>
          <div class="fund-modal-header">
            <span class="fund-modal-title">🔔 盈亏提醒</span>
            <button
              type="button"
              class="fund-modal-close"
              onClick={() => closeAlertModal()}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <div class="fund-modal-body">
            <p class="fund-alert-hint">
              净值刷新后，持仓收益率越过阈值时发送系统通知（默认关闭）。
            </p>
            <label class="fund-alert-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.currentTarget.checked)}
              />
              <span>启用盈亏提醒</span>
            </label>
            <div class="fund-modal-row">
              <div class="fund-modal-field">
                <label class="fund-modal-label">盈利提醒 ≥ (%)</label>
                <input
                  type="number"
                  step="0.1"
                  class="fund-modal-input"
                  value={profitPct}
                  onInput={(e) => setProfitPct(e.currentTarget.value)}
                  disabled={!enabled}
                />
              </div>
              <div class="fund-modal-field">
                <label class="fund-modal-label">亏损提醒 ≤ (%)</label>
                <input
                  type="number"
                  step="0.1"
                  max="0"
                  class="fund-modal-input"
                  value={lossPct}
                  onInput={(e) => setLossPct(e.currentTarget.value)}
                  disabled={!enabled}
                />
              </div>
            </div>
            {error && <div class="fund-modal-error">{error}</div>}
          </div>
          <div class="fund-modal-footer">
            <button
              type="button"
              class="fund-btn fund-btn-ghost"
              onClick={() => closeAlertModal()}
            >
              取消
            </button>
            <button
              type="submit"
              class="fund-btn fund-btn-primary"
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default FundAlertModal;
