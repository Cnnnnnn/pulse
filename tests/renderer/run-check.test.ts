// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCheck } from "../../src/renderer/run-check.ts";
import { apps, checkJob, checkSession, results, startCheck, finishCheck } from "../../src/renderer/store.ts";

const mockCheckUpdates = vi.fn();

vi.mock("../../src/renderer/api.ts", () => ({
  api: {
    checkUpdates: (...args) => mockCheckUpdates(...args),
  },
}));

beforeEach(() => {
  apps.value = [{ name: "Cursor", bundle: "Cursor.app" }];
  results.value = new Map();
  startCheck([]);
  finishCheck();
  mockCheckUpdates.mockReset();
});

describe("renderer runCheck", () => {
  it("starts one session, calls check-updates, and applies returned results", async () => {
    mockCheckUpdates.mockResolvedValue([
      {
        name: "Cursor",
        status: "update_available",
        has_update: true,
        brew_cask: "cursor",
      },
    ]);

    const result = await runCheck();

    expect(mockCheckUpdates).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ started: true });
    expect(checkSession.value.phase).toBe("done");
    expect(checkJob.value.phase).toBe("succeeded");
    expect(results.value.get("Cursor").brew_cask).toBe("cursor");
  });

  it("does not invoke IPC when the renderer session is already running", async () => {
    startCheck(["Cursor"]);

    const result = await runCheck();

    expect(result).toEqual({ started: false, reason: "already_running" });
    expect(mockCheckUpdates).not.toHaveBeenCalled();
  });

  it("maps main-process rejection to a structured failed result", async () => {
    mockCheckUpdates.mockRejectedValue(new Error("worker unavailable"));

    const result = await runCheck();

    expect(result).toEqual({
      started: false,
      reason: "check_failed",
      error: "worker unavailable",
    });
    expect(checkSession.value.phase).toBe("error");
    expect(checkSession.value.error).toBe("worker unavailable");
    expect(checkJob.value.phase).toBe("failed");
  });

  it("cancels the local job when main rejects a duplicate request", async () => {
    mockCheckUpdates.mockResolvedValue({
      started: false,
      reason: "already_running",
    });

    const result = await runCheck();

    expect(result).toEqual({ started: false, reason: "already_running" });
    expect(checkSession.value.phase).toBe("cancelled");
    expect(checkJob.value.phase).toBe("cancelled");
  });
});
