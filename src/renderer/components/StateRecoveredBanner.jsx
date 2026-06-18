/**
 * src/renderer/components/StateRecoveredBanner.jsx
 *
 * Phase Q8: one-time dismissible banner shown when state.json was corrupt
 * at startup. Driven by `stateRecoveredSignal` (set by the bootstrap
 * subscription in index.jsx). Dismissal is recorded in localStorage so the
 * banner does not reappear on the next check.
 */
import { signal, useComputed } from '@preact/signals';

export const stateRecoveredSignal = signal(null);

function isDismissedForEvent(evt) {
  if (!evt) return false;
  const dismissed = localStorage.getItem('state-banner:dismissed');
  if (!dismissed) return false;
  const dismissedTs = Number(dismissed);
  return Number.isFinite(dismissedTs) && dismissedTs >= evt.ts;
}

export function StateRecoveredBanner() {
  const visible = useComputed(() => {
    const evt = stateRecoveredSignal.value;
    if (!evt) return null;
    if (isDismissedForEvent(evt)) return null;
    return evt;
  });

  const evt = visible.value;
  if (!evt) return null;

  const reasonText = evt.reason === 'parse_failed'
    ? 'state.json 解析失败'
    : 'state.json 字段格式不符';
  const backupText = evt.backup
    ? `原文件已备份到 ${evt.backup}`
    : `备份失败${evt.backupFailed ? ' (' + evt.backupFailed + ')' : ''} — 请尽快手动保存重要数据`;

  function dismiss() {
    try {
      localStorage.setItem('state-banner:dismissed', String(evt.ts));
    } catch { /* ignore */ }
    stateRecoveredSignal.value = null;
  }

  return (
    <div class="state-recovered-banner" role="alert">
      <div class="state-recovered-banner__title">设置已恢复默认</div>
      <div class="state-recovered-banner__body">
        上次启动时 {reasonText},已用默认配置启动。
        {backupText}。
      </div>
      <button class="btn btn-sm" onClick={dismiss}>知道了</button>
    </div>
  );
}