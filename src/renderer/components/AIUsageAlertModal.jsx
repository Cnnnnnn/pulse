/**
 * src/renderer/components/AIUsageAlertModal.jsx
 *
 * A4 v2: 用量异常检测阈值设置.
 */
import { useState } from 'preact/hooks';
import {
  aiUsageAlertPrefs,
  closeAiUsageAlertModal,
  saveAiUsageAlertPrefs,
} from '../store/ai-usage-store.js';
import { BareModalShell } from './ModalShell.jsx';
import { IconBarChart } from './icons.jsx';

export function AIUsageAlertModal() {
  const cur = aiUsageAlertPrefs.value;
  const [enabled, setEnabled] = useState(cur.enabled !== false);
  const [absMinPct, setAbsMinPct] = useState(String(cur.absMinPct ?? 55));
  const [spikeRatio, setSpikeRatio] = useState(String(cur.spikeRatio ?? 1.5));
  const [reAlertStepPct, setReAlertStepPct] = useState(
    String(cur.reAlertStepPct ?? 5),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const abs = Number(absMinPct);
    const ratio = Number(spikeRatio);
    const step = Number(reAlertStepPct);
    if (!Number.isFinite(abs) || abs < 1 || abs > 100) {
      setError('绝对阈值需在 1–100 之间');
      return;
    }
    if (!Number.isFinite(ratio) || ratio < 1 || ratio > 5) {
      setError('尖峰倍数需在 1–5 之间');
      return;
    }
    if (!Number.isFinite(step) || step < 1 || step > 50) {
      setError('重复提醒间隔需在 1–50 百分点');
      return;
    }
    setSaving(true);
    setError('');
    const r = await saveAiUsageAlertPrefs({
      enabled,
      absMinPct: abs,
      spikeRatio: ratio,
      reAlertStepPct: step,
    });
    setSaving(false);
    if (r && r.ok) {
      closeAiUsageAlertModal();
    } else {
      setError('保存失败，请重试');
    }
  }

  return (
    <BareModalShell
      open
      onClose={closeAiUsageAlertModal}
      overlayClass="fund-modal-overlay"
      cardClass="fund-modal fund-alert-modal"
      usePortal
      ariaLabel="用量异常提醒"
    >
      <form class="fund-modal-form" onSubmit={handleSubmit}>
          <div class="fund-modal-header">
            <span class="fund-modal-title fund-modal-title-row">
              <IconBarChart size={16} /> 用量异常提醒
            </span>
            <button
              type="button"
              class="fund-modal-close"
              onClick={() => closeAiUsageAlertModal()}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <div class="fund-modal-body">
            <p class="fund-alert-hint">
              今日 5h 窗口用量明显高于近 7 日中位时，页面提示并发送系统通知。
            </p>
            <label class="fund-alert-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.currentTarget.checked)}
              />
              <span>启用用量异常检测</span>
            </label>
            <div class="fund-modal-row">
              <div class="fund-modal-field">
                <label class="fund-modal-label">绝对阈值 ≥ (%)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  class="fund-modal-input"
                  value={absMinPct}
                  onInput={(e) => setAbsMinPct(e.currentTarget.value)}
                />
              </div>
              <div class="fund-modal-field">
                <label class="fund-modal-label">相对中位倍数 ≥</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  class="fund-modal-input"
                  value={spikeRatio}
                  onInput={(e) => setSpikeRatio(e.currentTarget.value)}
                />
              </div>
            </div>
            <div class="fund-modal-field">
              <label class="fund-modal-label">同方向重复提醒间隔 (百分点)</label>
              <input
                type="number"
                step="1"
                min="1"
                max="50"
                class="fund-modal-input"
                value={reAlertStepPct}
                onInput={(e) => setReAlertStepPct(e.currentTarget.value)}
              />
            </div>
            {error && <p class="fund-modal-error">{error}</p>}
          </div>
          <div class="fund-modal-footer">
            <button
              type="button"
              class="fund-btn fund-btn-ghost"
              onClick={() => closeAiUsageAlertModal()}
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
    </BareModalShell>
  );
}
