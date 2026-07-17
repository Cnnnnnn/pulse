// @vitest-environment happy-dom
/**
 * tests/renderer/github-check-scheduler.test.js
 *
 * 后台定时检查 + 桌面通知的调度器测试。
 * github 数据全在 renderer localStorage，调度器放 renderer（应用开着才跑）。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  githubProjects,
  githubAutoCheck,
  githubAutoCheckIntervalMin,
  githubNotifyOnNew,
  lastFailedIds,
} from "../../src/renderer/store/github-projects-store.js";

// mock checkGithubUpdates：默认返回无新版
const { checkUpdatesMock, notifyMock } = vi.hoisted(() => ({
  checkUpdatesMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("../../src/renderer/store/github-projects-store.js", async () => {
  const actual = await vi.importActual(
    "../../src/renderer/store/github-projects-store.js",
  );
  return {
    ...actual,
    checkGithubUpdates: checkUpdatesMock,
  };
});

// mock 全局 Notification
const { notificationCtorMock } = vi.hoisted(() => ({
  notificationCtorMock: vi.fn(),
}));
globalThis.Notification = notificationCtorMock;
Notification.requestPermission = vi.fn(async () => "granted");
Notification.permission = "default";

beforeEach(() => {
  vi.useFakeTimers();
  checkUpdatesMock.mockReset();
  notifyMock.mockReset();
  notificationCtorMock.mockReset();
  checkUpdatesMock.mockResolvedValue({ ok: true, newCount: 0, errorCount: 0, skippedCount: 0, failedProjects: [], skippedProjects: [] });
  githubAutoCheck.value = true;
  githubAutoCheckIntervalMin.value = 360;
  githubNotifyOnNew.value = true;
  lastFailedIds.value = [];
  githubProjects.value = [{ id: "a/b", name: "a/b", owner: "a", repo: "b" }];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("github-check-scheduler · start/stop", () => {
  it("autoCheck=false → start 不启 interval，不检查", async () => {
    githubAutoCheck.value = false;
    const { createGithubCheckScheduler } = await import("../../src/renderer/github/github-check-scheduler.js");
    const s = createGithubCheckScheduler();
    s.start();
    // 推进时间，不应该触发 check
    vi.advanceTimersByTime(720 * 60 * 1000);
    expect(checkUpdatesMock).not.toHaveBeenCalled();
    s.stop();
  });

  it("autoCheck=true → start 后首次延迟不立即检查，推进 60s 后检查一次", async () => {
    const { createGithubCheckScheduler } = await import("../../src/renderer/github/github-check-scheduler.js");
    const s = createGithubCheckScheduler();
    s.start();
    expect(checkUpdatesMock).not.toHaveBeenCalled();
    // 首次延迟 60s
    await vi.advanceTimersByTimeAsync(61 * 1000);
    expect(checkUpdatesMock).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("按 interval 周期检查（首次 60s 后，每 intervalMs 一次）", async () => {
    githubAutoCheckIntervalMin.value = 1; // 1 分钟，便于测试
    const { createGithubCheckScheduler } = await import("../../src/renderer/github/github-check-scheduler.js");
    const s = createGithubCheckScheduler();
    s.start();
    // 首次 60s
    await vi.advanceTimersByTimeAsync(61 * 1000);
    expect(checkUpdatesMock).toHaveBeenCalledTimes(1);
    // 第一个 interval（60s）后
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(checkUpdatesMock).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it("stop → clearInterval，不再触发", async () => {
    githubAutoCheckIntervalMin.value = 1;
    const { createGithubCheckScheduler } = await import("../../src/renderer/github/github-check-scheduler.js");
    const s = createGithubCheckScheduler();
    s.start();
    await vi.advanceTimersByTimeAsync(61 * 1000);
    const countBefore = checkUpdatesMock.mock.calls.length;
    s.stop();
    await vi.advanceTimersByTimeAsync(600 * 1000);
    expect(checkUpdatesMock.mock.calls.length).toBe(countBefore);
  });

  it("stop 幂等（重复调不报错）", async () => {
    const { createGithubCheckScheduler } = await import("../../src/renderer/github/github-check-scheduler.js");
    const s = createGithubCheckScheduler();
    s.start();
    s.stop();
    expect(() => s.stop()).not.toThrow();
  });

  it("start 幂等（重复 start 不启多个 interval）", async () => {
    const { createGithubCheckScheduler } = await import("../../src/renderer/github/github-check-scheduler.js");
    const s = createGithubCheckScheduler();
    s.start();
    s.start();
    await vi.advanceTimersByTimeAsync(61 * 1000);
    expect(checkUpdatesMock).toHaveBeenCalledTimes(1);
    s.stop();
  });
});

describe("github-check-scheduler · 通知", () => {
  it("newCount>0 + notifyOnNew=true → 发系统通知", async () => {
    checkUpdatesMock.mockResolvedValue({ ok: true, newCount: 2, errorCount: 0, skippedCount: 0, failedProjects: [], skippedProjects: [] });
    const { createGithubCheckScheduler } = await import("../../src/renderer/github/github-check-scheduler.js");
    const s = createGithubCheckScheduler();
    s.start();
    await vi.advanceTimersByTimeAsync(61 * 1000);
    expect(notificationCtorMock).toHaveBeenCalled();
    // new Notification(title, options) —— 第二个参数是 options
    const opts = notificationCtorMock.mock.calls[0][1];
    expect(opts.body).toContain("2");
    s.stop();
  });

  it("newCount=0 → 不发通知", async () => {
    checkUpdatesMock.mockResolvedValue({ ok: true, newCount: 0, errorCount: 0, skippedCount: 0, failedProjects: [], skippedProjects: [] });
    const { createGithubCheckScheduler } = await import("../../src/renderer/github/github-check-scheduler.js");
    const s = createGithubCheckScheduler();
    s.start();
    await vi.advanceTimersByTimeAsync(61 * 1000);
    expect(notificationCtorMock).not.toHaveBeenCalled();
    s.stop();
  });

  it("notifyOnNew=false → 即使有新版也不通知", async () => {
    githubNotifyOnNew.value = false;
    checkUpdatesMock.mockResolvedValue({ ok: true, newCount: 5, errorCount: 0, skippedCount: 0, failedProjects: [], skippedProjects: [] });
    const { createGithubCheckScheduler } = await import("../../src/renderer/github/github-check-scheduler.js");
    const s = createGithubCheckScheduler();
    s.start();
    await vi.advanceTimersByTimeAsync(61 * 1000);
    expect(notificationCtorMock).not.toHaveBeenCalled();
    s.stop();
  });
});

describe("github-check-scheduler · restart", () => {
  it("restart = stop + start（设置变更时用）", async () => {
    const { createGithubCheckScheduler } = await import("../../src/renderer/github/github-check-scheduler.js");
    const s = createGithubCheckScheduler();
    s.start();
    await vi.advanceTimersByTimeAsync(61 * 1000);
    const beforeRestart = checkUpdatesMock.mock.calls.length;
    // 改 interval 后 restart
    githubAutoCheckIntervalMin.value = 2;
    s.restart();
    // 推进新周期
    await vi.advanceTimersByTimeAsync(61 * 1000);
    expect(checkUpdatesMock.mock.calls.length).toBeGreaterThan(beforeRestart);
    s.stop();
  });
});
