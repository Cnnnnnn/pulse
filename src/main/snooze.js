/**
 * src/main/snooze.js
 *
 * Phase C2: pure snooze helper.
 *
 * - presetTime(preset, now=Date.now()) → epoch ms | null
 * - isAppSnoozed(state, name, now, result?) → boolean
 * - applySnoozeFilter(results, state, now) → mutated copy with has_update=false + snoozed marker
 */

function presetTime(preset, nowMs) {
  const now = (typeof nowMs === 'number') ? new Date(nowMs) : new Date();
  switch (preset) {
    case 'tonight': {
      const d = new Date(now);
      d.setHours(22, 0, 0, 0);
      if (d.getTime() <= now.getTime()) {
        d.setDate(d.getDate() + 1);
      }
      return d.getTime();
    }
    case 'tomorrow': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    }
    case 'weekend': {
      const d = new Date(now);
      const day = d.getDay();
      const delta = ((6 - day + 7) % 7) || 7;
      d.setDate(d.getDate() + delta);
      d.setHours(10, 0, 0, 0);
      return d.getTime();
    }
    case 'skip-version':
      return null;
    default:
      return null;
  }
}

function isAppSnoozed(state, name, nowMs, result) {
  if (!state || !state.apps) return false;
  const app = state.apps[name];
  if (!app) return false;
  const now = (typeof nowMs === 'number') ? nowMs : Date.now();

  if (typeof app.snoozeUntil === 'number' && app.snoozeUntil > now) {
    return true;
  }

  if (typeof app.skippedVersion === 'string' && app.skippedVersion.length > 0) {
    if (result && typeof result.latest_version === 'string' && result.latest_version === app.skippedVersion) {
      return true;
    }
  }

  return false;
}

function applySnoozeFilter(results, state, nowMs) {
  if (!Array.isArray(results)) return results;
  const now = (typeof nowMs === 'number') ? nowMs : Date.now();
  return results.map((r) => {
    if (!r || !r.name) return r;
    const appEntry = state && state.apps && state.apps[r.name];
    if (!appEntry) return r;

    if (typeof appEntry.snoozeUntil === 'number' && appEntry.snoozeUntil > now) {
      return {
        ...r,
        has_update: false,
        snoozed: true,
        snoozeReason: 'until',
        snoozeUntil: appEntry.snoozeUntil,
      };
    }

    if (
      typeof appEntry.skippedVersion === 'string' &&
      appEntry.skippedVersion.length > 0 &&
      typeof r.latest_version === 'string' &&
      r.latest_version === appEntry.skippedVersion
    ) {
      return {
        ...r,
        has_update: false,
        snoozed: true,
        snoozeReason: 'version',
        skippedVersion: appEntry.skippedVersion,
      };
    }

    return r;
  });
}

module.exports = { presetTime, isAppSnoozed, applySnoozeFilter };
