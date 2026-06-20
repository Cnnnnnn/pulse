/**
 * src/renderer/components/SnoozeMenu.jsx
 *
 * Phase C2: per-app "等下次再升" snooze menu.
 * 4 presets + cancel if currently snoozed.
 */
import { api } from '../api.js';

function fmtTs(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function presetLocalTime(preset) {
  const now = Date.now();
  const d = new Date(now);
  if (preset === 'tonight') {
    d.setHours(22, 0, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  } else if (preset === 'tomorrow') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else if (preset === 'weekend') {
    const day = d.getDay();
    const delta = ((6 - day + 7) % 7) || 7;
    d.setDate(d.getDate() + delta);
    d.setHours(10, 0, 0, 0);
  }
  return d.getTime();
}

export function SnoozeMenu({ name, latestVersion = null, snoozeUntil = null, skippedVersion = null, x = 0, y = 0, onClose }) {
  function handlePick(preset) {
    if (preset === 'skip-version') {
      api.setAppSnooze && api.setAppSnooze(name, { version: latestVersion || '' });
    } else {
      const until = presetLocalTime(preset);
      api.setAppSnooze && api.setAppSnooze(name, { until });
    }
    if (typeof onClose === 'function') onClose();
  }

  function handleCancel() {
    api.clearAppSnooze && api.clearAppSnooze(name);
    if (typeof onClose === 'function') onClose();
  }

  const isSnoozed = (snoozeUntil && snoozeUntil > Date.now()) || skippedVersion;

  const style = x || y ? { left: `${x}px`, top: `${y}px` } : undefined;

  return (
    <div class="snooze-menu" role="menu" style={style}>
      <div class="snooze-menu__title">等下次再升</div>
      <button class="snooze-menu__item" role="menuitem" onClick={() => handlePick('tonight')}>
        ⏰ 今晚 ({fmtTs(presetLocalTime('tonight'))})
      </button>
      <button class="snooze-menu__item" role="menuitem" onClick={() => handlePick('tomorrow')}>
        ☀️ 明早 9:00 ({fmtTs(presetLocalTime('tomorrow'))})
      </button>
      <button class="snooze-menu__item" role="menuitem" onClick={() => handlePick('weekend')}>
        📅 本周六 10:00
      </button>
      <button
        class="snooze-menu__item"
        role="menuitem"
        onClick={() => handlePick('skip-version')}
        disabled={!latestVersion}
      >
        ⊘ 跳过此版本 {latestVersion ? `(${latestVersion})` : ''}
      </button>
      {isSnoozed && (
        <>
          <div class="snooze-menu__divider" />
          {snoozeUntil && snoozeUntil > Date.now() && (
            <div class="snooze-menu__status">
              已延后到 {fmtTs(snoozeUntil)} <button class="snooze-menu__cancel" onClick={handleCancel}>取消</button>
            </div>
          )}
          {skippedVersion && (
            <div class="snooze-menu__status">
              跳过 {skippedVersion} <button class="snooze-menu__cancel" onClick={handleCancel}>取消</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
