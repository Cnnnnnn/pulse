/**
 * src/renderer/store/check-store.js
 *
 * Check session + per-app phase + per-app result signal.
 * Session-based 检测模型.
 */

import { signal, computed } from "@preact/signals";
import { taggedLog } from "../log.js";

const log = taggedLog("[store/check]");

let _sessionCounter = 0;
function generateSessionId() {
  return `s-${Date.now()}-${_sessionCounter++}`;
}

export const apps = signal([]);
export const results = signal(new Map());

export const checkSession = signal({
  id: null,
  phase: "idle",
  startedAt: null,
  finishedAt: null,
  error: null,
  appOrder: [],
});

export const appPhases = signal(new Map());

export const checkDuration = computed(() => {
  const s = checkSession.value;
  if (s.startedAt == null) return null;
  const end = s.finishedAt || Date.now();
  return end - s.startedAt;
});

export const lastError = computed(() => checkSession.value.error);
export const checkStartTime = computed(() => checkSession.value.startedAt);

const resultSignals = new Map();
export function getResultSignal(name) {
  let sig = resultSignals.get(name);
  if (!sig) {
    sig = signal(undefined);
    resultSignals.set(name, sig);
  }
  return sig;
}

const appPhaseSignals = new Map();
export function getAppPhaseSignal(name) {
  let sig = appPhaseSignals.get(name);
  if (!sig) {
    sig = signal("idle");
    appPhaseSignals.set(name, sig);
  }
  return sig;
}

export function getAppPhase(name) {
  return appPhases.value.get(name) || "idle";
}

function resultToPhase(result) {
  if (result.status === "error") return "error";
  return "done";
}

export function startCheck(appNames = []) {
  const sessionId = generateSessionId();

  const nameSet = new Set(appNames);
  const phases = new Map();
  // 重置所有 phase signals: 在新 appNames 里的 → pending, 否则 → idle.
  // 避免 stale app (上次 check 中存在, 这次不在) 留在 "pending" 状态, 导致
  // AppRow 显示 loading 永远不结束.
  for (const [name, sig] of appPhaseSignals.entries()) {
    if (nameSet.has(name)) {
      sig.value = "pending";
      phases.set(name, "pending");
    } else {
      sig.value = "idle";
    }
  }
  for (const name of appNames) {
    if (!phases.has(name)) {
      phases.set(name, "pending");
      getAppPhaseSignal(name).value = "pending";
    }
  }
  appPhases.value = phases;

  checkSession.value = {
    id: sessionId,
    phase: "running",
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    appOrder: [...appNames],
  };

  return sessionId;
}

export function resetCheck() {
  return startCheck(apps.value.map((a) => a.name));
}

export function applyProgressBatch(list, sessionId) {
  if (!Array.isArray(list)) return;
  for (const r of list) {
    applyProgress(r, sessionId);
  }
}

export function applyProgress(result, sessionId) {
  if (!result || !result.name) return;

  const currentSession = checkSession.value;
  if (sessionId && currentSession.id && sessionId !== currentSession.id) {
    log.warn(
      `applyProgress: stale session ${sessionId}, current=${currentSession.id}, discarding`,
    );
    return;
  }

  const name = result.name;
  const phase = resultToPhase(result);
  const nextPhases = new Map(appPhases.value);
  nextPhases.set(name, phase);
  appPhases.value = nextPhases;
  getAppPhaseSignal(name).value = phase;

  const next = new Map(results.value);
  next.set(name, result);
  results.value = next;

  getResultSignal(name).value = result;
}

export function markAppDetecting(name, sessionId) {
  if (!name) return;
  const currentSession = checkSession.value;
  if (sessionId && currentSession.id && sessionId !== currentSession.id) return;

  const nextPhases = new Map(appPhases.value);
  if (nextPhases.get(name) === "pending" || !nextPhases.has(name)) {
    nextPhases.set(name, "detecting");
    appPhases.value = nextPhases;
    getAppPhaseSignal(name).value = "detecting";
  }
}

export function finishCheck() {
  const s = checkSession.value;
  if (s.phase !== "running") return;
  checkSession.value = {
    ...s,
    phase: "done",
    finishedAt: Date.now(),
  };
}

export function setError(message) {
  const s = checkSession.value;
  if (s.phase !== "running") return;
  checkSession.value = {
    ...s,
    phase: "error",
    finishedAt: Date.now(),
    error: message || "未知错误",
  };
}

export function isCheckRunning() {
  return checkSession.value.phase === "running";
}

export function applyCachedResults(cached, configApps) {
  if (!cached || !cached.apps) return;
  // ponytail: 用户从 config.json 移除某个 app (比如 Codex/ChatGPT) 后, state.json
  //   里还残留着历史检测结果; applyCachedResults 直接 set 会让 UI 继续显示"幽灵
  //   app". 过滤掉 configApps 中不存在的 name, 让"取消检查"立即生效 (不需要
  //   等 state 里的 ts 老化或手清 state.json).
  const allowed = configApps
    ? new Set(configApps.map((a) => a && a.name).filter(Boolean))
    : null;
  const nextResults = new Map(results.value);
  const nextPhases = new Map(appPhases.value);

  for (const [name, r] of Object.entries(cached.apps)) {
    if (!r || !r.name) continue;
    if (allowed && !allowed.has(name)) continue; // 不在当前 config → 丢弃历史
    nextResults.set(name, r);
    getResultSignal(name).value = r;
    nextPhases.set(name, "done");
    getAppPhaseSignal(name).value = "done";
  }

  // ponytail: 清理 results 里也不在 config 的残留 (兜底, 比如外部状态改动后).
  if (allowed) {
    for (const name of [...nextResults.keys()]) {
      if (!allowed.has(name)) {
        nextResults.delete(name);
        nextPhases.delete(name);
        getResultSignal(name).value = null;
        getAppPhaseSignal(name).value = null;
      }
    }
  }

  results.value = nextResults;
  appPhases.value = nextPhases;
}

export { resultSignals, appPhaseSignals };
