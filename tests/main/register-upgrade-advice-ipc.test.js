/**
 * tests/main/register-upgrade-advice-ipc.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const advicePath = require.resolve("../../src/ai/upgrade-advice.js");
const registerPath =
  mainArtifactPath("ipc/register-upgrade-advice");

const fetchUpgradeAdvice = vi.fn();

function stubModules() {
  vi.resetModules();
  require.cache[advicePath] = {
    id: advicePath,
    filename: advicePath,
    loaded: true,
    exports: { fetchUpgradeAdvice },
  };
}

beforeEach(() => {
  fetchUpgradeAdvice.mockReset();
  stubModules();
});

afterEach(() => {
  delete require.cache[advicePath];
  delete require.cache[registerPath];
});

describe("upgrade-advice:fetch IPC", () => {
  it("透传 fetchUpgradeAdvice 结果", async () => {
    fetchUpgradeAdvice.mockResolvedValue({
      ok: true,
      recommendation: "wait",
      summary: "不急",
    });
    const handlers = {};
    const { registerUpgradeAdviceHandlers } = require(registerPath);
    registerUpgradeAdviceHandlers({
      safeHandle: (ch, fn) => {
        handlers[ch] = fn;
      },
    });
    const r = await handlers["upgrade-advice:fetch"]({}, { appName: "Cursor" });
    expect(fetchUpgradeAdvice).toHaveBeenCalledWith({ appName: "Cursor" });
    expect(r.ok).toBe(true);
    expect(r.summary).toBe("不急");
  });
});
