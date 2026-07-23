/**
 * src/main/ai-usage-alerts.js
 *
 * A4: AI 用量异常检测 + 系统通知.
 */
"use strict";

const {
  detectUsageAnomaly,
  DEFAULT_ABS_MIN_PCT,
  DEFAULT_SPIKE_RATIO,
  DEFAULT_RE_ALERT_STEP_PCT,
} = require("../ai-usage/anomaly-detect");
const { todayKey } = require("../ai-usage/history-series");
const stateStore = require("./state-store.ts");

const DEFAULT_ALERT_PREFS = {
  enabled: true,
  absMinPct: DEFAULT_ABS_MIN_PCT,
  spikeRatio: DEFAULT_SPIKE_RATIO,
  reAlertStepPct: DEFAULT_RE_ALERT_STEP_PCT,
  lastNotified: {},
};

function normalizeAlertPrefs(raw) {
  const out = {
    enabled: true,
    absMinPct: DEFAULT_ALERT_PREFS.absMinPct,
    spikeRatio: DEFAULT_ALERT_PREFS.spikeRatio,
    reAlertStepPct: DEFAULT_ALERT_PREFS.reAlertStepPct,
    lastNotified: {},
  };
  if (!raw || typeof raw !== "object") return out;
  if (raw.enabled === false) out.enabled = false;
  const abs = Number(raw.absMinPct);
  const ratio = Number(raw.spikeRatio);
  const step = Number(raw.reAlertStepPct);
  if (Number.isFinite(abs) && abs > 0) out.absMinPct = abs;
  if (Number.isFinite(ratio) && ratio > 0) out.spikeRatio = ratio;
  if (Number.isFinite(step) && step > 0) out.reAlertStepPct = step;
  if (raw.lastNotified && typeof raw.lastNotified === "object") {
    for (const [pid, v] of Object.entries(raw.lastNotified)) {
      if (!v || typeof v !== "object") continue;
      out.lastNotified[pid] = {
        date: typeof v.date === "string" ? v.date : "",
        percent: Number.isFinite(v.percent) ? v.percent : 0,
      };
    }
  }
  return out;
}

function detectOptsFromPrefs(prefs, lastNotifiedPercent) {
  return {
    enabled: prefs.enabled,
    absMinPct: prefs.absMinPct,
    spikeRatio: prefs.spikeRatio,
    reAlertStepPct: prefs.reAlertStepPct,
    lastNotifiedPercent,
  };
}

function topTasksByMsgCount(tasks, limit = 3) {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .filter((t) => t && typeof t.title === "string")
    .slice()
    .sort((a, b) => (b.msgCount || 0) - (a.msgCount || 0))
    .slice(0, limit);
}

/**
 * @param {object} args
 * @param {string} args.providerId
 * @param {Array} args.historyDays
 * @param {object} [args.alertPrefs]
 */
function checkAiUsageAlertsPure({ providerId, historyDays, alertPrefs }) {
  const prefs = normalizeAlertPrefs(alertPrefs);
  const empty = {
    checked: 0,
    notified: 0,
    items: [],
    nextLastNotified: { ...prefs.lastNotified },
  };
  if (!prefs.enabled || !providerId) return empty;

  const prev = prefs.lastNotified[providerId];
  const lastNotifiedPercent =
    prev && prev.date === todayKey() ? prev.percent : undefined;

  const det = detectUsageAnomaly(
    historyDays,
    detectOptsFromPrefs(prefs, lastNotifiedPercent),
  );
  if (!det.anomaly) {
    return { ...empty, checked: 1 };
  }

  return {
    checked: 1,
    notified: 1,
    items: [
      {
        providerId,
        todayPercent: det.todayPercent,
        baselineMedian: det.baselineMedian,
      },
    ],
    nextLastNotified: {
      ...prefs.lastNotified,
      [providerId]: { date: todayKey(), percent: det.todayPercent },
    },
  };
}

/**
 * @param {object} deps
 */
async function checkAiUsageAlerts(deps) {
  const {
    providers = ["minimax", "glm"],
    loadHistoryProvider = stateStore.loadAiUsageHistoryProvider,
    loadAlertPrefs = stateStore.loadAiUsageAlertPrefs,
    saveAlertPrefs = stateStore.saveAiUsageAlertPrefs,
    listTasks = null,
    sendNotification = null,
    log = null,
  } = deps || {};

  const prefs = loadAlertPrefs();
  const allItems = [];
  let nextLast = { ...prefs.lastNotified };

  for (const providerId of providers) {
    const hist = loadHistoryProvider(providerId);
    const days = hist && Array.isArray(hist.days) ? hist.days : [];
    const out = checkAiUsageAlertsPure({
      providerId,
      historyDays: days,
      alertPrefs: { ...prefs, lastNotified: nextLast },
    });
    if (out.items.length > 0) {
      allItems.push(...out.items);
      nextLast = out.nextLastNotified;
    }
  }

  if (allItems.length === 0) {
    return { checked: providers.length, notified: 0, items: [] };
  }

  try {
    saveAlertPrefs({ lastNotified: nextLast });
  } catch (err) {
    if (log && typeof log.warn === "function") {
      log.warn(`[ai-usage-alerts] save failed: ${err && err.message}`);
    }
  }

  let suspectTasks = [];
  if (typeof listTasks === "function") {
    try {
      const r = await listTasks(todayKey());
      suspectTasks = topTasksByMsgCount(r && r.tasks, 3);
    } catch {
      suspectTasks = [];
    }
  }

  if (typeof sendNotification === "function") {
    for (const it of allItems) {
      const label = it.providerId === "glm" ? "GLM" : "MiniMax";
      let body = `今日 5h 窗口已用 ${it.todayPercent}%（7 日中位约 ${Math.round(it.baselineMedian)}%）`;
      if (suspectTasks.length > 0) {
        const names = suspectTasks.map((t) => `「${t.title}」`).join("、");
        body += `\n疑似任务: ${names}`;
      }
      try {
        sendNotification({ title: `📊 ${label} 用量异常`, body });
      } catch (err) {
        if (log && typeof log.warn === "function") {
          log.warn(`[ai-usage-alerts] notify failed: ${err && err.message}`);
        }
      }
    }
  }

  return {
    checked: providers.length,
    notified: allItems.length,
    items: allItems,
    suspectTasks,
  };
}

module.exports = {
  DEFAULT_ALERT_PREFS,
  normalizeAlertPrefs,
  checkAiUsageAlertsPure,
  checkAiUsageAlerts,
  topTasksByMsgCount,
};
