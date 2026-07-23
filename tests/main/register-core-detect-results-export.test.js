/**
 * tests/main/register-core-detect-results-export.test.js
 *
 * C7 — detect-results:export IPC handler.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const mockHandle = vi.fn((name, fn) => { handlers.set(name, fn); });
const handlers = new Map();

const electronStub = {
  ipcMain: { handle: mockHandle, on: vi.fn(), removeHandler: vi.fn() },
  app: { getPath: vi.fn(() => "/fake/userData") },
  shell: { trashItem: vi.fn(async () => {}) },
};
const electronPath = require.resolve("electron");

function freshModule() {
  vi.resetModules();
  require.cache[electronPath] = {
    id: electronPath, filename: electronPath, loaded: true, exports: electronStub,
  };
  handlers.clear();
  mockHandle.mockClear();
}

let tmpRoot;
let detectExport;
let registerCoreHandlers;

function setup(getCachedState) {
  freshModule();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-c7-ipc-"));
  detectExport = require("../../src/main/detect-results-export.js");
  ({ registerCoreHandlers } = require("../../src/main/ipc/register-core.ts"));

  registerCoreHandlers({
    getConfig: () => ({ apps: [] }),
    pool: { enqueue: vi.fn() },
    getWindow: () => null,
    onCheckComplete: vi.fn(),
    getCachedState,
    sendToRenderer: vi.fn(),
    safeHandle: (name, fn) => handlers.set(name, fn),
  });
}

beforeEach(() => {
  setup(() => ({
    apps: {
      Foo: { name: "Foo", installed_version: "1", latest_version: "2", has_update: true, status: "update_available" },
    },
  }));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("detect-results:export", () => {
  it("json: 写出文件 → 返 ok + path + rowCount", async () => {
    vi.spyOn(detectExport, "exportDetectResults").mockImplementation((opts) => ({
      ok: true,
      path: path.join(tmpRoot, "pulse-detect-results-mock.json"),
      sizeBytes: 999,
      rowCount: 1,
      format: opts.format,
    }));

    const h = handlers.get("detect-results:export");
    const r = await h({}, { format: "json" });
    expect(r.ok).toBe(true);
    expect(r.path).toContain("pulse-detect-results-mock.json");
    expect(r.rowCount).toBe(1);
    expect(r.format).toBe("json");
    expect(detectExport.exportDetectResults).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "json",
        state: expect.objectContaining({ apps: expect.any(Object) }),
      }),
    );
  });

  it("exportDetectResults ok:false → 透传 reason", async () => {
    vi.spyOn(detectExport, "exportDetectResults").mockReturnValueOnce({
      ok: false,
      error: "bad_format",
    });
    const h = handlers.get("detect-results:export");
    const r = await h({}, { format: "xml" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad_format");
  });

  it("exportDetectResults throw → ok:false reason:threw", async () => {
    vi.spyOn(detectExport, "exportDetectResults").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const h = handlers.get("detect-results:export");
    const r = await h({}, { format: "csv" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("threw");
  });
});
