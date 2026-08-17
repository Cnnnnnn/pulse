/**
 * Renderer-side check orchestration.
 *
 * This is the single seam used by the library CTA, command palette, bootstrap,
 * and auto-recheck. The preload `checkUpdates` bridge is the only production
 * IPC entry; it returns either a result array or a structured started:false
 * response when the main process rejects a duplicate request.
 */
import {
  apps,
  applyProgressBatch,
  checkSession,
  finishCheck,
  isCheckRunning,
  cancelCheck,
  setError,
  startCheck,
} from "./store.ts";
import { api } from "./api.ts";
import { taggedLog } from "./log.ts";

const log = taggedLog("[run-check]");

export type RunCheckResult = {
  started: boolean;
  reason?: string;
  error?: string;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runCheck(): Promise<RunCheckResult> {
  if (isCheckRunning()) {
    return { started: false, reason: "already_running" };
  }

  const appNames = apps.value.map((app: any) => app && app.name).filter(Boolean);
  const sessionId = startCheck(appNames);

  try {
    const returned = await api.checkUpdates();

    if (checkSession.value.id === sessionId) {
      if (returned && !Array.isArray(returned) && returned.started === false) {
        cancelCheck(returned.reason || "check_rejected");
        return returned as RunCheckResult;
      }
      if (Array.isArray(returned) && returned.length > 0) {
        applyProgressBatch(returned, sessionId);
      }
      finishCheck();
    }

    return { started: true };
  } catch (err) {
    const message = errorMessage(err);
    log.error("checkUpdates failed:", err);
    if (checkSession.value.id === sessionId) {
      setError(message);
    }
    return { started: false, reason: "check_failed", error: message };
  }
}

export default runCheck;
