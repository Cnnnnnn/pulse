// @vitest-environment happy-dom
/**
 * tests/renderer/github-check-toast.test.jsx
 *
 * 验证 GithubPage.handleCheckUpdates 的 toast 门控逻辑：
 *   - permanent 失败单独归到 skipped，不显示「失败」，而是 info「已失效」
 *   - newCount>0 时哪怕有失败也显示 success，并附带失败/失效计数
 *   - rate_limited 带 retryAfter 时 toast 显示「约 X 分钟」
 *
 * 这是「检查更新老显示失败 toast」根因 B（门控激进）+ 感知缺口（detail 永远空）的 UI 侧修复。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import { toast, clearToasts } from "../../src/renderer/store/toast-store.js";

// hoisted mock：只替换 checkGithubUpdates，保留 githubProjects 等真实 signal
const { checkUpdatesMock } = vi.hoisted(() => ({
  checkUpdatesMock: vi.fn(),
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

import { GithubPage } from "../../src/renderer/github/GithubPage.jsx";
import { githubProjects } from "../../src/renderer/store/github-projects-store.js";

beforeEach(() => {
  clearToasts();
  checkUpdatesMock.mockReset();
  // seed 1 个项目，让「检查更新」按钮可点
  githubProjects.value = [
    { id: "a/keep", name: "a/keep", owner: "a", repo: "keep" },
  ];
});

function lastToast() {
  const arr = toast.value;
  return arr.length ? arr[arr.length - 1] : null;
}

async function clickCheck(container) {
  const btn = container.querySelector(".github-check-btn");
  expect(btn, "检查更新按钮应存在").toBeTruthy();
  expect(btn.disabled, "按钮不应 disabled").toBe(false);
  fireEvent.click(btn);
  await waitFor(() => expect(checkUpdatesMock).toHaveBeenCalledTimes(1));
  return lastToast();
}

describe("GithubPage.handleCheckUpdates · toast 门控", () => {
  it("newCount>0 + errorCount>0 → success 附带失败计数", async () => {
    checkUpdatesMock.mockResolvedValue({
      ok: true,
      newCount: 2,
      errorCount: 1,
      skippedCount: 0,
      failedProjects: [{ id: "a/b", name: "a/b", reason: "rate_limited" }],
      skippedProjects: [],
    });
    const { container } = render(<GithubPage />);
    const t = await clickCheck(container);
    expect(t.type).toBe("success");
    expect(t.message).toContain("2 个项目有新版本");
    expect(t.message).toContain("1 个失败");
  });

  it("newCount>0 + skippedCount>0 → success 附带已失效计数", async () => {
    checkUpdatesMock.mockResolvedValue({
      ok: true,
      newCount: 1,
      errorCount: 0,
      skippedCount: 2,
      failedProjects: [],
      skippedProjects: [
        { id: "x/g1", name: "x/g1", reason: "not_found" },
        { id: "x/g2", name: "x/g2", reason: "not_found" },
      ],
    });
    const { container } = render(<GithubPage />);
    const t = await clickCheck(container);
    expect(t.type).toBe("success");
    expect(t.message).toContain("2 个已失效");
  });

  it("newCount=0 errorCount=0 skippedCount>0 → info「已失效」不显示失败", async () => {
    checkUpdatesMock.mockResolvedValue({
      ok: true,
      newCount: 0,
      errorCount: 0,
      skippedCount: 1,
      failedProjects: [],
      skippedProjects: [{ id: "x/gone", name: "x/gone", reason: "not_found" }],
    });
    const { container } = render(<GithubPage />);
    const t = await clickCheck(container);
    expect(t.type).toBe("info");
    expect(t.message).toContain("已失效");
    expect(t.message).not.toContain("失败");
  });

  it("rate_limited 带 retryAfter:1800 → warn 文案含「30 分钟」", async () => {
    checkUpdatesMock.mockResolvedValue({
      ok: true,
      newCount: 0,
      errorCount: 1,
      skippedCount: 0,
      failedProjects: [
        {
          id: "a/b",
          name: "a/b",
          reason: "rate_limited",
          retryAfter: 1800,
          rateLimitRemaining: 0,
        },
      ],
      skippedProjects: [],
    });
    const { container } = render(<GithubPage />);
    const t = await clickCheck(container);
    expect(t.type).toBe("warn");
    expect(t.message).toContain("30 分钟");
  });

  it("rate_limited 带 rateLimitRemaining:3 → warn 文案含「剩余 3 次」", async () => {
    checkUpdatesMock.mockResolvedValue({
      ok: true,
      newCount: 0,
      errorCount: 1,
      skippedCount: 0,
      failedProjects: [
        {
          id: "a/b",
          name: "a/b",
          reason: "rate_limited",
          rateLimitRemaining: 3,
        },
      ],
      skippedProjects: [],
    });
    const { container } = render(<GithubPage />);
    const t = await clickCheck(container);
    expect(t.type).toBe("warn");
    expect(t.message).toContain("剩余 3 次");
  });

  it("newCount=0 errorCount=0 skippedCount=0 → info「已是最新版本」", async () => {
    checkUpdatesMock.mockResolvedValue({
      ok: true,
      newCount: 0,
      errorCount: 0,
      skippedCount: 0,
      failedProjects: [],
      skippedProjects: [],
    });
    const { container } = render(<GithubPage />);
    const t = await clickCheck(container);
    expect(t.type).toBe("info");
    expect(t.message).toContain("已是最新版本");
  });

  it("未知 reason (threw) + detail → warn 文案附加原始错误（防御深度）", async () => {
    checkUpdatesMock.mockResolvedValue({
      ok: true,
      newCount: 0,
      errorCount: 1,
      skippedCount: 0,
      failedProjects: [
        {
          id: "a/b",
          name: "a/b",
          reason: "threw",
          detail: "parseGithubUrl is not defined",
        },
      ],
      skippedProjects: [],
    });
    const { container } = render(<GithubPage />);
    const t = await clickCheck(container);
    expect(t.type).toBe("warn");
    // 原始错误信息透出，而非笼统的「操作失败，请重试」无 detail
    expect(t.message).toContain("parseGithubUrl is not defined");
  });
});
