import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const { requireMain } = _require("../_setup/require-main.cjs");

describe("app info IPC", () => {
  it("app:get-version 返回当前 Pulse 版本", async () => {
    const { registerAppInfoHandlers } = requireMain("ipc/register-app-info");
    const handlers = {};
    registerAppInfoHandlers({
      app: { getVersion: () => "2.82.0" },
      ipcMain: {
        handle: (channel, handler) => { handlers[channel] = handler; },
      },
    });

    await expect(handlers["app:get-version"]()).resolves.toBe("2.82.0");
  });
});
