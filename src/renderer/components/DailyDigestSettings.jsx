/**
 * src/renderer/components/DailyDigestSettings.jsx
 *
 * Phase I5: settings section for daily digest (enabled + time).
 * Embedded inside AISettingsModal. Real-time save on change.
 */
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';

export function DailyDigestSettings() {
  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState('08:30');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof api.getConfig !== 'function') return;
    const p = api.getConfig();
    if (!p || typeof p.then !== 'function') return;
    p.then((cfg) => {
      const dd = (cfg && cfg.daily_digest) || {};
      if (typeof dd.enabled === 'boolean') setEnabled(dd.enabled);
      if (typeof dd.time === 'string') setTime(dd.time);
    }).catch(() => { /* ignore */ });
  }, []);

  async function save(next) {
    if (typeof api.digestUpdateSettings !== 'function') return;
    setSaving(true);
    try {
      const p = api.digestUpdateSettings(next);
      if (p && typeof p.then === 'function') {
        await p;
      }
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  function onToggle(e) {
    const v = !!e.target.checked;
    setEnabled(v);
    save({ enabled: v, time });
  }

  function onTimeChange(e) {
    const v = e.target.value;
    setTime(v);
    save({ enabled, time: v });
  }

  return (
    <section class="settings-section">
      <h3 class="settings-section__title">每日早报通知</h3>
      <label class="settings-row settings-row--inline">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          data-testid="digest-enabled"
        />
        <span>启用每日早报</span>
      </label>
      <label class="settings-row settings-row--inline">
        <span>推送时间</span>
        <input
          type="time"
          value={time}
          disabled={!enabled}
          onChange={onTimeChange}
          data-testid="digest-time"
        />
      </label>
      <p class="settings-hint">
        无重要变化时不推送。Quiet hours (23:00–08:00) 内也会跳过。
      </p>
      {saving && <span class="settings-saving">保存中...</span>}
    </section>
  );
}
